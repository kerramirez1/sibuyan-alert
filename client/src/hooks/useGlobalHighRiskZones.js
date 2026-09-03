import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { highRiskZonesAPI } from '../services/api';
import {
    QUERY_CACHE_TTLS,
    dedupedFetch,
    getCachedData,
    getStaleData,
    setCachedData,
} from '../utils/queryCache';

export const HIGH_RISK_ZONES_CACHE_KEY = 'high-risk-zones:island-wide';

const isVisibleZone = (zone) => Boolean(zone?._id) && zone.isActive !== false;

const upsertVisibleZone = (zones, zone) => {
    if (!zone?._id) return zones;
    if (!isVisibleZone(zone)) return zones.filter((existing) => existing._id !== zone._id);
    return [zone, ...zones.filter((existing) => existing._id !== zone._id)];
};

const useGlobalHighRiskZones = () => {
    const { subscribe, reconnectVersion } = useSocket();
    // Stale-while-revalidate: render the last island-wide snapshot instantly
    // on remount (no skeleton on 2nd visit), then silent-refresh in background.
    const [zones, setZones] = useState(() => getStaleData(HIGH_RISK_ZONES_CACHE_KEY) || []);
    const [loading, setLoading] = useState(() => getStaleData(HIGH_RISK_ZONES_CACHE_KEY) === null);
    const [error, setError] = useState('');

    const refresh = useCallback(async ({ silent = false } = {}) => {
        const hasCache = getStaleData(HIGH_RISK_ZONES_CACHE_KEY) !== null;
        if (!silent && !hasCache) setLoading(true);
        if (!silent) setError('');
        try {
            // Risk-zone visibility is intentionally island-wide. Municipal scope
            // applies only to management permissions, never to this read model.
            const response = await dedupedFetch(HIGH_RISK_ZONES_CACHE_KEY, () => highRiskZonesAPI.getAll());
            const visible = (response.data.data || []).filter(isVisibleZone);
            setZones(visible);
            setCachedData(HIGH_RISK_ZONES_CACHE_KEY, visible);
            setError('');
        } catch (requestError) {
            console.error('Failed to load island-wide high-risk zones:', requestError);
            // Keep stale zones on screen; only surface the error when we have nothing to show.
            if (getStaleData(HIGH_RISK_ZONES_CACHE_KEY) === null) {
                setError('High-risk zones are temporarily unavailable.');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Fresh cache (<=TTL): skip the network entirely — this is what removes
        // the "loading again" on immediate back-navigation.
        if (getCachedData(HIGH_RISK_ZONES_CACHE_KEY, QUERY_CACHE_TTLS.zones) !== null) {
            setLoading(false);
            return;
        }
        // Stale cache: show it now, revalidate silently without a spinner.
        if (getStaleData(HIGH_RISK_ZONES_CACHE_KEY) !== null) {
            refresh({ silent: true });
            return;
        }
        refresh();
    }, [refresh]);

    // Recover any zone changes missed while the socket was disconnected.
    useEffect(() => {
        if (reconnectVersion > 0) refresh({ silent: true });
    }, [reconnectVersion, refresh]);

    useEffect(() => {
        const syncCache = (next) => setCachedData(HIGH_RISK_ZONES_CACHE_KEY, next);
        const unsubscribeCreated = subscribe('highRiskZoneCreated', (zone) => {
            setZones((previous) => {
                const next = upsertVisibleZone(previous, zone);
                syncCache(next);
                return next;
            });
        });
        const unsubscribeUpdated = subscribe('highRiskZoneUpdated', (zone) => {
            setZones((previous) => {
                const next = upsertVisibleZone(previous, zone);
                syncCache(next);
                return next;
            });
        });
        const unsubscribeDeleted = subscribe('highRiskZoneDeleted', (data) => {
            const zoneId = data?.id ?? data?._id;
            if (!zoneId) return;
            setZones((previous) => {
                const next = previous.filter((zone) => zone._id !== zoneId);
                syncCache(next);
                return next;
            });
        });

        return () => {
            unsubscribeCreated();
            unsubscribeUpdated();
            unsubscribeDeleted();
        };
    }, [subscribe]);

    return { zones, loading, error, refresh };
};

export default useGlobalHighRiskZones;
