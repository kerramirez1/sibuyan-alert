import { useEffect, useState } from 'react';
import { viewsAPI } from '../services/api';

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
 * Revalidates when the tab regains focus. Reach changes when somebody opens a
 * record — usually after the dashboard has already been loaded — so a
 * mount-once snapshot keeps showing numbers that were true when the admin first
 * navigated there. Focus is the moment the admin is actually reading it.
 *
 * The revalidation is silent on purpose: it must never blink a skeleton over data
 * that is already on screen, which is also why this hook reports no `loading`
 * flag. There is nothing honest to do with one — the panel renders the last known
 * figures, and a spinner would only replace real data with less information.
 *
 * @param {object}  [options]
 * @param {boolean} [options.enabled] Only fetch for viewers allowed to see it.
 * @param {number}  [options.limit]   Max rows per leaderboard.
 */
export const useReachData = ({ enabled = false, limit = 10 } = {}) => {
    const [reach, setReach] = useState(null);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;

        const load = () => viewsAPI.getReach({ limit })
            .then((response) => {
                if (!cancelled) setReach(response.data?.data || null);
            })
            .catch(() => {
                if (!cancelled) setReach(null);
            });

        load();

        const revalidate = () => {
            if (typeof document !== 'undefined'
                && document.visibilityState
                && document.visibilityState !== 'visible') {
                return;
            }
            load();
        };

        window.addEventListener('focus', revalidate);
        document.addEventListener('visibilitychange', revalidate);

        return () => {
            cancelled = true;
            window.removeEventListener('focus', revalidate);
            document.removeEventListener('visibilitychange', revalidate);
        };
    }, [enabled, limit]);

    return { reach };
};

export default useReachData;
