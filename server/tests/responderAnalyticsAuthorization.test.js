import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../models/HighRiskZone.js', () => ({
    default: {
        countDocuments: vi.fn().mockResolvedValue(0),
        find: vi.fn(() => ({
            sort: vi.fn(() => ({
                limit: vi.fn(() => ({
                    select: vi.fn().mockResolvedValue([]),
                })),
            })),
        })),
    },
}));
vi.mock('../models/Report.js', () => ({
    default: {
        countDocuments: vi.fn(),
        aggregate: vi.fn().mockResolvedValue([]),
    },
}));

const { getResponderAnalytics } = await import('../controllers/analyticsController.js');
const { default: Report } = await import('../models/Report.js');
const { default: HighRiskZone } = await import('../models/HighRiskZone.js');

let highRiskZoneSort;

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
        Report.aggregate.mockResolvedValue([]);
        HighRiskZone.countDocuments.mockResolvedValue(0);
        highRiskZoneSort = vi.fn(() => ({
            limit: vi.fn(() => ({
                select: vi.fn().mockResolvedValue([]),
            })),
        }));
        HighRiskZone.find.mockReturnValue({
            sort: highRiskZoneSort,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
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
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-04T00:30:00.000Z'));
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
        expect(Report.countDocuments).toHaveBeenCalledTimes(5);
        const municipalityScope = {
            $or: [
                { municipalityName: 'Magdiwang' },
                { originalMunicipalityName: 'Magdiwang' },
                { 'transferHistory.fromMunicipalityName': 'Magdiwang' },
            ],
        };
        expect(Report.countDocuments.mock.calls[0][0]).toEqual(expect.objectContaining({
            ...municipalityScope,
            status: { $in: ['verified', 'transferred', 'responding'] },
        }));
        expect(Report.countDocuments.mock.calls[1][0]).toEqual(expect.objectContaining({
            $and: [
                municipalityScope,
                {
                    $or: [
                        { status: 'transferred' },
                        {
                            status: 'verified',
                            respondedBy: null,
                            'responders.0': { $exists: false },
                        },
                    ],
                },
            ],
        }));
        expect(HighRiskZone.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
            municipality: 'Magdiwang',
            isActive: true,
        }));
        expect(HighRiskZone.find).toHaveBeenCalledWith(expect.objectContaining({
            municipality: 'Magdiwang',
            isActive: true,
            severity: { $in: ['critical', 'high'] },
        }));
        expect(highRiskZoneSort).toHaveBeenCalledWith({ severity: 1, createdAt: -1 });
        expect(Report.countDocuments.mock.calls[2][0]).toEqual(expect.objectContaining({
            $and: [
                municipalityScope,
                {
                    status: 'resolved',
                    resolvedAt: {
                        $gte: new Date('2026-08-03T16:00:00.000Z'),
                        $lt: new Date('2026-08-04T16:00:00.000Z'),
                    },
                    $or: [
                        { resolvedBy: 'responder-1' },
                        { respondedBy: 'responder-1' },
                        { 'responders.user': 'responder-1' },
                    ],
                },
            ],
        }));
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
