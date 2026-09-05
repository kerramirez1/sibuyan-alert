const CASUALTY_FIELDS = ['injured', 'fatalities', 'missing'];

/**
 * Fail-closed whole-number coercion for people counts.
 * Anything that is not a finite, non-negative number becomes 0 —
 * NaN can never reach the database to poison $sum aggregations.
 */
export const toValidatedCount = (value) => {
    const count = Number(value ?? 0);
    if (!Number.isFinite(count) || count < 0) return 0;
    return Math.floor(count);
};

/**
 * Validates an admin casualty correction ({ injured, fatalities, missing }).
 * Every supplied field must be a non-negative whole number; omitted fields
 * fall back to 0. Returns the sanitized object, or null when invalid.
 */
export const normalizeCasualtyCounts = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const corrected = {};
    for (const field of CASUALTY_FIELDS) {
        const raw = input[field] ?? 0;
        const count = typeof raw === 'string' ? (raw.trim() === '' ? 0 : Number(raw)) : raw;
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
        corrected[field] = count;
    }
    return corrected;
};

export default { toValidatedCount, normalizeCasualtyCounts };
