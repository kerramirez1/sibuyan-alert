import { describe, expect, test } from 'vitest';
import {
    INCIDENT_TYPE_LABELS,
    INCIDENT_TYPE_OPTIONS,
    getIncidentTypeLabel,
    getReportIncidentTypeLabel,
} from '../config/incidentTypes';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';

// Mirrors the server canonical list (server/config/incidentCategories.js). If
// this list and the server drift, the label a user selects stops matching what
// the server accepts — this test is the tripwire for that.
const CANONICAL_TYPES = [
    'vehicular',
    'motorcycle',
    'pedestrian',
    'bicycle',
    'self_accident',
    'mechanical',
    'other',
];

describe('incident type labels — one source of truth', () => {
    test('labels every canonical type', () => {
        for (const type of CANONICAL_TYPES) {
            expect(INCIDENT_TYPE_LABELS[type], `missing label for "${type}"`).toBeTruthy();
        }
    });

    test('the form derives its options from the same map', () => {
        expect(INCIDENT_CATEGORIES.accident.types).toEqual(INCIDENT_TYPE_OPTIONS);
        expect(INCIDENT_TYPE_OPTIONS.map((option) => option.value)).toEqual(CANONICAL_TYPES);
    });

    test('the label a user selects is the label they later see', () => {
        // "Hit and run / pedestrian" was the case that proved the mismatch:
        // the form said one thing and the display said "Pedestrian".
        expect(getIncidentTypeLabel('pedestrian')).toBe('Hit and run / pedestrian');
        expect(getIncidentTypeLabel('vehicular')).toBe('Vehicular collision');
        expect(getIncidentTypeLabel('mechanical')).toBe('Mechanical failure');
    });

    test('unknown values fall back to a specific title-cased label, not a placeholder', () => {
        expect(getIncidentTypeLabel('legacy_rollover')).toBe('Legacy Rollover');
        expect(getIncidentTypeLabel('')).toBe('Unspecified incident');
        expect(getIncidentTypeLabel(null)).toBe('Unspecified incident');
    });

    test('the report adapter reads both the modern and legacy type fields', () => {
        expect(getReportIncidentTypeLabel({ incidentType: 'motorcycle' })).toBe('Motorcycle accident');
        expect(getReportIncidentTypeLabel({ accidentType: 'bicycle' })).toBe('Bicycle accident');
        expect(getReportIncidentTypeLabel({ incidentType: 'vehicular', accidentType: 'bicycle' }))
            .toBe('Vehicular collision');
    });
});
