import { describe, expect, test } from 'vitest';
import {
    applyRiskZoneLocationAutofill,
    buildRiskZoneLocationAutofill,
} from '../utils/riskZoneLocation';

describe('risk-zone location autofill', () => {
    test('uses the polygon-matched barangay instead of a provider locality', () => {
        const result = buildRiskZoneLocationAutofill({
            coordinates: { lat: 12.368, lng: 122.683 },
            isWithinSibuyanBounds: true,
            barangayAssignment: 'matched',
            municipalityAssignment: 'matched',
            barangay: { name: 'Poblacion' },
            municipality: { name: 'Cajidiocan' },
            providerAddress: 'Alibagon, Romblon, Philippines',
            displayAddress: 'Sibuyan Circumferential Road, Poblacion',
        });

        expect(result).toEqual({
            valid: true,
            value: {
                coordinates: { lat: 12.368, lng: 122.683 },
                barangay: 'Poblacion',
                municipality: 'Cajidiocan',
                name: 'Poblacion Risk Zone',
                description: 'Sibuyan Circumferential Road, Poblacion',
            },
        });
    });

    test('rejects a point without a unique barangay boundary match', () => {
        const result = buildRiskZoneLocationAutofill({
            coordinates: { lat: 12.4, lng: 122.55 },
            isWithinSibuyanBounds: true,
            barangayAssignment: 'unmatched',
            municipalityAssignment: 'matched',
            municipality: { name: 'Cajidiocan' },
        });

        expect(result.valid).toBe(false);
        expect(result.message).toContain('barangay boundaries');
    });

    test('replaces stale location labels every time a different pin is verified', () => {
        const firstPin = applyRiskZoneLocationAutofill(
            { name: '', description: '', municipality: '', type: 'accident_prone' },
            {
                name: 'Poblacion Risk Zone',
                description: 'Main Road, Poblacion',
                municipality: 'Cajidiocan',
            }
        );
        const secondPin = applyRiskZoneLocationAutofill(firstPin, {
            name: 'Tampayan Risk Zone',
            description: 'Sibuyan Circumferential Road, Tampayan',
            municipality: 'Magdiwang',
        });

        expect(secondPin).toEqual({
            name: 'Tampayan Risk Zone',
            description: 'Sibuyan Circumferential Road, Tampayan',
            municipality: 'Magdiwang',
            type: 'accident_prone',
        });
    });
});
