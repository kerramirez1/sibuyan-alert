import { describe, expect, test } from 'vitest';
import { formatCleanAddress } from '../utils/incidentAddress';

describe('formatCleanAddress helper', () => {
    test('deduplicates repeated barangay and municipality tokens', () => {
        const address = formatCleanAddress({
            locationName: 'Sugod',
            barangay: 'Sugod',
            municipality: 'Cajidiocan',
        });
        expect(address).toBe('Sugod, Cajidiocan');
    });

    test('deduplicates case-insensitively and handles substring overlap', () => {
        const address = formatCleanAddress({
            locationName: 'Poblacion Coastal Road',
            barangay: 'Poblacion',
            municipality: 'San Fernando',
        });
        expect(address).toBe('Poblacion Coastal Road, San Fernando');
    });

    test('returns default fallback when all fields are empty or null', () => {
        expect(formatCleanAddress({})).toBe('Sibuyan Island, Romblon');
        expect(formatCleanAddress(null)).toBe('Sibuyan Island, Romblon');
        expect(formatCleanAddress(undefined)).toBe('Sibuyan Island, Romblon');
    });

    test('supports municipalityName and address field aliases', () => {
        const address = formatCleanAddress({
            address: 'Crossing Mabini',
            barangay: 'Mabini',
            municipalityName: 'Magdiwang',
        });
        expect(address).toBe('Crossing Mabini, Magdiwang');
    });
});
