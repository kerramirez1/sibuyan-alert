/**
 * Durable queue for reports filed while offline.
 *
 * A verified reporter standing at a crash site with no signal must still be
 * able to file. The report is stored on the device — fields plus the actual
 * image blobs — and replayed when the connection returns.
 *
 * Write-ahead by design: `ReportPage` stores the report *before* the request
 * leaves and drops the stored copy only once the server acknowledges. A
 * submission interrupted by a signal drop mid-upload, a stall past the request
 * timeout, a closed tab, or a dying phone is therefore already on the device
 * and replays itself. Queueing only after a failure would lose exactly the
 * cases this queue exists for.
 *
 * Every entry carries a client-generated idempotency key. The server collapses
 * a replayed key into the original report, so a flaky reconnect that sends the
 * same submission twice still produces exactly one incident. Without that key
 * this queue would manufacture duplicates, which is the opposite of its job.
 *
 * An entry a live submit attempt is currently sending is marked with
 * `sendingSince`. The queue skips it while that lease is fresh, so the retry
 * timer can never upload a second copy of a request that is still running. A
 * lease older than `QUEUED_REPORT_SENDING_STALE_MS`, or one taken before this
 * page session started, is reclaimable — nothing can still be running under it.
 *
 * Failures are classified rather than retried blindly (`classifySubmitFailure`):
 *   - Transient (no response, timeout, 401, 408, 429, 5xx) -> stays queued and
 *     is retried on the next pass. A dropped upload usually lands here.
 *   - Needs the reporter (other 4xx) -> marked blocked with the server's own
 *     message and a machine-readable code (`QUEUE_BLOCKED_CODES`), and skipped
 *     by later passes until the reporter acts on it (`resolveBlockedQueuedReport`)
 *     or discards it. A rejection the reporter cannot fix is worth parking; a
 *     possible duplicate is not a rejection at all, so it is surfaced as a
 *     question instead of being retried forever or silently dropped.
 *
 * Every entry records the reporter who filed it. The queue lives on the device
 * but delivery is a session, and on a shared phone those are not the same
 * thing: without the owner, an admin or responder signing in next would upload
 * someone else's report (403-blocked, parked at that), and a second reporter
 * would have it filed under their own name. Only the owner's session may
 * deliver an entry — see `partitionQueuedReports`.
 */

import { QUEUED_REPORT_SENDING_STALE_MS } from '../config/reportSubmission';

const DB_NAME = 'sibuyan-offline';
const DB_VERSION = 1;
const STORE = 'pending-reports';

/**
 * Module evaluation time. Any in-flight lease taken before this cannot still be
 * running (its page is gone), so a submission interrupted by a crash is
 * reclaimable on the very next launch instead of waiting out the stale window.
 */
const PAGE_SESSION_STARTED_AT = Date.now();

/** Serialises concurrent flushes; see `flushQueuedReports`. */
let activeFlush = null;

export const isOfflineQueueSupported = () => (
    typeof indexedDB !== 'undefined' && typeof FormData !== 'undefined'
);

export const createClientReportId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Transient failures are worth another attempt; permanent ones are not.
 *
 * A dropped connection can surface as "no response" or as an answer from an
 * intermediary (a router or gateway returning 502/503/504 after the upload
 * died), so both stay queued. A 401 is transient on purpose: the session may
 * only need renewing, and an emergency report must not be parked under a
 * "needs attention" label while the reporter walks away from it.
 */
export const classifySubmitFailure = (error) => {
    if (!error?.response) return 'transient';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'transient';

    const status = error.response.status;
    if (status === 401 || status === 408 || status === 429 || status >= 500) return 'transient';
    return 'permanent';
};

export const isTransientSubmitFailure = (error) => classifySubmitFailure(error) === 'transient';

/**
 * The server's warning code for "a similar incident was already reported
 * nearby". It is a question, not a rejection, and only the reporter can answer
 * it — which the queue cannot do on their behalf.
 */
export const POSSIBLE_DUPLICATE_CODE = 'POSSIBLE_DUPLICATE';

/** Why a queued report is waiting on the reporter instead of the network. */
export const QUEUE_BLOCKED_CODES = {
    duplicate: 'duplicate',
    rejected: 'rejected',
};

/**
 * Turns a permanent failure into what the reporter needs to see: the server's
 * own words, plus a code the inbox can branch on. A missing body still produces
 * a readable reason, because "Rejected by the server" beats an empty line.
 */
export const describeSubmitFailure = (error) => {
    const data = error?.response?.data;
    const message = typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : 'Rejected by the server';

    return {
        blockedReason: message,
        blockedCode: data?.code === POSSIBLE_DUPLICATE_CODE
            ? QUEUE_BLOCKED_CODES.duplicate
            : QUEUE_BLOCKED_CODES.rejected,
    };
};

const queueListeners = new Set();

/**
 * Tells subscribers (the sync hook) that the queue changed, so a report staged
 * by one screen is delivered and counted everywhere.
 *
 * Attempt counters deliberately do NOT notify: a pass that failed for transient
 * reasons would otherwise wake the hook and immediately start another upload,
 * turning a weak link into a retry storm.
 */
const notifyQueueChanged = () => {
    queueListeners.forEach((listener) => {
        try {
            listener();
        } catch {
            // A failing listener must never break a queue write.
        }
    });
};

/** @returns {Function} unsubscribe */
export const subscribeToQueueChanges = (listener) => {
    if (typeof listener !== 'function') return () => {};
    queueListeners.add(listener);
    return () => queueListeners.delete(listener);
};

/**
 * One connection, reused.
 *
 * `indexedDB.open` returns a new `IDBDatabase` on every call and nothing closes
 * them, so opening per operation leaked a connection per count, patch and list.
 * The cached promise is keyed on the `indexedDB` object itself, so a replaced
 * implementation (tests, or a browser that swaps it) can never inherit a stale
 * connection.
 */
let connectionIndexedDB = null;
let connectionPromise = null;

const openDb = () => {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB is unavailable'));
    }

    if (connectionIndexedDB !== indexedDB) {
        connectionIndexedDB = indexedDB;
        connectionPromise = null;
    }
    if (connectionPromise) return connectionPromise;

    connectionPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'clientReportId' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            // Another tab asking for a newer version must not be blocked by
            // this one holding the old version open.
            db.onversionchange = () => {
                db.close();
                connectionPromise = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            connectionPromise = null;
            reject(request.error);
        };
    });

    return connectionPromise;
};

/**
 * Runs one IndexedDB transaction and resolves with the request's result.
 *
 * `work` may return a request wrapped by `requestValue()`, in which case the
 * resolved value is that request's `result`. The promise settles on
 * transaction completion rather than request success, so a read that is
 * followed by a write inside the same transaction stays atomic.
 */
const runTransaction = async (mode, work) => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);

        let wrapped;
        try {
            wrapped = work(store);
        } catch (error) {
            reject(error);
            return;
        }

        const isRequest = Boolean(wrapped) && wrapped.__request === true;
        let requestResult;
        if (isRequest) {
            wrapped.value.onsuccess = () => { requestResult = wrapped.value.result; };
        }

        transaction.oncomplete = () => resolve(isRequest ? (requestResult !== undefined ? requestResult : wrapped?.value?.result) : wrapped);
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction error'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
};

const requestValue = (request) => ({ __request: true, value: request });

/**
 * Stores a report for later delivery.
 *
 * @param {object} params
 * @param {object} params.fields
 * @param {Array<File|Blob>} [params.images=[]]
 * @param {string} [params.clientReportId] - Optional existing idempotency key to preserve across network drops
 * @param {boolean} [params.leased=false] - True when a live submit attempt is
 *   about to send this exact entry. The lease is written in the same
 *   transaction as the entry, so a retry pass can never observe a
 *   freshly-staged report without its in-flight marker.
 * @param {string} [params.reporterId] - The account that filed the report. Only
 *   that account's session may deliver the entry afterwards.
 * @returns {Promise<Object|null>} the stored entry, or null when the device
 *   cannot persist (private mode, storage disabled, quota exhausted) — the
 *   caller must then fall back to telling the user the report was not saved.
 */
export const enqueueReport = async ({ fields, images = [], clientReportId, leased = false, reporterId = null }) => {
    if (!isOfflineQueueSupported()) return null;

    try {
        const safeClientReportId = typeof clientReportId === 'string' && clientReportId.trim()
            ? clientReportId.trim()
            : createClientReportId();
        const entry = {
            clientReportId: safeClientReportId,
            reporterId: reporterId ? String(reporterId) : null,
            fields,
            images,
            queuedAt: Date.now(),
            attempts: 0,
            blockedReason: null,
            blockedCode: null,
            sendingSince: leased ? Date.now() : null,
        };
        await runTransaction('readwrite', (store) => store.put(entry));
        notifyQueueChanged();
        return entry;
    } catch (error) {
        console.error('Could not queue offline report:', error);
        return null;
    }
};

export const listQueuedReports = async () => {
    if (!isOfflineQueueSupported()) return [];
    try {
        const queued = await runTransaction('readonly', (store) => requestValue(store.getAll()));
        return Array.isArray(queued) ? queued : [];
    } catch {
        return [];
    }
};

export const removeQueuedReport = async (clientReportId) => {
    if (!isOfflineQueueSupported()) return false;
    try {
        await runTransaction('readwrite', (store) => store.delete(clientReportId));
        notifyQueueChanged();
        return true;
    } catch {
        return false;
    }
};

/**
 * Applies a shallow patch to a stored entry inside one transaction.
 *
 * A missing entry is ignored rather than recreated: a report that was already
 * delivered must not be resurrected by a late bookkeeping write.
 *
 * @returns {Promise<boolean>} true when the patched entry was written, false
 *   when there was nothing to patch — callers notify the queue only on a real
 *   change, so a late write cannot wake the retry loop over nothing.
 */
const patchQueuedReport = async (clientReportId, buildPatch) => {
    if (!clientReportId) return false;

    let patched = false;

    try {
        await runTransaction('readwrite', (store) => {
            const getRequest = store.get(clientReportId);
            // Issued from a request callback, so it stays inside this same
            // transaction: the read and the write cannot be split apart.
            getRequest.onsuccess = () => {
                const entry = getRequest.result;
                if (!entry) return;
                patched = true;
                store.put({ ...entry, ...buildPatch(entry) });
            };
        });
        return patched;
    } catch {
        return false;
    }
};

const markAttempt = async (clientReportId, blocked) => {
    // Losing an attempt counter is not worth surfacing, and must not notify:
    // that would immediately re-trigger the retry that just failed.
    await patchQueuedReport(clientReportId, (entry) => ({
        attempts: (entry.attempts || 0) + 1,
        lastAttemptAt: Date.now(),
        blockedReason: blocked?.blockedReason ?? entry.blockedReason ?? null,
        blockedCode: blocked?.blockedCode ?? entry.blockedCode ?? null,
    }));
};

/**
 * Releases the in-flight lease after a live submit attempt gave up on a
 * transient failure, so the queue may retry it immediately.
 *
 * Without this the entry would stay protected for the full stale window even
 * though nothing is sending it any more.
 */
export const clearQueuedReportSending = async (clientReportId) => {
    const cleared = await patchQueuedReport(clientReportId, () => ({ sendingSince: null }));
    if (cleared) notifyQueueChanged();
    return cleared;
};

/** Rebuilds the multipart body from a stored entry, including the idempotency key. */
export const buildQueuedFormData = (entry = {}) => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(entry?.fields || {})) {
        if (value === undefined || value === null || value === '') continue;
        if (typeof value === 'object' && !(value instanceof Blob) && !(value instanceof File)) {
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                if (nestedValue === undefined || nestedValue === null || nestedValue === '') continue;
                formData.append(`${key}[${nestedKey}]`, String(nestedValue));
            }
            continue;
        }
        formData.append(key, String(value));
    }

    (entry?.images || []).forEach((image, index) => {
        if (!image) return;
        formData.append('images', image, image.name || `queued-${index}.jpg`);
    });

    if (entry?.clientReportId) {
        formData.append('clientReportId', entry.clientReportId);
    }
    return formData;
};

/**
 * True when an entry may be replayed right now.
 *
 * A fresh `sendingSince` means a live submit attempt is still working on this
 * exact report, so replaying it would upload a second copy of a request that is
 * already in flight.
 */
const isReplayableNow = (entry, now) => {
    if (!entry?.sendingSince) return true;
    // Taken before this page session began -> nothing can still be running it.
    if (entry.sendingSince < PAGE_SESSION_STARTED_AT) return true;
    return (now - entry.sendingSince) >= QUEUED_REPORT_SENDING_STALE_MS;
};

/**
 * True when this session may deliver the entry.
 *
 * An entry with no recorded owner predates owner binding (or was staged by an
 * older build); it is adopted rather than stranded, because a report already on
 * the device must not be lost to a schema change. Everything else belongs
 * strictly to the reporter who filed it.
 */
const isOwnedBy = (entry, reporterId) => {
    if (!reporterId) return true;
    if (!entry?.reporterId) return true;
    return String(entry.reporterId) === String(reporterId);
};

/**
 * Splits stored entries into what this session can act on.
 *
 * Foreign entries are counted, never returned: another account's report must
 * not appear in this session's list — not even as a redacted row — while it
 * waits for its own reporter to sign back in. `deliverable` can be attempted
 * now, `deferred` is held by a live submit attempt, and `blocked` is waiting on
 * the reporter rather than the network.
 */
export const partitionQueuedReports = (entries = [], { reporterId = null, now = Date.now() } = {}) => {
    const partition = { deliverable: [], blocked: [], deferred: [], foreignCount: 0 };

    for (const entry of entries) {
        if (!entry) continue;
        if (!isOwnedBy(entry, reporterId)) {
            partition.foreignCount += 1;
            continue;
        }
        if (entry.blockedReason) {
            partition.blocked.push(entry);
            continue;
        }
        if (isReplayableNow(entry, now)) partition.deliverable.push(entry);
        else partition.deferred.push(entry);
    }

    return partition;
};

/**
 * The raw, non-identifying context of a queued report, for the inbox row.
 * Address first, because that is how the reporter recognises the incident.
 */
export const describeQueuedReport = (entry = {}) => ({
    address: entry.fields?.address || '',
    barangay: entry.fields?.barangay || '',
    incidentType: entry.fields?.incidentType || '',
    queuedAt: entry.queuedAt ?? null,
});

/**
 * Clears the blocked state so the next pass may attempt the report again.
 *
 * `confirmDistinct` carries the reporter's answer to the duplicate question the
 * replay could not answer for them: the resend then files the report as a
 * deliberately separate incident instead of coming back as the same warning.
 */
export const resolveBlockedQueuedReport = async (clientReportId, { confirmDistinct = false } = {}) => {
    const patched = await patchQueuedReport(clientReportId, (entry) => ({
        blockedReason: null,
        blockedCode: null,
        ...(confirmDistinct ? { fields: { ...entry.fields, confirmDistinct: 'true' } } : {}),
    }));

    if (patched) notifyQueueChanged();
    return patched;
};

/**
 * Attempts to deliver every queued report.
 *
 * Sequential on purpose: this runs on a reconnect, often on a weak link, and
 * firing N multipart uploads at once is the fastest way to fail all of them.
 *
 * What it reports back drives the retry policy, so the shape matters:
 * `blocked` is this pass's newly blocked reports, `remaining` is everything
 * still stored for this session, and `deliverableRemaining` is what a later
 * pass could still deliver on its own — the number the hook times against.
 *
 * @param {Function} send - async (formData) => response
 * @returns {Promise<{sent: number, failed: number, blocked: number, deferred: number, foreign: number, remaining: number, deliverableRemaining: number}>}
 */
const runFlush = async (send, { reporterId = null } = {}) => {
    const queued = (await listQueuedReports()) || [];
    const partition = partitionQueuedReports(queued, { reporterId, now: Date.now() });
    const owned = queued.length - partition.foreignCount;

    if (typeof send !== 'function') {
        return {
            sent: 0,
            failed: 0,
            blocked: 0,
            deferred: partition.deferred.length,
            foreign: partition.foreignCount,
            remaining: owned,
            deliverableRemaining: partition.deliverable.length + partition.deferred.length,
        };
    }

    const result = {
        sent: 0,
        failed: 0,
        blocked: 0,
        deferred: partition.deferred.length,
        foreign: partition.foreignCount,
        remaining: owned,
        deliverableRemaining: 0,
    };

    for (const entry of partition.deliverable) {
        try {
            await send(buildQueuedFormData(entry));
            await removeQueuedReport(entry.clientReportId);
            result.sent += 1;
        } catch (error) {
            if (isTransientSubmitFailure(error)) {
                // Still on the device, still ours to deliver.
                await markAttempt(entry.clientReportId, null);
                result.failed += 1;
            } else {
                // Only the reporter can clear this one, so stop retrying it and
                // keep the entry visible with the server's reason on it.
                await markAttempt(entry.clientReportId, describeSubmitFailure(error));
                result.blocked += 1;
            }
        }
    }

    result.remaining = Math.max(0, owned - result.sent);
    // What is left that is worth another pass: everything owned and still
    // stored, minus what just went out and minus what now needs the reporter.
    // A blocked report must not keep the retry loop alive.
    result.deliverableRemaining = Math.max(
        0,
        owned - result.sent - partition.blocked.length - result.blocked,
    );
    return result;
};

/**
 * Attempts to deliver every queued report, one flush at a time process-wide.
 *
 * Sequential on purpose: this runs on a reconnect, often on a weak link, and
 * firing N multipart uploads at once is the fastest way to fail all of them.
 * The sync hook is mounted in more than one place (the layout and the reporter's
 * inbox), so concurrent passes share one in-flight flush instead of uploading
 * the same entry twice — harmless thanks to the idempotency key, but a waste of
 * the exact bandwidth the report is competing for.
 *
 * @param {Function} send - async (formData) => response
 * @param {object} [options]
 * @param {string} [options.reporterId] - The signed-in account. Entries filed
 *   by anyone else are left alone for that reporter's own session.
 * @returns {Promise<{sent: number, failed: number, blocked: number, deferred: number, foreign: number, remaining: number, deliverableRemaining: number}>}
 */
export const flushQueuedReports = (send, options) => {
    if (activeFlush) return activeFlush;

    const flush = runFlush(send, options).finally(() => {
        if (activeFlush === flush) activeFlush = null;
    });
    activeFlush = flush;
    return flush;
};

export const clearOfflineReportQueue = async () => {
    if (!isOfflineQueueSupported()) return false;
    try {
        await runTransaction('readwrite', (store) => store.clear());
        notifyQueueChanged();
        return true;
    } catch {
        return false;
    }
};

export default {
    isOfflineQueueSupported,
    createClientReportId,
    classifySubmitFailure,
    isTransientSubmitFailure,
    POSSIBLE_DUPLICATE_CODE,
    QUEUE_BLOCKED_CODES,
    describeSubmitFailure,
    subscribeToQueueChanges,
    enqueueReport,
    listQueuedReports,
    removeQueuedReport,
    clearQueuedReportSending,
    resolveBlockedQueuedReport,
    partitionQueuedReports,
    describeQueuedReport,
    buildQueuedFormData,
    flushQueuedReports,
    clearOfflineReportQueue,
};
