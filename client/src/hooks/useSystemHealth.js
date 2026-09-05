import { useEffect, useState } from 'react';
import { systemAPI } from '../services/api';

export const SYSTEM_HEALTH_POLL_MS = 60000;

/**
 * Live system status from GET /api/health (200 = DB connected, 503 = down).
 * Starts optimistic ('checking' renders as online) so dashboards never flash
 * a false alarm on first paint; flips to 'degraded' only on confirmed failure.
 */
export const useSystemHealth = () => {
    const [status, setStatus] = useState('checking');

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const response = await systemAPI.getHealth();
                if (!cancelled) setStatus(response?.data?.success ? 'online' : 'degraded');
            } catch {
                if (!cancelled) setStatus('degraded');
            }
        };

        check();
        const intervalId = setInterval(check, SYSTEM_HEALTH_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, []);

    return {
        status,
        isDegraded: status === 'degraded',
        isOnline: status !== 'degraded',
    };
};

export default useSystemHealth;
