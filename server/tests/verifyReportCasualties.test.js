import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
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

describe('verifyReport casualty correction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('applies an admin casualty correction when verifying', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });

        const req = createReq({ status: 'verified', casualties: { injured: 3, fatalities: 1, missing: 0 } });
        const res = createRes();

        await verifyReport(req, res);

        expect(report.casualties).toEqual({ injured: 3, fatalities: 1, missing: 0 });
        expect(report.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('leaves casualties untouched when no correction is supplied', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });

        await verifyReport(createReq(), createRes());

        expect(report.casualties).toEqual({ injured: 1, fatalities: 0, missing: 0 });
        expect(report.save).toHaveBeenCalled();
    });

    test('returns 400 for a non-whole-number correction', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });

        const res = createRes();
        await verifyReport(createReq({ status: 'verified', casualties: { injured: -2 } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(report.save).not.toHaveBeenCalled();
    });

    test('returns 400 when a correction accompanies a rejection', async () => {
        const report = createReport();
        Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });

        const res = createRes();
        await verifyReport(
            createReq({ status: 'rejected', rejectionReason: 'Duplicate report', casualties: { injured: 0 } }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(report.save).not.toHaveBeenCalled();
    });
});
