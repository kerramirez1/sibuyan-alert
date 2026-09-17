import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';

/**
 * Loads the reach leaderboards (unique viewers per incident and per risk zone).
 *
 * Fetched separately from the rest of the dashboard because reach comes from the
 * ViewEvent collection while everything else on the analytics page is derived
 * client-side from the report list. Mixing the two sources into one loading
 * state would make a reach failure look like a report failure.
 *
 * Failures are swallowed into `reach: null`: reach is supplementary, so a bad
 * fetch degrades to "not shown" rather than breaking the analytics page.
 *
 * @param {object}  [options]
 * @param {boolean} [options.enabled] Only fetch for viewers allowed to see it.
 * @param {number}  [options.limit]   Max rows per leaderboard.
 */
export const useReachData = ({ enabled = false, limit = 10 } = {}) => {
    const [reach, setReach] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        setLoading(true);

        adminAPI.getReach({ limit })
            .then((response) => {
                if (cancelled) return;
                setReach(response.data?.data || null);
            })
            .catch(() => {
                if (!cancelled) setReach(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, limit]);

    return { reach, loading };
};

export default useReachData;
