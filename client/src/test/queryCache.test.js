import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    __queryCacheInternals,
    clearQueryCache,
    dedupedFetch,
    getCachedData,
    getStaleData,
    isCacheFresh,
    setCachedData,
} from '../utils/queryCache';

describe('queryCache stale-while-revalidate store', () => {
    beforeEach(() => {
        clearQueryCache();
        __queryCacheInternals.inflight.clear();
    });

    test('returns null on miss and data within TTL', () => {
        expect(getCachedData('k', 1000)).toBe(null);
        setCachedData('k', [1, 2]);
        expect(getCachedData('k', 1000)).toEqual([1, 2]);
        expect(isCacheFresh('k', 1000)).toBe(true);
    });

    test('expires entries past TTL but keeps stale snapshot', () => {
        setCachedData('k', 'v');
        expect(getCachedData('k', -1)).toBe(null);
        expect(getStaleData('k')).toBe('v');
        expect(isCacheFresh('k', -1)).toBe(false);
    });

    test('dedupes concurrent fetches to a single network call', async () => {
        const fetcher = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('ok'), 10)));
        const [a, b] = await Promise.all([dedupedFetch('k', fetcher), dedupedFetch('k', fetcher)]);
        expect(a).toBe('ok');
        expect(b).toBe('ok');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('releases inflight slot after failure so retry works', async () => {
        const failing = vi.fn().mockRejectedValueOnce(new Error('down'));
        await expect(dedupedFetch('k', failing)).rejects.toThrow('down');
        const retry = vi.fn().mockResolvedValue('recovered');
        await expect(dedupedFetch('k', retry)).resolves.toBe('recovered');
        expect(retry).toHaveBeenCalledTimes(1);
    });

    test('starts the fetcher synchronously, on the caller tick', async () => {
        // Callers depend on this ordering, so it is a contract rather than an
        // implementation detail: deferring the call by even one microtask was
        // enough to change what a search-and-filter page observed.
        const fetcher = vi.fn().mockResolvedValue('ok');
        const pending = dedupedFetch('k', fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);
        await expect(pending).resolves.toBe('ok');
    });

    test('surfaces a synchronous fetcher throw instead of a TDZ error', async () => {
        // Regression guard: releasing the inflight slot from a `finally` inside
        // the promise chain meant a fetcher that threw synchronously ran that
        // cleanup while the promise binding was still uninitialized, so callers
        // saw "Cannot access 'request' before initialization" and the real error
        // was lost.
        const throwing = vi.fn(() => { throw new Error('real cause'); });

        await expect(dedupedFetch('k', throwing)).rejects.toThrow('real cause');
        // Nothing should be left in flight, so a retry is not deduped away.
        const retry = vi.fn().mockResolvedValue('recovered');
        await expect(dedupedFetch('k', retry)).resolves.toBe('recovered');
        expect(retry).toHaveBeenCalledTimes(1);
    });

    test('clearQueryCache supports prefix invalidation', () => {
        setCachedData('incident-queue:admin:p1', []);
        setCachedData('dashboard:public:guest', []);
        clearQueryCache('incident-queue:');
        expect(getStaleData('incident-queue:admin:p1')).toBe(null);
        expect(getStaleData('dashboard:public:guest')).toEqual([]);
    });
});
