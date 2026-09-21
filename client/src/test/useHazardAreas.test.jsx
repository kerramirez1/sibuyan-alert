import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getHazardLayersMock } = vi.hoisted(() => ({ getHazardLayersMock: vi.fn() }));

vi.mock('../services/api', () => ({
    highRiskZonesAPI: { getHazardLayers: getHazardLayersMock },
}));

import useHazardAreas, { HAZARD_LAYERS_CACHE_KEY } from '../hooks/useHazardAreas';
import { clearQueryCache, setCachedData } from '../utils/queryCache';

const layer = (datasetId, hazardType, featureCount = 1) => ({
    datasetId,
    hazardType,
    features: Array.from({ length: featureCount }, () => ({ type: 'Feature' })),
});

const respondWith = (layers) => getHazardLayersMock.mockResolvedValue({
    data: { data: { layers, unavailable: [] } },
});

describe('useHazardAreas', () => {
    beforeEach(() => {
        clearQueryCache();
        getHazardLayersMock.mockReset();
    });

    test('drops a layer whose hazard type has no colour rule', async () => {
        // The server can still return a dataset this client no longer knows —
        // e.g. an unregistered one. Drawing it would paint every polygon with the
        // grey fallback, which reads as a real hazard class on the map.
        respondWith([
            layer('landslide', 'landslide'),
            layer('storm_surge_ssa4', 'storm_surge'),
        ]);

        const { result } = renderHook(() => useHazardAreas());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.layers.map((entry) => entry.datasetId)).toEqual(['landslide']);
    });

    test('filters a stale cached payload that still holds a removed layer', async () => {
        // The regression this guards: a payload cached before the removal keeps
        // the grey layer on the map until the TTL lapses. The snapshot is read on
        // mount, so it has to be filtered there too.
        setCachedData(HAZARD_LAYERS_CACHE_KEY, {
            layers: [
                layer('landslide', 'landslide'),
                layer('storm_surge_ssa4', 'storm_surge'),
            ],
            unavailable: [],
        });
        respondWith([]);

        const { result } = renderHook(() => useHazardAreas());

        expect(result.current.layers.map((entry) => entry.datasetId)).toEqual(['landslide']);
    });

    test('drops a renderable layer that carries no features', async () => {
        respondWith([layer('landslide', 'landslide', 0)]);

        const { result } = renderHook(() => useHazardAreas());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.layers).toEqual([]);
    });
});
