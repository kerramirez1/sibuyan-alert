import { describe, expect, test, vi } from 'vitest';
import ViewEvent, {
    PUBLIC_VIEWER_ROLES,
    VIEW_TARGET_TYPES,
    VIEWER_ROLES,
    VIEWER_KEY_PATTERN,
    VIEW_EVENT_RETENTION_DAYS,
} from '../models/ViewEvent.js';
import {
    buildViewerIdentity,
    collapseGuestViewForTarget,
    deleteViewEventsForTarget,
    deleteViewerAliasesForUser,
    linkViewerAlias,
    recordViewEvent,
    readTopReach,
    resolveViewerAlias,
} from '../services/viewEventService.js';
import ViewerAlias from '../models/ViewerAlias.js';
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

// Every test here spies on a model method. Restoring between tests is what keeps
// one test's rejected `deleteOne` from becoming the next test's failure — the
// recording path now touches two collections, so the surface to leak through has
// grown.
afterEach(() => {
    vi.restoreAllMocks();
});

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

/**
 * Repeat views cannot double-count.
 *
 * The question this answers is the one every reach feature gets asked: "if a
 * guest opens the same incident five times, do we count five?" The answer has to
 * be no, and it has to come from the write, not from client-side bookkeeping — a
 * flaky network, a refresh, a back-navigation and a second tab all bypass
 * whatever the client thinks it remembers.
 *
 * The schema test above asserts the unique index exists. These assert the write
 * that index is protecting: an upsert keyed by (record, viewer) whose per-view
 * effect is a timestamp, never a count.
 */
describe('repeated views from the same guest collapse to one row', () => {
    const anonKey = `anon:${VALID_UUID}`;

    test('writes an upsert keyed by the record and the viewer, not an insert', async () => {
        const spy = vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });

        await recordViewEvent({ targetType: 'report', targetId: VALID_ID, viewerKey: anonKey, viewerRole: 'guest' });
        await recordViewEvent({ targetType: 'report', targetId: VALID_ID, viewerKey: anonKey, viewerRole: 'guest' });

        expect(spy).toHaveBeenCalledTimes(2);
        const [filter, update, options] = spy.mock.calls[0];

        // The dedupe key. Two writes from the same guest resolve to the same row.
        expect(filter).toEqual({ targetType: 'report', targetId: VALID_ID, viewerKey: anonKey });
        expect(options).toMatchObject({ upsert: true });
        expect(spy.mock.calls[1][0]).toEqual(filter);

        // `firstViewedAt` and the role are written once, on the first contact;
        // the repeated open only moves `lastViewedAt`.
        expect(update.$set).toEqual({ lastViewedAt: expect.any(Date) });
        // Same set of fields, order-independent: the point is that every field
        // describing the row is written once, and none of them is a counter.
        expect(Object.keys(update.$setOnInsert).sort()).toEqual(
            ['firstViewedAt', 'targetType', 'targetId', 'viewerKey', 'viewerRole'].sort(),
        );

        // Nothing here increments anything. If someone ever turns this into
        // `$inc`, reach becomes an open counter and the panel's "repeat opens by
        // the same viewer count once" footnote becomes a lie.
        expect(Object.keys(update)).toEqual(['$setOnInsert', '$set']);
    });

    test('a lost race updates the winning row instead of failing or duplicating', async () => {
        const conflict = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
        const spy = vi.spyOn(ViewEvent, 'updateOne')
            .mockRejectedValueOnce(conflict)
            .mockResolvedValueOnce({ acknowledged: true });

        // A double-tap can make both requests believe they are first. One wins the
        // insert, the other must quietly land on the same row — otherwise a
        // legitimate view would surface as a 500.
        await expect(recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: anonKey, viewerRole: 'guest',
        })).resolves.toBe(true);

        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls[1][0]).toEqual(spy.mock.calls[0][0]);
        // The retry only re-stamps the existing row: no second insert attempt.
        expect(spy.mock.calls[1][1]).toEqual({ $set: { lastViewedAt: expect.any(Date) } });
        expect(spy.mock.calls[1][2]).toBeUndefined();
    });
});

/**
 * One person, one row — across the sign-in boundary.
 *
 * Recording is idempotent per viewer key, which covers refreshes and repeat
 * opens. It does NOT cover the identity switch: a visitor who browses the public
 * map as a guest and then logs in holds two keys for the same record
 * (`anon:<uuid>`, then `user:<id>`), and both `guest` and `reporter` count as
 * public reach. Left alone, that counted one person twice — on every record they
 * had already opened before signing in, in the flow the app encourages.
 *
 * The client sends its anonymous id with every view, so the browser that owns
 * the guest row is known exactly. These tests pin that the account write removes
 * it, that a guest write never does, and that the removal can never fail a
 * recorded view.
 */
/**
 * The other direction of the same boundary: signed in → signed out.
 *
 * Collapsing the guest row fixes the case where somebody browses first and signs
 * in second. It does nothing for the reverse, because a signed-out request has no
 * account to collapse toward — the sign-out simply wrote a fresh `anon:` row for a
 * person whose `user:` row was already counted, and both roles are public reach.
 *
 * What closes it is remembering the browser. A signed-in view stores an alias for
 * the anonymous id it arrived with; a later signed-out view from that browser
 * resolves to the account and updates the row that already exists, so crossing the
 * boundary in either direction leaves one person counted once.
 */
describe('a signed-out view from a linked browser resolves to the account', () => {
    const anonKey = `anon:${VALID_UUID}`;
    const userKey = `user:${VALID_ID}`;
    const aliasLookup = (alias) => vi.spyOn(ViewerAlias, 'findOne')
        .mockReturnValue({ lean: async () => alias });

    test('records the view against the account instead of minting a new viewer', async () => {
        aliasLookup({ user: VALID_ID, viewerRole: 'reporter' });
        const upsert = vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });
        // Both sides of the account path still run, and both must stay harmless
        // here: the browser's guest row for this record (if an earlier write made
        // one while aliases were unreachable) is removed, and the link is refreshed.
        const collapse = vi.spyOn(ViewEvent, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
        vi.spyOn(ViewerAlias, 'updateOne').mockResolvedValue({ acknowledged: true });

        await expect(recordViewEvent({
            targetType: 'report',
            targetId: VALID_ID,
            viewerKey: anonKey,
            viewerRole: 'guest',
            anonymousId: VALID_UUID,
        })).resolves.toBe(true);

        // The existing account row, updated. A second row for the same person is
        // exactly what this exists to prevent.
        expect(upsert.mock.calls[0][0]).toEqual({
            targetType: 'report',
            targetId: VALID_ID,
            viewerKey: userKey,
        });
        expect(upsert.mock.calls[0][1].$setOnInsert.viewerRole).toBe('reporter');
        // The row written is the account's, and the guest row for the same record
        // does not survive beside it.
        expect(collapse).toHaveBeenCalledWith({
            targetType: 'report', targetId: VALID_ID, viewerKey: anonKey,
        });
    });

    test('leaves a browser with no alias counting as the guest it is', async () => {
        aliasLookup(null);
        const upsert = vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });

        await recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: anonKey, viewerRole: 'guest',
            anonymousId: VALID_UUID,
        });

        expect(upsert.mock.calls[0][0]).toEqual({
            targetType: 'report', targetId: VALID_ID, viewerKey: anonKey,
        });
    });

    test('a failed alias lookup falls back to the guest key instead of dropping the view', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(ViewerAlias, 'findOne').mockReturnValue({
            lean: async () => { throw new Error('viewer_aliases unavailable'); },
        });
        const upsert = vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });

        // Resolving the alias is an optimisation for correctness of the COUNT, not
        // a precondition for recording. A view that arrives while the lookup is
        // down must still be written, or the outage erases real reach.
        await expect(recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: anonKey, viewerRole: 'guest',
            anonymousId: VALID_UUID,
        })).resolves.toBe(true);

        expect(upsert.mock.calls[0][0].viewerKey).toBe(anonKey);
        expect(warn).toHaveBeenCalled();
    });

    test('a signed-in view remembers the browser, so the next signed-out one resolves', async () => {
        const aliasWrite = vi.spyOn(ViewerAlias, 'updateOne').mockResolvedValue({ acknowledged: true });
        vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });
        vi.spyOn(ViewEvent, 'deleteOne').mockResolvedValue({ deletedCount: 0 });

        await recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: userKey, viewerRole: 'reporter',
            anonymousId: VALID_UUID,
        });

        expect(aliasWrite).toHaveBeenCalledWith(
            { viewerKey: anonKey },
            {
                $set: {
                    user: VALID_ID,
                    viewerRole: 'reporter',
                    // Anchored on each link, so a browser still in use keeps its
                    // link for another retention window.
                    linkedAt: expect.any(Date),
                },
            },
            { upsert: true },
        );
    });

    test('refuses to link a malformed browser id, a bad account, or an unknown role', async () => {
        const aliasWrite = vi.spyOn(ViewerAlias, 'updateOne').mockResolvedValue({ acknowledged: true });

        await expect(linkViewerAlias({ anonymousId: 'not-a-uuid', accountId: VALID_ID, viewerRole: 'reporter' }))
            .resolves.toBe(false);
        await expect(linkViewerAlias({ anonymousId: VALID_UUID, accountId: 'nope', viewerRole: 'reporter' }))
            .resolves.toBe(false);
        await expect(linkViewerAlias({ anonymousId: VALID_UUID, accountId: VALID_ID, viewerRole: 'stranger' }))
            .resolves.toBe(false);

        expect(aliasWrite).not.toHaveBeenCalled();
    });

    test('resolves nothing without a usable browser id, and never for a malformed one', async () => {
        const lookup = vi.spyOn(ViewerAlias, 'findOne')
            .mockReturnValue({ lean: async () => null });

        await expect(resolveViewerAlias({})).resolves.toBeNull();
        await expect(resolveViewerAlias({ anonymousId: 'forged' })).resolves.toBeNull();

        // Malformed input is rejected before the query, so it can never become a
        // lookup key.
        expect(lookup).not.toHaveBeenCalled();
    });

    test('cleans up the aliases pointing at a deleted account', async () => {
        const cleanup = vi.spyOn(ViewerAlias, 'deleteMany').mockResolvedValue({ deletedCount: 2 });

        await expect(deleteViewerAliasesForUser({ userId: VALID_ID })).resolves.toBe(2);
        expect(cleanup).toHaveBeenCalledWith({ user: VALID_ID });

        await expect(deleteViewerAliasesForUser({ userId: 'nope' })).resolves.toBe(0);
        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});

describe('viewer alias schema', () => {
    test('allows one alias per browser, so a signed-out view cannot resolve ambiguously', () => {
        const unique = ViewerAlias.schema.indexes().find(([, options]) => options?.unique === true);

        expect(unique).toBeDefined();
        expect(unique[0]).toEqual({ viewerKey: 1 });
    });

    test('expires the link on the same window as the rows it de-duplicates', () => {
        const ttl = ViewerAlias.schema.indexes()
            .find(([, options]) => options?.expireAfterSeconds !== undefined);

        expect(ttl).toBeDefined();
        expect(ttl[0]).toEqual({ linkedAt: 1 });
        expect(ttl[1].expireAfterSeconds).toBe(VIEW_EVENT_RETENTION_DAYS * 24 * 60 * 60);
    });
});

describe('a signed-in view collapses the browser guest row for the same record', () => {
    const anonKey = `anon:${VALID_UUID}`;
    const userKey = `user:${VALID_ID}`;

    test('removes the guest row for exactly the record the account just opened', async () => {
        vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });
        vi.spyOn(ViewerAlias, 'updateOne').mockResolvedValue({ acknowledged: true });
        const deleteSpy = vi.spyOn(ViewEvent, 'deleteOne').mockResolvedValue({ deletedCount: 1 });

        await expect(recordViewEvent({
            targetType: 'report',
            targetId: VALID_ID,
            viewerKey: userKey,
            viewerRole: 'reporter',
            anonymousId: VALID_UUID,
        })).resolves.toBe(true);

        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(deleteSpy).toHaveBeenCalledWith({
            targetType: 'report',
            targetId: VALID_ID,
            viewerKey: anonKey,
        });
    });

    test('never queries for a guest write or without a usable anonymous id', async () => {
        vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });
        const deleteSpy = vi.spyOn(ViewEvent, 'deleteOne').mockResolvedValue({ deletedCount: 0 });
        const aliasLookup = vi.spyOn(ViewerAlias, 'findOne')
            .mockReturnValue({ lean: async () => null });

        // A guest write has no account to attribute the row to — and collapsing on
        // a guest key would delete the row that was just written.
        await recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: anonKey, viewerRole: 'guest',
            anonymousId: VALID_UUID,
        });
        // Signed in, but nothing identifies the browser's earlier row.
        await recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: userKey, viewerRole: 'reporter',
        });
        // A forged or malformed id must never become a delete filter.
        await recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: userKey, viewerRole: 'reporter',
            anonymousId: 'not-a-uuid',
        });

        expect(deleteSpy).not.toHaveBeenCalled();
        // The one lookup that did happen is the first call — a guest write — and it
        // resolved to nothing, so that browser keeps an anonymous row.
        expect(aliasLookup).toHaveBeenCalledTimes(1);
    });

    test('a failed collapse still reports the view as recorded', async () => {
        vi.spyOn(ViewEvent, 'updateOne').mockResolvedValue({ acknowledged: true });
        vi.spyOn(ViewerAlias, 'updateOne').mockResolvedValue({ acknowledged: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(ViewEvent, 'deleteOne').mockRejectedValue(new Error('view_events unavailable'));

        // The upsert already landed, so the caller must not be told the operation
        // failed: the cost of this failure is the old double-count, not a lost view.
        await expect(recordViewEvent({
            targetType: 'report', targetId: VALID_ID, viewerKey: userKey, viewerRole: 'reporter',
            anonymousId: VALID_UUID,
        })).resolves.toBe(true);

        expect(warn).toHaveBeenCalled();
    });

    test('rejects a malformed target without querying', async () => {
        const deleteSpy = vi.spyOn(ViewEvent, 'deleteOne').mockResolvedValue({ deletedCount: 0 });

        await expect(collapseGuestViewForTarget({
            targetType: 'user', targetId: VALID_ID, anonymousId: VALID_UUID,
        })).resolves.toBe(0);
        await expect(collapseGuestViewForTarget({
            targetType: 'report', targetId: 'nope', anonymousId: VALID_UUID,
        })).resolves.toBe(0);

        expect(deleteSpy).not.toHaveBeenCalled();
    });
});

/**
 * The reach aggregation.
 *
 * `readTopReach` is the single read path now — the per-record variant that
 * duplicated this logic was deleted rather than left to drift — so its two
 * load-bearing decisions are pinned here: which viewers count as the public, and
 * that the record scope is applied inside the pipeline instead of being used to
 * filter an already-truncated result.
 */
describe('reach aggregation', () => {
    const aggregateSpy = () => vi.spyOn(ViewEvent, 'aggregate').mockResolvedValue([]);

    test('treats only the anonymous public and verified reporters as public reach', () => {
        // Staff opens are recorded and counted in uniqueViewers, but they are not
        // community awareness, and the headline figure has to mean one thing.
        expect(PUBLIC_VIEWER_ROLES).toEqual(['guest', 'reporter']);
        expect(PUBLIC_VIEWER_ROLES).not.toContain('responder');
        expect(PUBLIC_VIEWER_ROLES).not.toContain('municipal_admin');
    });

    test('ranks by public reach, then by total, then by recency', async () => {
        const spy = aggregateSpy();

        await readTopReach({ targetType: 'report', limit: 5 });

        expect(spy).toHaveBeenCalledTimes(1);
        const pipeline = spy.mock.calls[0][0];
        expect(pipeline.at(-1)).toEqual({ $limit: 5 });
        expect(pipeline.at(-2)).toEqual({
            $sort: { publicViewers: -1, uniqueViewers: -1, lastViewedAt: -1 },
        });
    });

    test('constrains the pipeline to the caller-supplied scope before limiting', async () => {
        const spy = aggregateSpy();
        const scoped = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];

        await readTopReach({ targetType: 'report', limit: 10, targetIds: scoped });

        const pipeline = spy.mock.calls[0][0];
        expect(pipeline[0].$match.targetType).toBe('report');
        // Scope inside the pipeline — filtering the result afterwards would cap
        // the rows a municipality can ever see at the island-wide top N.
        expect(pipeline[0].$match.targetId.$in.map(String)).toEqual(scoped);
    });

    test('leaves the pipeline unscoped when the caller passes no scope', async () => {
        const spy = aggregateSpy();

        await readTopReach({ targetType: 'zone' });

        expect(spy.mock.calls[0][0][0]).toEqual({ $match: { targetType: 'zone' } });
    });

    test('answers an empty scope without querying at all', async () => {
        const spy = aggregateSpy();

        // "No records in scope" is an answer, and must not silently become the
        // unscoped read: that is how one municipality's numbers leak into another's.
        await expect(readTopReach({ targetType: 'report', targetIds: [] })).resolves.toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });

    test('rejects an unknown target type without touching the database', async () => {
        const spy = aggregateSpy();

        await expect(readTopReach({ targetType: 'user' })).resolves.toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });
});

/**
 * Cleanup of the reach rows a deleted record leaves behind.
 *
 * The behaviour that matters is not the happy path — it is that a cleanup failure
 * cannot fail the deletion it is attached to. These rows are supplementary to the
 * record, and the TTL already guarantees they cannot outlive their usefulness by
 * more than the retention window.
 */
describe('reach cleanup on record deletion', () => {
    test('removes the rows for the deleted record and reports how many went', async () => {
        const spy = vi.spyOn(ViewEvent, 'deleteMany').mockResolvedValue({ deletedCount: 3 });

        await expect(deleteViewEventsForTarget({ targetType: 'zone', targetId: VALID_ID }))
            .resolves.toBe(3);
        expect(spy).toHaveBeenCalledWith({ targetType: 'zone', targetId: VALID_ID });
    });

    test('swallows a cleanup failure so the deletion still succeeds', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(ViewEvent, 'deleteMany').mockRejectedValue(new Error('view_events unavailable'));

        // Resolving rather than rejecting is the contract: the caller has already
        // deleted the record and must not be told the operation failed.
        await expect(deleteViewEventsForTarget({ targetType: 'report', targetId: VALID_ID }))
            .resolves.toBe(0);
        expect(warn).toHaveBeenCalled();
    });

    test('rejects a malformed target without querying', async () => {
        const spy = vi.spyOn(ViewEvent, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

        await expect(deleteViewEventsForTarget({ targetType: 'user', targetId: VALID_ID }))
            .resolves.toBe(0);
        await expect(deleteViewEventsForTarget({ targetType: 'report', targetId: 'nope' }))
            .resolves.toBe(0);
        expect(spy).not.toHaveBeenCalled();
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
