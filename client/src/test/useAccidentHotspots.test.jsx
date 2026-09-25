import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getAccidentHotspotsMock, listeners, socketState, subscribeMock } = vi.hoisted(() => {
    const socketListeners = new Map();
    return {
        getAccidentHotspotsMock: vi.fn(),
        listeners: socketListeners,
        socketState: { reconnectVersion: 0 },
        subscribeMock: vi.fn((event, callback) => {
            socketListeners.set(event, callback);
            return vi.fn(() => socketListeners.delete(event));
        }),
    };
});

vi.mock('../services/api', () => ({
    highRiskZonesAPI: { getAccidentHotspots: getAccidentHotspotsMock },
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({ subscribe: subscribeMock, reconnectVersion: socketState.reconnectVersion }),
}));

import useAccidentHotspots, { ACCIDENT_HOTSPOTS_CACHE_KEY } from '../hooks/useAccidentHotspots';
import { clearQueryCache, getStaleData } from '../utils/queryCache';

/** The payload shape the endpoint returns, with a three-report medium hotspot. */
const payload = (overrides = {}) => ({
    data: {
        data: {
            datasetId: 'accident_hotspots',
            label: 'Accident-prone',
            source: 'Sibuyan Alert accident reports',
            derivedFromReports: true,
            method: 'radius_cluster',
            rule: { radiusMeters: 100, timeScope: 'all_time', windowDays: null, mediumMinReports: 3, highMinReports: 6 },
            classes: [{ value: 2, label: 'Medium' }, { value: 3, label: 'High' }],
            features: [
                {
                    type: 'Feature',
                    properties: { class: 2, count: 3 },
                    geometry: { type: 'Point', coordinates: [122.676219, 12.345053] },
                },
            ],
            totals: { reports: 3, hotspots: 1, clusteredReports: 3 },
            ...overrides,
        },
    },
});

const feature = (coordinateClass, coordinates) => ({
    type: 'Feature',
    properties: { class: coordinateClass, count: 3 },
    geometry: { type: 'Point', coordinates },
});

describe('useAccidentHotspots', () => {
    beforeEach(() => {
        clearQueryCache();
        listeners.clear();
        socketState.reconnectVersion = 0;
        subscribeMock.mockClear();
        getAccidentHotspotsMock.mockReset();
        getAccidentHotspotsMock.mockResolvedValue(payload());
    });

    test('loads the derived layer and keeps the metadata that explains it', async () => {
        expect(ACCIDENT_HOTSPOTS_CACHE_KEY).toBe('accident-hotspots:sibuyan:all-time');
        const { result } = renderHook(() => useAccidentHotspots());

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(getAccidentHotspotsMock).toHaveBeenCalledTimes(1);
        expect(result.current.layer.derivedFromReports).toBe(true);
        expect(result.current.layer.method).toBe('radius_cluster');
        expect(result.current.layer.scope).toBe('all_time');
        expect(result.current.layer.timeScope).toBe('all_time');
        // The rule travels with the layer, so the map draws the radius the data
        // was clustered by and the UI can state the thresholds it used instead of
        // implying them.
        expect(result.current.layer.rule).toEqual({
            radiusMeters: 100,
            timeScope: 'all_time',
            windowDays: null,
            mediumMinReports: 3,
            highMinReports: 6,
        });
        expect(result.current.layer.features).toHaveLength(1);
        expect(result.current.layer.totals).toEqual({ reports: 3, hotspots: 1, clusteredReports: 3 });
    });

    test('drops features it cannot draw, and keeps the rest', async () => {
        getAccidentHotspotsMock.mockResolvedValue(payload({
            features: [
                feature(2, [122.68, 12.35]),
                // A class this client has no paint rule for: painted, it would
                // read as a third severity rather than as an error.
                feature(9, [122.6, 12.4]),
                // A point that is not a point.
                { type: 'Feature', properties: { class: 2, count: 3 }, geometry: { type: 'MultiPolygon', coordinates: [] } },
                feature(2, [Number.NaN, Number.NaN]),
            ],
        }));

        const { result } = renderHook(() => useAccidentHotspots());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.layer.features).toHaveLength(1);
        expect(result.current.layer.features[0].geometry.coordinates).toEqual([122.68, 12.35]);
    });

    test('renders a cached snapshot immediately and does not refetch while it is fresh', async () => {
        const first = renderHook(() => useAccidentHotspots());
        await waitFor(() => expect(first.result.current.layer).not.toBeNull());
        expect(getStaleData(ACCIDENT_HOTSPOTS_CACHE_KEY)).not.toBeNull();

        first.unmount();

        const second = renderHook(() => useAccidentHotspots());

        // No skeleton on the second visit: the snapshot is already the layer.
        expect(second.result.current.layer.features).toHaveLength(1);
        await waitFor(() => expect(second.result.current.loading).toBe(false));
        expect(getAccidentHotspotsMock).toHaveBeenCalledTimes(1);
    });

    test('refetches when a report is verified, because that is what changes the layer', async () => {
        const { result } = renderHook(() => useAccidentHotspots());
        await waitFor(() => expect(result.current.loading).toBe(false));

        getAccidentHotspotsMock.mockResolvedValue(payload({
            features: [feature(3, [122.55, 12.4])],
            totals: { reports: 6, hotspots: 1, clusteredReports: 6 },
        }));

        await act(async () => {
            listeners.get('reportVerified')?.({ _id: 'report-1' });
        });

        await waitFor(() => expect(result.current.layer.totals).toEqual({ reports: 6, hotspots: 1, clusteredReports: 6 }));
        expect(getAccidentHotspotsMock).toHaveBeenCalledTimes(2);
    });

    test('catches up after a reconnect, and stays quiet when disabled', async () => {
        const { result, rerender } = renderHook(
            ({ enabled }) => useAccidentHotspots({ enabled }),
            { initialProps: { enabled: false } }
        );

        // Opted out: no request at all.
        expect(getAccidentHotspotsMock).not.toHaveBeenCalled();
        expect(result.current.layer).toBeNull();

        rerender({ enabled: true });
        await waitFor(() => expect(result.current.layer).not.toBeNull());

        socketState.reconnectVersion = 1;
        rerender({ enabled: true });
        // Whatever happened while the socket was down is recovered by a refetch,
        // not by waiting out the TTL.
        await waitFor(() => expect(getAccidentHotspotsMock.mock.calls.length).toBeGreaterThan(1));
    });

    test('a failed request leaves the map usable and does not throw', async () => {
        getAccidentHotspotsMock.mockRejectedValue(new Error('offline'));

        const { result } = renderHook(() => useAccidentHotspots());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.layer).toBeNull();
    });
});
