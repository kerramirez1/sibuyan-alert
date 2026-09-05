import { describe, expect, test } from 'vitest';
import { normalizeCasualtyCounts, toValidatedCount } from '../utils/casualtyCounts.js';

describe('casualty count sanitization', () => {
    test('toValidatedCount coerces everyday inputs to whole numbers', () => {
        expect(toValidatedCount(undefined)).toBe(0);
        expect(toValidatedCount(null)).toBe(0);
        expect(toValidatedCount('')).toBe(0);
        expect(toValidatedCount(0)).toBe(0);
        expect(toValidatedCount('3')).toBe(3);
        expect(toValidatedCount(2.9)).toBe(2);
    });

    test('toValidatedCount never leaks NaN or negatives into the database', () => {
        expect(toValidatedCount('abc')).toBe(0);
        expect(toValidatedCount(NaN)).toBe(0);
        expect(toValidatedCount(Infinity)).toBe(0);
        expect(toValidatedCount(-4)).toBe(0);
        expect(toValidatedCount('-2')).toBe(0);
    });

    test('normalizeCasualtyCounts accepts a complete valid correction', () => {
        expect(normalizeCasualtyCounts({ injured: 2, fatalities: 0, missing: 1 }))
            .toEqual({ injured: 2, fatalities: 0, missing: 1 });
    });

    test('normalizeCasualtyCounts fills omitted fields with 0', () => {
        expect(normalizeCasualtyCounts({ injured: 1 })).toEqual({ injured: 1, fatalities: 0, missing: 0 });
        expect(normalizeCasualtyCounts({})).toEqual({ injured: 0, fatalities: 0, missing: 0 });
    });

    test('normalizeCasualtyCounts accepts numeric strings and blanks', () => {
        expect(normalizeCasualtyCounts({ injured: '2', fatalities: '', missing: '  ' }))
            .toEqual({ injured: 2, fatalities: 0, missing: 0 });
    });

    test('normalizeCasualtyCounts rejects negatives, fractions, and garbage', () => {
        expect(normalizeCasualtyCounts({ injured: -1 })).toBeNull();
        expect(normalizeCasualtyCounts({ fatalities: 1.5 })).toBeNull();
        expect(normalizeCasualtyCounts({ missing: 'many' })).toBeNull();
        expect(normalizeCasualtyCounts({ injured: NaN })).toBeNull();
        expect(normalizeCasualtyCounts(null)).toBeNull();
        expect(normalizeCasualtyCounts('3')).toBeNull();
        expect(normalizeCasualtyCounts([1, 2])).toBeNull();
    });
});
