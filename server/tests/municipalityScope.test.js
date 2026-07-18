import { describe, expect, test } from '@jest/globals';
import { canViewAllMunicipalities } from '../utils/municipalityScope.js';

describe('municipality visibility policy', () => {
    test('allows only system administrators to request island-wide data', () => {
        expect(canViewAllMunicipalities({ role: 'admin' })).toBe(true);
        expect(canViewAllMunicipalities({ role: 'municipal_admin' })).toBe(false);
        expect(canViewAllMunicipalities({ role: 'responder' })).toBe(false);
        expect(canViewAllMunicipalities(null)).toBe(false);
    });
});
