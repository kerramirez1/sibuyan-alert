import { SIBUYAN_BARANGAY_PSGC_CODES } from '../config/sibuyanLocations.js';
import {
    buildSibuyanBoundaryDocuments,
    getExpectedSibuyanBoundaryCount,
} from '../utils/sibuyanBoundaryDataset.js';

const detailedPolygon = (offset) => {
    const centerLng = 122.5 + offset;
    const centerLat = 12.3;
    const ring = Array.from({ length: 24 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2;
        return [centerLng + (Math.cos(angle) * 0.001), centerLat + (Math.sin(angle) * 0.001)];
    });
    ring.push(ring[0]);
    return {
        type: 'Polygon',
        coordinates: [ring],
    };
};

const makeFeatureCollection = () => {
    let offset = 0;
    const features = Object.entries(SIBUYAN_BARANGAY_PSGC_CODES).flatMap(([municipality, barangays]) => (
        Object.entries(barangays).map(([name, psgcCode]) => ({
            type: 'Feature',
            properties: { psgc_10d: psgcCode, city_name: municipality, brgy_name: name },
            geometry: detailedPolygon((offset += 0.003)),
        }))
    ));
    return { type: 'FeatureCollection', features };
};

describe('Sibuyan boundary dataset import validation', () => {
    test('keeps exactly the official 35 PSGC boundary records', () => {
        const documents = buildSibuyanBoundaryDocuments(makeFeatureCollection());
        expect(documents).toHaveLength(getExpectedSibuyanBoundaryCount());
        expect(documents).toContainEqual(expect.objectContaining({
            name: 'Gutivan', psgcCode: '1705903007', municipalityName: 'Cajidiocan',
        }));
    });

    test('rejects a feature with a municipality that does not match its PSGC code', () => {
        const data = makeFeatureCollection();
        data.features[0].properties.city_name = 'Magdiwang';
        expect(() => buildSibuyanBoundaryDocuments(data)).toThrow(/Municipality mismatch/);
    });

    test('rejects a boundary that is too simplified for road-level matching', () => {
        const data = makeFeatureCollection();
        data.features[0].geometry = {
            type: 'Polygon',
            coordinates: [[[122.5, 12.3], [122.51, 12.3], [122.5, 12.31], [122.5, 12.3]]],
        };
        expect(() => buildSibuyanBoundaryDocuments(data)).toThrow(/overly simplified/);
    });
});
