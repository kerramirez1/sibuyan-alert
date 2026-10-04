import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    __queryCacheInternals,
    clearQueryCache,
    dedupedFetch,
    deleteCachedKey,
    getCachedData,
    getStaleData,
    isCacheFresh,
    isRecentlyRevalidated,
    setCachedData,
} from '../utils/queryCache';

const NAMESPACE = 'sibuyan-alert:qcache:';
const readPersisted = (key) => {
    const raw = window.localStorage.getItem(`${NAMESPACE}${key}`);
    return raw ? JSON.parse(raw) : null;
};
// Simulates a JS context reset (reload, discarded tab, new tab): the module
// Map is rebuilt empty while localStorage survives.
const simulateContextReset = () => __queryCacheInternals.entries.clear();

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

    test('setCachedData persists the { data, updatedAt } envelope to localStorage', () => {
        const before = Date.now();
        setCachedData('k', [1, 2]);
        const persisted = readPersisted('k');
        expect(persisted).not.toBe(null);
        expect(persisted.data).toEqual([1, 2]);
        expect(persisted.updatedAt).toBeGreaterThanOrEqual(before);
        expect(persisted.updatedAt).toBeLessThanOrEqual(Date.now());
    });

    test('getStaleData falls back to the persisted copy after a context reset; memory wins on a hit', () => {
        setCachedData('k', 'warm');
        simulateContextReset();
        expect(getStaleData('k')).toBe('warm');

        // A live memory entry outranks a divergent persisted copy.
        setCachedData('k', 'fresh');
        window.localStorage.setItem(`${NAMESPACE}k`, JSON.stringify({ data: 'stale-disk', updatedAt: Date.now() }));
        expect(getStaleData('k')).toBe('fresh');
    });

    test('getCachedData enforces the TTL against the persisted updatedAt after a reset', () => {
        setCachedData('k', 'v');
        simulateContextReset();
        expect(getCachedData('k', 60 * 1000)).toBe('v');
        expect(getCachedData('k', -1)).toBe(null);
        expect(isCacheFresh('k', 60 * 1000)).toBe(false);
    });

    test('isRecentlyRevalidated consults the persisted updatedAt after a reset', () => {
        setCachedData('k', 'v');
        simulateContextReset();
        expect(isRecentlyRevalidated('k')).toBe(true);
        expect(isRecentlyRevalidated('k', 0)).toBe(false);

        // An entry persisted long ago does not debounce a revalidation.
        window.localStorage.setItem(
            `${NAMESPACE}old`,
            JSON.stringify({ data: 'v', updatedAt: Date.now() - 60 * 1000 }),
        );
        expect(isRecentlyRevalidated('old')).toBe(false);
    });

    test('deleteCachedKey and clearQueryCache remove the persisted entries', () => {
        setCachedData('incident-queue:admin:p1', []);
        setCachedData('dashboard:public:guest', []);
        deleteCachedKey('incident-queue:admin:p1');
        expect(readPersisted('incident-queue:admin:p1')).toBe(null);
        expect(readPersisted('dashboard:public:guest')).not.toBe(null);

        clearQueryCache('dashboard:');
        expect(readPersisted('dashboard:public:guest')).toBe(null);

        // Prefix-less clear (logout / session expiry) wipes the namespace so
        // nothing leaks to the next account on a shared device.
        setCachedData('incident-queue:admin:p1', []);
        setCachedData('dashboard:public:guest', []);
        window.localStorage.setItem('unrelated-key', 'keep me');
        clearQueryCache();
        expect(readPersisted('incident-queue:admin:p1')).toBe(null);
        expect(readPersisted('dashboard:public:guest')).toBe(null);
        expect(window.localStorage.getItem('unrelated-key')).toBe('keep me');
        window.localStorage.removeItem('unrelated-key');
    });

    test('a storage quota failure does not throw and the memory cache still works', () => {
        const setItemSpy = vi
            .spyOn(window.localStorage, 'setItem')
            .mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
        try {
            expect(() => setCachedData('k', 'v')).not.toThrow();
            expect(getStaleData('k')).toBe('v');
            expect(getCachedData('k', 1000)).toBe('v');
        } finally {
            setItemSpy.mockRestore();
        }
    });

    test('non-serializable values are never persisted', () => {
        const circular = { name: 'loop' };
        circular.self = circular;
        expect(() => setCachedData('k', circular)).not.toThrow();
        expect(readPersisted('k')).toBe(null);
        // The memory entry is unaffected by the persistence skip.
        expect(getStaleData('k')).toBe(circular);
    });
});
