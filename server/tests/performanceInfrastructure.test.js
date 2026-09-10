import { beforeEach, describe, expect, test, vi as jest } from 'vitest';
import {
    getOrSet,
    invalidate,
    clear,
    getCacheStats,
    __resetCacheForTests,
} from '../utils/apiCache.js';
import {
    buildWeakEtag,
    etagMatches,
    sendConditionalJson,
} from '../utils/httpCache.js';
import {
    clampPageSize,
    clampPageNumber,
    resolveQueryPolicy,
    QUERY_POLICY_DEFAULTS,
} from '../config/queryPolicy.js';

const createRes = () => {
    const res = {
        headers: {},
        statusCode: null,
        body: undefined,
        ended: false,
    };
    res.setHeader = jest.fn((name, value) => { res.headers[name] = value; });
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((payload) => { res.body = payload; return res; });
    res.end = jest.fn(() => { res.ended = true; return res; });
    return res;
};

beforeEach(() => {
    __resetCacheForTests();
});

describe('apiCache', () => {
    test('runs the loader once and serves the cached value afterwards', async () => {
        const loader = jest.fn().mockResolvedValue({ total: 3 });

        const first = await getOrSet('k', 60_000, loader);
        const second = await getOrSet('k', 60_000, loader);

        expect(first).toEqual({ total: 3 });
        expect(second).toEqual({ total: 3 });
        expect(loader).toHaveBeenCalledTimes(1);
    });

    test('deduplicates concurrent callers on a cold key', async () => {
        // Without this, a cache stampede is worse than no cache: every caller
        // misses at the same instant and they all hit the database together.
        let release;
        const loader = jest.fn(() => new Promise((resolve) => { release = resolve; }));

        const pending = Promise.all([
            getOrSet('stampede', 60_000, loader),
            getOrSet('stampede', 60_000, loader),
            getOrSet('stampede', 60_000, loader),
        ]);

        release({ ok: true });
        const results = await pending;

        expect(loader).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(3);
        expect(getCacheStats().deduped).toBe(2);
    });

    test('reloads after the TTL lapses', async () => {
        const loader = jest.fn().mockResolvedValue(1);

        await getOrSet('ttl', 1, loader);
        await new Promise((resolve) => setTimeout(resolve, 5));
        await getOrSet('ttl', 1, loader);

        expect(loader).toHaveBeenCalledTimes(2);
    });

    test('never caches a failure', async () => {
        // Caching a rejection would turn a transient blip into a sustained outage.
        const loader = jest.fn()
            .mockRejectedValueOnce(new Error('mongo down'))
            .mockResolvedValueOnce('recovered');

        await expect(getOrSet('fail', 60_000, loader)).rejects.toThrow('mongo down');
        await expect(getOrSet('fail', 60_000, loader)).resolves.toBe('recovered');
    });

    test('invalidates by prefix without touching unrelated keys', async () => {
        await getOrSet('stats:a', 60_000, async () => 1);
        await getOrSet('stats:b', 60_000, async () => 2);
        await getOrSet('zones:x', 60_000, async () => 3);

        expect(invalidate('stats:')).toBe(2);

        const reloaded = jest.fn().mockResolvedValue(9);
        await getOrSet('stats:a', 60_000, reloaded);
        expect(reloaded).toHaveBeenCalledTimes(1);

        const zoneLoader = jest.fn().mockResolvedValue(4);
        await getOrSet('zones:x', 60_000, zoneLoader);
        expect(zoneLoader).not.toHaveBeenCalled();
    });

    test('reports hit rate for tuning the TTL', async () => {
        await getOrSet('hits', 60_000, async () => 1);
        await getOrSet('hits', 60_000, async () => 1);

        const stats = getCacheStats();
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe(0.5);
    });

    test('clear empties the store', async () => {
        await getOrSet('a', 60_000, async () => 1);
        expect(clear()).toBe(1);
        expect(getCacheStats().size).toBe(0);
    });
});

describe('httpCache', () => {
    test('builds a deterministic weak validator', () => {
        expect(buildWeakEtag('a', 1)).toBe(buildWeakEtag('a', 1));
        expect(buildWeakEtag('a', 1)).not.toBe(buildWeakEtag('a', 2));
        expect(buildWeakEtag('a', 1)).toMatch(/^W\/"[0-9a-f]{32}"$/);
    });

    test('matches If-None-Match across weak prefixes, lists and the wildcard', () => {
        const etag = buildWeakEtag('x');

        expect(etagMatches(etag, etag)).toBe(true);
        expect(etagMatches(etag.replace(/^W\//, ''), etag)).toBe(true);
        expect(etagMatches('*', etag)).toBe(true);
        expect(etagMatches(`W/"other", ${etag}`, etag)).toBe(true);
        expect(etagMatches('W/"other"', etag)).toBe(false);
        expect(etagMatches(undefined, etag)).toBe(false);
    });

    test('returns 304 without a body when the validator matches', () => {
        const etag = buildWeakEtag('payload');
        const req = { headers: { 'if-none-match': etag } };
        const res = createRes();

        const handled = sendConditionalJson(req, res, { big: 'payload' }, { etag, maxAgeSeconds: 60 });

        expect(handled).toBe(true);
        expect(res.statusCode).toBe(304);
        expect(res.ended).toBe(true);
        expect(res.json).not.toHaveBeenCalled();
    });

    test('sends the body with cache headers on a miss', () => {
        const req = { headers: {} };
        const res = createRes();

        sendConditionalJson(req, res, { ok: true }, { etag: 'W/"abc"', maxAgeSeconds: 60, private: true });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(res.headers['Cache-Control']).toBe('private, max-age=60, must-revalidate');
        // Vary on Cookie so a shared cache never serves one session's data to another.
        expect(res.headers.Vary).toBe('Cookie, Accept-Encoding');
    });

    test('derives a validator from the payload when none is supplied', () => {
        const res = createRes();
        sendConditionalJson({ headers: {} }, res, { a: 1 });
        expect(res.headers.ETag).toMatch(/^W\//);
    });
});

describe('compression configuration contract', () => {
    /**
     * Validates the middleware *configuration* used in server.js (threshold and
     * the already-encoded guard) rather than the one-line registration itself.
     * End-to-end verification needs a running instance with a database.
     */
    const buildApp = async () => {
        const [{ default: express }, { default: compression }, { default: request }] = await Promise.all([
            import('express'),
            import('compression'),
            import('supertest'),
        ]);

        const app = express();
        app.use(compression({
            threshold: 1024,
            filter: (req, res) => {
                if (res.getHeader('Content-Encoding')) return false;
                return compression.filter(req, res);
            },
        }));
        app.get('/large', (_req, res) => res.json({ items: Array.from({ length: 400 }, (_, i) => `barangay-${i}`) }));
        app.get('/small', (_req, res) => res.json({ ok: true }));
        return { app, request };
    };

    test('compresses a large JSON response when the client accepts it', async () => {
        const { app, request } = await buildApp();

        const response = await request(app)
            .get('/large')
            .set('Accept-Encoding', 'gzip')
            .expect(200);

        expect(response.headers['content-encoding']).toBe('gzip');
    });

    test('leaves a response below the threshold uncompressed', async () => {
        const { app, request } = await buildApp();

        const response = await request(app)
            .get('/small')
            .set('Accept-Encoding', 'gzip')
            .expect(200);

        expect(response.headers['content-encoding']).toBeUndefined();
    });

    test('does not compress when the client does not accept it', async () => {
        const { app, request } = await buildApp();

        const response = await request(app)
            .get('/large')
            .set('Accept-Encoding', 'identity')
            .expect(200);

        expect(response.headers['content-encoding']).toBeUndefined();
    });
});

describe('queryPolicy', () => {
    test('clamps page size into the allowed window', () => {
        const policy = resolveQueryPolicy({});

        expect(clampPageSize('10', policy)).toBe(10);
        expect(clampPageSize('9999', policy)).toBe(policy.maxPageSize);
        expect(clampPageSize('0', policy)).toBe(policy.defaultPageSize);
        expect(clampPageSize('abc', policy)).toBe(policy.defaultPageSize);
        expect(clampPageSize(undefined, policy)).toBe(policy.defaultPageSize);
    });

    test('clamps the page number to a positive integer', () => {
        expect(clampPageNumber('3')).toBe(3);
        expect(clampPageNumber('0')).toBe(1);
        expect(clampPageNumber('-5')).toBe(1);
        expect(clampPageNumber(undefined)).toBe(1);
    });

    test('falls back to safe defaults for malformed overrides', () => {
        const policy = resolveQueryPolicy({ QUERY_MAX_TIME_MS: 'nope', QUERY_MAX_PAGE_SIZE: '-1' });

        expect(policy.maxTimeMs).toBe(QUERY_POLICY_DEFAULTS.maxTimeMs);
        expect(policy.maxPageSize).toBe(QUERY_POLICY_DEFAULTS.maxPageSize);
    });

    test('honours valid overrides', () => {
        const policy = resolveQueryPolicy({ QUERY_MAX_TIME_MS: '1500' });
        expect(policy.maxTimeMs).toBe(1500);
    });
});
