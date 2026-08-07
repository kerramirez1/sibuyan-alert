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
});
