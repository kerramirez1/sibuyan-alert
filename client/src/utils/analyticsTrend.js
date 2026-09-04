import {
    eachDayOfInterval,
    endOfMonth,
    format,
    isSameMonth,
    isValid,
    parseISO,
    startOfMonth,
} from 'date-fns';

const toValidDate = (value) => {
    if (value instanceof Date) return isValid(value) ? value : null;
    if (typeof value !== 'string' || !value.trim()) return null;

    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
};

const getDayKey = (date) => format(date, 'yyyy-MM-dd');

const SEVERITY_LEVELS = Object.freeze(['minor', 'moderate', 'severe', 'critical']);

const normalizeSeverity = (value) => {
    const level = String(value || '').toLowerCase();
    return SEVERITY_LEVELS.includes(level) ? level : 'moderate';
};

const emptySeverityBuckets = () => ({ minor: 0, moderate: 0, severe: 0, critical: 0 });

export const buildDailyIncidentTrend = ({
    reports = [],
    selectedMonth,
    now = new Date(),
} = {}) => {
    const month = toValidDate(selectedMonth);
    const referenceDate = toValidDate(now) || new Date();

    if (!month) return [];

    const intervalStart = startOfMonth(month);
    const intervalEnd = isSameMonth(month, referenceDate)
        ? referenceDate
        : endOfMonth(month);

    if (intervalEnd < intervalStart) return [];

    const dailyCounts = new Map();
    const dailySeverity = new Map();
    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (!reportedAt || !isSameMonth(reportedAt, month) || reportedAt > intervalEnd) continue;

        const key = getDayKey(reportedAt);
        dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
        if (!dailySeverity.has(key)) dailySeverity.set(key, emptySeverityBuckets());
        const buckets = dailySeverity.get(key);
        buckets[normalizeSeverity(report?.severity)] += 1;
    }

    return eachDayOfInterval({ start: intervalStart, end: intervalEnd }).map((date) => {
        const key = getDayKey(date);
        const total = dailyCounts.get(key) || 0;

        return {
            date: format(date, 'MMM d'),
            fullDate: format(date, 'MMM d, yyyy'),
            dayKey: key,
            total,
            ...(dailySeverity.get(key) || emptySeverityBuckets()),
        };
    });
};

/**
 * Count reports whose createdAt falls in the given calendar month.
 * Used for month-over-month deltas without extra endpoints.
 */
export const countReportsInMonth = (reports = [], monthDate) => {
    const month = toValidDate(monthDate);
    if (!month) return 0;
    let count = 0;
    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (reportedAt && isSameMonth(reportedAt, month)) count += 1;
    }
    return count;
};

/**
 * Keep reports from one calendar day (dayKey 'yyyy-MM-dd', same basis as
 * buildDailyIncidentTrend) for click-to-filter drill-downs.
 */
export const filterReportsByDayKey = (reports = [], dayKey) => {
    if (!dayKey) return Array.isArray(reports) ? reports : [];
    return (Array.isArray(reports) ? reports : []).filter((report) => {
        const reportedAt = toValidDate(report?.createdAt);
        return reportedAt ? getDayKey(reportedAt) === dayKey : false;
    });
};

/**
 * One-line admin insight derived from built trend data:
 * total, peak day, quiet-day count, and an optional month-over-month delta.
 */
export const getTrendInsight = (chartData = [], { selectedMonth, prevMonthCount = null } = {}) => {
    const days = Array.isArray(chartData) ? chartData : [];
    const total = days.reduce((sum, day) => sum + (Number(day?.total) || 0), 0);

    let peak = null;
    for (const day of days) {
        const count = Number(day?.total) || 0;
        if (count > 0 && (!peak || count > peak.count)) {
            peak = { label: day.date, fullDate: day.fullDate, dayKey: day.dayKey, count };
        }
    }

    const quietDays = days.filter((day) => (Number(day?.total) || 0) === 0).length;

    let delta = null;
    if (Number.isFinite(prevMonthCount) && (total > 0 || prevMonthCount > 0)) {
        const month = toValidDate(selectedMonth);
        const prevLabel = month
            ? format(new Date(month.getFullYear(), month.getMonth() - 1, 1), 'MMM')
            : 'prev. month';
        const diff = total - prevMonthCount;
        delta = {
            diff,
            label: `${diff > 0 ? '+' : ''}${diff} vs ${prevLabel}`,
        };
    }

    return { total, peak, quietDays, delta };
};
