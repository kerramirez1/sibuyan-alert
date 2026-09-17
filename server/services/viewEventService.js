import mongoose from 'mongoose';
import ViewEvent, { VIEW_TARGET_TYPES, VIEWER_KEY_PATTERN } from '../models/ViewEvent.js';

/**
 * D8 View events — recording and reading reach.
 *
 * Two responsibilities, deliberately kept apart:
 *   recordViewEvent()   — idempotent per (record, viewer); repeat calls update
 *                         a timestamp instead of adding a row.
 *   readReachByTargets() / readTopReach()
 *                       — aggregate counts for admin surfaces. Aggregates only:
 *                         no function here can return a per-viewer list, so a
 *                         future caller cannot accidentally expose one.
 */

const isObjectId = (value) => mongoose.isValidObjectId(value);

/**
 * Derives the opaque viewer key and role for a request.
 *
 * Authenticated viewers are keyed by their account id, so the same person
 * counts once across every browser they sign in from. Guests are keyed by the
 * random id the client generates and stores locally.
 *
 * The guest key is per-BROWSER, not per-person: private browsing and cleared
 * storage both mint a new one, and a determined user could forge one. That is
 * an accepted limit, because the threat being solved is accidental
 * double-counting — refreshing, reopening, navigating back — not ballot
 * stuffing. Treat these counts as reach, never as an audited headcount.
 *
 * @param {object}  [options]
 * @param {object}  [options.user]        Authenticated user, if any.
 * @param {string}  [options.anonymousId] Client-generated id for guests.
 * @returns {{ viewerKey: string, viewerRole: string } | null}
 */
export const buildViewerIdentity = ({ user = null, anonymousId = null } = {}) => {
    const userId = user?._id ?? user?.id ?? null;

    if (userId) {
        const normalized = String(userId);
        if (!isObjectId(normalized)) return null;
        return {
            viewerKey: `user:${normalized}`,
            // Municipal admins and responders are distinct audiences for reach
            // purposes; anything else authenticated counts as a reporter.
            viewerRole: user?.role === 'municipal_admin' || user?.role === 'admin'
                ? 'municipal_admin'
                : user?.role === 'responder'
                    ? 'responder'
                    : 'reporter',
        };
    }

    const guestId = typeof anonymousId === 'string' ? anonymousId.trim() : '';
    if (!guestId) return null;
    const viewerKey = `anon:${guestId}`;
    if (!VIEWER_KEY_PATTERN.test(viewerKey)) return null;
    return { viewerKey, viewerRole: 'guest' };
};

/**
 * Records that `viewerKey` opened `targetId`.
 *
 * Idempotent by construction: the unique index on
 * (targetType, targetId, viewerKey) plus `upsert` means a repeat view matches
 * the existing row. `firstViewedAt` is therefore the true first contact and
 * `lastViewedAt` the most recent — neither is a running total, which is exactly
 * what makes the count immune to refreshes.
 *
 * E11000 handling: two concurrent upserts can both miss the row and both try to
 * insert; one wins and the other raises a duplicate-key error. That is a benign
 * race — the row it wanted now exists — so it is retried once rather than
 * surfaced. Without this, a double-tap would produce a 500 for a view that was
 * in fact recorded correctly.
 *
 * @returns {Promise<boolean>} true when the view was recorded or already existed.
 */
export const recordViewEvent = async ({ targetType, targetId, viewerKey, viewerRole } = {}) => {
    if (!VIEW_TARGET_TYPES.includes(targetType)) return false;
    if (!isObjectId(targetId)) return false;
    if (!VIEWER_KEY_PATTERN.test(String(viewerKey || ''))) return false;

    const now = new Date();
    const filter = { targetType, targetId, viewerKey };
    const update = {
        $setOnInsert: {
            targetType,
            targetId,
            viewerKey,
            // Role is written once, on insert. It describes the audience that
            // FIRST reached the record; a later role change belongs to a
            // different viewer key (anon: -> user:) and therefore a new row.
            viewerRole,
            firstViewedAt: now,
        },
        $set: { lastViewedAt: now },
    };

    try {
        await ViewEvent.updateOne(filter, update, { upsert: true });
        return true;
    } catch (error) {
        if (error?.code === 11000) {
            await ViewEvent.updateOne({ ...filter }, { $set: { lastViewedAt: now } });
            return true;
        }
        throw error;
    }
};

/**
 * Unique-viewer counts for a set of records, keyed by target id.
 *
 * `$group` counts rows, and because one row exists per viewer, the row count IS
 * the distinct-viewer count. `guestViewers` is split out because public reach is
 * the number that drives a decision (whether a warning needs a second channel);
 * the responder and reporter slices were deliberately left out of the MVP, since
 * "a responder opened it" is a weaker signal than the respond action the system
 * already records properly.
 *
 * @returns {Promise<Map<string, { uniqueViewers: number, guestViewers: number }>>}
 */
export const readReachByTargets = async ({ targetType, targetIds = [] } = {}) => {
    const reach = new Map();
    if (!VIEW_TARGET_TYPES.includes(targetType)) return reach;

    const ids = targetIds.filter(isObjectId).map((id) => new mongoose.Types.ObjectId(String(id)));
    if (ids.length === 0) return reach;

    const rows = await ViewEvent.aggregate([
        { $match: { targetType, targetId: { $in: ids } } },
        {
            $group: {
                _id: '$targetId',
                uniqueViewers: { $sum: 1 },
                guestViewers: {
                    $sum: { $cond: [{ $eq: ['$viewerRole', 'guest'] }, 1, 0] },
                },
            },
        },
    ]);

    rows.forEach((row) => {
        reach.set(String(row._id), {
            uniqueViewers: row.uniqueViewers,
            guestViewers: row.guestViewers,
        });
    });

    return reach;
};

/**
 * Highest-reach records of one type, for the admin leaderboard.
 *
 * @param {object} [options]
 * @param {string} [options.targetType] 'report' or 'zone'.
 * @param {number} [options.limit]      Maximum rows; clamped to 1..50.
 */
export const readTopReach = async ({ targetType, limit = 10 } = {}) => {
    if (!VIEW_TARGET_TYPES.includes(targetType)) return [];

    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    return ViewEvent.aggregate([
        { $match: { targetType } },
        {
            $group: {
                _id: '$targetId',
                uniqueViewers: { $sum: 1 },
                guestViewers: {
                    $sum: { $cond: [{ $eq: ['$viewerRole', 'guest'] }, 1, 0] },
                },
                lastViewedAt: { $max: '$lastViewedAt' },
            },
        },
        { $sort: { uniqueViewers: -1, lastViewedAt: -1 } },
        { $limit: safeLimit },
    ]);
};

export default {
    buildViewerIdentity,
    recordViewEvent,
    readReachByTargets,
    readTopReach,
};
