import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from '../utils/appToast';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getIncidentTypeLabel } from '../config/incidentTypes';
import {
    QUEUE_BLOCKED_CODES,
    describeQueuedReport,
    flushQueuedReports,
    listQueuedReports,
    partitionQueuedReports,
    removeQueuedReport,
    resolveBlockedQueuedReport,
    subscribeToQueueChanges,
} from '../utils/offlineReportQueue';
import { useConnectivity } from './useConnectivity';
import {
    OFFLINE_SYNC_RETRY_BASE_MS,
    OFFLINE_SYNC_RETRY_FACTOR,
    OFFLINE_SYNC_RETRY_MAX_MS,
} from '../config/reportSubmission';

const EMPTY_QUEUE = { deliverable: [], blocked: [], deferred: [], foreignCount: 0 };

/** Everything still owed to the server that the queue can attempt on its own. */
const pendingDeliverableCount = (queue) => queue.deliverable.length + queue.deferred.length;

/**
 * True when another pass could still deliver something on its own.
 *
 * A report waiting on the reporter does not count: the queue cannot answer the
 * server's question for them, so retrying it is a guaranteed no-op. Treating it
 * as deliverable kept the backoff timer awake for the life of the tab, waking
 * every 30 seconds to attempt a report that could never go out.
 */
export const hasDeliverableReports = (result) => {
    if (!result) return true;
    return (result.deliverableRemaining ?? result.remaining) > 0;
};

/**
 * Backoff for the retry timer.
 *
 * A pass that delivered something, or emptied the deliverable queue, resets the
 * clock. A pass that tried and failed doubles it. A pass that attempted nothing
 * — the only entry was still held by a live submit attempt — leaves it alone,
 * because being deferred is not a failure.
 *
 * Exported for direct testing: the policy decides how hard a weak link is
 * hammered with retries, so it is pinned by its own assertions.
 */
export const nextRetryDelay = (current, result) => {
    if (!result) return current;
    if (result.sent > 0 || !hasDeliverableReports(result)) return OFFLINE_SYNC_RETRY_BASE_MS;
    if (result.failed > 0 || result.blocked > 0) {
        return Math.min(current * OFFLINE_SYNC_RETRY_FACTOR, OFFLINE_SYNC_RETRY_MAX_MS);
    }
    return current;
};

/**
 * What the inbox needs to explain a blocked report and offer the right fix.
 *
 * Address first, because that is how the reporter recognises the incident; the
 * incident type is the fallback for a report filed by coordinates alone.
 */
const describeBlockedReport = (entry) => {
    const details = describeQueuedReport(entry);

    return {
        clientReportId: entry.clientReportId,
        blockedCode: entry.blockedCode || QUEUE_BLOCKED_CODES.rejected,
        blockedReason: entry.blockedReason || 'Rejected by the server',
        queuedAt: details.queuedAt,
        label: details.address
            || details.barangay
            || getIncidentTypeLabel(details.incidentType, 'Incident report'),
    };
};

/**
 * Delivers reports that were filed while the device was offline.
 *
 * A queued report is replayed when the connection returns, when the app regains
 * focus, when the backoff timer fires, and whenever the queue itself changes —
 * the screen that filed a report is not always the screen holding this hook.
 *
 * Only the reporter who filed a report may deliver it. The queue is device
 * storage but the delivery is an HTTP session, and on a shared phone those are
 * different things: an admin or responder signed in next would collect the
 * report endpoint's 403 — parking the reporter's own report as "needs
 * attention" without them ever seeing it — and a second reporter would have it
 * filed under their name. Entries record their owner, and a session that cannot
 * submit reports does not flush at all.
 *
 * The retry timer is not redundant with the `online` event. `navigator.onLine`
 * reports whether there is a network interface, not whether the server is
 * reachable, so a fading signal can leave it `true` the whole time: no `offline`
 * event fires, and therefore no `online` event fires when signal comes back.
 * Without a timer an interrupted submission would sit on the device until a
 * manual sync or an app relaunch.
 *
 * A failed delivery is never dropped, and a rejected one is never retried
 * silently: transient failures stay queued, while permanent ones are reported in
 * `blockedReports` for the reporter to resolve or discard. Concurrent flushes
 * are collapsed — inside one instance by `syncingRef`, across instances by the
 * queue's own flush lock.
 */
export const useOfflineReportSync = () => {
    const { isOnline } = useConnectivity();
    const { user, canSubmitReports } = useAuth();
    const reporterId = user?._id || user?.id || null;
    // `canSubmitReports` mirrors what the server enforces on POST /api/reports,
    // so the client never asks for a delivery it would be refused.
    const canDeliver = Boolean(reporterId) && canSubmitReports();

    const [queue, setQueue] = useState(EMPTY_QUEUE);
    const [isSyncing, setIsSyncing] = useState(false);
    const syncingRef = useRef(false);
    const retryDelayRef = useRef(OFFLINE_SYNC_RETRY_BASE_MS);

    const deliverableCount = queue.deliverable.length;
    const deliverablePendingCount = pendingDeliverableCount(queue);
    const pendingCount = deliverablePendingCount + queue.blocked.length;

    const refreshQueue = useCallback(async () => {
        const entries = await listQueuedReports();
        setQueue(partitionQueuedReports(entries, { reporterId }));
    }, [reporterId]);

    const sync = useCallback(async () => {
        if (!canDeliver || syncingRef.current) return null;
        syncingRef.current = true;
        setIsSyncing(true);

        try {
            const result = await flushQueuedReports(
                (formData) => reportsAPI.create(formData),
                { reporterId },
            );
            await refreshQueue();
            retryDelayRef.current = nextRetryDelay(retryDelayRef.current, result);

            if (result.sent > 0) {
                toast.success(`${result.sent} offline report${result.sent > 1 ? 's' : ''} submitted.`);
            }
            if (result.blocked > 0) {
                toast.error(`${result.blocked} queued report${result.blocked > 1 ? 's' : ''} could not be submitted and need${result.blocked > 1 ? '' : 's'} attention.`);
            }

            return result;
        } catch {
            // Nothing here is actionable by the reporter: the queue still holds
            // the report and the retry timer will come back to it.
            return null;
        } finally {
            syncingRef.current = false;
            setIsSyncing(false);
        }
    }, [canDeliver, refreshQueue, reporterId]);

    /**
     * Clears a blocked report so the next pass may attempt it again.
     *
     * `confirmDistinct` is the reporter's answer to the server's duplicate
     * warning: the resend then files the report as a deliberately separate
     * incident instead of coming back as the same question. Both this and
     * `discardReport` wake the queue through its own change notification, so the
     * list refreshes and the retry runs without the caller re-sequencing them.
     */
    const resolveBlockedReport = useCallback(
        (clientReportId, options) => resolveBlockedQueuedReport(clientReportId, options),
        [],
    );

    const discardReport = useCallback((clientReportId) => removeQueuedReport(clientReportId), []);

    // The queue is per account, so it is re-read whenever the signed-in reporter
    // changes — a different account must never inherit the previous one's list.
    useEffect(() => {
        refreshQueue();
    }, [refreshQueue]);

    // A report staged by the report form lives in the same queue: refresh the
    // list and give it a delivery pass straight away.
    useEffect(() => subscribeToQueueChanges(() => {
        refreshQueue();
        sync();
    }), [refreshQueue, sync]);

    useEffect(() => {
        if (!isOnline || !canDeliver) return;
        sync();
    }, [isOnline, canDeliver, sync]);

    // Backoff retry while anything is still deliverable. Re-armed explicitly
    // rather than from a re-render: a pass that leaves the count unchanged would
    // otherwise never schedule the next attempt. Reports waiting on the reporter
    // are excluded — a report that needs an answer does not need a timer.
    useEffect(() => {
        if (!isOnline || !canDeliver || deliverablePendingCount <= 0) return undefined;

        let cancelled = false;
        let timer = null;

        const schedule = () => {
            timer = setTimeout(async () => {
                if (cancelled) return;
                const result = await sync();
                if (cancelled || !hasDeliverableReports(result)) return;
                schedule();
            }, retryDelayRef.current);
        };

        schedule();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [isOnline, canDeliver, deliverablePendingCount, sync]);

    // Signal often returns while the phone is in a pocket or the tab is in the
    // background, where no `online` event is guaranteed to land usefully.
    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

        const resyncOnReturn = () => {
            if (document.visibilityState === 'visible') sync();
        };
        document.addEventListener('visibilitychange', resyncOnReturn);
        window.addEventListener('focus', resyncOnReturn);

        return () => {
            document.removeEventListener('visibilitychange', resyncOnReturn);
            window.removeEventListener('focus', resyncOnReturn);
        };
    }, [sync]);

    const blockedReports = useMemo(
        () => queue.blocked.map(describeBlockedReport),
        [queue.blocked],
    );

    return {
        pendingCount,
        deliverableCount,
        blockedReports,
        isSyncing,
        sync,
        resolveBlockedReport,
        discardReport,
    };
};

export default useOfflineReportSync;
