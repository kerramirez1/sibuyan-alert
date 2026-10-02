import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

// ---------------------------------------------------------------------------
// Per-reporter report visibility ("hide from my list").
//
// This is NOT a soft delete: hiding only sets a per-reporter visibility flag.
// The report stays fully intact in accident history, admin queues, the public
// map/stats, and analytics.
// ---------------------------------------------------------------------------

jest.mock('../models/Report.js', () => ({
    default: {
        find: jest.fn(),
        findById: jest.fn(),
        countDocuments: jest.fn(),
    },
}));

jest.mock('../models/HighRiskZone.js', () => ({
    default: { find: jest.fn() },
}));

jest.mock('../models/User.js', () => ({ default: {} }));
jest.mock('../models/Municipality.js', () => ({ default: {} }));
jest.mock('../models/Notification.js', () => ({ default: {} }));

jest.mock('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn().mockResolvedValue({ success: true }),
    sendNewReportAlertEmail: jest.fn(),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUsers: jest.fn().mockResolvedValue(false),
    sendPushToUser: jest.fn().mockResolvedValue(false),
    pushTemplates: {},
}));

jest.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: jest.fn(),
    broadcastMultiUnitResponse: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
    broadcastReportResolved: jest.fn(),
    broadcastReportTransfer: jest.fn(),
    broadcastTransferAcknowledged: jest.fn(),
    broadcastDispatchEscalation: jest.fn(),
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

jest.mock('../services/evidenceProcessingQueue.js', () => ({
    evidenceProcessingQueue: { add: jest.fn() },
}));

jest.mock('../services/geocoding.js', () => ({
    isWithinSibuyanBounds: jest.fn().mockReturnValue(true),
}));

jest.mock('../services/hazardAreaService.js', () => ({
    describeHazardsAt: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/locationService.js', () => ({
    processLocation: jest.fn(),
    getResponseTimeEstimate: jest.fn(),
}));

jest.mock('../utils/duplicateDetection.js', () => ({
    findDuplicateCandidates: jest.fn().mockResolvedValue([]),
    DUPLICATE_RADIUS_METERS: 100,
    DUPLICATE_WINDOW_MINUTES: 30,
}));

const { hideMyReport, unhideMyReport, getMyReports, getReports } = await import(
    '../controllers/reportController.js'
);
const { default: Report } = await import('../models/Report.js');

// Chainable mongoose-query stub: every link returns the chain, .lean()
// resolves the canned docs.
const chainable = (docs = []) => {
    const chain = {};
    chain.select = jest.fn(() => chain);
    chain.populate = jest.fn(() => chain);
    chain.sort = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.skip = jest.fn(() => chain);
    chain.maxTimeMS = jest.fn(() => chain);
    chain.lean = jest.fn().mockResolvedValue(docs);
    return chain;
};

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.setHeader = jest.fn(() => res);
    res.end = jest.fn(() => res);
    return res;
};

const createIo = () => {
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    return { io, emit };
};

const ownedReport = (overrides = {}) => ({
    _id: 'report-1',
    reporter: 'reporter-1',
    status: 'pending',
    hiddenFromReporterAt: null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
});

const authedReq = (overrides = {}) => ({
    params: { id: 'report-1' },
    query: {},
    headers: {},
    user: { _id: 'reporter-1', role: 'reporter' },
    app: { get: jest.fn(() => null) },
    ...overrides,
});

describe('hideMyReport / unhideMyReport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('hide sets the flag, saves, emits reportHidden to the owner room only', async () => {
        const report = ownedReport();
        Report.findById.mockResolvedValue(report);
        const { io, emit } = createIo();
        const req = authedReq({ app: { get: jest.fn(() => io) } });
        const res = createRes();

        await hideMyReport(req, res);

        expect(report.hiddenFromReporterAt).toBeInstanceOf(Date);
        expect(report.save).toHaveBeenCalledTimes(1);
        expect(io.to).toHaveBeenCalledWith('user_reporter-1');
        expect(emit).toHaveBeenCalledWith('reportHidden', { id: 'report-1' });
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, message: 'Report removed from your list' }),
        );
    });

    test('hide returns 404 (not 403) for a report owned by someone else', async () => {
        const report = ownedReport({ reporter: 'reporter-2' });
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await hideMyReport(authedReq(), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, message: 'Report not found' }),
        );
        expect(report.save).not.toHaveBeenCalled();
    });

    test('hide returns 404 when the report does not exist', async () => {
        Report.findById.mockResolvedValue(null);
        const res = createRes();

        await hideMyReport(authedReq(), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('hide is allowed for any status (e.g. actively responding)', async () => {
        const report = ownedReport({ status: 'responding' });
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await hideMyReport(authedReq(), res);

        expect(report.save).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('hide is idempotent: hiding twice succeeds', async () => {
        const report = ownedReport({ hiddenFromReporterAt: new Date('2026-10-01T00:00:00Z') });
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await hideMyReport(authedReq(), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.save).toHaveBeenCalledTimes(1);
    });

    test('unhide clears the flag and emits reportUnhidden', async () => {
        const report = ownedReport({ hiddenFromReporterAt: new Date() });
        Report.findById.mockResolvedValue(report);
        const { io, emit } = createIo();
        const req = authedReq({ app: { get: jest.fn(() => io) } });
        const res = createRes();

        await unhideMyReport(req, res);

        expect(report.hiddenFromReporterAt).toBeNull();
        expect(report.save).toHaveBeenCalledTimes(1);
        expect(io.to).toHaveBeenCalledWith('user_reporter-1');
        expect(emit).toHaveBeenCalledWith('reportUnhidden', { id: 'report-1' });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('unhide is idempotent when the report was not hidden', async () => {
        const report = ownedReport({ hiddenFromReporterAt: null });
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await unhideMyReport(authedReq(), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('unhide returns 404 for a report owned by someone else', async () => {
        const report = ownedReport({ reporter: 'reporter-2', hiddenFromReporterAt: new Date() });
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await unhideMyReport(authedReq(), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(report.save).not.toHaveBeenCalled();
    });
});

describe('getMyReports visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Report.find.mockImplementation(() => chainable([]));
        Report.countDocuments.mockResolvedValue(0);
    });

    test('default query excludes hidden reports (null matches null OR missing)', async () => {
        const res = createRes();
        await getMyReports(authedReq(), res);

        expect(Report.find).toHaveBeenCalledWith(
            expect.objectContaining({
                reporter: 'reporter-1',
                hiddenFromReporterAt: null,
            }),
        );
        expect(Report.countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({ hiddenFromReporterAt: null }),
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('?hidden=only returns just the hidden reports', async () => {
        const res = createRes();
        await getMyReports(authedReq({ query: { hidden: 'only' } }), res);

        expect(Report.find).toHaveBeenCalledWith(
            expect.objectContaining({
                reporter: 'reporter-1',
                hiddenFromReporterAt: { $ne: null },
            }),
        );
        expect(Report.countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({ hiddenFromReporterAt: { $ne: null } }),
        );
    });
});

describe('getReports per-reporter scoping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Report.find.mockImplementation(() => chainable([]));
        Report.countDocuments.mockImplementation(() => ({
            maxTimeMS: jest.fn().mockResolvedValue(0),
        }));
    });

    const findQuery = () => Report.find.mock.calls[0][0];

    test('reporter role: own hidden reports are excluded from public feeds', async () => {
        const res = createRes();
        await getReports(authedReq({ query: {} }), res);

        const query = findQuery();
        expect(query.$nor).toEqual([
            { reporter: 'reporter-1', hiddenFromReporterAt: { $ne: null } },
        ]);
    });

    test('municipal_admin still sees hidden reports (admin queues unaffected)', async () => {
        const res = createRes();
        await getReports(
            authedReq({ user: { _id: 'admin-1', role: 'municipal_admin' }, query: {} }),
            res,
        );

        expect(findQuery().$nor).toBeUndefined();
    });

    test('anonymous viewers still see hidden reports (public map/stats unaffected)', async () => {
        const res = createRes();
        await getReports(authedReq({ user: undefined, query: {} }), res);

        expect(findQuery().$nor).toBeUndefined();
    });

    test('accident-history style query (status=resolved) carries no visibility filter for non-reporters', async () => {
        const res = createRes();
        await getReports(authedReq({ user: undefined, query: { status: 'resolved' } }), res);

        const query = findQuery();
        expect(query.status).toBe('resolved');
        expect(query.$nor).toBeUndefined();
        expect(query.hiddenFromReporterAt).toBeUndefined();
    });
});
