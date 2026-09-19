/**
 * Report submission and offline-delivery policy.
 *
 * These values are the contract between a live submit attempt and the on-device
 * queue, so they live in one module: changing how long a request may stall, or
 * how long an in-flight copy stays protected from replay, without touching the
 * other side is how a report ends up filed twice or lost entirely.
 */

/**
 * A submit that stalls longer than this is treated as undelivered and handed to
 * the offline queue. Long enough for five photos on a weak but real link, short
 * enough that the reporter is usually still on the page when it gives up — with
 * no timeout at all a faded radio can leave the request pending for minutes,
 * and the report dies with the app.
 *
 * What this now has to cover is the upload and a short server round trip:
 * image analysis is queued after the 201 (`scheduleEvidenceMetadataProcessing`
 * on the server), so it no longer adds minutes to the request. Before that
 * change the server's own work alone measured ~90s for five photos, which meant
 * this timeout fired on a submission the server went on to complete.
 */
export const REPORT_SUBMIT_TIMEOUT_MS = 60000;

/**
 * How long a report held by a live submit attempt is protected from the queue's
 * own replay. Must stay comfortably above `REPORT_SUBMIT_TIMEOUT_MS`, otherwise
 * the queue could upload a second copy of a request that is still running.
 */
export const QUEUED_REPORT_SENDING_STALE_MS = 120000;

/**
 * Retry cadence for the queue once the connection is usable again. The first
 * retry fires quickly (a returning signal should deliver within seconds, not
 * a minute) and then doubles up to the cap after each pass that moved nothing,
 * because a link that just failed twice is unlikely to succeed on the third
 * attempt — this is what stops a weak signal from being hammered with uploads.
 */
export const OFFLINE_SYNC_RETRY_BASE_MS = 15000;
export const OFFLINE_SYNC_RETRY_FACTOR = 2;
export const OFFLINE_SYNC_RETRY_MAX_MS = 300000;

/**
 * Unfinished-form draft (localStorage, fields only — never photos or tokens).
 * This is deliberately separate from the IndexedDB offline queue: the queue
 * holds reports the reporter already submitted, while the draft holds a form
 * that was never submitted (closed tab, failed validation, dead battery).
 */
export const REPORT_DRAFT_STORAGE_KEY = 'sibuyan-report-draft-v1';
export const REPORT_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
