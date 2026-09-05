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
    pushTemplates: {},
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

const { dismissTransferredReport } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const transferredOutReport = (overrides = {}) => ({
    _id: 'report123',
    status: 'transferred',
    municipalityName: 'Magdiwang',
    originalMunicipalityName: 'Cajidiocan',
    transferHistory: [
        { fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'Magdiwang', reason: 'Mutual aid' },
    ],
    hiddenFromMunicipalities: [],
    ...overrides,
});

const originAdminReq = (bodyless = {}) => ({
    params: { id: 'report123' },
    user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
    ...bodyless,
});

describe('dismissTransferredReport controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('origin admin dismisses a transferred-out copy without touching the record', async () => {
        Report.findById.mockResolvedValue(transferredOutReport());

        const res = createRes();
        await dismissTransferredReport(originAdminReq(), res);

        expect(Report.updateOne).toHaveBeenCalledWith(
            { _id: 'report123' },
            { $addToSet: { hiddenFromMunicipalities: 'Cajidiocan' } }
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('dismisses acknowledged downstream copies (e.g. responding), not just transferred status', async () => {
        Report.findById.mockResolvedValue(transferredOutReport({ status: 'responding' }));

        const res = createRes();
        await dismissTransferredReport(originAdminReq(), res);

        expect(Report.updateOne).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('returns 404 when the report does not exist', async () => {
        Report.findById.mockResolvedValue(null);

        const res = createRes();
        await dismissTransferredReport(originAdminReq(), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(Report.updateOne).not.toHaveBeenCalled();
    });

    test('returns 400 for reports without transfer history', async () => {
        Report.findById.mockResolvedValue(transferredOutReport({
            status: 'verified',
            municipalityName: 'Cajidiocan',
            transferHistory: [],
            originalMunicipalityName: 'Cajidiocan',
        }));

        const res = createRes();
        await dismissTransferredReport(originAdminReq(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Report.updateOne).not.toHaveBeenCalled();
    });

    test('returns 400 when the report is still in the admin municipality (use delete instead)', async () => {
        Report.findById.mockResolvedValue(transferredOutReport({
            municipalityName: 'Cajidiocan',
        }));

        const res = createRes();
        await dismissTransferredReport(originAdminReq(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Report.updateOne).not.toHaveBeenCalled();
    });

    test('returns 403 for an admin with no origin link to the transfer', async () => {
        Report.findById.mockResolvedValue(transferredOutReport());

        const res = createRes();
        await dismissTransferredReport({
            params: { id: 'report123' },
            user: { _id: 'admin-9', role: 'municipal_admin', assignedMunicipality: 'San Fernando' },
        }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(Report.updateOne).not.toHaveBeenCalled();
    });
});
