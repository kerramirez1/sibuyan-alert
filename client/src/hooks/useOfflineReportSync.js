import { useCallback, useEffect, useRef, useState } from 'react';
import toast from '../utils/appToast';
import { reportsAPI } from '../services/api';
import { countQueuedReports, flushQueuedReports } from '../utils/offlineReportQueue';
import { useConnectivity } from './useConnectivity';

/**
 * Delivers reports that were filed while the device was offline.
 *
 * Runs on mount and on every reconnect. A failed delivery is never dropped: it
 * stays queued until it either succeeds or the server rejects it outright.
 * Concurrent flushes are collapsed so a flapping connection cannot launch two
 * deliveries of the same report.
 */
export const useOfflineReportSync = () => {
    const { isOnline } = useConnectivity();
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const syncingRef = useRef(false);

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

            if (result.sent > 0) {
                toast.success(`${result.sent} offline report${result.sent > 1 ? 's' : ''} submitted.`);
            }
            if (result.blocked > 0) {
                toast.error(`${result.blocked} queued report${result.blocked > 1 ? 's' : ''} could not be submitted and need attention.`);
            }

            return result;
        } finally {
            syncingRef.current = false;
            setIsSyncing(false);
        }
    }, [refreshCount]);

    useEffect(() => {
        refreshCount();
    }, [refreshCount]);

    useEffect(() => {
        if (!isOnline) return;
        sync();
    }, [isOnline, sync]);

    return { pendingCount, isSyncing, sync, refreshCount };
};

export default useOfflineReportSync;
