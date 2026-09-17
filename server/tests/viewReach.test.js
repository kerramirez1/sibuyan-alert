import { describe, expect, test } from 'vitest';
import ViewEvent, {
    VIEW_TARGET_TYPES,
    VIEWER_ROLES,
    VIEWER_KEY_PATTERN,
    VIEW_EVENT_RETENTION_DAYS,
} from '../models/ViewEvent.js';
import { buildViewerIdentity, recordViewEvent } from '../services/viewEventService.js';

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
