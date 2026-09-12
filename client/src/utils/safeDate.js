import { format, isValid } from 'date-fns';

/**
 * Total date helpers for render paths: never throw on null / garbage input.
 * `date-fns/format` throws `RangeError: Invalid time value` on invalid dates,
 * which is exactly the prod-only crash seen with dirty `selectedMonth` state
 * restored from URLs or legacy payloads.
 */
export const toValidDate = (value) => {
    if (value instanceof Date) return isValid(value) ? value : null;
    if (value === null || value === undefined || value === '') return null;
    try {
        const date = new Date(value);
        return isValid(date) ? date : null;
    } catch {
        return null;
    }
};

export const isUsableMonth = (value) => toValidDate(value) !== null;

/** `format()` that falls back instead of throwing. */
export const formatMonthLabel = (value, pattern, fallback = '') => {
    const date = toValidDate(value);
    if (!date) return fallback;
    try {
        return format(date, pattern);
    } catch {
        return fallback;
    }
};

export default { toValidDate, isUsableMonth, formatMonthLabel };
