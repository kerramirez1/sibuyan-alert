import { describe, expect, test, vi } from 'vitest';
import ViewEvent, {
    VIEW_TARGET_TYPES,
    VIEWER_ROLES,
    VIEWER_KEY_PATTERN,
    VIEW_EVENT_RETENTION_DAYS,
} from '../models/ViewEvent.js';
import { buildViewerIdentity, recordViewEvent } from '../services/viewEventService.js';
import { csrfProtection } from '../middleware/csrf.js';

/**
 * Reach tests.
 *
 * These cover the parts that decide correctness without touching MongoDB: how a
 * viewer key is derived, what input is rejected, and whether the schema still
 * declares the index that makes dedupe work. The upsert itself is exercised by
 * the unique index at runtime — asserting the index exists is the closest a
 * unit test can get to asserting "repeat views cannot double-count", and it is
 * the assertion that would actually catch someone deleting it.
 */

const VALID_ID = '507f1f77bcf86cd799439011';
const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('viewer identity', () => {
    test('keys signed-in viewers by account so one person counts once per account', () => {
        const identity = buildViewerIdentity({ user: { _id: VALID_ID, role: 'reporter' } });
        expect(identity).toEqual({ viewerKey: `user:${VALID_ID}`, viewerRole: 'reporter' });
    });

    test('maps municipal admins and responders to their own roles', () => {
        expect(buildViewerIdentity({ user: { _id: VALID_ID, role: 'municipal_admin' } })?.viewerRole)
            .toBe('municipal_admin');
        expect(buildViewerIdentity({ user: { _id: VALID_ID, role: 'admin' } })?.viewerRole)
            .toBe('municipal_admin');
        expect(buildViewerIdentity({ user: { _id: VALID_ID, role: 'responder' } })?.viewerRole)
            .toBe('responder');
    });

    test('keys guests by the anonymous id they send', () => {
        expect(buildViewerIdentity({ anonymousId: VALID_UUID }))
            .toEqual({ viewerKey: `anon:${VALID_UUID}`, viewerRole: 'guest' });
    });

    test('refuses to invent an identity when none is supplied', () => {
        // The failure this prevents: folding every id-less request into one
        // "anonymous" bucket, which would let a client inflate reach on every
        // call — exactly what the dedupe exists to stop.
        expect(buildViewerIdentity()).toBeNull();
        expect(buildViewerIdentity({})).toBeNull();
        expect(buildViewerIdentity({ anonymousId: '' })).toBeNull();
        expect(buildViewerIdentity({ anonymousId: 'not-a-uuid' })).toBeNull();
        expect(buildViewerIdentity({ user: { _id: 'not-an-objectid' } })).toBeNull();
    });

    test('accepts only well-formed viewer keys', () => {
        expect(VIEWER_KEY_PATTERN.test(`user:${VALID_ID}`)).toBe(true);
        expect(VIEWER_KEY_PATTERN.test(`anon:${VALID_UUID}`)).toBe(true);
        // A v1 UUID must not pass as an anonymous key.
        expect(VIEWER_KEY_PATTERN.test('anon:3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false);
        expect(VIEWER_KEY_PATTERN.test('anon:')).toBe(false);
    });
});

describe('recordViewEvent input validation', () => {
    test('rejects an unknown target type without touching the database', async () => {
        await expect(recordViewEvent({ targetType: 'user', targetId: VALID_ID, viewerKey: `user:${VALID_ID}` }))
            .resolves.toBe(false);
    });

    test('rejects a malformed target id', async () => {
        await expect(recordViewEvent({ targetType: 'report', targetId: 'nope', viewerKey: `user:${VALID_ID}` }))
            .resolves.toBe(false);
    });

    test('rejects a malformed viewer key', async () => {
        await expect(recordViewEvent({ targetType: 'report', targetId: VALID_ID, viewerKey: 'anon:forged' }))
            .resolves.toBe(false);
    });
});

describe('view event schema', () => {
    test('declares the unique index that makes repeat views impossible to double-count', () => {
        const unique = ViewEvent.schema.indexes().find(([, options]) => options?.unique === true);

        expect(unique).toBeDefined();
        expect(unique[0]).toEqual({ targetType: 1, targetId: 1, viewerKey: 1 });
    });

    test('declares the retention TTL on lastViewedAt', () => {
        const ttl = ViewEvent.schema.indexes().find(([, options]) => options?.expireAfterSeconds !== undefined);

        expect(ttl).toBeDefined();
        expect(ttl[0]).toEqual({ lastViewedAt: 1 });
        expect(ttl[1].expireAfterSeconds).toBe(VIEW_EVENT_RETENTION_DAYS * 24 * 60 * 60);
    });

    test('covers both record types and all viewer roles', () => {
        expect(VIEW_TARGET_TYPES).toEqual(['report', 'zone']);
        expect(VIEWER_ROLES).toContain('guest');
        // The retention window is a privacy commitment, not a tuning knob; a
        // silent change here should fail loudly.
        expect(VIEW_EVENT_RETENTION_DAYS).toBe(180);
    });
});

const makeRes = () => {
    const res = { statusCode: 200 };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = () => res;
    return res;
};

/**
 * Regression guard for the bug that made every guest view vanish.
 *
 * The CSRF cookie is only issued when a session is created, so an
 * unauthenticated guest has no token to echo. Without an explicit exemption the
 * middleware answers 403 and the view is dropped — silently, because the client
 * is fire-and-forget. Signed-in viewers kept working, which is what made this
 * look like a guest-only mystery rather than a missing allowlist entry.
 */
describe('reach endpoint reachability', () => {
    const guestRequest = (path) => ({
        method: 'POST',
        path,
        headers: {},
        get: () => undefined,
    });

    test('a guest POST to /api/views passes CSRF', () => {
        const res = makeRes();
        const next = vi.fn();

        csrfProtection(guestRequest('/api/views'), res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
    });

    test('a guest POST to the legacy report-view path still passes', () => {
        const res = makeRes();
        const next = vi.fn();

        csrfProtection(guestRequest('/api/reports/507f1f77bcf86cd799439011/views'), res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    test('the exemption does not open other API writes', () => {
        const res = makeRes();
        const next = vi.fn();

        csrfProtection(guestRequest('/api/reports'), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });
});

/**
 * Coverage guard for the whole class of bug, not just this instance.
 *
 * `optionalAuth` is the marker that says "a guest may reach this route". Any
 * such route must also be CSRF-exempt, because a guest has no CSRF cookie to
 * echo — the cookie is only issued when a session is created. When those two
 * facts drift apart the route silently 403s for guests, which is exactly how
 * /api/views shipped broken.
 *
 * This reads the route sources rather than importing them so it can catch a
 * route that was added without anyone thinking about CSRF at all. It only sees
 * single-line registrations; a route split across lines would slip past, so the
 * assertion is a floor, not a proof.
 */
describe('every guest-reachable write route is CSRF-exempt', () => {
    const routeFiles = [
        'auth.js', 'reports.js', 'views.js', 'notifications.js',
        'admin.js', 'highRiskZones.js', 'analyticsRoutes.js', 'files.js',
    ];

    test('optionalAuth routes all appear in the CSRF exempt list', async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, join } = await import('node:path');

        const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
        const routesDir = join(serverDir, 'routes');
        const serverSource = readFileSync(join(serverDir, 'server.js'), 'utf8');

        // A route file only knows its own path (`/:id/views`); the middleware
        // sees the mounted path (`/api/reports/:id/views`). Rebuilding that
        // requires both halves: the import that names the router, and the
        // app.use that mounts it. Guessing the prefix would make this guard lie.
        const fileByImport = {};
        serverSource.split('\n').forEach((line) => {
            const imported = line.match(/import\s+(\w+)\s+from\s+'\.\/routes\/([\w.]+)'/);
            if (imported) fileByImport[imported[1]] = imported[2];
        });

        const prefixByFile = {};
        serverSource.split('\n').forEach((line) => {
            const mounted = line.match(/app\.use\('(\/api[^']*)',\s*(\w+)\)/);
            if (!mounted) return;
            const file = fileByImport[mounted[2]];
            if (file) prefixByFile[file] = mounted[1];
        });

        const uncovered = [];
        let checked = 0;

        routeFiles.forEach((file) => {
            let source = '';
            try {
                source = readFileSync(join(routesDir, file), 'utf8');
            } catch {
                return;
            }

            const prefix = prefixByFile[file] || '';
            source.split('\n').forEach((line) => {
                if (!line.includes('optionalAuth')) return;
                const match = line.match(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/);
                // GET/HEAD are safe methods and never reach the token check.
                if (!match || match[1] === 'get') return;

                const routePath = match[2] === '/' ? prefix : `${prefix}${match[2]}`;
                checked += 1;

                const res = makeRes();
                const next = vi.fn();
                csrfProtection({
                    method: 'POST',
                    path: routePath,
                    headers: {},
                    get: () => undefined,
                }, res, next);

                if (next.mock.calls.length === 0) uncovered.push(routePath);
            });
        });

        // Guard against the guard: if the parsing above silently stops finding
        // routes, an empty `uncovered` would be meaningless.
        expect(checked).toBeGreaterThan(0);
        // Empty means every guest-reachable write can actually be reached by a
        // guest. A failure here names the route that cannot.
        expect(uncovered).toEqual([]);
    });
});
