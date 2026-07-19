export const PHILIPPINES_TIMEZONE = 'Asia/Manila';
export const PHILIPPINES_UTC_OFFSET_MINUTES = 8 * 60;

export const PUBLIC_REPORT_STATUSES = Object.freeze([
    'verified',
    'transferred',
    'responding',
    'resolved',
]);

/**
 * Return an inclusive-exclusive calendar-month range in UTC for Philippine time.
 * The Philippines uses UTC+08:00 year-round and does not observe daylight saving.
 */
export const getPhilippineCalendarMonthRange = (now = new Date()) => {
    const instant = now instanceof Date ? now : new Date(now);

    if (Number.isNaN(instant.getTime())) {
        throw new TypeError('A valid date is required to calculate the analytics period');
    }

    const offsetMs = PHILIPPINES_UTC_OFFSET_MINUTES * 60 * 1000;
    const philippineDate = new Date(instant.getTime() + offsetMs);
    const year = philippineDate.getUTCFullYear();
    const zeroBasedMonth = philippineDate.getUTCMonth();
    const startAt = new Date(Date.UTC(year, zeroBasedMonth, 1) - offsetMs);
    const endAt = new Date(Date.UTC(year, zeroBasedMonth + 1, 1) - offsetMs);

    return {
        startAt,
        endAt,
        timezone: PHILIPPINES_TIMEZONE,
        year,
        month: zeroBasedMonth + 1,
    };
};

