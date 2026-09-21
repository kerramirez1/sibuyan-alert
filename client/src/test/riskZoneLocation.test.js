import { describe, expect, test } from 'vitest';
import {
    applyRiskZoneLocationAutofill,
    buildRiskZoneLocationAutofill,
} from '../utils/riskZoneLocation';

const baseLocation = (overrides = {}) => ({
    coordinates: { lat: 12.391799, lng: 122.568231 },
    isWithinSibuyanBounds: true,
    barangayAssignment: 'matched',
    municipalityAssignment: 'matched',
    barangay: { name: 'Tampayan' },
    municipality: { name: 'Magdiwang' },
    displayAddress: 'Sibuyan Circumferential Road, Tampayan',
    ...overrides,
});

const hazardsPayload = (results, { available = true, reason = 'in_hazard' } = {}) => ({
    available,
    reason,
    results,
});

const landslideResult = (hazardClass, suggestedZoneType = null) => ({
    datasetId: 'landslide',
    hazardType: 'landslide',
    hazardClass,
    hazardLabel: hazardClass >= 3 ? 'High' : 'Medium',
    classDescription: null,
    suggestedZoneType,
    source: 'DOST Project NOAH / PHIVOLCS',
});

describe('risk-zone location autofill', () => {
    test('uses the polygon-matched barangay instead of a provider locality', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            providerAddress: 'Alibagon, Romblon, Philippines',
        }));

        expect(result.valid).toBe(true);
        expect(result.value).toMatchObject({
            coordinates: { lat: 12.391799, lng: 122.568231 },
            barangay: 'Tampayan',
            municipality: 'Magdiwang',
            name: 'Tampayan Risk Zone',
            description: 'Sibuyan Circumferential Road, Tampayan',
        });
    });

    test('rejects a point without a unique barangay boundary match', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            barangayAssignment: 'unmatched',
        }));

        expect(result.valid).toBe(false);
        expect(result.message).toContain('barangay boundaries');
    });

    test('rejects a point outside the island', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({ isWithinSibuyanBounds: false }));
        expect(result.valid).toBe(false);
        expect(result.message).toContain('inside Sibuyan Island');
    });

    test('replaces stale location labels every time a different pin is verified', () => {
        const firstPin = applyRiskZoneLocationAutofill(
            { name: '', description: '', municipality: '', type: 'accident_prone' },
            { name: 'Tampayan Risk Zone', description: 'Main Road, Tampayan', municipality: 'Magdiwang' }
        );
        const secondPin = applyRiskZoneLocationAutofill(firstPin, {
            name: 'Poblacion Risk Zone',
            description: 'Sibuyan Circumferential Road, Poblacion',
            municipality: 'Cajidiocan',
        });

        expect(secondPin).toEqual({
            name: 'Poblacion Risk Zone',
            description: 'Sibuyan Circumferential Road, Poblacion',
            municipality: 'Cajidiocan',
            type: 'accident_prone',
        });
    });
});

describe('hazard-aware autofill', () => {
    test('carries every hazard result through, not just the first', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            hazards: hazardsPayload([
                landslideResult(3, 'landslide_prone'),
                {
                    datasetId: 'second_layer',
                    hazardType: 'other_hazard',
                    hazardClass: 2,
                    hazardLabel: 'Medium',
                    suggestedZoneType: null,
                },
            ]),
        }));

        expect(result.value.hazards.results).toHaveLength(2);
        expect(result.value.hazards.results.map((r) => r.datasetId))
            .toEqual(['landslide', 'second_layer']);
    });

    test('suggests the zone type carried by the first suggesting layer', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            hazards: hazardsPayload([landslideResult(3, 'landslide_prone')]),
        }));

        expect(result.value.suggestedZoneType).toBe('landslide_prone');
        expect(result.value.hazards.suggestion).toEqual({
            zoneType: 'landslide_prone',
            datasetId: 'landslide',
        });
    });

    test('does not suggest when the hazard carries no zone type', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            hazards: hazardsPayload([landslideResult(2)]),
        }));

        expect(result.value.suggestedZoneType).toBeNull();
        expect(result.value.hazards.suggestion).toBeNull();
    });

    test('keeps an unchecked reading unknown instead of reporting it as clear', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            hazards: { available: false, reason: 'dataset_missing', results: [] },
        }));

        expect(result.value.hazards).toMatchObject({ known: false, reason: 'dataset_missing' });
        expect(result.value.hazardSummary).toContain('could not be checked');
        expect(result.value.suggestedZoneType).toBeNull();
    });

    test('treats a missing payload as unknown', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation());
        expect(result.value.hazards.known).toBe(false);
    });

    test('reports an available-but-empty result as clear', () => {
        const result = buildRiskZoneLocationAutofill(baseLocation({
            hazards: hazardsPayload([], { reason: 'clear' }),
        }));

        expect(result.value.hazards).toMatchObject({ known: true, reason: 'clear' });
        expect(result.value.hazards.results).toEqual([]);
        expect(result.value.hazardSummary).toContain('none mapped here');
    });

    test('adopts the suggested type only while the form is on its default', () => {
        const detected = {
            name: 'A', description: 'B', municipality: 'C', suggestedZoneType: 'landslide_prone',
        };

        expect(applyRiskZoneLocationAutofill({ type: 'accident_prone' }, detected).type)
            .toBe('landslide_prone');
        // An explicit choice by the administrator is never overwritten.
        expect(applyRiskZoneLocationAutofill({ type: 'flood_prone' }, detected).type)
            .toBe('flood_prone');
    });

    test('leaves the zone type untouched when no hazard was suggested', () => {
        const result = applyRiskZoneLocationAutofill(
            { type: 'flood_prone' },
            { name: 'A', description: 'B', municipality: 'C', suggestedZoneType: null }
        );

        expect(result.type).toBe('flood_prone');
    });
});
