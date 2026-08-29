import { filesAPI } from '../services/api';
import { isProtectedOriginalFileUrl } from './evidenceModel';

/**
 * Enterprise-Grade In-Memory Blob Cache with LRU Eviction and Single-Flight Deduplication.
 * 
 * Objectives:
 * 1. Eliminate redundant network downloads and loading spinners when viewing protected assets.
 * 2. Deduplicate simultaneous requests for the same protected binary across thumbnails and lightbox.
 * 3. Enforce bounded memory usage via Least-Recently-Used (LRU) eviction and object URL revocation.
 * 4. Provide session-scoped security clearing upon logout or auth expiration.
 */

const DEFAULT_MAX_CACHE_SIZE = 50;

// Key: rawUrl (string) -> Value: { blobUrl: string, createdAt: number }
const cache = new Map();

// Key: rawUrl (string) -> Value: Promise<{ url: string, fromCache: boolean }>
const inFlightRequests = new Map();

let maxCacheSize = DEFAULT_MAX_CACHE_SIZE;

/**
 * Configure maximum cache capacity (useful for tests or custom environments).
 * @param {number} size
 */
export const setMaxBlobCacheSize = (size) => {
    maxCacheSize = Math.max(1, size || DEFAULT_MAX_CACHE_SIZE);
};

/**
 * Check synchronously if a protected asset URL is already cached in memory.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export const isBlobCached = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    return cache.has(rawUrl);
};

/**
 * Synchronously retrieve the active Object URL for a cached asset and promote its recency in LRU.
 * @param {string} rawUrl
 * @returns {string | null} The active object URL or null if not cached.
 */
export const getCachedBlobUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return null;

    const entry = cache.get(rawUrl);
    if (!entry) return null;

    // Promote to most-recently-used in Map
    cache.delete(rawUrl);
    cache.set(rawUrl, entry);

    return entry.blobUrl;
};

/**
 * Evict the oldest item in the LRU cache and release its browser memory.
 */
const evictOldest = () => {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
        const oldestEntry = cache.get(oldestKey);
        cache.delete(oldestKey);
        if (oldestEntry?.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try {
                URL.revokeObjectURL(oldestEntry.blobUrl);
            } catch {
                // Ignore browser revocation errors
            }
        }
    }
};

/**
 * Asynchronously fetch a protected asset with single-flight deduplication and LRU caching.
 * @param {string} rawUrl - The server endpoint URL (e.g. /api/files/...)
 * @param {object} [options] - Axios / Fetch options including AbortSignal
 * @returns {Promise<{ url: string, fromCache: boolean }>}
 */
export const fetchProtectedBlob = async (rawUrl, options = {}) => {
    if (!rawUrl || typeof rawUrl !== 'string') {
        throw new Error('fetchProtectedBlob requires a valid URL string');
    }

    // 1. Direct synchronous cache hit
    const cachedUrl = getCachedBlobUrl(rawUrl);
    if (cachedUrl) {
        return { url: cachedUrl, fromCache: true };
    }

    // 2. Single-flight deduplication: reuse in-flight promise if one is already pending
    if (inFlightRequests.has(rawUrl)) {
        try {
            return await inFlightRequests.get(rawUrl);
        } catch {
            // If a previous in-flight promise was cancelled or errored, check cache or re-initiate
            const cachedAfter = getCachedBlobUrl(rawUrl);
            if (cachedAfter) return { url: cachedAfter, fromCache: true };
        }
    }

    // 3. Initiate single network request
    const requestPromise = (async () => {
        try {
            const response = await filesAPI.getProtected(rawUrl, options);
            if (!response?.data) {
                throw new Error('Failed to retrieve binary data for asset');
            }

            const createdBlobUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
                ? URL.createObjectURL(response.data)
                : '';

            // Enforce capacity bounds
            while (cache.size >= maxCacheSize) {
                evictOldest();
            }

            cache.set(rawUrl, {
                blobUrl: createdBlobUrl,
                createdAt: Date.now(),
            });

            return { url: createdBlobUrl, fromCache: false };
        } finally {
            inFlightRequests.delete(rawUrl);
        }
    })();

    inFlightRequests.set(rawUrl, requestPromise);
    return requestPromise;
};

/**
 * Non-blocking background prefetch into the LRU blob cache.
 * Failures are silently ignored so background prefetching never interrupts UI operations.
 * @param {string} rawUrl
 */
export const preloadProtectedBlob = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    if (cache.has(rawUrl) || inFlightRequests.has(rawUrl)) return;
    if (!isProtectedOriginalFileUrl(rawUrl) && !rawUrl.startsWith('/api/files')) return;

    fetchProtectedBlob(rawUrl).catch(() => {
        // Silently discard background prefetch errors
    });
};

/**
 * Wipe all cached Object URLs and release browser memory.
 * Mandatory call on user logout, account switch, or session expiration.
 */
export const clearBlobCache = () => {
    inFlightRequests.clear();
    for (const [, entry] of cache.entries()) {
        if (entry?.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try {
                URL.revokeObjectURL(entry.blobUrl);
            } catch {
                // Ignore revocation errors
            }
        }
    }
    cache.clear();
};

/**
 * Cache metrics for diagnostics and automated testing.
 * @returns {{ size: number, inFlightCount: number, maxCapacity: number }}
 */
export const getBlobCacheStats = () => ({
    size: cache.size,
    inFlightCount: inFlightRequests.size,
    maxCapacity: maxCacheSize,
});
