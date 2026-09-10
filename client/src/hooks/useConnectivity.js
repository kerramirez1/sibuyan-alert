import { useEffect, useState } from 'react';

/**
 * Tracks whether the device currently has a network connection.
 *
 * This is deliberately NOT a liveness probe. `navigator.onLine` reports whether
 * the device has a network interface, not whether the server is reachable — a
 * captive portal still reads as online. It is still the right signal here,
 * because the failure this system must never hide is a responder holding a
 * phone that cannot receive alerts at all.
 */

const readNavigatorState = () => {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
        // Assume online when the environment cannot tell us. Showing an offline
        // warning that might be wrong is worse than showing none.
        return true;
    }
    return navigator.onLine;
};

export const useConnectivity = () => {
    const [isOnline, setIsOnline] = useState(readNavigatorState);
    const [lastChangedAt, setLastChangedAt] = useState(null);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return () => {};
        }

        const goOnline = () => {
            setIsOnline(true);
            setLastChangedAt(Date.now());
        };
        const goOffline = () => {
            setIsOnline(false);
            setLastChangedAt(Date.now());
        };

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        // The value can change between the first render and this effect running.
        setIsOnline(readNavigatorState());

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    return { isOnline, isOffline: !isOnline, lastChangedAt };
};

export default useConnectivity;
