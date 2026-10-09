import { describe, expect, test } from 'vitest';
import {
    CATEGORY_TYPES,
    INCIDENT_TYPE_LABELS,
    INCIDENT_TYPE_OPTIONS,
    getIncidentTypeLabel,
    getIncidentTypeOptions,
    getReportIncidentTypeLabel,
} from '../config/incidentTypes';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';
// True server-config sync: this is the actual server module, not a copy.
import { INCIDENT_CATEGORIES as SERVER_CATEGORIES } from '../../../server/config/incidentCategories.js';

const EXPECTED_NEW_LABELS = {
    structural: 'Structural fire',
    vegetation: 'Forest/grass fire',
    vehicular_fire: 'Vehicle fire',
    other_fire: 'Other fire incident',
    fallen_tree: 'Fallen tree',
    fallen_post: 'Fallen post/pole',
    road_debris: 'Debris on road',
    landslide: 'Landslide/rockfall',
    other_hazard: 'Other road hazard',
};

describe('incident type labels — one source of truth', () => {
    test('labels every canonical type in every category', () => {
        for (const [category, types] of Object.entries(CATEGORY_TYPES)) {
            for (const type of types) {
                expect(INCIDENT_TYPE_LABELS[type], `missing label for "${category}/${type}"`).toBeTruthy();
            }
        }
    });

    test('new fire and hazard labels resolve', () => {
        for (const [type, label] of Object.entries(EXPECTED_NEW_LABELS)) {
            expect(getIncidentTypeLabel(type)).toBe(label);
        }
    });

    test('existing accident labels are byte-identical', () => {
        expect(getIncidentTypeLabel('pedestrian')).toBe('Hit and run / pedestrian');
        expect(getIncidentTypeLabel('vehicular')).toBe('Vehicular collision');
        expect(getIncidentTypeLabel('motorcycle')).toBe('Motorcycle accident');
        expect(getIncidentTypeLabel('bicycle')).toBe('Bicycle accident');
        expect(getIncidentTypeLabel('self_accident')).toBe('Self accident');
        expect(getIncidentTypeLabel('mechanical')).toBe('Mechanical failure');
        expect(getIncidentTypeLabel('other')).toBe('Other road incident');
    });

    test('per-category type lists stay in sync with the server config', () => {
        // The server list is the validation source of truth: if these drift,
        // the label a user selects stops matching what the server accepts.
        expect(CATEGORY_TYPES).toEqual(
            Object.fromEntries(
                Object.entries(SERVER_CATEGORIES).map(([category, config]) => [category, [...config.types]])
            )
        );
    });

    test('the form options for each category match the server config types', () => {
        for (const category of Object.keys(SERVER_CATEGORIES)) {
            const optionValues = getIncidentTypeOptions(category).map((option) => option.value);
            expect(optionValues, `options drift for "${category}"`).toEqual([...SERVER_CATEGORIES[category].types]);
            // The report form's category map uses the same per-category options.
            expect(INCIDENT_CATEGORIES[category].types.map((option) => option.value)).toEqual(optionValues);
        }
    });

    test('the label a user selects is the label they later see', () => {
        // "Hit and run / pedestrian" was the case that proved the mismatch:
        // the form said one thing and the display said "Pedestrian".
        expect(getIncidentTypeLabel('pedestrian')).toBe('Hit and run / pedestrian');
        expect(getIncidentTypeLabel('vehicular')).toBe('Vehicular collision');
        expect(getIncidentTypeLabel('mechanical')).toBe('Mechanical failure');
        expect(getIncidentTypeLabel('structural')).toBe('Structural fire');
        expect(getIncidentTypeLabel('fallen_tree')).toBe('Fallen tree');
    });

    test('unknown values fall back to a specific title-cased label, not a placeholder', () => {
        expect(getIncidentTypeLabel('legacy_rollover')).toBe('Legacy Rollover');
        expect(getIncidentTypeLabel('')).toBe('Unspecified incident');
        expect(getIncidentTypeLabel(null)).toBe('Unspecified incident');
    });

    test('unknown categories yield empty option lists without crashing', () => {
        expect(getIncidentTypeOptions('maritime')).toEqual([]);
        expect(getIncidentTypeOptions(null)).toEqual([]);
    });

    test('the report adapter reads both the modern and legacy type fields', () => {
        expect(getReportIncidentTypeLabel({ incidentType: 'motorcycle' })).toBe('Motorcycle accident');
        expect(getReportIncidentTypeLabel({ accidentType: 'bicycle' })).toBe('Bicycle accident');
        expect(getReportIncidentTypeLabel({ incidentType: 'vehicular', accidentType: 'bicycle' }))
            .toBe('Vehicular collision');
        expect(getReportIncidentTypeLabel({ incidentType: 'structural' })).toBe('Structural fire');
    });

    test('INCIDENT_TYPE_OPTIONS covers every labeled type', () => {
        expect(INCIDENT_TYPE_OPTIONS.map((option) => option.value).sort())
            .toEqual(Object.keys(INCIDENT_TYPE_LABELS).sort());
    });
});
