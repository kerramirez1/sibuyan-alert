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
};

export const getCacheSnapshot = (key) => cacheEntries.get(key) || null;

export const isCacheFresh = (key, ttl) => {
    const entry = cacheEntries.get(key);
    if (!entry) return false;
    return Date.now() - entry.updatedAt <= ttl;
};

export const getCachedData = (key, ttl) => {
    const entry = cacheEntries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > ttl) return null;
    return entry.data;
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
 */
export const dedupedFetch = (key, fetcher) => {
    const ongoing = inflightRequests.get(key);
    if (ongoing) return ongoing;

    const request = (async () => {
        try {
            return await fetcher();
        } finally {
            if (inflightRequests.get(key) === request) inflightRequests.delete(key);
        }
    })();

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
    setCachedData,
    deleteCachedKey,
    clearQueryCache,
    dedupedFetch,
};
