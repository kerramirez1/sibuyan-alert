import { useCallback, useEffect, useRef, useState } from 'react';
import toast from '../utils/appToast';
import { reportsAPI } from '../services/api';
import {
    countQueuedReports,
    flushQueuedReports,
    subscribeToQueueChanges,
} from '../utils/offlineReportQueue';
import { useConnectivity } from './useConnectivity';
import {
    OFFLINE_SYNC_RETRY_BASE_MS,
    OFFLINE_SYNC_RETRY_FACTOR,
    OFFLINE_SYNC_RETRY_MAX_MS,
} from '../config/reportSubmission';

/**
 * Backoff for the retry timer.
 *
 * A pass that delivered something, or emptied the queue, resets the clock. A
 * pass that tried and failed doubles it. A pass that attempted nothing — the
 * only entry was still held by a live submit attempt — leaves it alone, because
 * being deferred is not a failure.
 *
 * Exported for direct testing: the policy decides how hard a weak link is
 * hammered with retries, so it is pinned by its own assertions.
 */
export const nextRetryDelay = (current, result) => {
    if (!result) return current;
    if (result.sent > 0 || result.remaining === 0) return OFFLINE_SYNC_RETRY_BASE_MS;
    if (result.failed > 0 || result.blocked > 0) {
        return Math.min(current * OFFLINE_SYNC_RETRY_FACTOR, OFFLINE_SYNC_RETRY_MAX_MS);
    }
    return current;
};

/**
 * Delivers reports that were filed while the device was offline.
 *
 * A queued report is replayed when the connection returns, when the app regains
 * focus, when the backoff timer fires, and whenever the queue itself changes —
 * the screen that filed a report is not always the screen holding this hook.
 *
 * The retry timer is not redundant with the `online` event. `navigator.onLine`
 * reports whether there is a network interface, not whether the server is
 * reachable, so a fading signal can leave it `true` the whole time: no `offline`
 * event fires, and therefore no `online` event fires when signal comes back.
 * Without a timer an interrupted submission would sit on the device until a
 * manual sync or an app relaunch.
 *
 * A failed delivery is never dropped: it stays queued until it either succeeds
 * or the server rejects it outright. Concurrent flushes are collapsed — inside
 * one instance by `syncingRef`, across instances by the queue's own flush lock.
 */
export const useOfflineReportSync = () => {
    const { isOnline } = useConnectivity();
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const syncingRef = useRef(false);
    const retryDelayRef = useRef(OFFLINE_SYNC_RETRY_BASE_MS);

    const refreshCount = useCallback(async () => {
        setPendingCount(await countQueuedReports());
    }, []);

    const sync = useCallback(async () => {
        if (syncingRef.current) return null;
        syncingRef.current = true;
        setIsSyncing(true);

        try {
            const result = await flushQueuedReports((formData) => reportsAPI.create(formData));
            await refreshCount();
            retryDelayRef.current = nextRetryDelay(retryDelayRef.current, result);

            if (result.sent > 0) {
                toast.success(`${result.sent} offline report${result.sent > 1 ? 's' : ''} submitted.`);
            }
            if (result.blocked > 0) {
                toast.error(`${result.blocked} queued report${result.blocked > 1 ? 's' : ''} could not be submitted and need attention.`);
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
    }, [refreshCount]);

    useEffect(() => {
        refreshCount();
    }, [refreshCount]);

    // A report staged by the report form lives in the same queue: refresh the
    // count and give it a delivery pass straight away.
    useEffect(() => subscribeToQueueChanges(() => {
        refreshCount();
        sync();
    }), [refreshCount, sync]);

    useEffect(() => {
        if (!isOnline) return;
        sync();
    }, [isOnline, sync]);

    // Backoff retry while anything is still waiting. Re-armed explicitly rather
    // than from a re-render: a pass that leaves the count unchanged would
    // otherwise never schedule the next attempt.
    useEffect(() => {
        if (!isOnline || pendingCount <= 0) return undefined;

        let cancelled = false;
        let timer = null;

        const schedule = () => {
            timer = setTimeout(async () => {
                if (cancelled) return;
                const result = await sync();
                if (cancelled || result?.remaining === 0) return;
                schedule();
            }, retryDelayRef.current);
        };

        schedule();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [isOnline, pendingCount, sync]);

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

    return { pendingCount, isSyncing, sync, refreshCount };
};

export default useOfflineReportSync;

