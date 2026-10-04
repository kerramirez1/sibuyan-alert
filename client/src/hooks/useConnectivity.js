import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the device can actually reach the server.
 *
 * Two signals combine into one answer:
 * - `linkUp` — `navigator.onLine`: whether the device has a network interface.
 *   Fast, but it stays true when mobile data is ON with no load/internet, so a
 *   dead SIM still reads as "online".
 * - `serverReachable` — a lightweight liveness probe against `/api/health`
 *   (`null` = unknown yet). Any resolved response counts as reachable, even a
 *   503; only a thrown error counts as unreachable.
 *
 * Effective `isOnline = linkUp && serverReachable !== false`. The initial
 * state stays optimistic (unknown counts as up) so boot is never blocked; the
 * mount probe corrects it within ~5s.
 *
 * The probe endpoint is deliberate: `/api/health` is a light public GET that
 * the service worker's fetch handler does not intercept (absent from
 * PUBLIC_API/SCOPED_API, not under /api/files or /api/auth), so a failure is
 * a truthful "no internet" rather than a stale-cache lie. Raw `fetch` is used
 * — never the axios instance — so interceptors cannot touch the probe.
 *
 * Cadence: immediately on mount, on every 'online' window event (to verify the
 * "online" is real), and every 30s while the link is up (~200 bytes a probe:
 * negligible battery/data). Never while the link is down — `false` there means
 * definitely offline, no probe needed. `probeNow()` runs one probe on demand
 * (e.g. before a report submit) and resolves to the fresh boolean.
 */

const PROBE_URL = '/api/health';
const PROBE_TIMEOUT_MS = 5000;
const PROBE_INTERVAL_MS = 30 * 1000;

const readNavigatorState = () => {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
        // Assume online when the environment cannot tell us. Showing an offline
        // warning that might be wrong is worse than showing none.
        return true;
    }
    return navigator.onLine;
};

const probeServer = async () => {
    try {
        await fetch(PROBE_URL, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        return true;
    } catch {
        return false;
    }
};

export const useConnectivity = () => {
    const [linkUp, setLinkUp] = useState(readNavigatorState);
    const [serverReachable, setServerReachable] = useState(null);
    const [lastChangedAt, setLastChangedAt] = useState(null);
    const linkUpRef = useRef(linkUp);
    // Render-phase assignment: the interval and on-demand probes always read
    // the current link state instead of a stale closure.
    linkUpRef.current = linkUp;

    // One probe on demand. Never fires while the link is down (definitely
    // offline); otherwise measures, updates state, and resolves the boolean.
    const probeNow = useCallback(async () => {
        if (!linkUpRef.current) return false;
        const reachable = await probeServer();
        setServerReachable(reachable);
        return reachable;
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return () => {};
        }

        const goOnline = () => {
            // Optimistic like boot: the verification probe below corrects a
            // phantom "online" within ~5s.
            setLinkUp(true);
            setServerReachable(null);
        };
        const goOffline = () => {
            setLinkUp(false);
        };

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        // The value can change between the first render and this effect running.
        setLinkUp(readNavigatorState());

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    // Mount probe, verification on every link-up, and the 30s cadence while
    // the link is up. Never probes while the link is down.
    useEffect(() => {
        probeNow();
        if (!linkUp) return undefined;
        const id = setInterval(() => {
            probeNow();
        }, PROBE_INTERVAL_MS);
        return () => clearInterval(id);
    }, [linkUp, probeNow]);

    const isOnline = linkUp && serverReachable !== false;

    // lastChangedAt tracks the EFFECTIVE value, not just the link: a failed
    // probe flipping the answer counts as a change even when navigator.onLine
    // never moved.
    const prevEffectiveRef = useRef(isOnline);
    useEffect(() => {
        if (prevEffectiveRef.current !== isOnline) {
            prevEffectiveRef.current = isOnline;
            setLastChangedAt(Date.now());
        }
    });

    return { isOnline, isOffline: !isOnline, lastChangedAt, probeNow };
};

export default useConnectivity;
