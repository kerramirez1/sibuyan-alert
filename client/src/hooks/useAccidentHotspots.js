import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { highRiskZonesAPI } from '../services/api';
import {
    isRenderableAccidentHotspotFeature,
    resolveAccidentHotspotRule,
} from '../config/accidentHotspots';
import {
    QUERY_CACHE_TTLS,
    dedupedFetch,
    getCachedData,
    getStaleData,
    setCachedData,
} from '../utils/queryCache';

export const ACCIDENT_HOTSPOTS_CACHE_KEY = 'accident-hotspots:sibuyan:all-time';

/**
 * A payload this client can draw.
 *
 * The server already refuses coordinates outside the island and classes it did
 * not derive, so this filter exists for the two things a client cannot assume:
 * that a cached snapshot came from this version of the API, and that a feature
 * handed over by any other source has a class this build has a paint rule for.
 * A feature that fails either test is dropped rather than painted with the grey
 * fallback, which would read as an undocumented third severity.
 */
const normalizeLayer = (payload) => {
    if (!payload || typeof payload !== 'object') return null;

    const features = Array.isArray(payload.features)
        ? payload.features.filter(isRenderableAccidentHotspotFeature)
        : [];

    return {
        datasetId: payload.datasetId || 'accident_hotspots',
        label: payload.label || 'Accident-prone',
        source: payload.source || 'Sibuyan Alert accident reports',
        derivedFromReports: payload.derivedFromReports !== false,
        method: payload.method || 'radius_cluster',
        scope: payload.scope || 'all_time',
        timeScope: payload.timeScope || payload.rule?.timeScope || 'all_time',
        // Resolved here, once, so the drawn radius and the copy that explains an
        // empty layer both read the same rule — including for a cached payload
        // written before the server started sending one.
        rule: resolveAccidentHotspotRule(payload),
        classes: Array.isArray(payload.classes) ? payload.classes : [],
        totals: payload.totals || null,
        features,
    };
};

/**
 * Accident-prone areas derived from the system's own accident reports.
 *
 * The counterpart to `useHazardAreas`, and deliberately not the same hook: the
 * hazard layers are immutable reference geography with a half-hour TTL, while
 * this one is a live read of the reports collection. It therefore revalidates
 * far more often, and it listens to the socket — `reportVerified` is precisely
 * the moment a report becomes eligible for this layer, so waiting out a TTL would
 * show an operator a hotspot map that disagrees with the incident they just
 * approved.
 *
 * Failure is silent and non-fatal, as with the hazard layers: the zones
 * workspace is fully usable without this overlay, and an error banner about a
 * missing context layer would compete with the errors that block the operator.
 *
 * Consumed by the admin Risk Zones workspace only, matching the admin-only
 * endpoint behind it. No other map asks for it, so no public surface draws it.
 *
 * @param {{ enabled?: boolean }} [options] `enabled: false` defers the fetch
 *   entirely, so a caller can opt out without unmounting.
 * @returns {{ layer: object|null, loading: boolean, refresh: Function }}
 */
const useAccidentHotspots = ({ enabled = true } = {}) => {
    const { subscribe, reconnectVersion } = useSocket();
    const [layer, setLayer] = useState(() => normalizeLayer(getStaleData(ACCIDENT_HOTSPOTS_CACHE_KEY)));
    const [loading, setLoading] = useState(() => enabled && getStaleData(ACCIDENT_HOTSPOTS_CACHE_KEY) === null);

    const refresh = useCallback(async ({ silent = false } = {}) => {
        if (!enabled) return;
        const hasCache = getStaleData(ACCIDENT_HOTSPOTS_CACHE_KEY) !== null;
        if (!silent && !hasCache) setLoading(true);

        try {
            const response = await dedupedFetch(
                ACCIDENT_HOTSPOTS_CACHE_KEY,
                () => highRiskZonesAPI.getAccidentHotspots()
            );
            const next = normalizeLayer(response?.data?.data);
            if (!next) return;

            setLayer(next);
            setCachedData(ACCIDENT_HOTSPOTS_CACHE_KEY, next);
        } catch (error) {
            console.warn('Accident-prone areas unavailable:', error?.message || error);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;

        // Fresh cache: no network at all, which is what stops a remount from
        // re-fetching a layer the operator just looked at.
        if (getCachedData(ACCIDENT_HOTSPOTS_CACHE_KEY, QUERY_CACHE_TTLS.accidentHotspots) !== null) {
            setLoading(false);
            return;
        }
        // Stale cache: keep it on screen and revalidate behind it, so the
        // hotspots do not blink out and back in on every visit.
        refresh({ silent: getStaleData(ACCIDENT_HOTSPOTS_CACHE_KEY) !== null });
    }, [enabled, refresh]);

    // Catch up on anything missed while the socket was down.
    useEffect(() => {
        if (reconnectVersion > 0) refresh({ silent: true });
    }, [reconnectVersion, refresh]);

    useEffect(() => {
        if (!enabled) return undefined;

        // A report becoming verified is exactly when it joins this layer, so the
        // refresh is driven by the event rather than by a timer alone.
        const unsubscribe = subscribe('reportVerified', () => {
            refresh({ silent: true });
        });

        return () => unsubscribe?.();
    }, [enabled, refresh, subscribe]);

    return { layer, loading, refresh };
};

export default useAccidentHotspots;
