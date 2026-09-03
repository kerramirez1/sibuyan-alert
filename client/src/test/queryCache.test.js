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

    test('clearQueryCache supports prefix invalidation', () => {
        setCachedData('incident-queue:admin:p1', []);
        setCachedData('dashboard:public:guest', []);
        clearQueryCache('incident-queue:');
        expect(getStaleData('incident-queue:admin:p1')).toBe(null);
        expect(getStaleData('dashboard:public:guest')).toEqual([]);
    });
});
