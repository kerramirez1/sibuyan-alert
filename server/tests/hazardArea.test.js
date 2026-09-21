import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    countDocuments: vi.fn(),
    find: vi.fn(),
}));

vi.mock('../models/HazardArea.js', () => ({
    default: {
        countDocuments: mocks.countDocuments,
        find: mocks.find,
    },
}));

import {
    describeHazardsAt,
    getActiveHazardAreaCount,
    getHazardLayer,
    getHazardLayerCatalog,
    resetHazardAreaCaches,
    resolveHazardsForCoordinates,
} from '../services/hazardAreaService.js';
import { HAZARD_DATASET_IDS, SIBUYAN_HAZARD_EXTENT } from '../config/hazardDatasets.js';

/** Mirrors the `find().select().lean()` chain the service actually uses. */
const queryResult = (rows) => ({
    select: () => ({ lean: () => Promise.resolve(rows) }),
});

const DATA_DIR = path.resolve(process.cwd(), 'data');

beforeEach(() => {
    vi.clearAllMocks();
    // The count and layers are memoised for the process lifetime, so each case
    // has to start from an empty cache or it would assert the previous case.
    resetHazardAreaCaches();
});

describe('hazard point resolution', () => {
    test('rejects a coordinate pair that is not numeric', async () => {
        const result = await resolveHazardsForCoordinates('north', undefined);

        expect(result).toEqual({ status: 'invalid_coordinates', hazards: [] });
        expect(mocks.countDocuments).not.toHaveBeenCalled();
    });

    test('reports a missing dataset instead of implying the point is safe', async () => {
        mocks.countDocuments.mockResolvedValue(0);

        const result = await resolveHazardsForCoordinates(12.39, 122.56);

        expect(result).toEqual({ status: 'dataset_missing', hazards: [] });
        expect(mocks.find).not.toHaveBeenCalled();
    });

    test('reports clear when the point falls in no polygon', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([]));

        const result = await resolveHazardsForCoordinates(12.35, 122.50);

        expect(result).toEqual({ status: 'clear', hazards: [] });
    });

    test('returns one result per dataset, not one per matching document', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([
            { datasetId: 'landslide', hazardType: 'landslide', hazardClass: 2, hazardLabel: 'Medium' },
            { datasetId: 'landslide', hazardType: 'landslide', hazardClass: 3, hazardLabel: 'High' },
        ]));

        const result = await resolveHazardsForCoordinates(12.39, 122.56);

        expect(result.status).toBe('in_hazard');
        // Within a dataset the highest class wins rather than one row per match.
        expect(result.hazards).toHaveLength(1);
        expect(result.hazards[0].datasetId).toBe('landslide');
        expect(result.hazards[0].hazardClass).toBe(3);
    });

    test('scopes the query to the registry by default, so unregistered rows cannot leak', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([]));

        await resolveHazardsForCoordinates(12.39, 122.56);

        // A dataset that was removed from the registry must never be returned by
        // a point lookup, even if its documents are still in the collection.
        expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({
            datasetId: { $in: HAZARD_DATASET_IDS },
        }));
    });

    test('carries the zone-type suggestion the registry declares', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([
            { datasetId: 'landslide', hazardType: 'landslide', hazardClass: 3, hazardLabel: 'High' },
        ]));

        const result = await resolveHazardsForCoordinates(12.39, 122.56);

        expect(result.hazards[0].suggestedZoneType).toBe('landslide_prone');
    });

    test('restricts the query when dataset ids are supplied', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([]));

        await resolveHazardsForCoordinates(12.39, 122.56, { datasetIds: ['landslide'] });

        expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({
            datasetId: { $in: ['landslide'] },
        }));
    });

    test('caches the area count so repeated pins do not re-count the collection', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([]));

        await getActiveHazardAreaCount();
        await getActiveHazardAreaCount();

        expect(mocks.countDocuments).toHaveBeenCalledTimes(1);
        // The count is scoped to the registry, so a collection holding only an
        // unregistered dataset cannot report the layers as present.
        expect(mocks.countDocuments).toHaveBeenCalledWith({
            isActive: true,
            datasetId: { $in: HAZARD_DATASET_IDS },
        });
    });
});

describe('hazard API description', () => {
    test('marks a reading as available with its label and attribution', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([
            { datasetId: 'landslide', hazardType: 'landslide', hazardClass: 3, hazardLabel: 'High' },
        ]));

        const described = await describeHazardsAt(12.39, 122.56);

        expect(described).toMatchObject({ available: true, reason: 'in_hazard' });
        expect(described.results[0]).toMatchObject({
            datasetId: 'landslide',
            hazardClass: 3,
            hazardLabel: 'High',
            licence: 'ODC-ODbL',
        });
        expect(described.results[0].source).toContain('NOAH');
        expect(described.results[0].classDescription).toBe('No dwelling zone');
    });

    test('marks a clear point as available with no results', async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.find.mockReturnValue(queryResult([]));

        const described = await describeHazardsAt(12.35, 122.50);

        expect(described).toEqual({ available: true, reason: 'clear', results: [] });
    });

    test('reports an unchecked point as unavailable rather than safe', async () => {
        mocks.countDocuments.mockResolvedValue(0);

        const described = await describeHazardsAt(12.35, 122.50);

        expect(described).toEqual({ available: false, reason: 'dataset_missing', results: [] });
    });

    test('never throws when the lookup itself fails', async () => {
        mocks.countDocuments.mockRejectedValue(new Error('connection reset'));

        const described = await describeHazardsAt(12.35, 122.50);

        expect(described).toEqual({ available: false, reason: 'lookup_failed', results: [] });
    });
});

describe('hazard layer payloads', () => {
    test('reads the shipped landslide dataset and exposes its classes', () => {
        const layer = getHazardLayer('landslide');

        expect(layer.payload).toMatchObject({
            type: 'FeatureCollection',
            datasetId: 'landslide',
            hazardType: 'landslide',
            licence: 'ODC-ODbL',
        });
        expect(layer.payload.features).toHaveLength(2);
        expect(layer.payload.classes.map((entry) => entry.value)).toEqual([2, 3]);
        expect(layer.payload.attribution).toContain('NOAH');
        expect(layer.etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
        expect(layer.byteLength).toBeGreaterThan(0);
    });

    test('memoises the parsed payload for the same dataset', () => {
        expect(getHazardLayer('landslide')).toBe(getHazardLayer('landslide'));
    });

    test('rejects an unknown dataset instead of reading a wrong file', () => {
        expect(() => getHazardLayer('not_a_dataset')).toThrow(/Unknown hazard dataset/);
        try {
            getHazardLayer('not_a_dataset');
        } catch (error) {
            expect(error.code).toBe('UNKNOWN_DATASET');
        }
    });

    test('surfaces a missing file as ENOENT so the route can return a 503', () => {
        const previous = process.env.SIBUYAN_HAZARD_DATA_DIR;
        process.env.SIBUYAN_HAZARD_DATA_DIR = path.join(DATA_DIR, 'does-not-exist');
        resetHazardAreaCaches();
        try {
            expect(() => getHazardLayer('landslide')).toThrow();
        } finally {
            if (previous === undefined) delete process.env.SIBUYAN_HAZARD_DATA_DIR;
            else process.env.SIBUYAN_HAZARD_DATA_DIR = previous;
            resetHazardAreaCaches();
        }
    });

    test('catalogs every registered dataset that is built', () => {
        const catalog = getHazardLayerCatalog();

        expect(catalog.payloads).toHaveLength(HAZARD_DATASET_IDS.length);
        expect(catalog.missing).toEqual([]);
        expect(catalog.payloads.map((payload) => payload.datasetId)).toEqual([...HAZARD_DATASET_IDS]);
        expect(catalog.etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
        expect(catalog.byteLength).toBeGreaterThan(0);
    });

    test('every shipped layer carries only the classes it declares', () => {
        for (const datasetId of HAZARD_DATASET_IDS) {
            const layer = getHazardLayer(datasetId);
            const declared = layer.payload.classes.map((entry) => entry.value).sort();
            const present = [...new Set(layer.payload.features.map((f) => f.properties.haz))].sort();

            expect(present).toEqual(declared);
        }
    });

    test('every shipped layer stays inside the island extent', () => {
        for (const datasetId of HAZARD_DATASET_IDS) {
            const layer = getHazardLayer(datasetId);
            const lngs = [];
            const lats = [];
            for (const feature of layer.payload.features) {
                for (const polygon of feature.geometry.coordinates) {
                    for (const ring of polygon) {
                        for (const [lng, lat] of ring) {
                            lngs.push(lng);
                            lats.push(lat);
                        }
                    }
                }
            }
            expect(Math.min(...lngs)).toBeGreaterThanOrEqual(SIBUYAN_HAZARD_EXTENT.minLng);
            expect(Math.max(...lngs)).toBeLessThanOrEqual(SIBUYAN_HAZARD_EXTENT.maxLng);
            expect(Math.min(...lats)).toBeGreaterThanOrEqual(SIBUYAN_HAZARD_EXTENT.minLat);
            expect(Math.max(...lats)).toBeLessThanOrEqual(SIBUYAN_HAZARD_EXTENT.maxLat);
        }
    });

    test('landslide coverage reaches the island west and south margins', () => {
        // Regression: the layer used to be clipped to the operational report box
        // (122.45 / 12.30), which left the island's western and southern margins
        // with no hazard at all. Reaching past those lines is the fix.
        const layer = getHazardLayer('landslide');
        let minLng = Infinity;
        let minLat = Infinity;
        for (const feature of layer.payload.features) {
            for (const polygon of feature.geometry.coordinates) {
                for (const ring of polygon) {
                    for (const [lng, lat] of ring) {
                        if (lng < minLng) minLng = lng;
                        if (lat < minLat) minLat = lat;
                    }
                }
            }
        }
        expect(minLng).toBeLessThan(122.45);
        expect(minLat).toBeLessThan(12.30);
    });
});
