/**
 * Durable queue for reports filed while offline.
 *
 * A verified reporter standing at a crash site with no signal must still be
 * able to file. The report is stored on the device — fields plus the actual
 * image blobs — and replayed when the connection returns.
 *
 * Every entry carries a client-generated idempotency key. The server collapses
 * a replayed key into the original report, so a flaky reconnect that sends the
 * same submission twice still produces exactly one incident. Without that key
 * this queue would manufacture duplicates, which is the opposite of its job.
 *
 * Failures are classified rather than retried blindly:
 *   - No response  -> transient. Stays queued, retried on the next reconnect.
 *   - 4xx response -> permanent. Marked blocked with the server's message so
 *                     the reporter can see and fix it instead of the report
 *                     silently retrying forever and never arriving.
 */

const DB_NAME = 'sibuyan-offline';
const DB_VERSION = 1;
const STORE = 'pending-reports';

export const isOfflineQueueSupported = () => (
    typeof indexedDB !== 'undefined' && typeof FormData !== 'undefined'
);

export const createClientReportId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'clientReportId' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

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

        transaction.oncomplete = () => resolve(isRequest ? requestResult : wrapped);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
};

const requestValue = (request) => ({ __request: true, value: request });

/**
 * Stores a report for later delivery.
 *
 * @returns {Promise<Object|null>} the stored entry, or null when the device
 *   cannot persist (private mode, storage disabled) — the caller must then
 *   fall back to telling the user the report was not saved.
 */
export const enqueueReport = async ({ fields, images = [] }) => {
    if (!isOfflineQueueSupported()) return null;

    try {
        const entry = {
            clientReportId: createClientReportId(),
            fields,
            images,
            queuedAt: Date.now(),
            attempts: 0,
            blockedReason: null,
        };
        await runTransaction('readwrite', (store) => store.put(entry));
        return entry;
    } catch (error) {
        console.error('Could not queue offline report:', error);
        return null;
    }
};

export const listQueuedReports = async () => {
    if (!isOfflineQueueSupported()) return [];
    try {
        return await runTransaction('readonly', (store) => requestValue(store.getAll()));
    } catch {
        return [];
    }
};

export const countQueuedReports = async () => {
    if (!isOfflineQueueSupported()) return 0;
    try {
        return await runTransaction('readonly', (store) => requestValue(store.count()));
    } catch {
        return 0;
    }
};

export const removeQueuedReport = async (clientReportId) => {
    if (!isOfflineQueueSupported()) return false;
    try {
        await runTransaction('readwrite', (store) => store.delete(clientReportId));
        return true;
    } catch {
        return false;
    }
};

const markAttempt = async (clientReportId, blockedReason) => {
    try {
        await runTransaction('readwrite', (store) => {
            const getRequest = store.get(clientReportId);
            getRequest.onsuccess = () => {
                const entry = getRequest.result;
                if (!entry) return;
                store.put({
                    ...entry,
                    attempts: (entry.attempts || 0) + 1,
                    lastAttemptAt: Date.now(),
                    blockedReason: blockedReason ?? entry.blockedReason ?? null,
                });
            };
        });
    } catch {
        // Losing an attempt counter is not worth surfacing.
    }
};

/** Rebuilds the multipart body from a stored entry, including the idempotency key. */
export const buildQueuedFormData = (entry) => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(entry.fields || {})) {
        if (value === undefined || value === null || value === '') continue;
        formData.append(key, String(value));
    }

    (entry.images || []).forEach((image, index) => {
        if (!image) return;
        formData.append('images', image, image.name || `queued-${index}.jpg`);
    });

    formData.append('clientReportId', entry.clientReportId);
    return formData;
};

/**
 * Attempts to deliver every queued report.
 *
 * Sequential on purpose: this runs on a reconnect, often on a weak link, and
 * firing N multipart uploads at once is the fastest way to fail all of them.
 *
 * @param {Function} send - async (formData) => response
 */
export const flushQueuedReports = async (send) => {
    const queued = await listQueuedReports();
    const deliverable = queued.filter((entry) => !entry.blockedReason);

    const result = { sent: 0, failed: 0, blocked: 0, remaining: queued.length };

    for (const entry of deliverable) {
        try {
            await send(buildQueuedFormData(entry));
            await removeQueuedReport(entry.clientReportId);
            result.sent += 1;
            result.remaining -= 1;
        } catch (error) {
            const status = error?.response?.status;
            if (status && status >= 400 && status < 500) {
                // The server will reject this forever; stop retrying and keep
                // the entry visible so the reporter can act on it.
                await markAttempt(entry.clientReportId, error.response?.data?.message || 'Rejected by the server');
                result.blocked += 1;
            } else {
                await markAttempt(entry.clientReportId, null);
                result.failed += 1;
            }
        }
    }

    result.remaining -= result.blocked;
    return result;
};

export const clearOfflineReportQueue = async () => {
    if (!isOfflineQueueSupported()) return false;
    try {
        await runTransaction('readwrite', (store) => store.clear());
        return true;
    } catch {
        return false;
    }
};

export default {
    isOfflineQueueSupported,
    createClientReportId,
    enqueueReport,
    listQueuedReports,
    countQueuedReports,
    removeQueuedReport,
    buildQueuedFormData,
    flushQueuedReports,
    clearOfflineReportQueue,
};
