import { describe, expect, test } from 'vitest';
import {
    buildHazardColorExpression,
    describeHazards,
    getHazardColor,
    hazardFillLayerId,
    hazardOutlineLayerId,
    hazardSourceId,
    isRenderableHazardType,
    summarizeHazards,
} from '../config/hazardAreas';

const result = (overrides = {}) => ({
    datasetId: 'landslide',
    hazardType: 'landslide',
    hazardClass: 3,
    hazardLabel: 'High',
    classDescription: null,
    suggestedZoneType: null,
    source: 'DOST Project NOAH / PHIVOLCS',
    ...overrides,
});

describe('hazard layer ids', () => {
    test('are derived from the dataset id so layers cannot collide', () => {
        expect(hazardSourceId('landslide')).toBe('hazard-landslide');
        expect(hazardFillLayerId('landslide')).toBe('hazard-landslide-fill');
        expect(hazardOutlineLayerId('landslide')).toBe('hazard-landslide-outline');
    });
});

describe('hazard colours', () => {
    test('distinguishes classes within a type', () => {
        expect(getHazardColor('landslide', 3)).not.toBe(getHazardColor('landslide', 2));
    });

    test('falls back rather than throwing on an unknown type or class', () => {
        expect(getHazardColor('unknown_type', 3)).toBeTruthy();
        expect(getHazardColor('landslide', 99)).toBeTruthy();
        expect(getHazardColor('landslide', null)).toBeTruthy();
    });

    test('reports a renderable type only when it has a colour rule', () => {
        expect(isRenderableHazardType('landslide')).toBe(true);
        // Storm surge is unregistered. A type with no rule must not render, or
        // every polygon would take the grey fallback as though it were a class.
        expect(isRenderableHazardType('storm_surge')).toBe(false);
        expect(isRenderableHazardType(undefined)).toBe(false);
        expect(isRenderableHazardType('')).toBe(false);
    });

    test('builds a match expression covering every class plus a fallback', () => {
        const expression = buildHazardColorExpression('landslide', [
            { value: 2 }, { value: 3 },
        ]);

        expect(expression[0]).toBe('match');
        expect(expression[1]).toEqual(['get', 'haz']);
        expect(expression).toContain(2);
        expect(expression).toContain(3);
        // Match expressions must end with a default or MapLibre throws at render.
        expect(typeof expression[expression.length - 1]).toBe('string');
    });
});

describe('hazard description', () => {
    test('reports a high reading with its colour and label', () => {
        const described = describeHazards({ available: true, reason: 'in_hazard', results: [result()] });

        expect(described.known).toBe(true);
        expect(described.results).toHaveLength(1);
        expect(described.results[0]).toMatchObject({ hazardClass: 3, label: 'High', hazardType: 'landslide' });
        expect(described.results[0].color).toBeTruthy();
    });

    test('treats an explicit null class as no class, not as class zero', () => {
        // Regression guard: `Number(null)` is 0 and `Number.isFinite(0)` is true,
        // so a naive numeric coercion turned a verified-clear result into hazard
        // class 0, which then rendered as a medium hazard.
        const described = describeHazards({
            available: true,
            reason: 'in_hazard',
            results: [result({ hazardClass: null, hazardLabel: null })],
        });

        expect(described.results[0].hazardClass).toBeNull();
    });

    test('ignores a non-numeric class rather than inventing one', () => {
        const described = describeHazards({
            available: true,
            results: [result({ hazardClass: 'high' })],
        });

        expect(described.results[0].hazardClass).toBeNull();
    });

    test('keeps an unavailable lookup unknown rather than clear', () => {
        for (const reason of ['dataset_missing', 'lookup_failed', 'outside_sibuyan_bounds']) {
            const described = describeHazards({ available: false, reason, results: [] });
            expect(described).toMatchObject({ known: false, reason });
            expect(described.results).toEqual([]);
        }
    });

    test('treats a missing payload as unknown', () => {
        expect(describeHazards(undefined).known).toBe(false);
        expect(describeHazards(null).known).toBe(false);
    });

    test('reports an available-but-empty result as known and clear', () => {
        const described = describeHazards({ available: true, reason: 'clear', results: [] });

        expect(described).toMatchObject({ known: true, reason: 'clear' });
        expect(described.suggestion).toBeNull();
    });

    test('picks the first suggestion in server order, deterministically', () => {
        const described = describeHazards({
            available: true,
            results: [
                result({ datasetId: 'landslide', suggestedZoneType: 'landslide_prone' }),
                result({ datasetId: 'second_layer', hazardType: 'other', suggestedZoneType: 'flood_prone' }),
            ],
        });

        expect(described.suggestion).toEqual({ zoneType: 'landslide_prone', datasetId: 'landslide' });
    });

    test('exposes no suggestion when no layer carries a zone type', () => {
        const described = describeHazards({ available: true, results: [result()] });
        expect(described.suggestion).toBeNull();
    });

    test('summarizes multiple hazards on one line', () => {
        const described = describeHazards({
            available: true,
            results: [
                result(),
                result({ datasetId: 'second_layer', hazardType: 'other_hazard', hazardClass: 2, hazardLabel: 'Medium' }),
            ],
        });

        expect(summarizeHazards(described)).toBe('Hazard: High landslide, Medium other hazard');
    });

    test('summarizes the unknown and clear cases distinctly', () => {
        expect(summarizeHazards(describeHazards({ available: false, reason: 'dataset_missing' })))
            .toContain('could not be checked');
        expect(summarizeHazards(describeHazards({ available: true, reason: 'clear', results: [] })))
            .toContain('none mapped here');
        expect(summarizeHazards(null)).toBeNull();
    });
});
