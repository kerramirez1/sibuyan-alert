import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: { findById: jest.fn() },
}));

jest.mock('../models/User.js', () => ({
    default: {},
}));

jest.mock('../models/Municipality.js', () => ({
    default: {},
}));

jest.mock('../models/Notification.js', () => ({
    default: { createAndSend: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn(),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushNotification: jest.fn(),
    pushTemplates: {},
}));

jest.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
    broadcastTransferAcknowledged: jest.fn(),
}));

const { acknowledgeTransfer } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');
const { default: Notification } = await import('../models/Notification.js');
const { broadcastTransferAcknowledged } = await import('../services/socketService.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const createReport = (overrides = {}) => ({
    _id: 'report-1',
    address: 'Boundary Road',
    status: 'transferred',
    municipalityName: 'Magdiwang',
    transferHistory: [{
        _id: 'transfer-1',
        fromMunicipalityName: 'Cajidiocan',
        toMunicipalityName: 'Magdiwang',
        transferredBy: 'source-admin',
        transferredAt: new Date('2026-07-18T08:00:00.000Z'),
        acknowledgedBy: null,
        acknowledgedAt: null,
    }],
    save: jest.fn().mockResolvedValue({}),
    populate: jest.fn().mockResolvedValue({}),
    ...overrides,
});

describe('acknowledgeTransfer controller', () => {
    let req;
    let res;
    let io;

    beforeEach(() => {
        jest.clearAllMocks();
        io = { emit: jest.fn() };
        req = {
            params: { id: 'report-1' },
            user: {
                _id: 'target-admin',
                name: 'Magdiwang Admin',
                role: 'municipal_admin',
                assignedMunicipality: 'Magdiwang',
            },
            app: { get: jest.fn().mockReturnValue(io) },
        };
        res = createRes();
    });

    test('denies callers who are not target municipal administrators', async () => {
        req.user = { _id: 'global-admin', role: 'admin' };

        await acknowledgeTransfer(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(Report.findById).not.toHaveBeenCalled();
    });

    test('returns 404 when the report does not exist', async () => {
        Report.findById.mockResolvedValue(null);

        await acknowledgeTransfer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('rejects reports without a transfer record', async () => {
        Report.findById.mockResolvedValue(createReport({ transferHistory: [] }));

        await acknowledgeTransfer(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('denies a municipal administrator outside the current target municipality', async () => {
        req.user.assignedMunicipality = 'San Fernando';
        Report.findById.mockResolvedValue(createReport());

        await acknowledgeTransfer(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('is idempotent when the latest transfer is already acknowledged', async () => {
        const report = createReport({
            transferHistory: [{
                _id: 'transfer-1',
                toMunicipalityName: 'Magdiwang',
                acknowledgedBy: 'target-admin',
                acknowledgedAt: new Date('2026-07-18T08:30:00.000Z'),
            }],
        });
        Report.findById.mockResolvedValue(report);

        await acknowledgeTransfer(req, res);

        expect(report.save).not.toHaveBeenCalled();
        expect(broadcastTransferAcknowledged).not.toHaveBeenCalled();
        expect(Notification.createAndSend).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Transfer already acknowledged',
        }));
    });

    test('records acknowledgment without changing lifecycle or responder eligibility', async () => {
        const report = createReport({ status: 'responding' });
        Report.findById.mockResolvedValue(report);

        await acknowledgeTransfer(req, res);

        const latestTransfer = report.transferHistory[0];
        expect(report.status).toBe('responding');
        expect(latestTransfer.acknowledgedBy).toBe('target-admin');
        expect(latestTransfer.acknowledgedAt).toBeInstanceOf(Date);
        expect(report.save).toHaveBeenCalledTimes(1);
        expect(broadcastTransferAcknowledged).toHaveBeenCalledWith(io, report, latestTransfer, req.user);
        expect(Notification.createAndSend).toHaveBeenCalledWith(
            expect.objectContaining({
                recipient: 'source-admin',
                type: 'report_transfer_acknowledged',
                data: expect.objectContaining({ reportId: 'report-1' }),
            }),
            io
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Transfer acknowledged successfully',
        }));
    });
});
