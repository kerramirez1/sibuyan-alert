import { describe, expect, test } from 'vitest';
import { validateRiskZoneBoundaryResolution } from '../services/riskZoneJurisdictionService.js';

describe('risk-zone boundary jurisdiction validation', () => {
    test('accepts the canonical polygon match for the assigned municipality', () => {
        const result = validateRiskZoneBoundaryResolution({
            status: 'matched',
            barangay: {
                name: 'Poblacion',
                municipalityName: 'Cajidiocan',
                psgcCode: '175905010',
            },
        }, 'Cajidiocan');

        expect(result).toEqual({
            valid: true,
            value: {
                barangay: 'Poblacion',
                municipality: 'Cajidiocan',
                psgcCode: '175905010',
            },
        });
    });

    test('rejects a boundary match outside the administrator jurisdiction', () => {
        const result = validateRiskZoneBoundaryResolution({
            status: 'matched',
            barangay: { name: 'Poblacion', municipalityName: 'Magdiwang' },
        }, 'Cajidiocan');

        expect(result.valid).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.message).toContain('Magdiwang');
    });

    test('rejects ambiguous and unmatched points', () => {
        for (const status of ['ambiguous', 'unmatched']) {
            const result = validateRiskZoneBoundaryResolution({ status, barangay: null }, 'Cajidiocan');
            expect(result.valid).toBe(false);
            expect(result.statusCode).toBe(422);
        }
    });
});
