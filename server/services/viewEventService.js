import mongoose from 'mongoose';
import ViewEvent, {
    PUBLIC_VIEWER_ROLES,
    VIEW_TARGET_TYPES,
    VIEWER_KEY_PATTERN,
    VIEWER_ROLES,
} from '../models/ViewEvent.js';
import ViewerAlias from '../models/ViewerAlias.js';

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
 * The `anon:` key for a client-supplied browser id, or null when the value is
 * missing or malformed.
 *
 * One builder for every path that has to agree on this string — deriving the
 * guest identity, collapsing the guest row, and reading or writing the alias.
 * Four copies of `anon:${...}` were four chances for one of them to drift into a
 * key that silently matches nothing.
 */
const buildGuestKey = (anonymousId) => {
    const guestId = typeof anonymousId === 'string' ? anonymousId.trim() : '';
    if (!guestId) return null;
    const guestKey = `anon:${guestId}`;
    return VIEWER_KEY_PATTERN.test(guestKey) ? guestKey : null;
};

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

    const guestKey = buildGuestKey(anonymousId);
    return guestKey ? { viewerKey: guestKey, viewerRole: 'guest' } : null;
};

/**
 * Removes the guest row a browser already had, once the viewer is attributable
 * to an account.
 *
 * The hole this closes: a visitor opens a record without signing in (row
 * `anon:<uuid>`, role `guest`) and later opens the same record signed in (row
 * `user:<id>`, role `reporter`). Both roles are public reach, so ONE person was
 * counted TWICE — and the flow that produces it (public map, then log in) is the
 * one the app encourages.
 *
 * The client sends its anonymous id with every view, signed in or not (see
 * `viewsAPI.recordViewEvent`), and that id lives in the browser's storage. The
 * link is therefore exact: it is the browser that supplied the guest row, not a
 * shared address guessed from a request. Keying on IP was rejected for the
 * opposite reason — a barangay wifi is one address, so it would collapse a whole
 * village into one viewer.
 *
 * Scoped to the one record being opened. The browser's other guest rows are left
 * alone: nothing here says the account owner is the person who opened THEM, and
 * deleting them would silently erase views of records this request never touched.
 *
 * Best-effort, like `deleteViewEventsForTarget`, and for the same reason: the
 * view itself has already been recorded by the time this runs, so a cleanup
 * failure must not turn a recorded view into an error. The cost of failing is
 * only that the old double-count survives — today's behaviour, not a new bug.
 *
 * Trade-off, stated plainly: on a shared device, the earlier anonymous view is
 * dropped when the next person signs in. That under-counts by one in a genuinely
 * multi-person household, where the common personal-device case over-counts by
 * one every single time. Reach is not an audited headcount either way.
 *
 * @returns {Promise<number>} Rows removed; 0 when there was nothing or it failed.
 */
export const collapseGuestViewForTarget = async ({ targetType, targetId, anonymousId } = {}) => {
    if (!VIEW_TARGET_TYPES.includes(targetType) || !isObjectId(targetId)) return 0;

    // Shape check before the query: a forged or malformed value must not become a
    // delete filter, even though it could never match a real row.
    const guestKey = buildGuestKey(anonymousId);
    if (!guestKey) return 0;

    try {
        const result = await ViewEvent.deleteOne({ targetType, targetId, viewerKey: guestKey });
        return result?.deletedCount ?? 0;
    } catch (error) {
        console.warn(
            `[viewEvents] Could not collapse the guest reach row for ${targetType} ${targetId}:`,
            error?.message,
        );
        return 0;
    }
};

/**
 * The account this browser has already signed in as, if any.
 *
 * This is the second half of the sign-in boundary fix. The first half
 * (`collapseGuestViewForTarget`) handles signed out → signed in, by removing the
 * browser's earlier guest row when the account records a view. This handles the
 * other direction: signed in → signed out. Without it, signing out and reopening
 * a record wrote a brand-new `anon:` row for a person whose account row was
 * already on that record, and — because both `guest` and `reporter` count as
 * public — counted them twice all over again.
 *
 * With the link, the signed-out write is recorded as the account, which lands on
 * the row that already exists. One person, one row, whichever order the boundary
 * is crossed in.
 *
 * A lookup failure returns null rather than throwing: the caller then writes the
 * guest row, which is exactly the behaviour this feature had before aliases
 * existed. A failed optimisation must not drop a view.
 *
 * @returns {Promise<{viewerKey: string, viewerRole: string}|null>}
 */
export const resolveViewerAlias = async ({ anonymousId } = {}) => {
    const guestKey = buildGuestKey(anonymousId);
    if (!guestKey) return null;

    try {
        const alias = await ViewerAlias.findOne({ viewerKey: guestKey }, 'user viewerRole').lean();
        const accountId = alias?.user ? String(alias.user) : '';
        if (!isObjectId(accountId)) return null;

        return {
            viewerKey: `user:${accountId}`,
            viewerRole: VIEWER_ROLES.includes(alias.viewerRole) ? alias.viewerRole : 'reporter',
        };
    } catch (error) {
        console.warn(`[viewEvents] Could not resolve the viewer alias for ${guestKey}:`, error?.message);
        return null;
    }
};

/**
 * Remembers that this browser's guest id belongs to `accountId`.
 *
 * Refreshed on every signed-in view rather than written once, for two reasons:
 * the role can change (a reporter promoted to responder should be counted as
 * staff afterwards), and the TTL is anchored on `linkedAt` — a browser still in
 * use keeps its link, exactly as a record still being opened keeps its rows.
 *
 * Best-effort. Failing to store the link costs the signed-out half of the fix for
 * this browser; it must never fail the view that triggered it.
 *
 * @returns {Promise<boolean>} true when the link was stored.
 */
export const linkViewerAlias = async ({ anonymousId, accountId, viewerRole } = {}) => {
    const guestKey = buildGuestKey(anonymousId);
    const userId = accountId ? String(accountId) : '';

    if (!guestKey || !isObjectId(userId)) return false;
    if (!VIEWER_ROLES.includes(viewerRole)) return false;

    try {
        await ViewerAlias.updateOne(
            { viewerKey: guestKey },
            { $set: { user: userId, viewerRole, linkedAt: new Date() } },
            { upsert: true },
        );
        return true;
    } catch (error) {
        console.warn(`[viewEvents] Could not link the viewer alias ${guestKey}:`, error?.message);
        return false;
    }
};

/**
 * Removes the aliases pointing at a deleted account.
 *
 * A link to an account that no longer exists would keep re-attributing that
 * browser's signed-out views to a dead id — a viewer that can never be looked up
 * and a pseudonym kept past the point of any purpose. Called from the account
 * deletion path, beside the other per-account cleanups.
 *
 * @returns {Promise<number>} Rows removed; 0 when there was nothing or it failed.
 */
export const deleteViewerAliasesForUser = async ({ userId } = {}) => {
    const accountId = userId ? String(userId) : '';
    if (!isObjectId(accountId)) return 0;

    try {
        const result = await ViewerAlias.deleteMany({ user: accountId });
        return result?.deletedCount ?? 0;
    } catch (error) {
        console.warn(`[viewEvents] Could not clean up viewer aliases for ${accountId}:`, error?.message);
        return 0;
    }
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
 * An authenticated view also collapses this browser's earlier guest row for the
 * same record — see `collapseGuestViewForTarget`. The upsert is written FIRST so
 * a failed collapse leaves today's behaviour (one extra row) rather than
 * deleting the guest row and recording nothing.
 *
 * E11000 handling: two concurrent upserts can both miss the row and both try to
 * insert; one wins and the other raises a duplicate-key error. That is a benign
 * race — the row it wanted now exists — so it is retried once rather than
 * surfaced. Without this, a double-tap would produce a 500 for a view that was
 * in fact recorded correctly.
 *
 * @param {object}      [options]
 * @param {'report'|'zone'} [options.targetType]
 * @param {string}      [options.targetId]
 * @param {string}      [options.viewerKey]   `user:<ObjectId>` or `anon:<uuid v4>`.
 * @param {string}      [options.viewerRole]  Written on insert only.
 * @param {string}      [options.anonymousId] This browser's guest id, when the
 *        client sent one. It is what ties a view to the person behind it when
 *        the request's own identity cannot: it collapses the browser's earlier
 *        guest row on a signed-in write, and re-attributes a signed-out write to
 *        the account this browser already linked.
 *
 * @returns {Promise<boolean>} true when the view was recorded or already existed.
 */
export const recordViewEvent = async ({ targetType, targetId, viewerKey, viewerRole, anonymousId = null } = {}) => {
    if (!VIEW_TARGET_TYPES.includes(targetType)) return false;
    if (!isObjectId(targetId)) return false;
    if (!VIEWER_KEY_PATTERN.test(String(viewerKey || ''))) return false;

    // Signed in → signed out. A guest write from a browser that has already been
    // linked to an account is that account's view, so it updates the row that is
    // already there instead of minting a second viewer for one person.
    let effectiveKey = viewerKey;
    let effectiveRole = viewerRole;
    if (!String(viewerKey).startsWith('user:')) {
        const alias = await resolveViewerAlias({ anonymousId });
        if (alias) {
            effectiveKey = alias.viewerKey;
            effectiveRole = alias.viewerRole;
        }
    }

    const now = new Date();
    const filter = { targetType, targetId, viewerKey: effectiveKey };
    const update = {
        $setOnInsert: {
            targetType,
            targetId,
            viewerKey: effectiveKey,
            // Role is written once, on insert. It describes the audience that
            // FIRST reached the record; a role change on an identity that is
            // already counted does not rewrite it, which is what keeps one person
            // from moving between the public and staff slices on their own.
            viewerRole: effectiveRole,
            firstViewedAt: now,
        },
        $set: { lastViewedAt: now },
    };

    try {
        await ViewEvent.updateOne(filter, update, { upsert: true });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        // The row now exists, so the retry only re-stamps it.
        await ViewEvent.updateOne({ ...filter }, { $set: { lastViewedAt: now } });
    }

    // Signed out → signed in, the other direction: an account supersedes the guest
    // identity this browser used before it signed in. Only for account keys — a
    // guest write has no account to attribute it to, and collapsing on a guest key
    // would delete the very row just written.
    //
    // Both effects share one trigger, because both are only knowable here: the
    // request carries the account AND the browser id, which is the only moment
    // something can say the two are the same person.
    if (String(effectiveKey).startsWith('user:')) {
        await collapseGuestViewForTarget({ targetType, targetId, anonymousId });
        // Remember the browser, so the next SIGNED-OUT view from it resolves back
        // to this account instead of becoming a new anonymous viewer.
        await linkViewerAlias({
            anonymousId,
            accountId: String(effectiveKey).slice('user:'.length),
            viewerRole: effectiveRole,
        });
    }

    return true;
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
    collapseGuestViewForTarget,
    resolveViewerAlias,
    linkViewerAlias,
    deleteViewerAliasesForUser,
};
