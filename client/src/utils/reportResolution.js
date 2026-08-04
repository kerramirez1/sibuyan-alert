export const OPERATIONS_TIME_ZONE = 'Asia/Manila';

const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export const getEntityId = (entity) => {
    const id = entity?._id ?? entity?.id ?? entity;
    return id === null || id === undefined ? null : String(id);
};

const getManilaCalendarDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return manilaDateFormatter.formatToParts(date).reduce((parts, part) => {
        if (part.type !== 'literal') parts[part.type] = part.value;
        return parts;
    }, {});
};

export const getManilaCalendarDateKey = (value = new Date()) => {
    const date = getManilaCalendarDate(value);
    return date ? `${date.year}-${date.month}-${date.day}` : null;
};

export const getMillisecondsUntilNextManilaDay = (value = new Date()) => {
    const instant = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(instant.getTime())) return null;

    const offsetMs = 8 * 60 * 60 * 1000;
    const manilaInstant = new Date(instant.getTime() + offsetMs);
    const nextMidnightUtc = Date.UTC(
        manilaInstant.getUTCFullYear(),
        manilaInstant.getUTCMonth(),
        manilaInstant.getUTCDate() + 1,
    ) - offsetMs;

    return Math.max(0, nextMidnightUtc - instant.getTime());
};

export const isSameManilaCalendarDay = (left, right = new Date()) => {
    const leftKey = getManilaCalendarDateKey(left);
    const rightKey = getManilaCalendarDateKey(right);
    return Boolean(leftKey && rightKey && leftKey === rightKey);
};

export const responderParticipatedInReport = (report, responder) => {
    const responderId = getEntityId(responder);
    if (!responderId || !report) return false;

    if (getEntityId(report.resolvedBy) === responderId) return true;
    if (getEntityId(report.respondedBy) === responderId) return true;

    return Boolean(report.responders?.some((entry) => (
        getEntityId(entry?.user ?? entry) === responderId
    )));
};

export const getResolvedTodayReports = (
    reports = [],
    { currentUser = null, includeAll = false, now = new Date() } = {},
) => reports.filter((report) => {
    if (report?.status !== 'resolved' || !report.resolvedAt) return false;
    if (!isSameManilaCalendarDay(report.resolvedAt, now)) return false;
    return includeAll || responderParticipatedInReport(report, currentUser);
});
