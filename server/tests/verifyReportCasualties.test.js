import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock('../models/User.js', () => ({
    default: {
        find: jest.fn(() => ({ select: jest.fn().mockResolvedValue([]) })),
    },
}));

jest.mock('../models/Notification.js', () => ({
    default: {
        createAndSend: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUser: jest.fn().mockResolvedValue(false),
    pushTemplates: {
        reportVerified: jest.fn().mockReturnValue({}),
        reportRejected: jest.fn().mockReturnValue({}),
    },
}));

jest.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
    broadcastReportResolved: jest.fn(),
}));

const { verifyReport } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const createReport = (overrides = {}) => ({
    _id: 'report123',
    status: 'pending',
    municipalityName: 'Cajidiocan',
    address: 'Poblacion coastal road',
    incidentType: 'vehicular',
    casualties: { injured: 1, fatalities: 0, missing: 0 },
    reporter: {
        _id: 'reporter-1',
        name: 'Field Reporter',
        notificationPreferences: {},
        pushSubscription: null,
    },
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
});

const createReq = (body = { status: 'verified' }) => ({
    params: { id: 'report123' },
    body,
    user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
    app: {
        get: jest.fn().mockReturnValue({
            emit: jest.fn(),
            to: jest.fn(() => ({ emit: jest.fn() })),
        }),
    },
});

// Emulates the atomic verify: the pending-status filter and the $set update
// are applied to the in-memory mock report, like MongoDB would apply them.
const emulateAtomicVerify = (report) => {
    Report.findOneAndUpdate.mockImplementation((filter, update) => {
        const matched = (filter?._id === undefined || String(filter._id) === String(report._id))
            && (filter?.status === undefined || filter.status === report.status);
        if (matched) Object.assign(report, update?.$set || {});
        return { populate: jest.fn().mockResolvedValue(matched ? report : null) };
    });
};

describe('verifyReport casualty correction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('applies an admin casualty correction when verifying', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });
        emulateAtomicVerify(report);

        const req = createReq({ status: 'verified', casualties: { injured: 3, fatalities: 1, missing: 0 } });
        const res = createRes();

        await verifyReport(req, res);

        expect(report.casualties).toEqual({ injured: 3, fatalities: 1, missing: 0 });
        // The atomic write bypasses the pre-save hook, so the priority
        // recalculation is applied inline: 3 injured + 1 fatality (x3) = 6.
        expect(report.priority).toBe('urgent');
        expect(Report.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('leaves casualties untouched when no correction is supplied', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });
        emulateAtomicVerify(report);

        await verifyReport(createReq(), createRes());

        expect(report.casualties).toEqual({ injured: 1, fatalities: 0, missing: 0 });
        expect(Report.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    test('returns 400 for a non-whole-number correction', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });
        emulateAtomicVerify(report);

        const res = createRes();
        await verifyReport(createReq({ status: 'verified', casualties: { injured: -2 } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(Report.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('returns 400 when a correction accompanies a rejection', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });
        emulateAtomicVerify(report);

        const res = createRes();
        await verifyReport(
            createReq({ status: 'rejected', rejectionReason: 'Duplicate report', casualties: { injured: 0 } }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Report.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('two concurrent verifies produce exactly one winner (one 200, one 409)', async () => {
        // Shared "database" row; each pre-read takes a stale snapshot so both
        // requests pass the pending gate before either writes — the true race.
        const dbReport = createReport();
        const snapshot = () => ({ ...dbReport, reporter: { ...dbReport.reporter } });
        Report.findById.mockReturnValue({
            populate: jest.fn().mockImplementation(async () => snapshot()),
            select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ status: dbReport.status }) })),
        });
        Report.findOneAndUpdate.mockImplementation((filter, update) => {
            const matched = (filter?._id === undefined || String(filter._id) === String(dbReport._id))
                && (filter?.status === undefined || filter.status === dbReport.status);
            if (matched) Object.assign(dbReport, update?.$set || {});
            return { populate: jest.fn().mockResolvedValue(matched ? snapshot() : null) };
        });

        const res1 = createRes();
        const res2 = createRes();
        await Promise.all([
            verifyReport(createReq({ status: 'verified' }), res1),
            verifyReport(createReq({ status: 'verified' }), res2),
        ]);

        const succeeded = [res1, res2].filter((r) =>
            r.json.mock.calls.some(([payload]) => payload?.success === true));
        const conflicted = [res1, res2].filter((r) =>
            r.status.mock.calls.some(([code]) => code === 409));
        expect(succeeded).toHaveLength(1);
        expect(conflicted).toHaveLength(1);
        expect(dbReport.status).toBe('verified');
    });
});
