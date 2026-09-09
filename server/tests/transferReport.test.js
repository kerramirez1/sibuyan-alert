import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

// Mock dependencies
jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
    },
}));

jest.mock('../models/Municipality.js', () => ({
    default: {
        findById: jest.fn(),
    },
}));

jest.mock('../models/User.js', () => ({
    default: {
        find: jest.fn(),
    },
}));

jest.mock('../models/Notification.js', () => ({
    default: {
        createAndSend: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
    broadcastReportTransfer: jest.fn(),
    broadcastMultiUnitResponse: jest.fn(),
}));

const { transferReport, respondToReport } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');
const { default: Municipality } = await import('../models/Municipality.js');
const { default: User } = await import('../models/User.js');
const { broadcastReportTransfer } = await import('../services/socketService.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('transferReport controller', () => {
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            params: { id: 'report123' },
            body: {
                targetMunicipalityId: 'muni456',
                reason: 'Geographically closer to Magdiwang station',
            },
            app: {
                get: jest.fn().mockReturnValue({ emit: jest.fn() }),
            },
            user: {
                _id: 'adminUser123',
                role: 'municipal_admin',
                assignedMunicipality: 'Cajidiocan',
            },
        };
        res = createRes();
    });

    test('returns 404 if report is not found', async () => {
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(null);

        await transferReport(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: 'Report not found',
            })
        );
    });

    test('returns 400 if report status is not transferable', async () => {
        const mockReport = {
            status: 'pending', // Pending is not transferable
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        await transferReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: expect.stringContaining('Cannot transfer a report with status'),
            })
        );
    });

    test('returns 400 if report has an ongoing response', async () => {
        const mockReport = {
            status: 'responding',
            responders: [{ user: 'responder-1' }],
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        await transferReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: 'Cannot transfer an incident with an ongoing response.',
            })
        );
    });

    test('returns 403 if admin does not have access to current report municipality', async () => {
        const mockReport = {
            status: 'verified',
            municipalityName: 'Magdiwang', // Admin is assigned to Cajidiocan
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        await transferReport(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: expect.stringContaining('Not authorized to manage or transfer reports'),
            })
        );
    });

    test('returns 404 if target municipality does not exist', async () => {
        const mockReport = {
            status: 'verified',
            municipalityName: 'Cajidiocan',
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);
        Municipality.findById.mockResolvedValue(null);

        await transferReport(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: 'Target municipality not found',
            })
        );
    });

    test('returns 400 if transferring to the same municipality', async () => {
        const mockReport = {
            status: 'verified',
            municipality: 'muni123',
            municipalityName: 'Cajidiocan',
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        const mockTargetMuni = {
            _id: 'muni123',
            name: 'Cajidiocan',
        };
        Municipality.findById.mockResolvedValue(mockTargetMuni);

        await transferReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: 'Cannot transfer to the current handling municipality',
            })
        );
    });

    test('successfully transfers report status, logs history, and broadcasts real-time updates', async () => {
        const mockReport = {
            status: 'verified',
            municipality: 'muniCajidiocan',
            municipalityName: 'Cajidiocan',
            transferHistory: [],
            save: jest.fn().mockResolvedValue({}),
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        const mockTargetMuni = {
            _id: 'muniMagdiwang',
            name: 'Magdiwang',
        };
        Municipality.findById.mockResolvedValue(mockTargetMuni);
        User.find.mockReturnValue({
            select: jest.fn().mockResolvedValue([{ _id: 'responderUser1' }]),
        });

        await transferReport(req, res);

        expect(mockReport.status).toBe('transferred');
        expect(mockReport.municipality).toBe('muniMagdiwang');
        expect(mockReport.municipalityName).toBe('Magdiwang');
        expect(mockReport.transferHistory.length).toBe(1);
        expect(mockReport.transferHistory[0]).toEqual(
            expect.objectContaining({
                fromMunicipalityName: 'Cajidiocan',
                toMunicipalityName: 'Magdiwang',
                reason: 'Geographically closer to Magdiwang station',
            })
        );
        expect(mockReport.save).toHaveBeenCalled();
        expect(broadcastReportTransfer).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining('successfully transferred to Magdiwang'),
            })
        );
    });

    test('allows a destination responder to accept a transferred report', async () => {
        const mockReport = {
            _id: 'report123',
            status: 'transferred',
            municipalityName: 'Magdiwang',
            address: 'Boundary Road',
            responders: [
                { user: 'originalResponder', unitName: 'MDRRMO - Cajidiocan', unitType: 'MDRRMO' },
            ],
            reporter: {
                _id: 'reporter1',
                notificationPreferences: { browserPush: false },
            },
            save: jest.fn().mockResolvedValue({}),
            toObject: jest.fn().mockReturnValue({ _id: 'report123' }),
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);
        User.find.mockReturnValue({
            select: jest.fn().mockResolvedValue([]),
        });
        req.user = {
            _id: 'destinationResponder',
            role: 'responder',
            agency: 'BFP',
            assignedMunicipality: 'Magdiwang',
            responderUnit: 'BFP - Magdiwang',
        };
        req.body = {};

        await respondToReport(req, res);

        expect(mockReport.status).toBe('responding');
        expect(mockReport.responders).toHaveLength(2);
        expect(mockReport.responders[1]).toEqual(
            expect.objectContaining({
                user: 'destinationResponder',
                unitName: 'BFP - Magdiwang',
                unitType: 'BFP',
            })
        );
        expect(mockReport.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
