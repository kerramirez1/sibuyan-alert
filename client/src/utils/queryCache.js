/**
 * Minimal stale-while-revalidate in-memory query cache.
 *
 * Goals (MVP, no new dependencies):
 * - 2nd visit to a page renders instantly from cache (no skeleton flicker).
 * - Background silent revalidation keeps emergency data fresh.
 * - Request deduplication prevents N mounted hooks from firing N identical GETs.
 * - Key-scoped entries prevent cross-municipality / cross-user leakage.
 * - Testable: `clearQueryCache()` resets module state between Vitest cases.
 */

const cacheEntries = new Map();
const inflightRequests = new Map();

export const QUERY_CACHE_TTLS = {
    zones: 5 * 60 * 1000,
    dashboard: 3 * 60 * 1000,
    queue: 2 * 60 * 1000,
    reporterOverview: 60 * 1000,
    myReports: 2 * 60 * 1000,
    notifications: 2 * 60 * 1000,
    adminDashboard: 3 * 60 * 1000,
    adminUsers: 2 * 60 * 1000,
    accidentHistory: 3 * 60 * 1000,
    // Reference geography, not user data: the polygons change only when a
    // dataset is regenerated and redeployed. A long TTL keeps the combined
    // hazard payload out of every navigation, and the server's ETag still
    // revalidates it once the window lapses.
    hazardLayers: 30 * 60 * 1000,
    // The opposite case: derived from live reports, so it changes when an
    // accident is reported or verified. Short enough that a hotspot map is not
    // visibly behind the pins beside it, long enough to survive a remount — and
    // the `reportVerified` socket event invalidates it immediately rather than
    // waiting this out.
    accidentHotspots: 2 * 60 * 1000,
};

const DEFAULT_CACHE_TTL = 60 * 1000;

export const getCacheSnapshot = (key) => cacheEntries.get(key) || null;

export const isCacheFresh = (key, ttl = DEFAULT_CACHE_TTL) => {
    const entry = cacheEntries.get(key);
    if (!entry) return false;
    const resolvedTtl = typeof ttl === 'number' && Number.isFinite(ttl) ? ttl : DEFAULT_CACHE_TTL;
    return Date.now() - entry.updatedAt <= resolvedTtl;
};

export const getCachedData = (key, ttl = DEFAULT_CACHE_TTL) => {
    const entry = cacheEntries.get(key);
    if (!entry) return null;
    const resolvedTtl = typeof ttl === 'number' && Number.isFinite(ttl) ? ttl : DEFAULT_CACHE_TTL;
    if (Date.now() - entry.updatedAt > resolvedTtl) return null;
    return entry.data;
};

/** Returns whether the key was refreshed within the given threshold (default 5s) to debounce micro-switches. */
export const isRecentlyRevalidated = (key, thresholdMs = 5000) => {
    const entry = cacheEntries.get(key);
    if (!entry) return false;
    return Date.now() - entry.updatedAt < thresholdMs;
};

/** Returns stale data regardless of TTL (for instant render + background refresh). */
export const getStaleData = (key) => cacheEntries.get(key)?.data ?? null;

export const setCachedData = (key, data) => {
    cacheEntries.set(key, { data, updatedAt: Date.now() });
};

export const deleteCachedKey = (key) => {
    cacheEntries.delete(key);
};

export const clearQueryCache = (prefix) => {
    if (!prefix) {
        cacheEntries.clear();
        return;
    }
    for (const key of cacheEntries.keys()) {
        if (key === prefix || key.startsWith(prefix)) cacheEntries.delete(key);
    }
};

/**
 * Shares a single promise across concurrent callers for the same key.
 * Failures are not cached; the inflight slot is always released.
 *
 * The fetcher is invoked **synchronously**, on the caller's tick. That ordering
 * is load-bearing: callers depend on the request starting before they continue,
 * and deferring it by even one microtask changes what they observe.
 *
 * The `try` exists for the case where the fetcher throws synchronously. The
 * previous form released the inflight slot from a `finally` inside the promise
 * chain, so a synchronous throw ran that cleanup while the `request` binding was
 * still in its temporal dead zone — the caller received "Cannot access 'request'
 * before initialization" instead of the real error, erasing the actual failure.
 * Catching here turns a synchronous throw into the rejected promise this
 * function is documented to return.
 */
export const dedupedFetch = (key, fetcher) => {
    const ongoing = inflightRequests.get(key);
    if (ongoing) return ongoing;

    // Held on an object so the cleanup closure never reads the promise binding
    // directly. `.finally` is always scheduled asynchronously, so `slot.request`
    // is assigned well before this can run.
    const slot = {};
    const settle = () => {
        if (inflightRequests.get(key) === slot.request) inflightRequests.delete(key);
    };

    let request;
    try {
        request = Promise.resolve(fetcher()).finally(settle);
    } catch (error) {
        return Promise.reject(error);
    }

    slot.request = request;
    inflightRequests.set(key, request);
    return request;
};

/** Test-only escape hatch for asserting dedup behavior. */
export const __queryCacheInternals = {
    entries: cacheEntries,
    inflight: inflightRequests,
};

export default {
    QUERY_CACHE_TTLS,
    getCacheSnapshot,
    isCacheFresh,
    getCachedData,
    getStaleData,
    isRecentlyRevalidated,
    setCachedData,
    deleteCachedKey,
    clearQueryCache,
    dedupedFetch,
};
