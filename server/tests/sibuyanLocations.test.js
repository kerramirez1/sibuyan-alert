import {
    isValidSibuyanAddress,
    SIBUYAN_LOCATIONS,
    SIBUYAN_MUNICIPALITY_NAMES,
} from '../config/sibuyanLocations.js';

describe('official Sibuyan location reference', () => {
    test('contains the PSA municipality and barangay totals', () => {
        expect(SIBUYAN_MUNICIPALITY_NAMES).toEqual(['Cajidiocan', 'Magdiwang', 'San Fernando']);
        expect(SIBUYAN_LOCATIONS.Cajidiocan.barangays).toHaveLength(14);
        expect(SIBUYAN_LOCATIONS.Magdiwang.barangays).toHaveLength(9);
        expect(SIBUYAN_LOCATIONS['San Fernando'].barangays).toHaveLength(12);
    });

    test('accepts canonical municipality/barangay pairs and rejects stale or mismatched names', () => {
        expect(isValidSibuyanAddress('Cajidiocan', 'Gutivan')).toBe(true);
        expect(isValidSibuyanAddress('San Fernando', 'Panangcalan')).toBe(true);
        expect(isValidSibuyanAddress('Cajidiocan', 'Danao Norte')).toBe(false);
        expect(isValidSibuyanAddress('San Fernando', 'Butong')).toBe(false);
        expect(isValidSibuyanAddress('Magdiwang', 'Gutivan')).toBe(false);
    });
});
