import mongoose from 'mongoose';
import ViewEvent, {
    PUBLIC_VIEWER_ROLES,
    VIEW_TARGET_TYPES,
    VIEWER_KEY_PATTERN,
} from '../models/ViewEvent.js';

/**
 * D8 View events — recording and reading reach.
 *
 * Two responsibilities, deliberately kept apart:
 *   recordViewEvent() — idempotent per (record, viewer); repeat calls update a
 *                       timestamp instead of adding a row.
 *   readTopReach()    — aggregate counts for admin surfaces. Aggregates only:
 *                       no function here can return a per-viewer list, so a
 *                       future caller cannot accidentally expose one.
 *
 * There is deliberately a single read path. An earlier revision carried a
 * second one (`readReachByTargets`, per-record counts) that no caller used and
 * that duplicated this aggregation — two copies of one rule is how the counts
 * drift apart, so it was deleted rather than left as a spare.
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
 * Removes the reach rows for a record that no longer exists.
 *
 * Called from the delete paths, and best-effort on purpose. It runs inside a
 * request whose actual job is the deletion, so a cleanup failure must not turn a
 * successful delete into a 500 — the TTL is the backstop. Logging keeps the
 * failure visible instead of hiding it behind that backstop.
 *
 * Best-effort, but not optional: a row for a deleted record can never be read
 * back (both leaderboards join the aggregate to the record), so leaving them
 * behind just occupies dedupe slots and TTL windows to no end.
 *
 * @returns {Promise<number>} Rows removed; 0 when there was nothing or it failed.
 */
export const deleteViewEventsForTarget = async ({ targetType, targetId } = {}) => {
    if (!VIEW_TARGET_TYPES.includes(targetType) || !isObjectId(targetId)) return 0;

    try {
        const result = await ViewEvent.deleteMany({ targetType, targetId });
        return result?.deletedCount ?? 0;
    } catch (error) {
        console.warn(
            `[viewEvents] Could not clean up reach rows for ${targetType} ${targetId}:`,
            error?.message,
        );
        return 0;
    }
};

/**
 * Highest-reach records of one type, for the admin leaderboard.
 *
 * `$group` counts rows, and because one row exists per viewer, the row count IS
 * the distinct-viewer count. Three slices are returned because they answer
 * different questions and the headline has to be the right one:
 *
 *   publicViewers — the people a hazard warning is for (see
 *                   PUBLIC_VIEWER_ROLES). This is the headline and the sort key.
 *   guestViewers  — the anonymous part of that public: the number that decides
 *                   whether a warning needs a second channel (SMS, radio).
 *   uniqueViewers — everything, including staff. Kept so the panel can be honest
 *                   about the difference instead of quietly dropping rows.
 *
 * Sorting by public reach rather than by total is deliberate. Ranking by staff
 * opens would put the incidents the office has been working through at the top,
 * which is a dispatch metric, not a reach one.
 *
 * @param {object}   [options]
 * @param {string}   [options.targetType] 'report' or 'zone'.
 * @param {number}   [options.limit]      Maximum rows; clamped to 1..50.
 * @param {string[]|null} [options.targetIds]
 *        Optional allow-list. When given, only those records are considered.
 *        This is how a municipal admin's reach is scoped without storing a
 *        municipality on the view row: the caller resolves the scope from the
 *        records themselves (the same scope every other admin surface uses),
 *        so a transferred incident stays visible to every office that touched
 *        it. `null` means "no scope" — island-wide.
 *
 *        The allow-list is applied before `$limit`, not after. Filtering a
 *        top-N window that was computed globally would silently return fewer
 *        rows than asked for — or none at all — for a municipality whose
 *        incidents simply are not in the island-wide top N.
 */
export const readTopReach = async ({ targetType, limit = 10, targetIds = null } = {}) => {
    if (!VIEW_TARGET_TYPES.includes(targetType)) return [];

    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    const match = { targetType };
    if (Array.isArray(targetIds)) {
        const scoped = targetIds
            .filter(isObjectId)
            .map((id) => new mongoose.Types.ObjectId(String(id)));
        // An empty scope means "this municipality has no such records", which is
        // an answer, not a reason to fall back to the unscoped read.
        if (scoped.length === 0) return [];
        match.targetId = { $in: scoped };
    }

    return ViewEvent.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$targetId',
                uniqueViewers: { $sum: 1 },
                publicViewers: {
                    $sum: { $cond: [{ $in: ['$viewerRole', PUBLIC_VIEWER_ROLES] }, 1, 0] },
                },
                guestViewers: {
                    $sum: { $cond: [{ $eq: ['$viewerRole', 'guest'] }, 1, 0] },
                },
                lastViewedAt: { $max: '$lastViewedAt' },
            },
        },
        { $sort: { publicViewers: -1, uniqueViewers: -1, lastViewedAt: -1 } },
        { $limit: safeLimit },
    ]);
};

export default {
    buildViewerIdentity,
    recordViewEvent,
    readTopReach,
    deleteViewEventsForTarget,
};
