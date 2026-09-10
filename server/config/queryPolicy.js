/**
 * Query policy: execution timeouts, page bounds, and cache lifetimes.
 *
 * Every value here exists because of a measured structural problem, not as
 * generic tuning:
 *
 * - `maxTimeMs` — no query in this codebase had a timeout. A slow query held
 *   the HTTP connection open, the client's own timeout fired first on a weak
 *   link, and the failure surfaced as an unexplained client error. A server
 *   timeout turns that into a diagnosable 503.
 * - Page bounds — every list endpoint must be bounded so a caller cannot
 *   request the entire collection.
 * - Cache TTLs — the public stats endpoint runs five aggregations per call on
 *   an unauthenticated route. Short TTLs remove that cost without letting the
 *   data go meaningfully stale; socket events invalidate eagerly on mutation.
 *
 * Env-overridable, and every override falls back to a safe default rather than
 * trusting a malformed value.
 */

export const QUERY_POLICY_DEFAULTS = Object.freeze({
    maxTimeMs: 5_000,
    defaultPageSize: 50,
    maxPageSize: 100,
    // Delta sync: how many changed documents a single catch-up page may return.
    maxDeltaSize: 200,
});

export const CACHE_TTLS = Object.freeze({
    publicStats: 60_000,
    hazardZones: 120_000,
    municipalities: 600_000,
    categories: 600_000,
});

// Guards the in-process store against unbounded growth on a long-lived dyno.
export const CACHE_MAX_ENTRIES = 500;

const readPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const resolveQueryPolicy = (env = process.env) => ({
    maxTimeMs: readPositiveInt(env.QUERY_MAX_TIME_MS, QUERY_POLICY_DEFAULTS.maxTimeMs),
    defaultPageSize: readPositiveInt(env.QUERY_DEFAULT_PAGE_SIZE, QUERY_POLICY_DEFAULTS.defaultPageSize),
    maxPageSize: readPositiveInt(env.QUERY_MAX_PAGE_SIZE, QUERY_POLICY_DEFAULTS.maxPageSize),
    maxDeltaSize: readPositiveInt(env.QUERY_MAX_DELTA_SIZE, QUERY_POLICY_DEFAULTS.maxDeltaSize),
});

/**
 * Clamps a caller-supplied page size into the allowed window.
 * Never trusts `req.query` arithmetic.
 */
export const clampPageSize = (rawLimit, { defaultPageSize, maxPageSize }) => {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return defaultPageSize;
    return Math.min(parsed, maxPageSize);
};

/** Clamps a 1-based page number. */
export const clampPageNumber = (rawPage) => {
    const parsed = Number.parseInt(rawPage, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

export default {
    QUERY_POLICY_DEFAULTS,
    CACHE_TTLS,
    CACHE_MAX_ENTRIES,
    resolveQueryPolicy,
    clampPageSize,
    clampPageNumber,
};
