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

/**
 * Return an inclusive-exclusive Philippine calendar-week range in UTC.
 * Weeks run Monday 00:00 to Monday 00:00 Asia/Manila (no DST in PH).
 */
export const getPhilippineCalendarWeekRange = (now = new Date()) => {
    const instant = now instanceof Date ? now : new Date(now);

    if (Number.isNaN(instant.getTime())) {
        throw new TypeError('A valid date is required to calculate the analytics period');
    }

    const offsetMs = PHILIPPINES_UTC_OFFSET_MINUTES * 60 * 1000;
    const philippineDate = new Date(instant.getTime() + offsetMs);
    const year = philippineDate.getUTCFullYear();
    const zeroBasedMonth = philippineDate.getUTCMonth();
    const day = philippineDate.getUTCDate();
    // getUTCDay: 0 = Sunday. Monday-start offset in days.
    const daysSinceMonday = (philippineDate.getUTCDay() + 6) % 7;
    const startAt = new Date(Date.UTC(year, zeroBasedMonth, day - daysSinceMonday) - offsetMs);
    const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
        startAt,
        endAt,
        timezone: PHILIPPINES_TIMEZONE,
    };
};

/**
 * Return an inclusive-exclusive Philippine calendar-day range in UTC.
 * This remains stable on UTC-hosted platforms such as Heroku.
 */
export const getPhilippineCalendarDayRange = (now = new Date()) => {
    const instant = now instanceof Date ? now : new Date(now);

    if (Number.isNaN(instant.getTime())) {
        throw new TypeError('A valid date is required to calculate the analytics period');
    }

    const offsetMs = PHILIPPINES_UTC_OFFSET_MINUTES * 60 * 1000;
    const philippineDate = new Date(instant.getTime() + offsetMs);
    const year = philippineDate.getUTCFullYear();
    const zeroBasedMonth = philippineDate.getUTCMonth();
    const day = philippineDate.getUTCDate();
    const startAt = new Date(Date.UTC(year, zeroBasedMonth, day) - offsetMs);
    const endAt = new Date(Date.UTC(year, zeroBasedMonth, day + 1) - offsetMs);

    return {
        startAt,
        endAt,
        timezone: PHILIPPINES_TIMEZONE,
        year,
        month: zeroBasedMonth + 1,
        day,
    };
};
