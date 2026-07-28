import { describe, expect, test, vi } from 'vitest';

vi.mock('maplibre-gl', () => ({
    default: { addProtocol: vi.fn() },
}));

import {
    createOperationalMapStyle,
    PMTILES_SOURCE_ID,
    STREET_FALLBACK_LAYER_ID,
    STREET_FALLBACK_SOURCE_ID,
    TERRAIN_SOURCE_ID,
    toPmtilesProtocolUrl,
} from '../config/mapProvider';

describe('map provider configuration', () => {
    test('builds a self-hosted PMTiles street source with a public fallback', () => {
        const result = createOperationalMapStyle({
            pmtilesUrl: 'https://maps.example.gov/sibuyan.pmtiles',
            terrainTilesUrl: '',
        });

        expect(result.hasSelfHostedStreetMap).toBe(true);
        expect(result.style.sources[PMTILES_SOURCE_ID]).toMatchObject({
            type: 'vector',
            url: 'pmtiles://https://maps.example.gov/sibuyan.pmtiles',
        });
        expect(result.style.sources[STREET_FALLBACK_SOURCE_ID].tiles).toEqual([
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ]);
        expect(result.allStreetLayerIds).toContain(STREET_FALLBACK_LAYER_ID);
    });

    test('uses the policy-compliant OSM endpoint when PMTiles is not configured', () => {
        const result = createOperationalMapStyle({ pmtilesUrl: '', terrainTilesUrl: '' });

        expect(result.hasSelfHostedStreetMap).toBe(false);
        expect(result.primaryStreetLayerIds).toEqual([STREET_FALLBACK_LAYER_ID]);
        expect(result.style.sources).not.toHaveProperty(PMTILES_SOURCE_ID);
    });

    test('configures true terrain from a Terrarium DEM source', () => {
        const result = createOperationalMapStyle({
            pmtilesUrl: '',
            terrainTilesUrl: 'https://terrain.example.gov/{z}/{x}/{y}.png',
            enableTerrain: true,
        });

        expect(result.style.sources[TERRAIN_SOURCE_ID]).toMatchObject({
            type: 'raster-dem',
            encoding: 'terrarium',
        });
        expect(result.style.terrain).toEqual({ source: TERRAIN_SOURCE_ID, exaggeration: 1 });
    });

    test('rejects non-http map archive protocols', () => {
        expect(() => toPmtilesProtocolUrl('file:///private/sibuyan.pmtiles')).toThrow(/unsupported/i);
    });
});
