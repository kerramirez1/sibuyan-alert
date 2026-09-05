import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
        updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    },
}));

jest.mock('../models/User.js', () => ({
    default: {},
}));

jest.mock('../models/Municipality.js', () => ({
    default: {},
}));

jest.mock('../models/Notification.js', () => ({
    default: {
        createAndSend: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('../models/AuthSession.js', () => ({
    default: {},
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

jest.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: jest.fn(),
}));

const { recordReportView } = await import('../controllers/reportController.js');
const { getOperationalReportById } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');

const REPORT_ID = '64b100000000000000000011';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('recordReportView', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('counts a guest view and returns the incremented count', async () => {
        Report.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: REPORT_ID, reporter: 'reporter-1', viewCount: 4 }),
        });

        const res = createRes();
        await recordReportView({ params: { id: REPORT_ID }, user: null }, res);

        expect(Report.updateOne).toHaveBeenCalledWith({ _id: REPORT_ID }, { $inc: { viewCount: 1 } });
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { viewCount: 5, counted: true },
        });
    });

    test('counts an authenticated non-owner view', async () => {
        Report.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: REPORT_ID, reporter: 'reporter-1', viewCount: 0 }),
        });

        const res = createRes();
        await recordReportView({ params: { id: REPORT_ID }, user: { _id: 'responder-9' } }, res);

        expect(Report.updateOne).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { viewCount: 1, counted: true },
        });
    });

    test('skips owner self-views without touching the counter', async () => {
        Report.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: REPORT_ID, reporter: 'reporter-1', viewCount: 7 }),
        });

        const res = createRes();
        await recordReportView({ params: { id: REPORT_ID }, user: { _id: 'reporter-1' } }, res);

        expect(Report.updateOne).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { viewCount: 7, counted: false },
        });
    });

    test('returns 400 for a malformed id and 404 when missing', async () => {
        const badRes = createRes();
        await recordReportView({ params: { id: 'not-an-id' }, user: null }, badRes);
        expect(badRes.status).toHaveBeenCalledWith(400);
        expect(Report.findById).not.toHaveBeenCalled();

        Report.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
        const missingRes = createRes();
        await recordReportView({ params: { id: REPORT_ID }, user: null }, missingRes);
        expect(missingRes.status).toHaveBeenCalledWith(404);
        expect(Report.updateOne).not.toHaveBeenCalled();
    });
});

describe('getOperationalReportById view counting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('increments viewCount on admin inspection and returns the new count', async () => {
        const report = {
            _id: REPORT_ID,
            status: 'verified',
            municipalityName: 'Cajidiocan',
            viewCount: 5,
            casualties: { injured: 0, fatalities: 0, missing: 0 },
        };
        const populate = jest.fn();
        const chain = { populate, then: (resolve) => resolve(report) };
        populate.mockReturnValue(chain);
        Report.findById.mockReturnValue(chain);

        const res = createRes();
        await getOperationalReportById({
            params: { id: REPORT_ID },
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
        }, res);

        expect(Report.updateOne).toHaveBeenCalledWith({ _id: REPORT_ID }, { $inc: { viewCount: 1 } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: expect.objectContaining({ viewCount: 6 }),
        }));
    });
});
