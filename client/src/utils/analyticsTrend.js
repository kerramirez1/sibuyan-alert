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
    for (const report of Array.isArray(reports) ? reports : []) {
        const reportedAt = toValidDate(report?.createdAt);
        if (!reportedAt || !isSameMonth(reportedAt, month) || reportedAt > intervalEnd) continue;

        const key = getDayKey(reportedAt);
        dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
    }

    return eachDayOfInterval({ start: intervalStart, end: intervalEnd }).map((date) => {
        const total = dailyCounts.get(getDayKey(date)) || 0;

        return {
            date: format(date, 'MMM d'),
            fullDate: format(date, 'MMM d, yyyy'),
            total,
        };
    });
};
