import { describe, expect, test } from 'vitest';
import {
    buildHazardAreaDocuments,
    countDatasetPolygons,
    countRingPositions,
} from '../utils/hazardDataset.js';
import { HAZARD_DATASETS, getHazardDataset, getZoneTypeSuggestion } from '../config/hazardDatasets.js';

/** A ring centred on a point inside the island extent. */
const ringAround = (lng, lat, radius = 0.002, points = 12) => {
    const ring = Array.from({ length: points }, (_, index) => {
        const angle = (index / points) * Math.PI * 2;
        return [lng + Math.cos(angle) * radius, lat + Math.sin(angle) * radius];
    });
    ring.push(ring[0]);
    return ring;
};

const polygonFeature = (haz, lng = 122.55, lat = 12.40) => ({
    type: 'Feature',
    properties: { haz },
    geometry: { type: 'Polygon', coordinates: [ringAround(lng, lat)] },
});

/** Builds a valid collection for whichever classes a dataset declares. */
const validCollection = (dataset) => ({
    type: 'FeatureCollection',
    features: dataset.classes.map((haz, index) => polygonFeature(haz, 122.5 + (index * 0.01), 12.4)),
});

describe('hazard dataset registry', () => {
    test('registers the landslide layer for Sibuyan and no storm surge', () => {
        expect(Object.keys(HAZARD_DATASETS)).toEqual(['landslide']);
        // Storm surge was removed from the registry entirely; a dataset that is
        // not registered is not importable, drawable, or resolvable.
        expect(Object.keys(HAZARD_DATASETS).some((id) => id.startsWith('storm_surge'))).toBe(false);
    });

    test('every dataset declares the metadata the API and licence require', () => {
        for (const dataset of Object.values(HAZARD_DATASETS)) {
            expect(dataset).toMatchObject({
                id: expect.any(String),
                hazardType: expect.any(String),
                label: expect.any(String),
                file: expect.any(String),
                licence: 'ODC-ODbL',
                attribution: expect.any(String),
                sourceUrl: expect.any(String),
            });
            expect(dataset.classes.length).toBeGreaterThan(0);
            // Every declared class needs a label, or the legend would show a
            // bare number where a hazard name belongs.
            for (const hazardClass of dataset.classes) {
                expect(dataset.classLabels[hazardClass]).toEqual(expect.any(String));
            }
        }
    });

    test('gives each dataset its own file so layers cannot overwrite each other', () => {
        const files = Object.values(HAZARD_DATASETS).map((dataset) => dataset.file);
        expect(new Set(files).size).toBe(files.length);
    });

    test('returns null for an unknown dataset rather than throwing', () => {
        expect(getHazardDataset('nope')).toBeNull();
    });

    test('maps a class to a zone type only where the dataset says so', () => {
        expect(getZoneTypeSuggestion('landslide', 3)).toBe('landslide_prone');
        expect(getZoneTypeSuggestion('landslide', 2)).toBeNull();
        // Storm surge is unregistered, so it can no longer suggest a flood-prone
        // zone at any class.
        expect(getZoneTypeSuggestion('storm_surge_ssa4', 3)).toBeNull();
        expect(getZoneTypeSuggestion('nope', 3)).toBeNull();
    });
});

describe('hazard dataset validation', () => {
    test('builds one document per declared class, tagged with its dataset', () => {
        const dataset = getHazardDataset('landslide');
        const documents = buildHazardAreaDocuments(validCollection(dataset), dataset);

        expect(documents).toHaveLength(dataset.classes.length);
        expect(documents.map((document) => document.hazardClass).sort()).toEqual([2, 3]);
        expect(documents.every((document) => document.datasetId === 'landslide')).toBe(true);
        expect(documents.every((document) => document.hazardType === 'landslide')).toBe(true);
        expect(documents).toContainEqual(expect.objectContaining({
            hazardClass: 3, hazardLabel: 'High', isActive: true,
        }));
    });

    test('keeps the dataset own class labels rather than a shared vocabulary', () => {
        const dataset = getHazardDataset('landslide');
        const documents = buildHazardAreaDocuments(validCollection(dataset), dataset);

        expect(documents.map((document) => document.hazardClass).sort()).toEqual([2, 3]);
        expect(documents.every((document) => document.datasetId === 'landslide')).toBe(true);
        expect(documents.find((document) => document.hazardClass === 3).hazardLabel).toBe('High');
    });

    test('rejects a dataset missing one of its declared classes', () => {
        const dataset = getHazardDataset('landslide');
        const data = validCollection(dataset);
        data.features = data.features.filter((feature) => feature.properties.haz !== 3);

        expect(() => buildHazardAreaDocuments(data, dataset)).toThrow(/missing class/i);
    });

    test('rejects a class the dataset does not declare', () => {
        const dataset = getHazardDataset('landslide');
        const data = validCollection(dataset);
        // Landslide declares only classes 2 and 3, so a class-1 polygon is invalid.
        data.features.push(polygonFeature(1, 122.58, 12.42));

        expect(() => buildHazardAreaDocuments(data, dataset)).toThrow(/Unexpected hazard class 1/);
    });

    test('rejects a duplicated class', () => {
        const dataset = getHazardDataset('landslide');
        const data = validCollection(dataset);
        data.features.push(polygonFeature(2, 122.60, 12.44));

        expect(() => buildHazardAreaDocuments(data, dataset)).toThrow(/Duplicate hazard class 2/);
    });

    test('rejects geometry that escapes the Sibuyan bounding box', () => {
        const dataset = getHazardDataset('landslide');
        const data = validCollection(dataset);
        data.features[0] = polygonFeature(2, 122.90, 12.40);

        expect(() => buildHazardAreaDocuments(data, dataset)).toThrow(/outside the Sibuyan bounding box/);
    });

    test('rejects a degenerate ring rather than importing a patch that renders as nothing', () => {
        const dataset = getHazardDataset('landslide');
        const data = validCollection(dataset);
        data.features[0] = {
            type: 'Feature',
            properties: { haz: 2 },
            geometry: { type: 'Polygon', coordinates: [[[122.55, 12.40], [122.551, 12.40], [122.55, 12.40]]] },
        };

        expect(() => buildHazardAreaDocuments(data, dataset)).toThrow(/empty or degenerate/);
    });

    test('names the offending dataset in the error', () => {
        const dataset = getHazardDataset('landslide');
        expect(() => buildHazardAreaDocuments({ type: 'Feature' }, dataset))
            .toThrow(/\[landslide\]/);
    });

    test('rejects a payload that is not a FeatureCollection', () => {
        const dataset = getHazardDataset('landslide');
        expect(() => buildHazardAreaDocuments(null, dataset)).toThrow(/FeatureCollection/);
        expect(() => buildHazardAreaDocuments({ type: 'Feature' }, dataset)).toThrow(/FeatureCollection/);
    });

    test('rejects an empty feature list', () => {
        const dataset = getHazardDataset('landslide');
        expect(() => buildHazardAreaDocuments({ type: 'FeatureCollection', features: [] }, dataset))
            .toThrow(/no features/);
    });

    test('requires a dataset descriptor before validating anything', () => {
        expect(() => buildHazardAreaDocuments(validCollection(getHazardDataset('landslide')), null))
            .toThrow(/descriptor/);
        expect(() => buildHazardAreaDocuments(validCollection(getHazardDataset('landslide')), { id: 'x', classes: [] }))
            .toThrow(/at least one class/);
    });
});

describe('hazard dataset geometry helpers', () => {
    test('counts positions through nested Polygon and MultiPolygon rings', () => {
        expect(countRingPositions([[[122.5, 12.4], [122.51, 12.4], [122.5, 12.41]]])).toBe(3);
        expect(countRingPositions([
            [[[122.5, 12.4], [122.51, 12.4], [122.5, 12.41]]],
            [[[122.6, 12.4], [122.61, 12.4], [122.6, 12.41]]],
        ])).toBe(6);
        expect(countRingPositions(null)).toBe(0);
    });

    test('counts polygons rather than features, so the log line is meaningful', () => {
        const dataset = getHazardDataset('landslide');
        expect(countDatasetPolygons(validCollection(dataset))).toBe(2);
        expect(countDatasetPolygons(null)).toBe(0);
    });
});
