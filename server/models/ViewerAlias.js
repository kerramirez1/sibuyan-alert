import mongoose from 'mongoose';
import { VIEW_EVENT_RETENTION_DAYS, VIEWER_ROLES } from './ViewEvent.js';

/**
 * Viewer aliases — the link between one browser's guest id and the account it
 * signed in as.
 *
 * Why this exists. Reach counts one row per (record, viewer), and a viewer is
 * either a browser (`anon:<uuid>`) or an account (`user:<ObjectId>`). Those are
 * two different keys for what can be one person, so a viewer who crosses the
 * sign-in boundary used to hold two rows for the same record:
 *
 *   opens a record signed out   → anon row    (role `guest`    → public reach)
 *   signs in, opens it again    → user row    (role `reporter` → public reach)
 *
 * Both roles are public, so the person was counted twice. That is two failures,
 * in opposite orders, and they need opposite remedies:
 *
 *   signed out → signed in   the account write deletes the browser's earlier
 *                            guest row for that record (see
 *                            `collapseGuestViewForTarget`), and remembers the
 *                            link here.
 *   signed in → signed out   the guest write finds the link and is recorded as
 *                            the account instead, so the sign-out mints no new
 *                            viewer. Without this row there is nothing to look
 *                            the browser up by, and the second failure survives.
 *
 * Why a separate collection rather than a field on `User`. Three reasons, in
 * order of weight:
 *
 * 1. **Lifetime.** The link is only needed while the reach rows it de-duplicates
 *    exist, so it carries the same 180-day TTL and expires on its own. A field on
 *    the account would outlive the data it protects, which is the opposite of
 *    what RA 10173 asks for.
 * 2. **Blast radius.** `User` is loaded on every authenticated request and its
 *    shape is returned to the client in places. A browsing pseudonym does not
 *    belong in that document, where one careless `select` would start shipping it.
 * 3. **Cardinality.** One browser map to one account is a unique index here. On
 *    `User` it would be a bounded array, i.e. application logic enforcing a limit
 *    the database could not.
 *
 * Privacy posture. The stored value is the same opaque random id the browser
 * already generated for itself — no IP, no MAC, no user-agent, no fingerprint.
 * What is new is only that it is *linked* to an account, which is what makes the
 * count correct; the link expires with the reach data, and no endpoint exposes
 * it. Aggregates remain the only read path.
 *
 * Known limit, stated plainly. On a shared browser the last account to record a
 * view owns the alias, so a later signed-out view on that device is attributed to
 * that account rather than counted as a new anonymous viewer. That under-counts
 * by one on a genuinely shared device, against an over-count that happened on
 * every personal device.
 */

const SECONDS_PER_DAY = 24 * 60 * 60;

const viewerAliasSchema = new mongoose.Schema(
    {
        /**
         * The browser's `anon:<uuid v4>` key — the same value stored on the reach
         * rows, so the two collections are joined by one string with no
         * translation step to drift.
         */
        viewerKey: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        /**
         * The role held when the link was last refreshed. Kept here rather than
         * read from `User` at resolution time so a signed-out view costs one
         * indexed lookup and no join — and because the reach row it produces
         * records the audience at first contact, which is the same rule
         * `recordViewEvent` applies to `viewerRole`.
         */
        viewerRole: {
            type: String,
            enum: VIEWER_ROLES,
            required: true,
        },
        linkedAt: {
            type: Date,
            required: true,
        },
    },
    {
        collection: 'viewer_aliases',
        versionKey: false,
        // Same reasoning as ViewEvent: one meaningful date, not a third time axis.
        timestamps: false,
    },
);

/**
 * ONE alias per browser.
 *
 * This is what makes a signed-out view deterministic: the lookup can only ever
 * return one account, so it cannot silently pick between two. `linkViewerAlias`
 * upserts on this key, which is also how the last sign-in wins on a shared
 * browser — a reassignment, never a second row.
 */
viewerAliasSchema.index(
    { viewerKey: 1 },
    { unique: true, name: 'uniq_viewer_alias' },
);

/**
 * Retention, matching the reach rows this link exists to de-duplicate: once those
 * rows are gone, the link can no longer change any count, so it goes too.
 */
viewerAliasSchema.index(
    { linkedAt: 1 },
    { expireAfterSeconds: VIEW_EVENT_RETENTION_DAYS * SECONDS_PER_DAY, name: 'ttl_alias_linked' },
);

const ViewerAlias = mongoose.models.ViewerAlias
    || mongoose.model('ViewerAlias', viewerAliasSchema);

export default ViewerAlias;
