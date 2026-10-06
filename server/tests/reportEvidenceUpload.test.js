import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/Report.js', () => ({
    default: {
        findById: vi.fn(),
        create: vi.fn(),
        findOne: vi.fn(),
        find: vi.fn(),
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

vi.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: vi.fn().mockResolvedValue(true),
    uploadFilesToGridFS: vi.fn(),
    findGridFsFile: vi.fn(),
    getGridFsBucket: vi.fn(),
}));

vi.mock('../services/evidenceDerivativeService.js', () => ({
    generateRedactedEvidenceDerivative: vi.fn().mockResolvedValue({
        metadata: {
            detectionStatus: 'no_faces_detected',
            redactionType: 'none',
            facesDetected: 0,
            redactedRegions: [],
            redactionVersion: '3.2',
            detectorVersion: 'picojs-facefinder-2.3',
            sourceHash: 'source-hash',
            derivativeHash: 'derivative-hash',
        },
    }),
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

const { attachReportEvidence } = await import('../controllers/reportController.js');
const { requireEvidenceContributor } = await import('../middleware/roleCheck.js');
const { default: Report } = await import('../models/Report.js');
const { uploadFilesToGridFS, deleteGridFsFilesByUrls, getGridFsBucket } = await import('../services/gridFsService.js');
const { evidenceProcessingQueue } = await import('../services/evidenceProcessingQueue.js');

const createResponse = () => {
    const response = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
};

describe('attachReportEvidence controller (POST /api/reports/:id/evidence)', () => {
    const validReportId = '64b100000000000000000001';
    const reporterId = '64b100000000000000000002';
    const otherUserId = '64b100000000000000000003';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('rejects request with invalid report ID', async () => {
        const req = {
            params: { id: 'invalid-id' },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'test.jpg' }],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'INVALID_REPORT_ID',
        }));
    });

    test('rejects request when no files are provided', async () => {
        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'NO_FILES_PROVIDED',
        }));
    });

    test('returns 404 when report does not exist', async () => {
        Report.findById.mockResolvedValue(null);

        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'test.jpg' }],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'REPORT_NOT_FOUND',
        }));
    });

    test('rejects unauthorized user who does not own the report and is not operational', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            images: [],
        };
        Report.findById.mockResolvedValue(fakeReport);

        const req = {
            params: { id: validReportId },
            user: { _id: otherUserId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'test.jpg' }],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'FORBIDDEN',
        }));
    });

    test('rejects operational user who belongs to a different municipality', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            municipalityName: 'Cajidiocan',
            images: [],
        };
        Report.findById.mockResolvedValue(fakeReport);

        const req = {
            params: { id: validReportId },
            user: { _id: otherUserId, role: 'responder', assignedMunicipality: 'San Fernando' },
            files: [{ buffer: Buffer.from('img'), originalname: 'test.jpg' }],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'FORBIDDEN',
        }));
    });

    test('accepts operational user from the same scoped municipality', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            municipalityName: 'Cajidiocan',
            images: [],
            evidenceMetadata: [],
            save: vi.fn().mockResolvedValue(true),
            populate: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(fakeReport);
        uploadFilesToGridFS.mockResolvedValue([
            { url: 'https://example.com/api/files/scoped.jpg' },
        ]);

        const req = {
            params: { id: validReportId },
            user: { _id: otherUserId, role: 'responder', assignedMunicipality: 'Cajidiocan' },
            files: [{ buffer: Buffer.from('img'), originalname: 'scoped.jpg' }],
            app: { get: vi.fn().mockReturnValue(null) },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
        }));
    });

    test('accepts system administrator regardless of municipality assignment', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            municipalityName: 'Cajidiocan',
            images: [],
            evidenceMetadata: [],
            save: vi.fn().mockResolvedValue(true),
            populate: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(fakeReport);
        uploadFilesToGridFS.mockResolvedValue([
            { url: 'https://example.com/api/files/admin.jpg' },
        ]);

        const req = {
            params: { id: validReportId },
            user: { _id: otherUserId, role: 'admin' },
            files: [{ buffer: Buffer.from('img'), originalname: 'admin.jpg' }],
            app: { get: vi.fn().mockReturnValue(null) },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
        }));
    });

    test('rejects attaching evidence to a resolved or rejected report', async () => {
        const closedReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'resolved',
            images: [],
        };
        Report.findById.mockResolvedValue(closedReport);

        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'test.jpg' }],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'REPORT_CLOSED',
        }));
    });

    test('rejects attaching evidence if total count exceeds 5 images', async () => {
        const existingReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            images: ['url1', 'url2', 'url3', 'url4'],
        };
        Report.findById.mockResolvedValue(existingReport);

        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [
                { buffer: Buffer.from('img1'), originalname: 'test1.jpg' },
                { buffer: Buffer.from('img2'), originalname: 'test2.jpg' },
            ],
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'EXCEEDS_IMAGE_LIMIT',
        }));
    });

    test('attaches evidence successfully and returns 200 with updated report', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            images: ['https://example.com/api/files/existing.jpg'],
            evidenceMetadata: [],
            municipalityName: 'Cajidiocan',
            save: vi.fn().mockResolvedValue(true),
            populate: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(fakeReport);
        uploadFilesToGridFS.mockResolvedValue([
            { url: 'https://example.com/api/files/new1.jpg' },
        ]);

        const emitMock = vi.fn();
        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('new-photo-bytes'), originalname: 'photo.jpg' }],
            app: {
                get: vi.fn().mockReturnValue({
                    to: vi.fn().mockReturnValue({ emit: emitMock }),
                }),
            },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(uploadFilesToGridFS).toHaveBeenCalled();
        expect(fakeReport.save).toHaveBeenCalled();
        expect(fakeReport.images).toHaveLength(2);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Evidence photos attached successfully.',
        }));

        // Analysis results no longer ride on the response: they are written
        // afterwards, against the photo's own index.
        await evidenceProcessingQueue.drain();
        expect(Report.updateOne).toHaveBeenCalledTimes(1);
        const [, pipeline] = Report.updateOne.mock.calls[0];
        expect(pipeline[0].$set.evidenceMetadata.$concatArrays[1][0]).toMatchObject({ index: 1 });
    });

    test('cleans up GridFS files if saving the report fails', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            images: [],
            evidenceMetadata: [],
            save: vi.fn().mockRejectedValue(new Error('Mongo save failed')),
        };
        Report.findById.mockResolvedValue(fakeReport);
        uploadFilesToGridFS.mockResolvedValue([
            { url: 'https://example.com/api/files/temp.jpg' },
        ]);

        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'photo.jpg' }],
            app: { get: vi.fn().mockReturnValue(null) },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(deleteGridFsFilesByUrls).toHaveBeenCalledWith(['https://example.com/api/files/temp.jpg']);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('returns 200 without duplicating when the photoId is already attached (idempotent replay)', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            images: ['https://example.com/api/files/existing.jpg'],
            evidenceMetadata: [],
            municipalityName: 'Cajidiocan',
            save: vi.fn().mockResolvedValue(true),
            populate: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(fakeReport);
        // A GridFS file carrying this photoId is already attached to the report.
        getGridFsBucket.mockReturnValue({
            find: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    toArray: vi.fn().mockResolvedValue([{ _id: 'gridfs-file-1' }]),
                }),
            }),
        });

        const req = {
            params: { id: validReportId },
            body: { photoId: 'photo-uuid-123' },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('new-photo-bytes'), originalname: 'photo.jpg' }],
            app: { get: vi.fn().mockReturnValue(null) },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
        expect(fakeReport.save).not.toHaveBeenCalled();
        expect(fakeReport.images).toHaveLength(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Evidence photo already attached.',
        }));
    });

    test('stores a new photoId in GridFS metadata for future idempotency checks', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            images: [],
            evidenceMetadata: [],
            municipalityName: 'Cajidiocan',
            save: vi.fn().mockResolvedValue(true),
            populate: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(fakeReport);
        getGridFsBucket.mockReturnValue({
            find: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    toArray: vi.fn().mockResolvedValue([]),
                }),
            }),
        });
        uploadFilesToGridFS.mockResolvedValue([
            { url: 'https://example.com/api/files/new.jpg' },
        ]);

        const req = {
            params: { id: validReportId },
            body: { photoId: 'photo-uuid-456' },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'photo.jpg' }],
            app: { get: vi.fn().mockReturnValue(null) },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(uploadFilesToGridFS).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ photoId: 'photo-uuid-456' })
        );
        expect(fakeReport.images).toHaveLength(1);
        expect(res.status).toHaveBeenCalledWith(200);
        await evidenceProcessingQueue.drain();
    });

    test('broadcasts reportEvidenceUpdated to both municipality and reporters rooms', async () => {
        const fakeReport = {
            _id: validReportId,
            reporter: reporterId,
            status: 'pending',
            municipalityName: 'Cajidiocan',
            images: [],
            evidenceMetadata: [],
            save: vi.fn().mockResolvedValue(true),
            populate: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(fakeReport);
        uploadFilesToGridFS.mockResolvedValue([
            { url: 'https://example.com/api/files/new.jpg' },
        ]);

        const municipalityEmit = vi.fn();
        const reportersEmit = vi.fn();

        const req = {
            params: { id: validReportId },
            user: { _id: reporterId, role: 'reporter' },
            files: [{ buffer: Buffer.from('img'), originalname: 'photo.jpg' }],
            app: {
                get: vi.fn().mockReturnValue({
                    to: vi.fn((room) => {
                        if (room === 'municipality_Cajidiocan') return { emit: municipalityEmit };
                        if (room === 'reporters') return { emit: reportersEmit };
                        return { emit: vi.fn() };
                    }),
                }),
            },
        };
        const res = createResponse();

        await attachReportEvidence(req, res);

        expect(municipalityEmit).toHaveBeenCalledWith('reportEvidenceUpdated', expect.objectContaining({
            reportId: validReportId,
            evidenceCount: 1,
            municipality: 'Cajidiocan',
        }));
        expect(reportersEmit).toHaveBeenCalledWith('reportEvidenceUpdated', expect.objectContaining({
            reportId: validReportId,
            evidenceCount: 1,
        }));
    });
});

describe('requireEvidenceContributor middleware', () => {
    test('denies unauthenticated request with 401', () => {
        const req = {};
        const res = createResponse();
        const next = vi.fn();

        requireEvidenceContributor(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('denies ordinary users with 403', () => {
        const req = { user: { role: 'ordinary' } };
        const res = createResponse();
        const next = vi.fn();

        requireEvidenceContributor(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('denies unverified reporters with 403', () => {
        const req = { user: { role: 'reporter', isVerified: false } };
        const res = createResponse();
        const next = vi.fn();

        requireEvidenceContributor(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('allows verified reporters', () => {
        const req = { user: { role: 'reporter', isVerified: true } };
        const res = createResponse();
        const next = vi.fn();

        requireEvidenceContributor(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    test('allows operational responders, municipal admins, and system admins', () => {
        for (const role of ['responder', 'municipal_admin', 'admin']) {
            const req = { user: { role } };
            const res = createResponse();
            const next = vi.fn();

            requireEvidenceContributor(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        }
    });
});
