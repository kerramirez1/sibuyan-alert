import { describe, expect, test } from 'vitest';
import {
    buildRiskZoneFeatureCollection,
    createRiskZoneCircle,
    RISK_ZONE_COLORS,
} from '../utils/riskZoneVisualization';

describe('risk-zone visualization', () => {
    test('builds a closed, bounded extrusion polygon from a valid zone', () => {
        const collection = buildRiskZoneFeatureCollection([{
            _id: 'zone-1',
            name: 'Mountain Road',
            type: 'landslide_prone',
            severity: 'high',
            radius: 250,
            coordinates: { lat: 12.4176, lng: 122.5571 },
        }], { points: 20 });

        expect(collection.type).toBe('FeatureCollection');
        expect(collection.features).toHaveLength(1);
        expect(collection.features[0].properties).toMatchObject({
            zoneId: 'zone-1',
            color: RISK_ZONE_COLORS.landslide_prone,
            extrusionHeight: 120,
            radiusMeters: 250,
        });
        const ring = collection.features[0].geometry.coordinates[0];
        expect(ring).toHaveLength(21);
        expect(ring[0]).toEqual(ring.at(-1));
    });

    test('skips invalid coordinates and normalizes untrusted visual properties', () => {
        const collection = buildRiskZoneFeatureCollection([
            { coordinates: { lat: 'invalid', lng: 122.5 }, radius: 100 },
            {
                id: 'zone-2',
                type: 'unknown',
                severity: 'extreme',
                radius: 999_999,
                coordinates: { lat: 12.4, lng: 122.55 },
            },
        ]);

        expect(collection.features).toHaveLength(1);
        expect(collection.features[0].properties).toMatchObject({
            type: 'other',
            severity: 'low',
            radiusMeters: 5_000,
            extrusionHeight: 35,
        });
    });

    test('caps polygon complexity for mobile-safe rendering', () => {
        const coordinates = { lat: 12.4, lng: 122.55 };
        expect(createRiskZoneCircle(coordinates, 100, 2)).toHaveLength(17);
        expect(createRiskZoneCircle(coordinates, 100, 500)).toHaveLength(65);
        expect(createRiskZoneCircle({ lat: 120, lng: 122.55 }, 100, 32)).toBeNull();
    });
});
