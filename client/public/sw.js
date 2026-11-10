/**
 * Sibuyan Alert service worker.
 *
 * Three jobs:
 *   1. Push notifications (as before).
 *   2. Offline app shell + read-only data cache, so a responder who drives into
 *      a dead zone can still open the app and read the last-known incident list
 *      instead of staring at a white screen.
 *   3. Push subscription rotation. Browsers rotate push subscriptions; without
 *      handling that, the server keeps a dead endpoint and delivery stops
 *      silently — the exact failure this system must never have.
 *
 * Caching rules are deliberately conservative:
 *   - Same-origin GETs only, with exactly one cross-origin exception: the
 *     basemap glyph/sprite files (public, content-stable label assets).
 *   - Only a safelist of read-only endpoints is cached. Auth, file, and
 *     evidence routes are never cached: they carry identity or private media.
 *   - Per-user data is namespaced by user id, so two accounts sharing a browser
 *     profile can never read each other's cached incidents.
 *   - Logout purges everything.
 */

const DEFAULT_URL = '/dashboard';
const DEFAULT_ICON = '/icons/Alert.png';

// Bump alongside breaking shell changes so `activate` purges the previous
// deploy's hashed chunks and index.html. Old hashes never collide (Vite
// content-addresses /assets/*), but without versioning the stale shell keeps
// referencing deleted chunks after each deploy -> lazy() 404s.
const SHELL_CACHE = 'sibuyan-shell-v2';
const DATA_CACHE = 'sibuyan-data-v1';
// Map assets that make repeat opens fast: the self-hosted PMTiles archive
// (one fixed file) plus the basemap glyph/sprite files MapLibre needs
// before it can paint labels. Imagery tiles are deliberately NOT here —
// they stay network-bound (provider terms, unbounded growth).
const MAP_CACHE = 'sibuyan-map-v1';
const LEGACY_SHELL_CACHES = ['sibuyan-shell-v1'];

// The glyph/sprite host for the basemap label stack. This prefix is the
// ONLY cross-origin traffic the fetch handler intercepts; every other
// cross-origin request (imagery, geocoding, APIs) passes through as
// before.
const MAP_ASSET_PREFIX = 'https://protomaps.github.io/basemaps-assets/';
const PMTILES_ARCHIVE_PATH = /^\/maps\/[^/]+\.pmtiles$/;
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// Public, read-only endpoints. Safe to share across accounts.
const PUBLIC_API = [
    /^\/api\/reports$/,
    /^\/api\/reports\/high-risk-zones$/,
    /^\/api\/reports\/map-config$/,
    /^\/api\/reports\/stats$/,
    /^\/api\/reports\/municipalities$/,
    /^\/api\/reports\/categories$/,
    /^\/api\/high-risk-zones$/,
];

// Per-user operational reads. Cached only under the owning user's namespace.
const SCOPED_API = [
    /^\/api\/admin\/reports$/,
    /^\/api\/reports\/my-reports$/,
    /^\/api\/notifications$/,
];

const DB_NAME = 'sibuyan-sw';
const DB_VERSION = 1;
const KV_STORE = 'kv';

const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const readKv = async (key) => {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const request = db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE).get(key);
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return null;
    }
};

const writeKv = async (key, value) => {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const request = db.transaction(KV_STORE, 'readwrite').objectStore(KV_STORE).put(value, key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return false;
    }
};

const internalUrl = (value) => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
        return DEFAULT_URL;
    }
    return value;
};

const readPayload = (event) => {
    if (!event.data) return {};
    try {
        return event.data.json();
    } catch {
        return { body: event.data.text() };
    }
};

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const matchesAny = (pathname, patterns) => patterns.some((pattern) => pattern.test(pathname));

/** Cache keys for per-user data include the owner, so scopes never bleed. */
const scopedKey = (request, scope) => {
    const url = new URL(request.url);
    return new Request(`${url.origin}/__scoped/${scope}${url.pathname}${url.search}`, { method: 'GET' });
};

const clearAllCaches = async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
};

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // Individually so one missing asset cannot fail the whole install.
        await Promise.all(SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, DATA_CACHE, MAP_CACHE]);
        const names = await caches.keys();
        await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
        // Defense in depth: an older SW may have created the legacy shell
        // cache under the same keep-set logic of its era. Delete explicitly.
        await Promise.all(LEGACY_SHELL_CACHES.map((name) => caches.delete(name).catch(() => false)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'skip-waiting') {
        event.waitUntil(self.skipWaiting());
        return;
    }

    if (data.type === 'set-cache-scope') {
        event.waitUntil(writeKv('cacheScope', typeof data.scope === 'string' && data.scope ? data.scope : null));
        return;
    }

    if (data.type === 'set-push-config') {
        event.waitUntil(writeKv('pushConfig', {
            vapidPublicKey: data.vapidPublicKey || null,
            csrfToken: data.csrfToken || null,
        }));
        return;
    }

    // Logout must not leave another account's incidents readable on this device.
    if (data.type === 'clear-caches') {
        event.waitUntil(clearAllCaches());
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Basemap glyphs and sprites: cache-first from the map cache. Without
    // these, MapLibre cannot paint labels, so on a cold open they were a
    // network round trip standing between the reporter and a usable map.
    if (url.href.startsWith(MAP_ASSET_PREFIX)) {
        event.respondWith(cacheFirst(request, MAP_CACHE));
        return;
    }

    if (url.origin !== self.location.origin) return;

    // Never cache identity, media, or evidence routes.
    if (url.pathname.startsWith('/api/files') || url.pathname.startsWith('/api/auth')) return;

    if (PMTILES_ARCHIVE_PATH.test(url.pathname)) {
        event.respondWith(servePmtilesArchive(request));
        return;
    }

    if (matchesAny(url.pathname, PUBLIC_API)) {
        event.respondWith(networkFirst(request, DATA_CACHE));
        return;
    }

    if (matchesAny(url.pathname, SCOPED_API)) {
        event.respondWith((async () => {
            const scope = await readKv('cacheScope');
            if (!scope) return fetch(request);
            return networkFirst(request, DATA_CACHE, scope);
        })());
        return;
    }

    // Navigations: network-first so each deploy's fresh index.html (new hashed
    // chunk URLs) wins immediately; the cached shell is only a fallback for
    // true offline launches. The previous cache-first order served a stale
    // shell that referenced deleted chunks -> lazy() 404 after every deploy.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL_CACHE);
            try {
                const network = await fetch(request);
                if (network && network.ok) {
                    try {
                        await cache.put('/index.html', network.clone());
                    } catch {
                        // Quota / opaque-response put failures must not break nav.
                    }
                    return network;
                }
                const cached = await cache.match('/index.html');
                return cached || network;
            } catch {
                const cached = await cache.match('/index.html');
                if (cached) return cached;
                return Response.error();
            }
        })());
        return;
    }

    if (SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request, SHELL_CACHE));
    }
});

/**
 * Network first, cache as fallback. Emergency data must be fresh when the
 * network is available; the cache exists only for when it is not.
 */
async function networkFirst(request, cacheName, scope) {
    const cache = await caches.open(cacheName);
    const key = scope ? scopedKey(request, scope) : request;

    try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(key, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(key);
        if (cached) return cached;
        throw error;
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
}

/**
 * Parse a single "bytes=start-end" range header against the archive size.
 * Also accepts the open-ended ("bytes=start-") and suffix ("bytes=-n")
 * forms. Returns null for anything else (multi-range, malformed, or a
 * start beyond the end of the file) so the caller can answer with the
 * full body instead of a broken slice.
 */
const parseRangeHeader = (header, total) => {
    if (!header || typeof header !== 'string') return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) return null;

    let start;
    let end;
    if (match[1] === '') {
        const suffix = Number(match[2]);
        if (!Number.isFinite(suffix) || suffix <= 0) return null;
        start = Math.max(0, total - suffix);
        end = total - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= total) {
        return null;
    }
    return { start, end };
};

/** Build a real 206 Partial Content response from cached archive bytes. */
const buildRangeResponse = (bytes, { start, end }) => new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
    },
});

/**
 * Serve the self-hosted PMTiles archive from the map cache.
 *
 * The archive is one fixed file, so the worker caches the WHOLE file on
 * first use and answers every range request by slicing the cached bytes.
 * That satisfies the exact contract the mapProvider header inspection
 * validates (status 206 + a "bytes <start>-<end>/<total>" Content-Range),
 * and it is what makes streets mode render on a repeat open with no
 * network at all.
 *
 * Failure discipline: if anything in the cache path fails — no cached
 * copy and the full download errors or is not ok, a cache read/write
 * throws — the ORIGINAL request goes to the network untouched. This
 * path may make the map faster; it must never be able to break it.
 */
async function servePmtilesArchive(request) {
    try {
        const cache = await caches.open(MAP_CACHE);
        let archive = await cache.match(request.url);

        if (!archive) {
            // One full download with no Range header; every later range
            // request is served locally from the stored copy.
            const full = await fetch(request.url);
            if (!full || !full.ok) return fetch(request);
            await cache.put(request.url, full.clone());
            archive = full;
        }

        const bytes = new Uint8Array(await archive.arrayBuffer());
        const range = parseRangeHeader(request.headers.get('range'), bytes.byteLength);
        if (!range) {
            return new Response(bytes, {
                status: 200,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': String(bytes.byteLength),
                    'Accept-Ranges': 'bytes',
                },
            });
        }
        return buildRangeResponse(bytes, range);
    } catch {
        return fetch(request);
    }
}

self.addEventListener('push', (event) => {
    const payload = readPayload(event);
    const destination = internalUrl(payload.data?.url || payload.url);
    const options = {
        body: payload.body || payload.message || 'New notification',
        icon: payload.icon || DEFAULT_ICON,
        badge: payload.badge || DEFAULT_ICON,
        tag: payload.tag || 'sibuyan-alert',
        renotify: Boolean(payload.renotify),
        requireInteraction: Boolean(payload.requireInteraction),
        vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [200, 100, 200],
        data: { ...payload.data, url: destination },
        actions: Array.isArray(payload.actions) ? payload.actions : [],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Sibuyan Alert', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const destination = new URL(internalUrl(event.notification.data?.url), self.location.origin);
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        });

        for (const client of clientList) {
            let clientUrl;
            try {
                clientUrl = new URL(client.url);
            } catch {
                continue;
            }
            if (clientUrl.origin === destination.origin && 'focus' in client) {
                if ('navigate' in client && clientUrl.href !== destination.href) {
                    await client.navigate(destination.href);
                }
                return client.focus();
            }
        }

        return self.clients.openWindow?.(destination.href);
    })());
});

/**
 * The browser rotated the subscription. Without this handler the server keeps
 * the old endpoint, every send 404s, and the responder silently stops being
 * alerted — the worst possible failure for this system.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        try {
            const config = await readKv('pushConfig');
            if (!config?.vapidPublicKey) return;

            const subscription = event.newSubscription || await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
            });

            await fetch('/api/auth/push-subscription', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.csrfToken ? { 'x-csrf-token': config.csrfToken } : {}),
                },
                body: JSON.stringify({ subscription: subscription.toJSON() }),
            });
        } catch (error) {
            // A failed re-registration is not fatal: the next app launch
            // reconciles the subscription through the normal login path.
            console.error('pushsubscriptionchange failed:', error);
        }
    })());
});
