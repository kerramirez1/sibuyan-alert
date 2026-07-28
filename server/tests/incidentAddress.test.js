import { buildIncidentAddressLabel } from '../utils/incidentAddress.js';

describe('incident address policy', () => {
    test('rejects a conflicting geocoder barangay and keeps the boundary match authoritative', () => {
        const label = buildIncidentAddressLabel({
            featureName: 'Cambajao',
            addressDetails: {
                village: 'Cambajao',
                municipality: 'Cajidiocan',
            },
            authoritativeBarangay: 'Cambijang',
            coordinates: { lat: 12.41, lng: 122.68 },
        });

        expect(label).toBe('Near Cambijang');
        expect(label).not.toContain('Cambajao');
    });

    test('uses a structured road while excluding a conflicting administrative label', () => {
        const label = buildIncidentAddressLabel({
            featureName: 'Cambajao',
            addressDetails: {
                road: 'Sibuyan Circumferential Road',
                village: 'Cambajao',
            },
            authoritativeBarangay: 'Cambijang',
        });

        expect(label).toBe('Sibuyan Circumferential Road, Cambijang');
    });

    test('preserves a real point of interest and the verified barangay', () => {
        const label = buildIncidentAddressLabel({
            featureName: 'Cambijang Elementary School',
            addressDetails: { road: 'Sibuyan Circumferential Road' },
            authoritativeBarangay: 'Cambijang',
        });

        expect(label).toBe('Cambijang Elementary School, Sibuyan Circumferential Road, Cambijang');
    });
});
