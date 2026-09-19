/**
 * Behaviour this file protects: submitting a report must not wait on image
 * analysis.
 *
 * Full face detection and redaction used to run inline for every uploaded photo
 * before the 201 was written — measured at ~10s for one 1200x900 photo and
 * ~18-24s for a phone photo carrying EXIF rotation, in synchronous JavaScript
 * that blocks the whole event loop. The analysis is now queued and only starts
 * once the response has been flushed, at a reduced cost (`fastMode`), writing
 * its result through an atomic per-index update.
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
    findGridFsFile: vi.fn(),
    getGridFsBucket: vi.fn(),
}));

vi.mock('../services/evidenceDerivativeService.js', () => ({
    generateRedactedEvidenceDerivative: vi.fn(),
}));

const { createReport, attachReportEvidence } = await import('../controllers/reportController.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');
const { processLocation, getResponseTimeEstimate } = await import('../services/locationService.js');
const { isWithinSibuyanBounds } = await import('../services/geocoding.js');
const { uploadFilesToGridFS } = await import('../services/gridFsService.js');
const { generateRedactedEvidenceDerivative } = await import('../services/evidenceDerivativeService.js');
const { evidenceProcessingQueue } = await import('../services/evidenceProcessingQueue.js');

const INCIDENT_TIME = '2026-08-11T04:00:00.000Z';
const REPORT_ID = '64b100000000000000000001';
const REPORTER_ID = '64b100000000000000000002';

const chainable = (result) => ({
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
});

class QueryStub {
    constructor(value) {
        this.value = value;
    }

    populate() {
        return this;
    }

    // oxlint-disable-next-line unicorn/no-thenable -- intentional: a Mongoose query is thenable by design, and the stub only breaks the controller if it is not.
    then(resolve, reject) {
        return Promise.resolve(this.value).then(resolve, reject);
    }
}

const photo = (name) => ({
    buffer: Buffer.from(`photo-bytes-${name}`),
    mimetype: 'image/jpeg',
    originalname: `${name}.jpg`,
    size: 16,
});

const derivativeResult = (overrides = {}) => ({
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
        ...overrides,
    },
});

const locationResult = () => ({
    success: true,
    coordinates: { lat: 12.4, lng: 122.6 },
    municipality: { _id: 'muni-1', name: 'Cajidiocan' },
    municipalityId: 'muni-1',
    municipalityName: 'Cajidiocan',
    municipalityAssignment: 'matched',
    barangayAssignment: 'matched',
    barangay: 'Poblacion',
    address: 'Poblacion, Cajidiocan',
    source: 'provided',
    warnings: [],
});

const createReq = (overrides = {}) => ({
    body: {
        incidentCategory: 'accident',
        incidentType: 'vehicular',
        incidentTime: INCIDENT_TIME,
        address: 'Poblacion, Cajidiocan',
        lat: '12.4',
        lng: '122.6',
        casualties: { injured: 1, fatalities: 0, missing: 0 },
    },
    files: [],
    user: { _id: REPORTER_ID, name: 'Field Reporter' },
    app: { get: () => null },
    ...overrides,
});

/**
 * Express response stub that records the listeners the controller attaches, so
 * a test can decide when the response "finishes" and then inspect what the
 * background job did.
 */
const createRes = () => {
    const handlers = new Map();
    const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
        once: vi.fn((event, handler) => {
            if (!handlers.has(event)) handlers.set(event, []);
            handlers.get(event).push(handler);
            return res;
        }),
    };

    res.emit = (event) => {
        const pending = handlers.get(event) || [];
        handlers.delete(event);
        pending.forEach((handler) => handler());
    };
    res.listenerCount = (event) => (handlers.get(event) || []).length;

    return res;
};

/** The entry each `persistEvidenceMetadata` call wrote, pulled out of the update pipeline. */
const persistedEntries = () => Report.updateOne.mock.calls
    .map(([, pipeline]) => pipeline[0].$set.evidenceMetadata.$concatArrays[1][0]);

const flushResponse = async (res) => {
    res.emit('finish');
    await evidenceProcessingQueue.drain();
};

beforeEach(async () => {
    vi.clearAllMocks();
    await evidenceProcessingQueue.drain();

    processLocation.mockResolvedValue(locationResult());
    getResponseTimeEstimate.mockReturnValue({ minutes: 5, distance: 2, category: 'immediate' });
    isWithinSibuyanBounds.mockReturnValue(true);

    Report.find.mockReturnValue(chainable([]));
    Report.findOne.mockImplementation(() => new QueryStub(null));
    Report.updateOne.mockResolvedValue({ acknowledged: true });
    Report.create.mockImplementation(async (document) => ({
        ...document,
        populate: vi.fn().mockResolvedValue(undefined),
    }));

    User.find.mockResolvedValue([]);
    uploadFilesToGridFS.mockResolvedValue([]);
    generateRedactedEvidenceDerivative.mockResolvedValue(derivativeResult());
});

describe('report submission: evidence analysis is off the request path', () => {
    test('answers 201 without analysing a single photo, then analyses after the flush', async () => {
        uploadFilesToGridFS.mockResolvedValue([
            { url: '/api/files/one/1.jpg' },
            { url: '/api/files/two/2.jpg' },
        ]);
        const res = createRes();

        await createReport(createReq({ files: [photo('one'), photo('two')] }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        // The measurement that motivated the change: analysis is not on the
        // request path at all.
        expect(generateRedactedEvidenceDerivative).not.toHaveBeenCalled();
        expect(evidenceProcessingQueue.stats()).toMatchObject({ active: 0, pending: 0 });

        await flushResponse(res);

        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledTimes(2);
    });

    test('analyses with the reduced-cost options and no cache write', async () => {
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/one/1.jpg' }]);
        const files = [photo('one')];
        const res = createRes();

        await createReport(createReq({ files }), res);
        await flushResponse(res);

        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledWith(
            files[0].buffer,
            { fastMode: true, skipCache: true },
        );
    });

    test('persists each result against its own photo index', async () => {
        uploadFilesToGridFS.mockResolvedValue([
            { url: '/api/files/one/1.jpg' },
            { url: '/api/files/two/2.jpg' },
        ]);
        const res = createRes();

        await createReport(createReq({ files: [photo('one'), photo('two')] }), res);
        await flushResponse(res);

        expect(persistedEntries().map((entry) => entry.index)).toEqual([0, 1]);
        expect(Report.updateOne.mock.calls[0][0]).toMatchObject({ _id: expect.anything() });
        expect(persistedEntries()[0]).toMatchObject({
            detectionStatus: 'no_faces_detected',
            redactionVersion: '3.4',
            sourceHash: 'source-hash',
        });
    });

    test('does not analyse when the reporter attached no photos', async () => {
        const res = createRes();

        await createReport(createReq(), res);
        await flushResponse(res);

        expect(generateRedactedEvidenceDerivative).not.toHaveBeenCalled();
        expect(Report.updateOne).not.toHaveBeenCalled();
    });

    test('registers no deferred work when the report was rejected as a duplicate', async () => {
        Report.find.mockReturnValue(chainable([{
            _id: 'existing-report',
            status: 'verified',
            incidentType: 'vehicular',
            address: 'Poblacion coastal road',
            coordinates: { lat: 12.4005, lng: 122.6005 },
            incidentTime: '2026-08-11T03:50:00.000Z',
            createdAt: '2026-08-11T03:51:00.000Z',
        }]));
        const res = createRes();

        await createReport(createReq({ files: [photo('one')] }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        // A rejected submission leaves nothing queued and no listener behind.
        expect(res.listenerCount('finish')).toBe(0);
        expect(res.listenerCount('close')).toBe(0);
    });

    test('records a fallback entry for a photo that cannot be analysed and keeps going', async () => {
        uploadFilesToGridFS.mockResolvedValue([
            { url: '/api/files/one/1.jpg' },
            { url: '/api/files/two/2.jpg' },
        ]);
        generateRedactedEvidenceDerivative
            .mockRejectedValueOnce(new Error('cascade unavailable'))
            .mockResolvedValueOnce(derivativeResult());
        const res = createRes();

        await createReport(createReq({ files: [photo('one'), photo('two')] }), res);
        await flushResponse(res);

        const entries = persistedEntries();
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({
            index: 0,
            detectionStatus: 'detector_failed',
            redactionType: 'fallback_blur',
            facesDetected: 0,
        });
        // The unanalysed entry must not claim a completed redaction.
        expect(entries[0].redactionVersion).toBe('3.2');
        expect(entries[1]).toMatchObject({ index: 1, detectionStatus: 'no_faces_detected' });
    });

    test('isolates a persistence failure so the remaining photos still complete', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        uploadFilesToGridFS.mockResolvedValue([
            { url: '/api/files/one/1.jpg' },
            { url: '/api/files/two/2.jpg' },
        ]);
        Report.updateOne
            .mockRejectedValueOnce(new Error('mongo unavailable'))
            .mockResolvedValue({ acknowledged: true });
        const res = createRes();

        await createReport(createReq({ files: [photo('one'), photo('two')] }), res);
        await flushResponse(res);

        expect(Report.updateOne).toHaveBeenCalledTimes(2);
        expect(persistedEntries()[1]).toMatchObject({ index: 1 });
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    test('still analyses when the client vanished before the response finished', async () => {
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/one/1.jpg' }]);
        const res = createRes();

        await createReport(createReq({ files: [photo('one')] }), res);
        // 'close' without 'finish' is the aborted-client case. The report is
        // already persisted, so the analysis is still worth doing.
        await flushResponse(res);

        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledTimes(1);
    });

    test('does not start the analysis twice when both lifecycle events fire', async () => {
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/one/1.jpg' }]);
        const res = createRes();

        await createReport(createReq({ files: [photo('one')] }), res);
        res.emit('finish');
        res.emit('close');
        await evidenceProcessingQueue.drain();

        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledTimes(1);
        expect(Report.updateOne).toHaveBeenCalledTimes(1);
    });
});

describe('attaching evidence to an existing report', () => {
    const existingReport = (overrides = {}) => ({
        _id: REPORT_ID,
        reporter: REPORTER_ID,
        status: 'pending',
        municipalityName: 'Cajidiocan',
        images: ['/api/files/existing.jpg'],
        evidenceMetadata: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
        ...overrides,
    });

    const attachReq = (files) => ({
        params: { id: REPORT_ID },
        user: { _id: REPORTER_ID, role: 'reporter' },
        files,
        app: { get: () => null },
    });

    test('defers the analysis and continues the report’s index sequence', async () => {
        Report.findById.mockResolvedValue(existingReport());
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/new.jpg' }]);
        const res = createRes();

        await attachReportEvidence(attachReq([photo('new')]), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(generateRedactedEvidenceDerivative).not.toHaveBeenCalled();

        await flushResponse(res);

        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledTimes(1);
        expect(persistedEntries()[0]).toMatchObject({ index: 1 });
    });

    test('does not write an unanalysed placeholder onto the report document', async () => {
        const report = existingReport();
        Report.findById.mockResolvedValue(report);
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/new.jpg' }]);
        const res = createRes();

        await attachReportEvidence(attachReq([photo('new')]), res);

        expect(report.images).toHaveLength(2);
        // Nothing is claimed about the photo until the analysis has run; the
        // public projection renders an absent entry as "processing".
        expect(report.evidenceMetadata).toEqual([]);
    });

    test('queues one analysis per attached photo, in order', async () => {
        Report.findById.mockResolvedValue(existingReport({ images: [] }));
        uploadFilesToGridFS.mockResolvedValue([
            { url: '/api/files/a.jpg' },
            { url: '/api/files/b.jpg' },
        ]);
        const res = createRes();

        await attachReportEvidence(attachReq([photo('a'), photo('b')]), res);
        await flushResponse(res);

        expect(generateRedactedEvidenceDerivative).toHaveBeenCalledTimes(2);
        expect(persistedEntries().map((entry) => entry.index)).toEqual([0, 1]);
    });
});
