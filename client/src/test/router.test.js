import { describe, expect, test } from 'vitest';

import { normalizeInternalTarget } from '../router';

describe('router navigation target validation', () => {
    test('preserves internal paths with query strings and fragments', () => {
        expect(normalizeInternalTarget('/dashboard?view=map#incidents'))
            .toBe('/dashboard?view=map#incidents');
    });

    test.each([
        'https://example.com',
        '//example.com/path',
        '/safe\\redirect',
        'dashboard',
        '',
        null,
    ])('rejects ambiguous or external target %s', (target) => {
        expect(() => normalizeInternalTarget(target)).toThrow(TypeError);
    });
});
