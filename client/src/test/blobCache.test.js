import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    fetchProtectedBlob,
    getCachedBlobUrl,
    isBlobCached,
    preloadProtectedBlob,
    clearBlobCache,
    setMaxBlobCacheSize,
    getBlobCacheStats,
} from '../utils/blobCache';
import { filesAPI } from '../services/api';

vi.mock('../services/api', () => ({
    filesAPI: {
        getProtected: vi.fn(),
    },
}));

describe('Enterprise In-Memory Blob Cache (blobCache.js)', () => {
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let createdUrls = [];
    let revokedUrls = [];

    beforeEach(() => {
        clearBlobCache();
        setMaxBlobCacheSize(50);
        vi.clearAllMocks();

        createdUrls = [];
        revokedUrls = [];

        originalCreateObjectURL = globalThis.URL.createObjectURL;
        originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

        let counter = 0;
        globalThis.URL.createObjectURL = vi.fn(() => {
            const url = `blob:http://localhost/mock-blob-${++counter}`;
            createdUrls.push(url);
            return url;
        });

        globalThis.URL.revokeObjectURL = vi.fn((url) => {
            revokedUrls.push(url);
        });
    });

    afterEach(() => {
        clearBlobCache();
        globalThis.URL.createObjectURL = originalCreateObjectURL;
        globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    test('1. First fetch triggers network request; subsequent calls return synchronously from cache with 0ms network latency', async () => {
        const mockBlob = new Blob(['sample photo'], { type: 'image/jpeg' });
        filesAPI.getProtected.mockResolvedValue({ data: mockBlob });

        const url = '/api/files/607f1f77bcf86cd799439011/photo1.jpg';

        expect(isBlobCached(url)).toBe(false);
        expect(getCachedBlobUrl(url)).toBeNull();

        // 1st Fetch: Network call
        const firstResult = await fetchProtectedBlob(url);
        expect(firstResult.fromCache).toBe(false);
        expect(firstResult.url).toMatch(/^blob:http:\/\/localhost\/mock-blob-/);
        expect(filesAPI.getProtected).toHaveBeenCalledTimes(1);

        // State check
        expect(isBlobCached(url)).toBe(true);
        expect(getCachedBlobUrl(url)).toBe(firstResult.url);

        // 2nd Fetch: Cache hit without any additional network request
        const secondResult = await fetchProtectedBlob(url);
        expect(secondResult.fromCache).toBe(true);
        expect(secondResult.url).toBe(firstResult.url);
        expect(filesAPI.getProtected).toHaveBeenCalledTimes(1);
    });

    test('2. Single-Flight Deduplication: Multiple simultaneous calls for the same URL share a single in-flight network request', async () => {
        const mockBlob = new Blob(['heavy binary'], { type: 'image/png' });
        let resolveRequest;
        const pendingPromise = new Promise((resolve) => {
            resolveRequest = resolve;
        });

        filesAPI.getProtected.mockReturnValue(pendingPromise);

        const url = '/api/files/607f1f77bcf86cd799439022/scene.png';

        // Fire 3 simultaneous requests (e.g. thumbnail, preloader, lightbox)
        const req1 = fetchProtectedBlob(url);
        const req2 = fetchProtectedBlob(url);
        const req3 = fetchProtectedBlob(url);

        expect(getBlobCacheStats().inFlightCount).toBe(1);
        expect(filesAPI.getProtected).toHaveBeenCalledTimes(1);

        // Resolve pending network response
        resolveRequest({ data: mockBlob });

        const [res1, res2, res3] = await Promise.all([req1, req2, req3]);

        expect(res1.url).toBe(res2.url);
        expect(res2.url).toBe(res3.url);
        expect(filesAPI.getProtected).toHaveBeenCalledTimes(1);
        expect(getBlobCacheStats().inFlightCount).toBe(0);
        expect(getBlobCacheStats().size).toBe(1);
    });

    test('3. LRU Eviction: Automatically evicts least recently used items and revokes object URLs when exceeding max capacity', async () => {
        setMaxBlobCacheSize(2);
        const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
        filesAPI.getProtected.mockResolvedValue({ data: mockBlob });

        const url1 = '/api/files/item-1.jpg';
        const url2 = '/api/files/item-2.jpg';
        const url3 = '/api/files/item-3.jpg';
        await fetchProtectedBlob(url1);
        const res2 = await fetchProtectedBlob(url2);

        expect(getBlobCacheStats().size).toBe(2);
        expect(isBlobCached(url1)).toBe(true);
        expect(isBlobCached(url2)).toBe(true);

        // Promoting url1 by accessing it
        getCachedBlobUrl(url1);

        // Adding 3rd item should evict url2 (as url1 was recently accessed)
        await fetchProtectedBlob(url3);

        expect(getBlobCacheStats().size).toBe(2);
        expect(isBlobCached(url1)).toBe(true);
        expect(isBlobCached(url3)).toBe(true);
        expect(isBlobCached(url2)).toBe(false);

        // Verifies browser memory revocation on evicted item
        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(res2.url);
    });

    test('4. PreloadProtectedBlob: Prefetches adjacent items in the background without throwing errors on failure', async () => {
        const mockBlob = new Blob(['preloaded data'], { type: 'image/jpeg' });
        filesAPI.getProtected.mockResolvedValue({ data: mockBlob });

        const url = '/api/files/adjacent-photo.jpg';

        preloadProtectedBlob(url);

        // Wait a tick for the microtask to resolve
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(isBlobCached(url)).toBe(true);
        expect(filesAPI.getProtected).toHaveBeenCalledWith(url, {});

        // Preload failure should not throw
        filesAPI.getProtected.mockRejectedValueOnce(new Error('Network failure'));
        expect(() => preloadProtectedBlob('/api/files/failing.jpg')).not.toThrow();
    });

    test('5. ClearBlobCache: Revokes all cached Object URLs in memory and wipes the cache', async () => {
        const mockBlob = new Blob(['data'], { type: 'image/jpeg' });
        filesAPI.getProtected.mockResolvedValue({ data: mockBlob });

        const res1 = await fetchProtectedBlob('/api/files/1.jpg');
        const res2 = await fetchProtectedBlob('/api/files/2.jpg');

        expect(getBlobCacheStats().size).toBe(2);

        clearBlobCache();

        expect(getBlobCacheStats().size).toBe(0);
        expect(isBlobCached('/api/files/1.jpg')).toBe(false);
        expect(isBlobCached('/api/files/2.jpg')).toBe(false);

        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(res1.url);
        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(res2.url);
    });

    test('6. Network Error: Propagates error to caller and cleans up in-flight state', async () => {
        filesAPI.getProtected.mockRejectedValue(new Error('Server 500 error'));

        const url = '/api/files/broken.jpg';

        await expect(fetchProtectedBlob(url)).rejects.toThrow('Server 500 error');
        expect(getBlobCacheStats().inFlightCount).toBe(0);
        expect(isBlobCached(url)).toBe(false);
    });
});
