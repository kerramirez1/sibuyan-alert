import { describe, expect, test } from 'vitest';
import { buildDailyIncidentTrend } from '../utils/analyticsTrend';

describe('buildDailyIncidentTrend', () => {
    test('aggregates sparse daily reports into one calendar timeline', () => {
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 7, 1),
            now: new Date(2026, 7, 7, 12),
            reports: [
                { createdAt: '2026-08-03T08:00:00' },
                { createdAt: '2026-08-03T11:30:00' },
                { createdAt: '2026-08-04T09:00:00' },
                { createdAt: 'invalid-date' },
                { createdAt: '2026-07-31T23:00:00' },
                { createdAt: '2026-08-08T09:00:00' },
            ],
        });

        expect(trend).toHaveLength(7);
        expect(trend[2]).toMatchObject({
            date: 'Aug 3',
            fullDate: 'Aug 3, 2026',
            total: 2,
        });
        expect(trend[3]).toMatchObject({ total: 1 });
        expect(trend[6]).toMatchObject({ total: 0 });
    });

    test('uses the full calendar month for historical selections', () => {
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 3, 1),
            now: new Date(2026, 7, 7),
            reports: [],
        });

        expect(trend).toHaveLength(30);
        expect(trend.at(-1).date).toBe('Apr 30');
    });

    test('returns an empty timeline for invalid input', () => {
        expect(buildDailyIncidentTrend({ selectedMonth: 'not-a-date' })).toEqual([]);
    });
});
