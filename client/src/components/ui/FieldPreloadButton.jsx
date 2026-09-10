import { useCallback, useState } from 'react';
import Button from './Button';
import toast from '../../utils/appToast';
import { reportsAPI, highRiskZonesAPI } from '../../services/api';
import { useConnectivity } from '../../hooks/useConnectivity';

const formatAge = (timestamp) => {
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return `${hours} hr ago`;
};

/**
 * Warms the offline cache before a responder drives out of coverage.
 *
 * Sibuyan's dead zones are on the roads, not at the station. Downloading the
 * incident list while there is still signal is the cheapest way to make the
 * trip out survivable without a connection — and it is a deliberate act, so
 * the responder knows exactly how stale the data in their hand is.
 *
 * There is no bespoke storage here: these are ordinary API reads, and the
 * service worker caches the responses. The app then reads them back through
 * the normal data layer when the network disappears.
 */
const FieldPreloadButton = () => {
    const { isOnline } = useConnectivity();
    const [loading, setLoading] = useState(false);
    const [cachedAt, setCachedAt] = useState(null);

    const preload = useCallback(async () => {
        if (!isOnline) {
            toast.error('Connect to the network first — there is nothing to download offline.');
            return;
        }

        setLoading(true);
        try {
            // allSettled: one failing endpoint must not throw away the rest of
            // the download. Partial offline data still beats none.
            const results = await Promise.allSettled([
                reportsAPI.getAll(),
                reportsAPI.getStats(),
                highRiskZonesAPI.getAll(),
            ]);

            const succeeded = results.filter((result) => result.status === 'fulfilled').length;
            if (succeeded === 0) {
                toast.error('Could not download incident data.');
                return;
            }

            setCachedAt(Date.now());
            toast.success('Incident data saved for offline use.');
        } catch {
            toast.error('Could not download incident data.');
        } finally {
            setLoading(false);
        }
    }, [isOnline]);

    return (
        <Button
            variant="secondary"
            size="sm"
            onClick={preload}
            loading={loading}
            loadingLabel="Downloading..."
        >
            {cachedAt ? `Refresh offline data (${formatAge(cachedAt)})` : 'Download for offline use'}
        </Button>
    );
};

export default FieldPreloadButton;
