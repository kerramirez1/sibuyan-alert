import { describe, expect, test, jest, beforeEach } from '@jest/globals';

// Mock the dependencies first
jest.unstable_mockModule('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
    },
}));

jest.unstable_mockModule('../models/User.js', () => ({
    default: {},
}));

jest.unstable_mockModule('../models/Notification.js', () => ({
    default: {
        createAndSend: jest.fn().mockResolvedValue({}),
    },
}));

jest.unstable_mockModule('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../services/pushService.js', () => ({
    sendPushNotification: jest.fn().mockResolvedValue({}),
    pushTemplates: {
        reporterVerified: jest.fn(),
        reporterRejected: jest.fn(),
    },
}));

jest.unstable_mockModule('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
}));

// Now import the controller and the mocked Report model
const { resolveReport } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('resolveReport controller', () => {
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            params: { id: 'report123' },
            body: { resolutionNotes: 'Fixed the issue' },
            app: {
                get: jest.fn().mockReturnValue({ emit: jest.fn() }),
            },
        };
        res = createRes();
    });

    test('returns 404 if report is not found', async () => {
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(null);

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: 'Report not found',
            })
        );
    });

    test('returns 400 if report status is not responding', async () => {
        const mockReport = {
            status: 'verified',
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: expect.stringContaining('Only reports being responded to can be resolved'),
            })
        );
    });

    test('denies access if user is responder but not first responder and not in responders list', async () => {
        const mockReport = {
            status: 'responding',
            respondedBy: 'user1',
            responders: [{ user: 'user1', unitName: 'MDRRMO', unitType: 'MDRRMO' }],
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        req.user = { _id: 'user2', role: 'responder' };

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: expect.stringContaining('Only assigned responders or administrators can resolve this report'),
            })
        );
    });

    test('allows resolution if user is the first responder', async () => {
        const mockReport = {
            status: 'responding',
            respondedBy: 'user1',
            responders: [{ user: 'user1', unitName: 'MDRRMO', unitType: 'MDRRMO' }],
            save: jest.fn().mockResolvedValue({}),
            populate: jest.fn().mockResolvedValue({}),
            reporter: { _id: 'reporter1', notificationPreferences: { email: false } },
            address: 'Main Street',
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        req.user = { _id: 'user1', role: 'responder', agency: 'MDRRMO' };

        await resolveReport(req, res);

        expect(mockReport.status).toBe('resolved');
        expect(mockReport.resolvedBy).toBe('user1');
        expect(mockReport.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining('Report resolved successfully'),
            })
        );
    });

    test('allows resolution if user is a joined responder in responders list', async () => {
        const mockReport = {
            status: 'responding',
            respondedBy: 'user1',
            responders: [
                { user: 'user1', unitName: 'MDRRMO', unitType: 'MDRRMO' },
                { user: 'user2', unitName: 'BFP', unitType: 'BFP' },
            ],
            save: jest.fn().mockResolvedValue({}),
            populate: jest.fn().mockResolvedValue({}),
            reporter: { _id: 'reporter1', notificationPreferences: { email: false } },
            address: 'Main Street',
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        req.user = { _id: 'user2', role: 'responder', agency: 'BFP' };

        await resolveReport(req, res);

        expect(mockReport.status).toBe('resolved');
        expect(mockReport.resolvedBy).toBe('user2');
        expect(mockReport.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining('Report resolved successfully'),
            })
        );
    });

    test('allows resolution if user is an admin or municipal admin', async () => {
        const mockReport = {
            status: 'responding',
            respondedBy: 'user1',
            responders: [{ user: 'user1', unitName: 'MDRRMO', unitType: 'MDRRMO' }],
            save: jest.fn().mockResolvedValue({}),
            populate: jest.fn().mockResolvedValue({}),
            reporter: { _id: 'reporter1', notificationPreferences: { email: false } },
            address: 'Main Street',
        };
        Report.findById.mockReturnValue({
            populate: jest.fn().mockReturnThis(),
        });
        Report.findById().populate.mockResolvedValue(mockReport);

        req.user = { _id: 'adminUser', role: 'municipal_admin', agency: 'LGU' };

        await resolveReport(req, res);

        expect(mockReport.status).toBe('resolved');
        expect(mockReport.resolvedBy).toBe('adminUser');
        expect(mockReport.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining('Report resolved successfully'),
            })
        );
    });
});
