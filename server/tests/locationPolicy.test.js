import {
    findOfficialBarangay,
    parseLocationCapture,
    resolveMunicipalityByBounds,
} from '../utils/locationPolicy.js';

describe('location policy', () => {
    const municipalities = [
        { name: 'Cajidiocan', bounds: { minLat: 12.35, maxLat: 12.45, minLng: 122.60, maxLng: 122.75 } },
        { name: 'Magdiwang', bounds: { minLat: 12.42, maxLat: 12.55, minLng: 122.45, maxLng: 122.60 } },
    ];

    test('uses the official barangay reference and normalizes harmless punctuation', () => {
        expect(findOfficialBarangay('jao asan')).toEqual({ municipality: 'Magdiwang', name: 'Jao-asan' });
        expect(findOfficialBarangay('not a barangay')).toBeNull();
    });

    test('does not silently route unmatched or overlapping coverage', () => {
        expect(resolveMunicipalityByBounds(12.4, 122.65, municipalities)).toMatchObject({ status: 'matched', municipality: { name: 'Cajidiocan' } });
        expect(resolveMunicipalityByBounds(12.43, 122.60, municipalities).status).toBe('ambiguous');
        expect(resolveMunicipalityByBounds(12.31, 122.50, municipalities).status).toBe('unassigned');
    });

    test('requires usable accuracy for GPS while preserving legacy reports', () => {
        expect(parseLocationCapture({ locationSource: 'gps', locationAccuracy: 101 }).valid).toBe(false);
        expect(parseLocationCapture({ locationSource: 'gps', locationAccuracy: 25 }).value.source).toBe('gps');
        expect(parseLocationCapture({}).value.source).toBe('legacy');
    });
});
