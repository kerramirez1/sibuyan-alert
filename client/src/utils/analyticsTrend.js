import {
    format,
    isValid,
    parseISO,
} from 'date-fns';

/**
 * Incident timestamps are UTC instants; operational bucketing follows the
 * Philippine calendar (UTC+08:00, no DST) so charts agree with the server
 * aggregates and with what responders see on the wall clock. Fixed-offset
 * math keeps this deterministic regardless of the browser/test-runner TZ.
 */
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTH_ABBR = Object.freeze([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

const pad2 = (value) => String(value).padStart(2, '0');

const manilaParts = (date) => {
    const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
};

export const getManilaDayKey = (date) => {
    const parts = manilaParts(date);
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const getManilaMonthKey = (date) => {
    const parts = manilaParts(date);
    return `${parts.year}-${pad2(parts.month)}`;
};

const daysInManilaMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Accept every timestamp shape the API/socket layer can produce:
 * Date, epoch millis, ISO string, Firestore-style { toDate() }, and
 * { seconds } objects. Anything else is null (caller drops the record).
 */
const toValidDate = (value) => {
    if (value instanceof Date) return isValid(value) ? value : null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        return isValid(date) ? date : null;
    }
    if (value && typeof value.toDate === 'function') {
        try {
            const date = value.toDate();
            return date instanceof Date && isValid(date) ? date : null;
        } catch {
            return null;
        }
    }
    if (value && typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
        const date = new Date(value.seconds * 1000);
        return isValid(date) ? date : null;
    }
    if (typeof value !== 'string' || !value.trim()) return null;

    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
};

const SEVERITY_LEVELS = Object.freeze(['minor', 'moderate', 'severe', 'critical']);

const normalizeSeverity = (value) => {
    const level = String(value || '').toLowerCase();
    return SEVERITY_LEVELS.includes(level) ? level : 'unknown';
};

const emptySeverityBuckets = () => ({ minor: 0, moderate: 0, severe: 0, critical: 0, unknown: 0 });

export const buildDailyIncidentTrend = ({
    reports = [],
    selectedMonth,
    now = new Date(),
} = {}) => {
    const month = toValidDate(selectedMonth);
    const referenceDate = toValidDate(now) || new Date();

    if (!month) return [];

    // NOTE: selectedMonth is interpreted in the viewer's locale (it comes
    // from a local month picker), while report instants bucket in Manila.
    const viewedYear = month.getFullYear();
    const viewedMonth = month.getMonth() + 1;
    const monthDays = daysInManilaMonth(viewedYear, viewedMonth);

    const referenceManila = manilaParts(referenceDate);
    const isCurrentManilaMonth = referenceManila.year === viewedYear
        && referenceManila.month === viewedMonth;
    const lastDay = isCurrentManilaMonth
        ? Math.min(referenceManila.day, monthDays)
        : monthDays;

    const viewedMonthKey = `${viewedYear}-${pad2(viewedMonth)}`;
    const dailyCounts = new Map();
    const dailySeverity = new Map();
    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (!reportedAt) continue;
        if (getManilaMonthKey(reportedAt) !== viewedMonthKey) continue;
        const parts = manilaParts(reportedAt);
        if (parts.day > lastDay) continue;

        const key = getManilaDayKey(reportedAt);
        dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
        if (!dailySeverity.has(key)) dailySeverity.set(key, emptySeverityBuckets());
        const buckets = dailySeverity.get(key);
        buckets[normalizeSeverity(report?.severity)] += 1;
    }

    return Array.from({ length: lastDay }, (_, index) => {
        const day = index + 1;
        const key = `${viewedYear}-${pad2(viewedMonth)}-${pad2(day)}`;
        const total = dailyCounts.get(key) || 0;

        return {
            date: `${MONTH_ABBR[viewedMonth - 1]} ${day}`,
            fullDate: `${MONTH_ABBR[viewedMonth - 1]} ${day}, ${viewedYear}`,
            dayKey: key,
            total,
            ...(dailySeverity.get(key) || emptySeverityBuckets()),
        };
    });
};

/**
 * Count reports whose createdAt falls in the given calendar month (Manila).
 * `throughDayOfMonth` caps the count for pace-fair month-over-month deltas
 * when the viewed month is still in progress.
 */
export const countReportsInMonth = (reports = [], monthDate, { throughDayOfMonth = null } = {}) => {
    const month = toValidDate(monthDate);
    if (!month) return 0;
    const viewedMonthKey = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;
    let count = 0;
    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (!reportedAt) continue;
        if (getManilaMonthKey(reportedAt) !== viewedMonthKey) continue;
        if (throughDayOfMonth !== null && manilaParts(reportedAt).day > throughDayOfMonth) continue;
        count += 1;
    }
    return count;
};

/**
 * Keep reports from one calendar day (Manila dayKey 'yyyy-MM-dd', same basis
 * as buildDailyIncidentTrend) for click-to-filter drill-downs.
 */
export const filterReportsByDayKey = (reports = [], dayKey) => {
    if (!dayKey) return Array.isArray(reports) ? reports : [];
    return (Array.isArray(reports) ? reports : []).filter((report) => {
        const reportedAt = toValidDate(report?.createdAt);
        return reportedAt ? getManilaDayKey(reportedAt) === dayKey : false;
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
        // Plain words instead of signed arithmetic: "-3 vs Aug" reads as an
        // error code, "3 fewer than August" reads as a sentence.
        const label = diff > 0
            ? `${diff} more than ${prevLabel}`
            : diff < 0
                ? `${-diff} fewer than ${prevLabel}`
                : `No change vs ${prevLabel}`;
        delta = { diff, label };
    }

    return { total, peak, quietDays, delta };
};
