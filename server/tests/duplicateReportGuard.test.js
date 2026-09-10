import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: { find: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

jest.mock('../models/User.js', () => ({
    default: { find: jest.fn() },
}));

jest.mock('../models/Municipality.js', () => ({ default: {} }));

jest.mock('../models/Notification.js', () => ({
    default: { createAndSend: jest.fn() },
}));

jest.mock('../services/locationService.js', () => ({
    processLocation: jest.fn(),
    getResponseTimeEstimate: jest.fn(),
}));

jest.mock('../services/geocoding.js', () => ({
    isWithinSibuyanBounds: jest.fn(),
}));

jest.mock('../services/emailService.js', () => ({
    sendNewReportAlertEmail: jest.fn(),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUsers: jest.fn(),
    pushTemplates: { newReport: jest.fn() },
}));

jest.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: jest.fn(),
    uploadFilesToGridFS: jest.fn(),
    findGridFsFile: jest.fn(),
    getGridFsBucket: jest.fn(),
}));

jest.mock('../services/evidenceDerivativeService.js', () => ({
    generateRedactedEvidenceDerivative: jest.fn(),
}));

jest.mock('../utils/publicReport.js', () => ({
    toPublicReport: jest.fn((report) => report),
    buildReportEvidenceObject: jest.fn(),
}));

jest.mock('../utils/reportAccess.js', () => ({
    canViewOperationalReport: jest.fn(),
    getEntityId: jest.fn(),
}));

const { createReport } = await import('../controllers/reportController.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');
const { processLocation } = await import('../services/locationService.js');
const { isWithinSibuyanBounds } = await import('../services/geocoding.js');
const { sendNewReportAlertEmail } = await import('../services/emailService.js');
const { sendPushToUsers, pushTemplates } = await import('../services/pushService.js');
const { uploadFilesToGridFS } = await import('../services/gridFsService.js');

const INCIDENT_TIME = '2026-08-11T04:00:00.000Z';

const chainable = (result) => ({
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
});

/**
 * Mongoose returns a thenable Query from findOne(), not a promise, so the
 * controller can chain .populate() before awaiting. The mock must do the same
 * or the chain breaks in a way real code never would.
 */
const findOneChain = (value) => {
    const chain = {
        populate: jest.fn(() => chain),
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    };
    return chain;
};

const existingReport = (overrides = {}) => ({
    _id: 'existing-report-1',
    status: 'verified',
    incidentType: 'vehicular',
    address: 'Poblacion coastal road',
    barangay: 'Poblacion',
    coordinates: { lat: 12.4005, lng: 122.6005 },
    incidentTime: '2026-08-11T03:50:00.000Z',
    createdAt: '2026-08-11T03:51:00.000Z',
    ...overrides,
});

const locationResult = (overrides = {}) => ({
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
    ...overrides,
});

const createReq = (bodyOverrides = {}) => ({
    body: {
        incidentCategory: 'accident',
        incidentType: 'vehicular',
        incidentTime: INCIDENT_TIME,
        address: 'Poblacion, Cajidiocan',
        lat: '12.4',
        lng: '122.6',
        casualties: { injured: 1, fatalities: 0, missing: 0 },
        ...bodyOverrides,
    },
    files: [],
    user: { _id: 'reporter-1', name: 'Field Reporter' },
    app: { get: () => null },
});

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const bodyOf = (res) => res.json.mock.calls[0][0];

beforeEach(() => {
    processLocation.mockReset();
    processLocation.mockResolvedValue(locationResult());
    isWithinSibuyanBounds.mockReset();
    isWithinSibuyanBounds.mockReturnValue(true);

    Report.find.mockReset();
    Report.find.mockReturnValue(chainable([]));
    Report.findOne.mockReset();
    Report.findOne.mockImplementation(() => findOneChain(null));
    Report.create.mockReset();
    Report.create.mockImplementation(async (document) => ({
        ...document,
        populate: jest.fn().mockResolvedValue(undefined),
    }));

    User.find.mockReset();
    User.find.mockResolvedValue([]);
    Notification.createAndSend.mockReset();
    Notification.createAndSend.mockResolvedValue({});
    sendNewReportAlertEmail.mockReset();
    sendNewReportAlertEmail.mockResolvedValue({ success: true });
    sendPushToUsers.mockReset();
    sendPushToUsers.mockResolvedValue(false);
    pushTemplates.newReport.mockReset();
    pushTemplates.newReport.mockReturnValue({});
    uploadFilesToGridFS.mockReset();
});

describe('duplicate report guard', () => {
    test('warns instead of creating when a similar report is already nearby', async () => {
        Report.find.mockReturnValue(chainable([existingReport()]));
        const res = createRes();

        await createReport(createReq(), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(bodyOf(res)).toMatchObject({
            success: false,
            code: 'POSSIBLE_DUPLICATE',
        });
        expect(bodyOf(res).duplicates[0]).toMatchObject({
            reportId: 'existing-report-1',
            typeMatch: true,
        });
        expect(Report.create).not.toHaveBeenCalled();
    });

    test('rejects the duplicate before spending an evidence upload', async () => {
        Report.find.mockReturnValue(chainable([existingReport()]));
        const req = createReq();
        req.files = [{ buffer: Buffer.from('image'), mimetype: 'image/jpeg', originalname: 'scene.jpg', size: 5 }];

        await createReport(req, createRes());

        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
    });

    test('creates the report and records the override when the reporter confirms it is distinct', async () => {
        Report.find.mockReturnValue(chainable([existingReport()]));
        const res = createRes();

        await createReport(createReq({ confirmDistinct: 'true' }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(Report.create).toHaveBeenCalledWith(
            expect.objectContaining({ possibleDuplicateOf: 'existing-report-1' })
        );
    });

    test('creates normally when nothing similar is nearby', async () => {
        const res = createRes();

        await createReport(createReq(), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(Report.create).toHaveBeenCalledWith(
            expect.objectContaining({ possibleDuplicateOf: undefined })
        );
    });

    test('does not warn about a distant report the pre-filter happened to return', async () => {
        // Proves the pure matcher is the real gate, not the bounding-box query.
        Report.find.mockReturnValue(chainable([
            existingReport({ coordinates: { lat: 12.48, lng: 122.68 } }),
        ]));
        const res = createRes();

        await createReport(createReq(), res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('does not warn about a nearby report that was already rejected', async () => {
        Report.find.mockReturnValue(chainable([existingReport({ status: 'rejected' })]));
        const res = createRes();

        await createReport(createReq(), res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('never lets duplicate detection block a report when the lookup fails', async () => {
        Report.find.mockImplementation(() => {
            throw new Error('mongo unavailable');
        });
        const res = createRes();

        await createReport(createReq(), res);

        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe('idempotent report creation', () => {
    test('replays an already-stored report instead of filing a second one', async () => {
        Report.findOne.mockImplementation(() => findOneChain({ _id: 'existing-1', clientReportId: 'key-1' }));
        const res = createRes();

        await createReport(createReq({ clientReportId: 'key-1' }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(bodyOf(res)).toMatchObject({ success: true, replayed: true });
        expect(Report.create).not.toHaveBeenCalled();
    });

    test('stores the client key on a first-time submission', async () => {
        const res = createRes();

        await createReport(createReq({ clientReportId: 'key-1' }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(Report.create).toHaveBeenCalledWith(
            expect.objectContaining({ clientReportId: 'key-1' })
        );
    });

    test('resolves a concurrent replay race to the report that won', async () => {
        // Pre-check misses, the insert loses the unique-index race, and the
        // catch resolves to the winner instead of surfacing a 500.
        Report.findOne
            .mockImplementationOnce(() => findOneChain(null))
            .mockImplementationOnce(() => findOneChain({ _id: 'winner-1' }));

        Report.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), {
            code: 11000,
            keyPattern: { clientReportId: 1 },
        }));

        const res = createRes();
        await createReport(createReq({ clientReportId: 'key-1' }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(bodyOf(res)).toMatchObject({ success: true, replayed: true });
    });
});
