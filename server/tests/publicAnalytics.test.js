import { afterEach, describe, expect, test, vi as jest } from 'vitest';

const reportCountDocuments = jest.fn();
const highRiskZoneCountDocuments = jest.fn();

jest.mock('../models/User.js', () => ({
    default: {},
}));

jest.mock('../models/Report.js', () => ({
    default: {
        countDocuments: reportCountDocuments,
    },
}));

jest.mock('../models/HighRiskZone.js', () => ({
    default: {
        countDocuments: highRiskZoneCountDocuments,
    },
}));

const { getPublicAnalytics } = await import('../controllers/analyticsController.js');
const {
    getPhilippineCalendarDayRange,
    getPhilippineCalendarMonthRange,
    PUBLIC_REPORT_STATUSES,
} = await import('../utils/publicAnalytics.js');
const { sortHighRiskZonesBySeverity } = await import('../utils/highRiskZones.js');

afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
});

describe('public homepage analytics', () => {
    test('calculates Philippine calendar-day boundaries in UTC', () => {
        const augustFourth = getPhilippineCalendarDayRange(new Date('2026-08-04T00:30:00.000Z'));

        expect(augustFourth.startAt.toISOString()).toBe('2026-08-03T16:00:00.000Z');
        expect(augustFourth.endAt.toISOString()).toBe('2026-08-04T16:00:00.000Z');
        expect(augustFourth.timezone).toBe('Asia/Manila');
        expect(augustFourth.day).toBe(4);
    });

    test('calculates Philippine calendar-month boundaries in UTC', () => {
        const july = getPhilippineCalendarMonthRange(new Date('2026-07-31T15:59:59.000Z'));
        expect(july.startAt.toISOString()).toBe('2026-06-30T16:00:00.000Z');
        expect(july.endAt.toISOString()).toBe('2026-07-31T16:00:00.000Z');
        expect(july.timezone).toBe('Asia/Manila');
        expect(july.month).toBe(7);

        const august = getPhilippineCalendarMonthRange(new Date('2026-07-31T16:00:00.000Z'));
        expect(august.startAt.toISOString()).toBe('2026-07-31T16:00:00.000Z');
        expect(august.month).toBe(8);
    });

    test('counts every published lifecycle state by verification time and uses matching active-zone semantics', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-07-18T04:00:00.000Z'));
        reportCountDocuments
            .mockResolvedValueOnce(6)
            .mockResolvedValueOnce(24);
        highRiskZoneCountDocuments.mockResolvedValueOnce(3);

        const response = {
            json: jest.fn(),
            status: jest.fn(function status() { return this; }),
        };

        await getPublicAnalytics({}, response);

        const verifiedQuery = reportCountDocuments.mock.calls[0][0];
        expect(verifiedQuery.status.$in).toEqual(PUBLIC_REPORT_STATUSES);
        expect(verifiedQuery.$or[0].verifiedAt).toEqual({
            $gte: new Date('2026-06-30T16:00:00.000Z'),
            $lt: new Date('2026-07-31T16:00:00.000Z'),
        });
        expect(verifiedQuery.$or[1]).toEqual({
            verifiedAt: null,
            createdAt: {
                $gte: new Date('2026-06-30T16:00:00.000Z'),
                $lt: new Date('2026-07-31T16:00:00.000Z'),
            },
        });
        expect(highRiskZoneCountDocuments).toHaveBeenCalledWith({ isActive: true });
        expect(reportCountDocuments.mock.calls[1][0].status.$in).toEqual(PUBLIC_REPORT_STATUSES);
        expect(response.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                verifiedReportsThisMonth: 6,
                activeHighRiskZones: 3,
                totalReportsAllTime: 24,
                period: expect.objectContaining({
                    type: 'calendar_month',
                    timezone: 'Asia/Manila',
                    month: 7,
                }),
            }),
        });
    });

    test('orders modal risk zones by operational severity and then recency', () => {
        const zones = [
            { _id: 'low', severity: 'low', createdAt: '2026-07-18T08:00:00.000Z' },
            { _id: 'critical-old', severity: 'critical', createdAt: '2026-07-17T08:00:00.000Z' },
            { _id: 'critical-new', severity: 'critical', createdAt: '2026-07-18T08:00:00.000Z' },
            { _id: 'high', severity: 'high', createdAt: '2026-07-19T08:00:00.000Z' },
        ];

        expect(sortHighRiskZonesBySeverity(zones).map((zone) => zone._id)).toEqual([
            'critical-new',
            'critical-old',
            'high',
            'low',
        ]);
        expect(zones[0]._id).toBe('low');
    });
});
