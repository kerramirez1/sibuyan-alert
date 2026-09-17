import mongoose from 'mongoose';

/**
 * D8 View events — one row per (record, viewer) pair.
 *
 * Answers a single question: **how many distinct people opened this record's
 * details?** It is deliberately NOT a traffic log. There is no page-view stream,
 * no session trail, and no per-request history — one row per viewer per record,
 * updated in place. That shape is what makes repeat views free to record and
 * impossible to double-count.
 *
 * What counts as a view: a viewer OPENED the details of one specific record —
 * an incident's modal on the map, an archive dossier, or a risk zone's panel.
 * Merely loading the dashboard, or scrolling a pin past the viewport, records
 * nothing. Measuring "was the pin seen" is impression tracking, a different and
 * far more privacy-invasive feature that this model deliberately does not do.
 *
 * Polymorphic by design (`targetType` + `targetId`) so incidents and risk zones
 * share one collection, one unique index and one dedupe rule instead of two
 * parallel implementations that could drift apart.
 *
 * Privacy posture (Data Privacy Act, RA 10173):
 * - `viewerKey` is an opaque, client-generated random value. No IP address, no
 *   MAC address, no user-agent, no geolocation is stored. The MAC address is
 *   not merely avoided — a browser cannot read it at all, so it was never an
 *   option.
 * - Rows expire via TTL; see VIEW_EVENT_RETENTION_DAYS.
 * - Admin surfaces read aggregates only. No endpoint returns a per-viewer list.
 */

export const VIEW_TARGET_TYPES = Object.freeze(['report', 'zone']);

export const VIEWER_ROLES = Object.freeze([
    'reporter',
    'responder',
    'municipal_admin',
    'guest',
]);

/**
 * Retention window, measured from the LAST view of a record.
 *
 * 180 days is the shortest window that still covers a full Philippine school
 * year plus one semester, which is the horizon over which an LGU reviews its
 * own hazard communication ("did the community see the warnings we posted last
 * term?"). Shorter than that and seasonal comparisons become impossible;
 * longer than that and the data outlives the purpose it was collected for,
 * which RA 10173 prohibits.
 *
 * Anchoring on `lastViewedAt` rather than `firstViewedAt` is a deliberate
 * choice: a record that is still being opened is still serving its purpose, so
 * it is kept while it is in use and expires once it stops being used.
 */
export const VIEW_EVENT_RETENTION_DAYS = 180;

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Accepted viewer key shapes.
 *
 * `user:<ObjectId>` for an authenticated viewer, `anon:<uuid v4>` for a guest.
 * Validating the shape rather than trusting the client keeps a malformed or
 * oversized string from becoming an unbounded index key, and makes it obvious
 * in the data which rows belong to signed-in accounts.
 */
export const VIEWER_KEY_PATTERN = /^(?:user:[a-f0-9]{24}|anon:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;

const viewEventSchema = new mongoose.Schema(
    {
        targetType: {
            type: String,
            enum: VIEW_TARGET_TYPES,
            required: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        viewerKey: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        viewerRole: {
            type: String,
            enum: VIEWER_ROLES,
            required: true,
        },
        firstViewedAt: {
            type: Date,
            required: true,
        },
        lastViewedAt: {
            type: Date,
            required: true,
        },
    },
    {
        collection: 'view_events',
        versionKey: false,
        // No `timestamps`: firstViewedAt / lastViewedAt already carry the only
        // two dates that matter, and a generic createdAt would be a third,
        // redundant time axis to reason about.
        timestamps: false,
    },
);

/**
 * THE dedupe mechanism.
 *
 * This unique index is the whole reason repeat views cannot inflate the count.
 * `recordViewEvent` writes with an upsert, so a returning viewer matches this
 * key and updates the existing row instead of inserting a second one.
 *
 * It is enforced by the database rather than by application logic on purpose.
 * A read-then-write check ("has this viewer been counted?") races: two
 * concurrent requests both read "not counted" and both insert. An index cannot
 * race with itself, so the invariant holds even under double-taps, retries and
 * flaky-network replays — exactly the conditions this app runs in.
 */
viewEventSchema.index(
    { targetType: 1, targetId: 1, viewerKey: 1 },
    { unique: true, name: 'uniq_target_viewer' },
);

/**
 * Retention enforcement. MongoDB's TTL monitor removes a row once
 * `lastViewedAt` is older than the window.
 *
 * Note this is a deletion floor, not a hard cap: the monitor runs about once a
 * minute, so rows may outlive the window by up to that sweep interval.
 */
viewEventSchema.index(
    { lastViewedAt: 1 },
    { expireAfterSeconds: VIEW_EVENT_RETENTION_DAYS * SECONDS_PER_DAY, name: 'ttl_last_viewed' },
);

/**
 * Reach reads. Every admin query filters by target then counts rows, so the
 * compound unique index above already serves it; this index exists for the
 * reverse sweep that builds a whole leaderboard in one pass.
 */
viewEventSchema.index({ targetType: 1, lastViewedAt: -1 }, { name: 'reach_by_type_recent' });

const ViewEvent = mongoose.models.ViewEvent
    || mongoose.model('ViewEvent', viewEventSchema);

export default ViewEvent;
