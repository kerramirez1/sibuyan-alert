import { describe, expect, test, vi } from 'vitest';

vi.mock('maplibre-gl', () => ({
    default: { addProtocol: vi.fn() },
}));

import {
    createOperationalMapStyle,
    inspectPmtilesArchive,
    OPERATIONAL_MAX_ZOOM,
    PMTILES_SOURCE_ID,
    prepareOperationalMapStyle,
    STREET_FALLBACK_LAYER_ID,
    STREET_FALLBACK_SOURCE_ID,
    toPmtilesProtocolUrl,
} from '../config/mapProvider';

const createPmtilesHeader = ({ minZoom = 0, maxZoom = 14 } = {}) => {
    const bytes = new ArrayBuffer(16384);
    const view = new DataView(bytes);
    view.setUint16(0, 0x4d50, true);
    view.setUint8(7, 3);
    view.setUint8(99, 1);
    view.setUint8(100, minZoom);
    view.setUint8(101, maxZoom);
    view.setInt32(102, Math.round(122.45 * 10000000), true);
    view.setInt32(106, Math.round(12.30 * 10000000), true);
    view.setInt32(110, Math.round(122.70 * 10000000), true);
    view.setInt32(114, Math.round(12.55 * 10000000), true);
    return bytes;
};

const createRangeResponse = (bytes, status = 206) => ({
    status,
    headers: {
        get: (name) => {
            const headers = {
                'content-range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
                'cache-control': 'public, max-age=86400',
                etag: '"test-map"',
            };
            return headers[name.toLowerCase()] || null;
        },
    },
    arrayBuffer: async () => bytes,
});

describe('map provider configuration', () => {
    test('caps every operational map below the incomplete imagery level', () => {
        const result = createOperationalMapStyle({ pmtilesUrl: '' });

        expect(OPERATIONAL_MAX_ZOOM).toBe(16);
        expect(result.streetMaxZoom).toBe(OPERATIONAL_MAX_ZOOM);
    });

    test('builds a self-hosted PMTiles street source with a public fallback', () => {
        const result = createOperationalMapStyle({
            pmtilesUrl: 'https://maps.example.gov/sibuyan.pmtiles',
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
        const result = createOperationalMapStyle({ pmtilesUrl: '' });

        expect(result.hasSelfHostedStreetMap).toBe(false);
        expect(result.primaryStreetLayerIds).toEqual([STREET_FALLBACK_LAYER_ID]);
        expect(result.style.sources).not.toHaveProperty(PMTILES_SOURCE_ID);
    });

    test('rejects non-http map archive protocols', () => {
        expect(() => toPmtilesProtocolUrl('file:///private/sibuyan.pmtiles')).toThrow(/unsupported/i);
    });

    test('verifies byte-range support and reads the archive zoom coverage', async () => {
        const bytes = createPmtilesHeader({ minZoom: 2, maxZoom: 14 });
        const fetchImpl = vi.fn().mockResolvedValue(createRangeResponse(bytes));

        const inspection = await inspectPmtilesArchive(
            'https://maps.example.gov/range-verified.pmtiles',
            { fetchImpl }
        );

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://maps.example.gov/range-verified.pmtiles',
            expect.objectContaining({ headers: { Range: 'bytes=0-16383' } })
        );
        expect(inspection).toMatchObject({
            minZoom: 2,
            maxZoom: 14,
            rangeSupported: true,
        });
    });

    test('falls back when the archive host does not return partial content', async () => {
        const bytes = createPmtilesHeader();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createRangeResponse(bytes, 200)));

        try {
            const provider = await prepareOperationalMapStyle({
                pmtilesUrl: 'https://maps.example.gov/no-range.pmtiles',
            });

            expect(provider.hasSelfHostedStreetMap).toBe(false);
            expect(provider.pmtilesError).toMatch(/206 Partial Content/i);
            expect(provider.primaryStreetLayerIds).toEqual([STREET_FALLBACK_LAYER_ID]);
        } finally {
            warnSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    test('uses the archive maximum zoom for the PMTiles street source', () => {
        const result = createOperationalMapStyle({
            pmtilesUrl: 'https://maps.example.gov/zoom-14.pmtiles',
            pmtilesInspection: { minZoom: 2, maxZoom: 14 },
        });

        expect(result.style.sources[PMTILES_SOURCE_ID]).toMatchObject({
            minzoom: 2,
            maxzoom: 14,
        });
        expect(result.streetMaxZoom).toBe(14);
    });

    test('creates explicit layer groups (streetLayerIds, satelliteLayerIds, satelliteVectorLabelLayerIds)', () => {
        const result = createOperationalMapStyle({
            includeStreet: true,
            include3DLabels: true,
            pmtilesUrl: 'https://maps.example.gov/sibuyan.pmtiles',
        });

        expect(Array.isArray(result.streetLayerIds)).toBe(true);
        expect(Array.isArray(result.satelliteLayerIds)).toBe(true);
        expect(Array.isArray(result.satelliteVectorLabelLayerIds)).toBe(true);

        expect(result.satelliteLayerIds).toContain('esri-imagery-layer');
        expect(result.satelliteLayerIds).toContain('esri-reference-layer');
        result.satelliteVectorLabelLayerIds.forEach((id) => {
            expect(result.satelliteLayerIds).toContain(id);
            expect(result.streetLayerIds).not.toContain(id);
        });

        // Street mode contains street layers and fallback
        expect(result.streetLayerIds).toContain('street-places_subplace');
        expect(result.streetLayerIds).toContain('street-places_locality');
        expect(result.streetLayerIds).toContain('street-roads_labels_major');
        expect(result.streetLayerIds).toContain(STREET_FALLBACK_LAYER_ID);

        // 3D vector labels contain place, road, and geographic labels
        expect(result.satelliteVectorLabelLayerIds).toContain('3d-label-places_subplace');
        expect(result.satelliteVectorLabelLayerIds).toContain('3d-label-places_locality');
        expect(result.satelliteVectorLabelLayerIds).toContain('3d-label-roads_labels_major');
        expect(result.satelliteVectorLabelLayerIds).toContain('3d-label-earth_label_islands');
        expect(result.satelliteVectorLabelLayerIds).toContain('3d-label-water_label_ocean');
    });

    test('hides esri-reference-layer in 3D/satellite style when vector labels are active', () => {
        const result = createOperationalMapStyle({
            includeStreet: true,
            include3DLabels: true,
            pmtilesUrl: 'https://maps.example.gov/sibuyan.pmtiles',
        });

        expect(result.hasVectorLabels).toBe(true);
        const refLayer = result.style.layers.find((l) => l.id === 'esri-reference-layer');
        expect(refLayer).toBeDefined();
        expect(refLayer.layout.visibility).toBe('none');

        const imageryLayer = result.style.layers.find((l) => l.id === 'esri-imagery-layer');
        expect(imageryLayer).toBeDefined();
        expect(imageryLayer.layout.visibility).toBe('visible');
    });

    test('ensures every layer ID in the generated style is unique (no duplicates)', () => {
        const result = createOperationalMapStyle({
            includeStreet: true,
            include3DLabels: true,
            pmtilesUrl: 'https://maps.example.gov/sibuyan.pmtiles',
        });

        const layerIds = result.style.layers.map((l) => l.id);
        const uniqueLayerIds = new Set(layerIds);
        expect(layerIds.length).toBe(uniqueLayerIds.size);
    });

    test('separates street map provider from 3D vector label provider', () => {
        // Only 3D labels configured; street map remains on standard provider (fallback)
        const result3DOnly = createOperationalMapStyle({
            pmtilesUrl: '',
            labels3DPmtilesUrl: 'https://maps.example.gov/labels.pmtiles',
            includeStreet: true,
            include3DLabels: true,
        });

        expect(result3DOnly.hasSelfHostedStreetMap).toBe(false);
        expect(result3DOnly.primaryStreetLayerIds).toEqual([STREET_FALLBACK_LAYER_ID]);
        expect(result3DOnly.style.sources).not.toHaveProperty(PMTILES_SOURCE_ID);
        expect(result3DOnly.style.sources).toHaveProperty('sibuyan-3d-labels');
        expect(result3DOnly.hasVectorLabels).toBe(true);
        expect(result3DOnly.satelliteVectorLabelLayerIds.length).toBeGreaterThan(0);

        // Verify that 3D label layers use the dedicated 3D labels source
        const subplace3DLayer = result3DOnly.style.layers.find((l) => l.id === '3d-label-places_subplace');
        expect(subplace3DLayer).toBeDefined();
        expect(subplace3DLayer.source).toBe('sibuyan-3d-labels');

        // Verify that street mode has no 3D labels in its layer IDs
        result3DOnly.satelliteVectorLabelLayerIds.forEach((id) => {
            expect(result3DOnly.streetLayerIds).not.toContain(id);
        });

        // Only street map configured; 3D labels not configured
        const resultStreetOnly = createOperationalMapStyle({
            pmtilesUrl: 'https://maps.example.gov/streets.pmtiles',
            labels3DPmtilesUrl: '',
            includeStreet: true,
            include3DLabels: true,
        });

        expect(resultStreetOnly.hasSelfHostedStreetMap).toBe(true);
        expect(resultStreetOnly.style.sources).toHaveProperty(PMTILES_SOURCE_ID);
        expect(resultStreetOnly.style.sources).not.toHaveProperty('sibuyan-3d-labels');
        expect(resultStreetOnly.hasVectorLabels).toBe(false);
        expect(resultStreetOnly.satelliteVectorLabelLayerIds).toEqual([]);
        const refLayer = resultStreetOnly.style.layers.find((l) => l.id === 'esri-reference-layer');
        expect(refLayer.layout.visibility).toBe('visible');
    });

    test('isolates failures: failed 3D labels archive does not break street map', async () => {
        const bytes = createPmtilesHeader();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Mock fetch so labels URL returns 500 while street URL is empty
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
            if (url.includes('labels-fail.pmtiles')) {
                return createRangeResponse(bytes, 500);
            }
            return createRangeResponse(bytes, 206);
        }));

        try {
            const provider = await prepareOperationalMapStyle({
                pmtilesUrl: '',
                labels3DPmtilesUrl: 'https://maps.example.gov/labels-fail.pmtiles',
            });

            // Street map continues working normally
            expect(provider.pmtilesError).toBeNull();
            expect(provider.primaryStreetLayerIds).toEqual([STREET_FALLBACK_LAYER_ID]);
            // 3D labels failed and fell back gracefully to raster reference
            expect(provider.labels3DError).toMatch(/206 Partial Content/i);
            expect(provider.hasVectorLabels).toBe(false);
            const refLayer = provider.style.layers.find((l) => l.id === 'esri-reference-layer');
            expect(refLayer.layout.visibility).toBe('visible');
        } finally {
            warnSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    test('isolates failures: failed street archive does not break 3D vector labels', async () => {
        const bytes = createPmtilesHeader();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
            if (url.includes('streets-fail.pmtiles')) {
                return createRangeResponse(bytes, 500);
            }
            return createRangeResponse(bytes, 206);
        }));

        try {
            const provider = await prepareOperationalMapStyle({
                pmtilesUrl: 'https://maps.example.gov/streets-fail.pmtiles',
                labels3DPmtilesUrl: 'https://maps.example.gov/labels-ok.pmtiles',
            });

            // Street map fell back to fallback layer
            expect(provider.pmtilesError).toMatch(/206 Partial Content/i);
            expect(provider.primaryStreetLayerIds).toEqual([STREET_FALLBACK_LAYER_ID]);
            // 3D vector labels succeeded and are active
            expect(provider.labels3DError).toBeNull();
            expect(provider.hasVectorLabels).toBe(true);
            const refLayer = provider.style.layers.find((l) => l.id === 'esri-reference-layer');
            expect(refLayer.layout.visibility).toBe('none');
        } finally {
            warnSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });
});

