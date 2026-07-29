import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../models/HighRiskZone.js', () => ({ default: {} }));
vi.mock('../models/Report.js', () => ({
    default: {
        countDocuments: vi.fn(),
    },
}));

const { getResponderAnalytics } = await import('../controllers/analyticsController.js');
const { default: Report } = await import('../models/Report.js');

const createResponse = () => {
    const response = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
};

describe('responder analytics municipality authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Report.countDocuments.mockResolvedValue(0);
    });

    test('fails closed when the responder has no assigned municipality', async () => {
        const request = { user: { _id: 'responder-1', role: 'responder' } };
        const response = createResponse();

        await getResponderAnalytics(request, response);

        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: expect.stringContaining('Municipality is not assigned'),
        }));
        expect(Report.countDocuments).not.toHaveBeenCalled();
    });

    test('applies the assigned municipality to every responder metric', async () => {
        const request = {
            user: {
                _id: 'responder-1',
                role: 'responder',
                assignedMunicipality: 'Magdiwang',
            },
        };
        const response = createResponse();

        await getResponderAnalytics(request, response);

        expect(response.status).not.toHaveBeenCalled();
        expect(Report.countDocuments).toHaveBeenCalledTimes(2);
        Report.countDocuments.mock.calls.forEach(([query]) => {
            expect(query).toEqual(expect.objectContaining({ municipalityName: 'Magdiwang' }));
        });
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
