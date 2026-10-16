/**
 * Behaviour this file protects: evidence analysis orphaned by a dyno restart
 * must be retried on the next boot.
 *
 * The evidence queue is in-memory only and Heroku cycles dynos daily and on
 * every deploy. A report whose analysis was queued or in flight at restart
 * would otherwise keep images[] entries with no evidenceMetadata entries
 * forever, and the public projection renders those as "processing"
 * permanently. The boot-time requeue scans for such reports (bounded) and
 * re-runs the analysis from the stored GridFS bytes through the existing
 * queue — never re-uploading, never mutating images[].
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/Report.js', () => ({
    default: {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        updateOne: vi.fn(),
    },
}));

vi.mock('../models/User.js', () => ({
    default: { find: vi.fn() },
}));

vi.mock('../models/Municipality.js', () => ({ default: {} }));

vi.mock('../models/Notification.js', () => ({
    default: { createAndSend: vi.fn() },
}));

vi.mock('../services/locationService.js', () => ({
    processLocation: vi.fn(),
    getResponseTimeEstimate: vi.fn(),
}));

vi.mock('../services/geocoding.js', () => ({
    isWithinSibuyanBounds: vi.fn(),
}));

vi.mock('../services/emailService.js', () => ({
    sendNewReportAlertEmail: vi.fn(),
}));

vi.mock('../services/pushService.js', () => ({
    sendPushToUsers: vi.fn(),
    pushTemplates: { newReport: vi.fn() },
}));

vi.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: vi.fn(),
    uploadFilesToGridFS: vi.fn(),
    parseGridFsFileId: vi.fn((url) => `gridfs-id-for:${url}`),
    findGridFsFile: vi.fn(),
    getGridFsBucket: vi.fn(),
}));

vi.mock('../services/evidenceDerivativeService.js', () => ({
    generateRedactedEvidenceDerivative: vi.fn(),
}));

const { requeueOrphanedEvidenceAnalysis } = await import('../controllers/reportController.js');
const { default: Report } = await import('../models/Report.js');
const { parseGridFsFileId, findGridFsFile, getGridFsBucket } = await import('../services/gridFsService.js');
const { generateRedactedEvidenceDerivative } = await import('../services/evidenceDerivativeService.js');
const { evidenceProcessingQueue } = await import('../services/evidenceProcessingQueue.js');

const REPORT_ID = '64b100000000000000000001';

const scanChain = (result) => {
    const chain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(result),
    };
    return chain;
};

const storedImageStream = async function* (chunks) {
    for (const chunk of chunks) yield chunk;
};

const derivativeResult = () => ({
    buffer: Buffer.from('derivative'),
    contentType: 'image/jpeg',
    metadata: {
        detectionStatus: 'no_faces_detected',
        redactionType: 'none',
        facesDetected: 0,
        redactedRegions: 0,
        redactionVersion: '3.4',
        detectorVersion: 'picojs-facefinder-2.3',
        sourceHash: 'source-hash',
        derivativeHash: 'derivative-hash',
    },
});

// Pulls the metadata entry out of the $concatArrays replace-index pipeline.
const writtenEntry = (updateCall) => {
    const pipeline = updateCall[1];
    const concat = pipeline[0].$set.evidenceMetadata.$concatArrays;
    return concat[concat.length - 1][0];
};

describe('requeueOrphanedEvidenceAnalysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateRedactedEvidenceDerivative.mockResolvedValue(derivativeResult());
        findGridFsFile.mockImplementation(async (id) => ({ _id: id, length: 1024 }));
        getGridFsBucket.mockReturnValue({
            openDownloadStream: vi.fn(() => storedImageStream([Buffer.from('stored-bytes')])),
        });
    });

    test('requeues only the indices missing metadata, from the stored GridFS bytes', async () => {
        const chain = scanChain([{
            _id: REPORT_ID,
            images: ['https://example.invalid/api/files/aaa/photo0.jpg', 'https://example.invalid/api/files/bbb/photo1.jpg'],
            evidenceMetadata: [{ index: 0, detectionStatus: 'no_faces_detected' }],
        }]);
        Report.find.mockReturnValue(chain);

        await requeueOrphanedEvidenceAnalysis();
        await evidenceProcessingQueue.drain();

        // Only index 1 was missing, so exactly one analysis ran.
        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledTimes(1);
        const [buffer, options] = generateRedactedEvidenceDerivative.mock.calls[0];
        expect(Buffer.concat([buffer]).toString()).toBe('stored-bytes');
        expect(options).toEqual({ fastMode: true, skipCache: true });

        // The GridFS id was resolved from the stored image URL, not a temp file.
        expect(parseGridFsFileId).toHaveBeenCalledWith('https://example.invalid/api/files/bbb/photo1.jpg');
        expect(findGridFsFile).toHaveBeenCalledWith('gridfs-id-for:https://example.invalid/api/files/bbb/photo1.jpg');

        // The result was persisted against its own index.
        expect(Report.updateOne).toHaveBeenCalledTimes(1);
        const [filter] = Report.updateOne.mock.calls[0];
        expect(filter).toEqual({ _id: REPORT_ID });
        expect(writtenEntry(Report.updateOne.mock.calls[0])).toEqual(
            expect.objectContaining({ index: 1, detectionStatus: 'no_faces_detected' })
        );
    });

    test('skips reports whose every image already has a metadata entry', async () => {
        Report.find.mockReturnValue(scanChain([{
            _id: REPORT_ID,
            images: ['https://example.invalid/api/files/aaa/photo0.jpg'],
            evidenceMetadata: [{ index: 0, detectionStatus: 'no_faces_detected' }],
        }]));

        await requeueOrphanedEvidenceAnalysis();
        await evidenceProcessingQueue.drain();

        expect(generateRedactedEvidenceDerivative).not.toHaveBeenCalled();
        expect(Report.updateOne).not.toHaveBeenCalled();
    });

    test('bounds the scan: recent window only, hard document limit', async () => {
        const chain = scanChain([]);
        Report.find.mockReturnValue(chain);

        await requeueOrphanedEvidenceAnalysis();

        const [filter] = Report.find.mock.calls[0];
        expect(filter.createdAt.$gte).toBeInstanceOf(Date);
        // Seven-day age window (with a small tolerance for clock skew).
        const ageMs = Date.now() - filter.createdAt.$gte.getTime();
        expect(ageMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
        expect(ageMs).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
        expect(chain.limit).toHaveBeenCalledWith(50);
    });

    test('writes a fallback entry when the stored file is gone, and keeps going', async () => {
        Report.find.mockReturnValue(scanChain([{
            _id: REPORT_ID,
            images: ['https://example.invalid/api/files/aaa/photo0.jpg'],
            evidenceMetadata: [],
        }]));
        findGridFsFile.mockResolvedValue(null);

        await requeueOrphanedEvidenceAnalysis();
        await evidenceProcessingQueue.drain();

        expect(generateRedactedEvidenceDerivative).not.toHaveBeenCalled();
        expect(Report.updateOne).toHaveBeenCalledTimes(1);
        expect(writtenEntry(Report.updateOne.mock.calls[0])).toEqual(
            expect.objectContaining({ index: 0, detectionStatus: 'detector_failed' })
        );
    });

    test('never throws: a scan failure is logged and swallowed', async () => {
        Report.find.mockImplementation(() => { throw new Error('db unavailable'); });

        await expect(requeueOrphanedEvidenceAnalysis()).resolves.toBeUndefined();
    });
});
