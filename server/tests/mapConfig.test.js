import { describe, expect, test } from 'vitest';
import { getSibuyanBounds } from '../services/geocoding.js';

describe('operational map configuration', () => {
    test('does not advertise the incomplete maximum imagery level', () => {
        expect(getSibuyanBounds().maxZoom).toBe(16);
    });
});
