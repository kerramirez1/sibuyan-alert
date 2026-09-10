/**
 * Cache-aside store for expensive read endpoints.
 *
 * Why this exists: `GET /api/reports/stats` is public and unauthenticated, and
 * it runs five passes over the reports collection (two aggregations, two
 * counts, one find) on every call. Anyone can trigger it repeatedly. A short
 * TTL removes that cost entirely between mutations.
 *
 * Design decisions:
 *
 * - **In-flight deduplication.** Ten concurrent requests for a cold key run
 *   the loader once, not ten times. Without this, a cache stampede is worse
 *   than no cache at all — every caller misses at the same instant and they
 *   all hit the database together.
 * - **Errors are never cached.** A failed loader leaves the key empty so the
 *   next request retries. Caching a failure would turn a transient database
 *   blip into a sustained outage.
 * - **Prefix invalidation.** The socket layer already emits an event for every
 *   mutation (report verified, zone created, …). Those events are the
 *   invalidation signal, so TTLs only need to be a backstop rather than the
 *   primary freshness mechanism.
 * - **Bounded size.** A long-lived dyno must not accumulate keys forever, so
 *   the store evicts the oldest entry once it exceeds the cap.
 *
 * Deliberately in-process. When REDIS_URL is set the app scales past one dyno,
 * and each dyno then keeps its own copy — which is correct but means a
 * mutation only invalidates the dyno that handled it. That is acceptable here
 * because the TTLs are short; moving to a shared cache is the documented next
 * step rather than a hidden assumption.
 */
import { CACHE_MAX_ENTRIES } from '../config/queryPolicy.js';

const entries = new Map();
const inflight = new Map();
const counters = { hits: 0, misses: 0, deduped: 0, evictions: 0, invalidations: 0 };

const evictOldestIfNeeded = () => {
    while (entries.size > CACHE_MAX_ENTRIES) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) return;
        entries.delete(oldestKey);
        counters.evictions += 1;
    }
};

/**
 * Returns the cached value for `key`, or runs `loader` and caches its result.
 *
 * @param {string} key
 * @param {number} ttlMs
 * @param {Function} loader - async () => value
 */
export const getOrSet = async (key, ttlMs, loader) => {
    const hit = entries.get(key);
    if (hit && hit.expiresAt > Date.now()) {
        counters.hits += 1;
        return hit.value;
    }
    if (hit) entries.delete(key);

    const ongoing = inflight.get(key);
    if (ongoing) {
        counters.deduped += 1;
        return ongoing;
    }

    counters.misses += 1;

    const request = (async () => {
        try {
            const value = await loader();
            entries.set(key, { value, expiresAt: Date.now() + ttlMs });
            evictOldestIfNeeded();
            return value;
        } finally {
            // Released on both success and failure so a thrown loader never
            // wedges the key.
            inflight.delete(key);
        }
    })();

    inflight.set(key, request);
    return request;
};

/** Removes every key equal to `prefix` or starting with `prefix`. */
export const invalidate = (prefix) => {
    let removed = 0;
    for (const key of entries.keys()) {
        if (key === prefix || key.startsWith(prefix)) {
            entries.delete(key);
            removed += 1;
        }
    }
    counters.invalidations += removed;
    return removed;
};

export const clear = () => {
    const size = entries.size;
    entries.clear();
    inflight.clear();
    return size;
};

/** Observability: hit rate is the only way to know a TTL is set sensibly. */
export const getCacheStats = () => ({
    ...counters,
    size: entries.size,
    inflight: inflight.size,
    hitRate: counters.hits + counters.misses > 0
        ? Number((counters.hits / (counters.hits + counters.misses)).toFixed(3))
        : 0,
});

/** Test-only escape hatch for asserting isolation between cases. */
export const __resetCacheForTests = () => {
    entries.clear();
    inflight.clear();
    Object.keys(counters).forEach((key) => { counters[key] = 0; });
};

export default { getOrSet, invalidate, clear, getCacheStats, __resetCacheForTests };
