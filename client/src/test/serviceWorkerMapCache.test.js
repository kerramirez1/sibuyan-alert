import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(TEST_DIR, '..', '..');

vi.mock('maplibre-gl', () => ({
    default: { addProtocol: vi.fn() },
}));

import { inspectPmtilesArchive } from '../config/mapProvider';

/**
 * The service worker is a classic script, not a module, so these tests
 * load its real source and run it against a fake worker scope: captured
 * event listeners, an in-memory CacheStorage, and a scripted network.
 * Everything asserted here is the worker's actual behavior — including
 * the PMTiles inspection contract, which is checked by feeding
 * SW-served responses through the real mapProvider inspection over the
 * real archive bytes.
 */

const ORIGIN = 'https://app.example';
const PMTILES_URL = `${ORIGIN}/maps/sibuyan.pmtiles`;
const GLYPH_URL = 'https://protomaps.github.io/basemaps-assets/fonts/Noto%20Sans%20Regular/0-255.pbf';
const SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light.png';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search?q=Cajidiocan&format=json';
const ESRI_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/8192/8192';

const archiveBytes = new Uint8Array(
    fs.readFileSync(path.join(CLIENT_DIR, 'public', 'maps', 'sibuyan.pmtiles')),
);

const loadServiceWorker = (networkFetch) => {
    const listeners = {};
    const stores = new Map();
    const deletedCaches = [];

    const keyOf = (request) => (typeof request === 'string' ? request : request.url);
    const caches = {
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                match: async (request) => {
                    const hit = store.get(keyOf(request));
                    return hit ? hit.clone() : undefined;
                },
                put: async (request, response) => { store.set(keyOf(request), response); },
                add: async () => {},
                delete: async (request) => store.delete(keyOf(request)),
            };
        },
        keys: async () => [...stores.keys()],
        delete: async (name) => { deletedCaches.push(name); return stores.delete(name); },
        match: async () => undefined,
    };

    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type, listener) => { listeners[type] = listener; },
        skipWaiting: vi.fn(() => Promise.resolve()),
        clients: { claim: vi.fn(() => Promise.resolve()), matchAll: vi.fn(async () => []) },
        registration: { showNotification: vi.fn() },
    };

    const source = fs.readFileSync(path.join(CLIENT_DIR, 'public', 'sw.js'), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('self', 'caches', 'fetch', 'indexedDB', source)(
        self,
        caches,
        networkFetch,
        { open: () => { throw new Error('indexedDB is not available in these tests'); } },
    );

    const dispatchFetch = (request) => {
        let responded;
        listeners.fetch({ request, respondWith: (promise) => { responded = promise; } });
        return responded;
    };
    const dispatchLifecycle = (type) => {
        let waited;
        listeners[type]({ waitUntil: (promise) => { waited = promise; } });
        return waited;
    };

    return { dispatchFetch, dispatchLifecycle, stores, deletedCaches };
};

/** A network that serves the real archive in full and fixed glyph bytes. */
const okNetwork = () => vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === PMTILES_URL) return new Response(archiveBytes.slice(), { status: 200 });
    if (url.startsWith('https://protomaps.github.io/')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }
    throw new Error(`Unexpected network call: ${url}`);
});

const rangeRequest = (range) => new Request(PMTILES_URL, { headers: { Range: range } });

describe('service worker map caching', () => {
    test('activate keeps the map cache while purging unknown caches', async () => {
        const sw = loadServiceWorker(okNetwork());
        for (const name of ['sibuyan-shell-v2', 'sibuyan-data-v1', 'sibuyan-map-v1', 'some-old-cache']) {
            sw.stores.set(name, new Map());
        }

        await sw.dispatchLifecycle('activate');

        expect(sw.deletedCaches).toContain('some-old-cache');
        expect(sw.deletedCaches).not.toContain('sibuyan-map-v1');
        expect(sw.deletedCaches).not.toContain('sibuyan-shell-v2');
        expect(sw.deletedCaches).not.toContain('sibuyan-data-v1');
    });

    test('(c) a cache miss downloads the full archive once (no Range), then serves ranges locally', async () => {
        const network = okNetwork();
        const sw = loadServiceWorker(network);

        const first = await sw.dispatchFetch(rangeRequest('bytes=0-16383'));
        expect(first.status).toBe(206);
        expect(network).toHaveBeenCalledTimes(1);
        // The one download is the full file: a plain URL fetch, no Range.
        expect(typeof network.mock.calls[0][0]).toBe('string');

        const second = await sw.dispatchFetch(rangeRequest('bytes=500000-500999'));
        expect(second.status).toBe(206);
        expect(network).toHaveBeenCalledTimes(1);

        const body = new Uint8Array(await second.arrayBuffer());
        expect(body).toEqual(archiveBytes.slice(500000, 501000));
    });

    test('(a) a range request against the cached archive returns the exact slice with a correct Content-Range', async () => {
        const network = okNetwork();
        const sw = loadServiceWorker(network);

        // Prime the cache with a full (no-range) request.
        const full = await sw.dispatchFetch(new Request(PMTILES_URL));
        expect(full.status).toBe(200);
        expect(full.headers.get('content-length')).toBe(String(archiveBytes.byteLength));
        expect(new Uint8Array(await full.arrayBuffer())).toEqual(archiveBytes);

        const response = await sw.dispatchFetch(rangeRequest('bytes=1000-1999'));
        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe(`bytes 1000-1999/${archiveBytes.byteLength}`);
        expect(response.headers.get('content-length')).toBe('1000');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(archiveBytes.slice(1000, 2000));
        expect(network).toHaveBeenCalledTimes(1);
    });

    test('(b) the header range served from cache passes the real mapProvider inspection', async () => {
        const network = okNetwork();
        const sw = loadServiceWorker(network);

        const fetchImpl = (url, init) => sw.dispatchFetch(new Request(url, init));
        const inspection = await inspectPmtilesArchive(PMTILES_URL, { fetchImpl });

        expect(inspection.rangeSupported).toBe(true);
        expect(inspection.maxZoom).toBeGreaterThan(inspection.minZoom);
        // The network saw exactly one call: the full archive download.
        expect(network).toHaveBeenCalledTimes(1);
    });

    test('(d) glyph and sprite requests are cache-first; the second request never hits the network', async () => {
        const network = okNetwork();
        const sw = loadServiceWorker(network);

        const firstGlyph = await sw.dispatchFetch(new Request(GLYPH_URL));
        expect(new Uint8Array(await firstGlyph.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
        const firstSprite = await sw.dispatchFetch(new Request(SPRITE_URL));
        expect(firstSprite.status).toBe(200);
        expect(network).toHaveBeenCalledTimes(2);

        const secondGlyph = await sw.dispatchFetch(new Request(GLYPH_URL));
        expect(new Uint8Array(await secondGlyph.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
        await sw.dispatchFetch(new Request(SPRITE_URL));
        expect(network).toHaveBeenCalledTimes(2);
    });

    test('(e) unrelated cross-origin requests are not intercepted (geocoding, imagery tiles)', () => {
        const network = okNetwork();
        const sw = loadServiceWorker(network);

        expect(sw.dispatchFetch(new Request(NOMINATIM_URL))).toBeUndefined();
        expect(sw.dispatchFetch(new Request(ESRI_TILE_URL))).toBeUndefined();
        expect(network).not.toHaveBeenCalled();
    });

    test('a failed full download falls back to the original range request untouched', async () => {
        // The cache path's full fetch fails; the passthrough (a Request
        // carrying the original Range header) is answered like the real
        // server would answer it.
        const network = vi.fn(async (input) => {
            if (typeof input === 'string') throw new Error('network down');
            const range = input.headers.get('range');
            const match = /^bytes=(\d+)-(\d+)$/.exec(range || '');
            const start = Number(match[1]);
            const end = Number(match[2]);
            return new Response(archiveBytes.slice(start, end + 1), {
                status: 206,
                headers: { 'Content-Range': `bytes ${start}-${end}/${archiveBytes.byteLength}` },
            });
        });
        const sw = loadServiceWorker(network);

        const response = await sw.dispatchFetch(rangeRequest('bytes=0-16383'));

        expect(response.status).toBe(206);
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(archiveBytes.slice(0, 16384));
        expect(network).toHaveBeenCalledTimes(2);
        const passthrough = network.mock.calls[1][0];
        expect(passthrough).toBeInstanceOf(Request);
        expect(passthrough.headers.get('range')).toBe('bytes=0-16383');
    });
});
