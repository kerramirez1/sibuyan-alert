import { describe, expect, test } from 'vitest';
import {
    buildDailyIncidentTrend,
    buildPeriodIncidentTrend,
    countReportsInMonth,
    filterReportsByDayKey,
    filterReportsByPeriodKey,
    getTrendInsight,
} from '../utils/analyticsTrend';

describe('buildDailyIncidentTrend', () => {
    test('aggregates sparse daily reports into one calendar timeline', () => {
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 7, 1),
            now: '2026-08-07T12:00:00+08:00',
            reports: [
                { createdAt: '2026-08-03T08:00:00+08:00' },
                { createdAt: '2026-08-03T11:30:00+08:00' },
                { createdAt: '2026-08-04T09:00:00+08:00' },
                { createdAt: 'invalid-date' },
                { createdAt: '2026-07-31T23:00:00+08:00' },
                { createdAt: '2026-08-08T09:00:00+08:00' },
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

    test('buckets UTC-boundary instants into the Manila calendar day', () => {
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 7, 1),
            now: '2026-08-09T12:00:00+08:00',
            reports: [
                // 2026-08-07 16:30Z == 2026-08-08 00:30 Manila.
                { createdAt: '2026-08-07T16:30:00Z' },
            ],
        });

        expect(trend[6]).toMatchObject({ dayKey: '2026-08-07', total: 0 });
        expect(trend[7]).toMatchObject({ dayKey: '2026-08-08', total: 1 });
    });

    test('uses the full calendar month for historical selections', () => {
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 3, 1),
            now: '2026-08-07T12:00:00+08:00',
            reports: [],
        });

        expect(trend).toHaveLength(30);
        expect(trend.at(-1).date).toBe('Apr 30');
    });

    test('accepts epoch, Firestore-style, and Date timestamps', () => {
        const instant = '2026-08-03T08:00:00+08:00';
        const epoch = Date.parse(instant);
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 7, 1),
            now: '2026-08-07T12:00:00+08:00',
            reports: [
                { createdAt: epoch },
                { createdAt: { seconds: epoch / 1000 } },
                { createdAt: { toDate: () => new Date(epoch) } },
                { createdAt: new Date(epoch) },
            ],
        });

        expect(trend[2]).toMatchObject({ dayKey: '2026-08-03', total: 4 });
    });

    test('returns an empty timeline for invalid input', () => {
        expect(buildDailyIncidentTrend({ selectedMonth: 'not-a-date' })).toEqual([]);
    });

    test('buckets daily totals by severity and stamps stable day keys', () => {
        const trend = buildDailyIncidentTrend({
            selectedMonth: new Date(2026, 7, 1),
            now: '2026-08-07T12:00:00+08:00',
            reports: [
                { createdAt: '2026-08-03T08:00:00+08:00', severity: 'critical' },
                { createdAt: '2026-08-03T11:30:00+08:00', severity: 'CRITICAL' },
                { createdAt: '2026-08-04T09:00:00+08:00', severity: 'minor' },
                { createdAt: '2026-08-05T09:00:00+08:00', severity: 'unknown-level' },
            ],
        });

        expect(trend[2]).toMatchObject({
            dayKey: '2026-08-03',
            total: 2,
            critical: 2,
            moderate: 0,
            unknown: 0,
        });
        expect(trend[3]).toMatchObject({ dayKey: '2026-08-04', total: 1, minor: 1 });
        // Unknown severities get their own bucket instead of inflating moderate
        expect(trend[4]).toMatchObject({ total: 1, moderate: 0, unknown: 1 });
        expect(trend[6]).toMatchObject({
            dayKey: '2026-08-07',
            total: 0,
            minor: 0,
            moderate: 0,
            severe: 0,
            critical: 0,
            unknown: 0,
        });
        for (const day of trend) {
            expect(day.minor + day.moderate + day.severe + day.critical + day.unknown).toBe(day.total);
        }
    });

    test('counts reports per Manila calendar month with optional pace cap', () => {
        const reports = [
            { createdAt: '2026-08-08T10:00:00+08:00' },
            { createdAt: '2026-08-09T10:00:00+08:00' },
            { createdAt: '2026-07-31T10:00:00+08:00' },
            { createdAt: 'invalid-date' },
        ];

        expect(countReportsInMonth(reports, new Date(2026, 7, 1))).toBe(2);
        expect(countReportsInMonth(reports, new Date(2026, 6, 1))).toBe(1);
        expect(countReportsInMonth(reports, new Date(2026, 7, 1), { throughDayOfMonth: 8 })).toBe(1);
        expect(countReportsInMonth(reports, 'not-a-date')).toBe(0);
        expect(countReportsInMonth(null, new Date(2026, 7, 1))).toBe(0);
    });

    test('filters reports to one Manila calendar day for drill-downs', () => {
        const reports = [
            { _id: 'a', createdAt: '2026-08-08T10:00:00+08:00' },
            { _id: 'b', createdAt: '2026-08-08T23:00:00+08:00' },
            // 2026-08-08 16:30Z is already Aug 9 in Manila.
            { _id: 'c', createdAt: '2026-08-08T16:30:00Z' },
            { _id: 'd', createdAt: 'invalid-date' },
        ];

        expect(filterReportsByDayKey(reports, '2026-08-08').map((r) => r._id)).toEqual(['a', 'b']);
        expect(filterReportsByDayKey(reports, '2026-08-09').map((r) => r._id)).toEqual(['c']);
        expect(filterReportsByDayKey(reports, null)).toHaveLength(4);
    });

    test('derives total, peak, quiet days, and month delta for the insight line', () => {
        const chartData = [
            { date: 'Aug 8', fullDate: 'Aug 8, 2026', dayKey: '2026-08-08', total: 2 },
            { date: 'Aug 9', fullDate: 'Aug 9, 2026', dayKey: '2026-08-09', total: 0 },
            { date: 'Aug 10', fullDate: 'Aug 10, 2026', dayKey: '2026-08-10', total: 1 },
        ];

        const insight = getTrendInsight(chartData, { selectedMonth: new Date(2026, 7, 1), prevMonthCount: 1 });

        expect(insight.total).toBe(3);
        expect(insight.peak).toMatchObject({ label: 'Aug 8', dayKey: '2026-08-08', count: 2 });
        expect(insight.quietDays).toBe(1);
        expect(insight.delta).toMatchObject({ diff: 2, label: '2 more than Jul' });
    });

    test('omits peak and delta when there is nothing to compare', () => {
        const empty = getTrendInsight(
            [{ date: 'Aug 8', fullDate: 'Aug 8, 2026', dayKey: '2026-08-08', total: 0 }],
            { selectedMonth: new Date(2026, 7, 1), prevMonthCount: 0 }
        );

        expect(empty).toMatchObject({ total: 0, peak: null, quietDays: 1, delta: null });
    });

    test('names the comparison period when it is not a month', () => {
        const insight = getTrendInsight(
            [{ date: 'Jan', fullDate: 'January 2026', dayKey: '2026-01', total: 5 }],
            { prevMonthCount: 2, prevLabel: '2025' }
        );

        expect(insight.delta).toMatchObject({ diff: 3, label: '3 more than 2025' });
    });
});

describe('buildPeriodIncidentTrend', () => {
    const reports = [
        { createdAt: '2026-03-04T08:00:00+08:00', severity: 'minor' },
        { createdAt: '2026-03-20T09:00:00+08:00', severity: 'critical' },
        { createdAt: '2025-11-02T10:00:00+08:00', severity: 'moderate' },
    ];
    const now = '2026-09-25T12:00:00+08:00';

    test('buckets a year into months, stopping at the month in progress', () => {
        const trend = buildPeriodIncidentTrend({ reports, scope: 'yearly', selectedYear: 2026, now });

        // January through September: October has not happened yet in 2026.
        expect(trend).toHaveLength(9);
        expect(trend[0]).toMatchObject({ date: 'Jan', fullDate: 'January 2026', dayKey: '2026-01', total: 0 });
        expect(trend[2]).toMatchObject({ dayKey: '2026-03', total: 2, minor: 1, critical: 1 });
        expect(trend.at(-1).dayKey).toBe('2026-09');
    });

    test('buckets all time by year and keeps a quiet year as a gap', () => {
        const trend = buildPeriodIncidentTrend({ reports, scope: 'all_time', now });

        expect(trend.map((bucket) => bucket.dayKey)).toEqual(['2025', '2026']);
        expect(trend[0]).toMatchObject({ date: '2025', total: 1, moderate: 1 });
        expect(trend[1]).toMatchObject({ date: '2026', total: 2 });
    });

    test('delegates to the daily trend in monthly scope', () => {
        const trend = buildPeriodIncidentTrend({
            reports,
            scope: 'monthly',
            selectedMonth: new Date(2026, 2, 1),
            now,
        });

        expect(trend).toHaveLength(31);
        expect(trend[3]).toMatchObject({ dayKey: '2026-03-04', total: 1 });
        expect(trend[19]).toMatchObject({ dayKey: '2026-03-20', total: 1 });
    });

    test('returns no buckets at all when nothing was ever recorded', () => {
        expect(buildPeriodIncidentTrend({ reports: [], scope: 'all_time', now })).toEqual([]);
    });
});

describe('filterReportsByPeriodKey', () => {
    const reports = [
        { _id: 'a', createdAt: '2026-03-04T08:00:00+08:00' },
        { _id: 'b', createdAt: '2026-03-20T09:00:00+08:00' },
        { _id: 'c', createdAt: '2026-04-01T09:00:00+08:00' },
        { _id: 'd', createdAt: 'invalid-date' },
    ];

    test('matches the bucket key at the granularity the scope implies', () => {
        expect(filterReportsByPeriodKey(reports, { scope: 'monthly', periodKey: '2026-03-04' }).map((r) => r._id))
            .toEqual(['a']);
        expect(filterReportsByPeriodKey(reports, { scope: 'yearly', periodKey: '2026-03' }).map((r) => r._id))
            .toEqual(['a', 'b']);
        expect(filterReportsByPeriodKey(reports, { scope: 'all_time', periodKey: '2026' }).map((r) => r._id))
            .toEqual(['a', 'b', 'c']);
    });

    test('returns everything for no key and nothing for no reports', () => {
        expect(filterReportsByPeriodKey(reports, { scope: 'all_time', periodKey: null })).toHaveLength(4);
        expect(filterReportsByPeriodKey(null, { scope: 'monthly', periodKey: '2026-03-04' })).toEqual([]);
    });
});
