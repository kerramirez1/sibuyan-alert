import { useConnectivity } from '../../hooks/useConnectivity';

/**
 * Makes connectivity loss visible.
 *
 * The dangerous property of an IP-only alerting system is silence: a responder
 * whose phone has no signal looks exactly like a responder with nothing to
 * respond to. This banner removes that ambiguity, and states plainly what still
 * works offline so the responder knows what they are looking at.
 */
const OfflineBanner = () => {
    const { isOffline } = useConnectivity();
    if (!isOffline) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
            <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
            />
            <p className="text-xs leading-relaxed sm:text-sm">
                <span className="font-semibold">You are offline.</span>{' '}
                New alerts will not reach this device until the connection returns. The map and
                incident list below are the last data received, not live.
            </p>
        </div>
    );
};

export default OfflineBanner;
