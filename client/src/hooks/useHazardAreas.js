import { useEffect, useState } from 'react';
import { highRiskZonesAPI } from '../services/api';
import { isRenderableHazardType } from '../config/hazardAreas';
import {
    QUERY_CACHE_TTLS,
    dedupedFetch,
    getCachedData,
    getStaleData,
    setCachedData,
} from '../utils/queryCache';

export const HAZARD_LAYERS_CACHE_KEY = 'hazard-layers:sibuyan';

/**
 * A layer this client can actually draw.
 *
 * Two conditions, both required. It must carry at least one feature — an empty
 * overlay is not worth a request — and its type must have a colour rule. The
 * second is what keeps a layer the server still sends (an unregistered dataset,
 * or one held over in the cache from before a deploy) off the map: without it
 * every polygon takes the flat grey fallback, which reads as a genuine hazard
 * class both on the canvas and in the legend.
 */
const isRenderableLayer = (layer) => (
    isRenderableHazardType(layer?.hazardType)
    && Array.isArray(layer?.features)
    && layer.features.length > 0
);

/**
 * NOAH hazard reference layers (landslide). Only types this client has a colour
 * rule for are returned; anything else is filtered out — see `isRenderableLayer`.
 *
 * Treated as reference geography rather than live data, which drives every
 * decision here:
 *
 * - No socket subscription. Nothing in the app mutates these polygons, so there
 *   is no event to listen for; the only thing that can change them is a redeploy
 *   with new data, which the server's ETag already handles.
 * - A long cache TTL, because re-downloading ~1.7 MB gzipped on every visit to
 *   the zones page is pure waste on the weak links this app targets.
 * - Failure is silent and non-fatal. The layers are context behind the pin, so a
 *   missing overlay must never stop an administrator placing a hazard zone —
 *   they simply get the map they had before.
 *
 * Consumed only by the admin Risk Zones workspace. The public dashboard map no
 * longer draws these layers and does not call this hook at all — they are an
 * administrative aid for placing zones, and the endpoint behind them is
 * municipal_admin-only.
 *
 * @param {{ enabled?: boolean }} [options] `enabled: false` defers the fetch
 *   entirely, so a caller can opt out of the ~1.7 MB payload.
 * @returns {{ layers: Object[], unavailable: string[], loading: boolean }}
 */
const useHazardAreas = ({ enabled = true } = {}) => {
    const [state, setState] = useState(() => {
        // Filtered on read too: the snapshot is what a remount renders before the
        // network answers, so a stale entry carrying a since-removed layer must
        // not slip onto the map for that first frame.
        const cached = getStaleData(HAZARD_LAYERS_CACHE_KEY);
        return {
            layers: Array.isArray(cached?.layers) ? cached.layers.filter(isRenderableLayer) : [],
            unavailable: Array.isArray(cached?.unavailable) ? cached.unavailable : [],
        };
    });
    const [loading, setLoading] = useState(() => enabled && getStaleData(HAZARD_LAYERS_CACHE_KEY) === null);

    useEffect(() => {
        if (!enabled) return undefined;

        let active = true;

        const load = async () => {
            try {
                const response = await dedupedFetch(
                    HAZARD_LAYERS_CACHE_KEY,
                    () => highRiskZonesAPI.getHazardLayers()
                );
                const payload = response?.data?.data;
                if (!active || !payload) return;

                const next = {
                    layers: (Array.isArray(payload.layers) ? payload.layers : [])
                        .filter(isRenderableLayer),
                    unavailable: Array.isArray(payload.unavailable) ? payload.unavailable : [],
                };

                setState(next);
                setCachedData(HAZARD_LAYERS_CACHE_KEY, next);
            } catch (error) {
                // Deliberately no error state surfaced to the caller. The map is
                // fully functional without this overlay, and a banner about a
                // missing reference layer would compete with the errors that
                // actually block the user.
                console.warn('Hazard layers unavailable:', error?.message || error);
                if (active && getStaleData(HAZARD_LAYERS_CACHE_KEY) === null) {
                    setState({ layers: [], unavailable: [] });
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        if (getCachedData(HAZARD_LAYERS_CACHE_KEY, QUERY_CACHE_TTLS.hazardLayers) !== null) {
            setLoading(false);
            return () => { active = false; };
        }

        load();
        return () => { active = false; };
    }, [enabled]);

    return { ...state, loading };
};

export default useHazardAreas;
