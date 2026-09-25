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

const MONTH_FULL = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);

/**
 * The three reporting scopes the analytics workspace offers. One bucket
 * granularity per scope: days inside a month, months inside a year, years
 * across everything.
 */
export const ANALYTICS_SCOPE = Object.freeze({
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    ALL_TIME: 'all_time',
});

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

export const getManilaYearKey = (date) => String(manilaParts(date).year);

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
 * Bucket reports by month across one calendar year (Manila), so a Yearly scope
 * reads as twelve bars rather than 365. Months that have not happened yet in the
 * viewed year are omitted, the same way buildDailyIncidentTrend stops at today.
 */
export const buildMonthlyIncidentTrend = ({ reports = [], selectedYear, now = new Date() } = {}) => {
    const reference = manilaParts(toValidDate(now) || new Date());
    const year = Number.isFinite(Number(selectedYear)) ? Number(selectedYear) : reference.year;
    const lastMonth = reference.year === year ? reference.month : 12;

    const totals = new Map();
    const severity = new Map();
    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (!reportedAt) continue;
        const key = getManilaMonthKey(reportedAt);
        if (!key.startsWith(`${year}-`)) continue;
        totals.set(key, (totals.get(key) || 0) + 1);
        if (!severity.has(key)) severity.set(key, emptySeverityBuckets());
        severity.get(key)[normalizeSeverity(report?.severity)] += 1;
    }

    return Array.from({ length: lastMonth }, (_, index) => {
        const month = index + 1;
        const key = `${year}-${pad2(month)}`;
        return {
            date: MONTH_ABBR[month - 1],
            fullDate: `${MONTH_FULL[month - 1]} ${year}`,
            dayKey: key,
            total: totals.get(key) || 0,
            ...(severity.get(key) || emptySeverityBuckets()),
        };
    });
};

/**
 * Bucket reports by year across everything the scope holds. The range runs from
 * the earliest record to the current year, so a quiet year between two busy ones
 * stays visible as a gap instead of being closed up.
 */
export const buildYearlyIncidentTrend = ({ reports = [], now = new Date() } = {}) => {
    const referenceYear = manilaParts(toValidDate(now) || new Date()).year;
    const totals = new Map();
    const severity = new Map();

    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (!reportedAt) continue;
        const key = getManilaYearKey(reportedAt);
        totals.set(key, (totals.get(key) || 0) + 1);
        if (!severity.has(key)) severity.set(key, emptySeverityBuckets());
        severity.get(key)[normalizeSeverity(report?.severity)] += 1;
    }

    if (totals.size === 0) return [];

    const years = [...totals.keys()].map(Number);
    const firstYear = Math.min(...years);
    const lastYear = Math.max(referenceYear, ...years);

    return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
        const key = String(firstYear + index);
        return {
            date: key,
            fullDate: key,
            dayKey: key,
            total: totals.get(key) || 0,
            ...(severity.get(key) || emptySeverityBuckets()),
        };
    });
};

/**
 * The trend for whichever scope is active, so the workspace asks one question
 * and gets back the bucket size that scope implies.
 */
export const buildPeriodIncidentTrend = ({
    reports = [],
    scope = ANALYTICS_SCOPE.MONTHLY,
    selectedMonth,
    selectedYear,
    now = new Date(),
} = {}) => {
    if (scope === ANALYTICS_SCOPE.ALL_TIME) return buildYearlyIncidentTrend({ reports, now });
    if (scope === ANALYTICS_SCOPE.YEARLY) return buildMonthlyIncidentTrend({ reports, selectedYear, now });
    return buildDailyIncidentTrend({ reports, selectedMonth, now });
};

/**
 * Keep the reports behind one trend bucket, for click-to-filter drill-downs.
 * The key is a Manila day, month, or year depending on the active scope —
 * `buildPeriodIncidentTrend` produces exactly those keys as `dayKey`.
 */
export const filterReportsByPeriodKey = (reports = [], { scope = ANALYTICS_SCOPE.MONTHLY, periodKey } = {}) => {
    const source = Array.isArray(reports) ? reports : [];
    if (!periodKey) return source;

    const keyOf = scope === ANALYTICS_SCOPE.ALL_TIME
        ? getManilaYearKey
        : scope === ANALYTICS_SCOPE.YEARLY
            ? getManilaMonthKey
            : getManilaDayKey;

    return source.filter((report) => {
        const reportedAt = toValidDate(report?.createdAt);
        return reportedAt ? keyOf(reportedAt) === periodKey : false;
    });
};

/**
 * One-line admin insight derived from built trend data:
 * total, peak day, quiet-day count, and an optional month-over-month delta.
 */
export const getTrendInsight = (chartData = [], { selectedMonth, prevMonthCount = null, prevLabel = null } = {}) => {
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
        // The caller owns the comparison's name when it is not a month — a Yearly
        // scope compares against "2025", which no month formatter can produce.
        const resolvedPrevLabel = prevLabel || (month
            ? format(new Date(month.getFullYear(), month.getMonth() - 1, 1), 'MMM')
            : 'prev. month');
        const diff = total - prevMonthCount;
        // Plain words instead of signed arithmetic: "-3 vs Aug" reads as an
        // error code, "3 fewer than August" reads as a sentence.
        const label = diff > 0
            ? `${diff} more than ${resolvedPrevLabel}`
            : diff < 0
                ? `${-diff} fewer than ${resolvedPrevLabel}`
                : `No change vs ${resolvedPrevLabel}`;
        delta = { diff, label };
    }

    return { total, peak, quietDays, delta };
};
