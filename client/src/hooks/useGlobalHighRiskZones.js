import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { highRiskZonesAPI } from '../services/api';

const isVisibleZone = (zone) => Boolean(zone?._id) && zone.isActive !== false;

const upsertVisibleZone = (zones, zone) => {
    if (!zone?._id) return zones;
    if (!isVisibleZone(zone)) return zones.filter((existing) => existing._id !== zone._id);
    return [zone, ...zones.filter((existing) => existing._id !== zone._id)];
};

const useGlobalHighRiskZones = () => {
    const { subscribe } = useSocket();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Risk-zone visibility is intentionally island-wide. Municipal scope
            // applies only to management permissions, never to this read model.
            const response = await highRiskZonesAPI.getAll();
            setZones((response.data.data || []).filter(isVisibleZone));
            setError('');
        } catch (requestError) {
            console.error('Failed to load island-wide high-risk zones:', requestError);
            setError('High-risk zones are temporarily unavailable.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        const unsubscribeCreated = subscribe('highRiskZoneCreated', (zone) => {
            setZones((previous) => upsertVisibleZone(previous, zone));
        });
        const unsubscribeUpdated = subscribe('highRiskZoneUpdated', (zone) => {
            setZones((previous) => upsertVisibleZone(previous, zone));
        });
        const unsubscribeDeleted = subscribe('highRiskZoneDeleted', (data) => {
            const zoneId = data?.id ?? data?._id;
            if (!zoneId) return;
            setZones((previous) => previous.filter((zone) => zone._id !== zoneId));
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
