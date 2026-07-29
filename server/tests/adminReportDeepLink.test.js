import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../models/Report.js', () => ({
    default: {
        find: vi.fn(),
        countDocuments: vi.fn(),
    },
}));
vi.mock('../models/Municipality.js', () => ({ default: {} }));
vi.mock('../models/Notification.js', () => ({ default: {} }));
vi.mock('../models/AuthSession.js', () => ({ default: {} }));
vi.mock('../services/emailService.js', () => ({
    sendVerificationEmail: vi.fn(),
    sendReportStatusEmail: vi.fn(),
}));
vi.mock('../services/pushService.js', () => ({
    sendPushToUser: vi.fn(),
    pushTemplates: {},
}));
vi.mock('../services/socketService.js', () => ({
    broadcastReportRejected: vi.fn(),
    broadcastReportResolved: vi.fn(),
    broadcastReportVerified: vi.fn(),
    broadcastVerifiedReportToResponders: vi.fn(),
}));
vi.mock('../services/gridFsService.js', () => ({ deleteGridFsFilesByUrls: vi.fn() }));

const { getAllReports } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');

const createResponse = () => {
    const response = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
};

describe('municipality-scoped incident notification deep links', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('rejects malformed report identifiers before querying MongoDB', async () => {
        const request = {
            query: { reportId: '../admin/users' },
            user: { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
        };
        const response = createResponse();

        await getAllReports(request, response);

        expect(response.status).toHaveBeenCalledWith(400);
        expect(Report.find).not.toHaveBeenCalled();
    });

    test('combines a valid report ID with the authenticated municipality scope', async () => {
        const reportId = '64b100000000000000000001';
        const queryChain = {
            populate: vi.fn(),
            sort: vi.fn(),
            limit: vi.fn(),
            skip: vi.fn().mockResolvedValue([]),
        };
        queryChain.populate.mockReturnValue(queryChain);
        queryChain.sort.mockReturnValue(queryChain);
        queryChain.limit.mockReturnValue(queryChain);
        Report.find.mockReturnValue(queryChain);
        Report.countDocuments.mockResolvedValue(0);
        const request = {
            query: { reportId },
            user: { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
        };
        const response = createResponse();

        await getAllReports(request, response);

        expect(Report.find).toHaveBeenCalledWith(expect.objectContaining({
            _id: reportId,
            $and: [{
                $or: [
                    { municipalityName: 'Cajidiocan' },
                    { originalMunicipalityName: 'Cajidiocan' },
                ],
            }],
        }));
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
