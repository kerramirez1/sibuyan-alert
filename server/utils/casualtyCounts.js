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

/**
 * Whole-number coercion that PRESERVES the absence of a value.
 *
 * `toValidatedCount` collapses "not recorded" and "zero" into 0. On a casualty
 * field that is the difference between "nobody was hurt" and "we do not know" —
 * and an emergency viewer reads a displayed 0 as the former. This variant
 * returns null for absent or blank input so the distinction survives to the UI,
 * where `formatCasualtyMetric` already renders it as "Not recorded".
 *
 * Input that was supplied but is unparseable still fails closed to 0 rather
 * than null: a supplied value is a recorded attempt, not an omission. (In
 * practice the request validator rejects such input before it reaches here.)
 */
export const toOptionalCount = (value) => {
    if (value === undefined || value === null || value === '') return null;
    return toValidatedCount(value);
};

/**
 * Normalises a stored casualty count for API serialization.
 *
 * Shared by both report serializers so the public feed and the operational
 * feed can never disagree about what a casualty number means:
 *   - absent / blank  -> null  ("not recorded")
 *   - negative or NaN -> 0     (fails closed; a stored count is never negative)
 *   - anything else   -> the whole number
 */
export const toSerializableCount = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.floor(number);
};

export default {
    toValidatedCount,
    toOptionalCount,
    toSerializableCount,
    normalizeCasualtyCounts,
};
