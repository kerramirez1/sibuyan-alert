import { describe, expect, test } from 'vitest';
import {
    buildRiskZoneMapTarget,
    findRiskZoneById,
    normalizeRiskZoneId,
} from '../utils/riskZoneNavigation';

describe('risk-zone map navigation', () => {
    test('builds an encoded map target from the zone identifier', () => {
        expect(buildRiskZoneMapTarget({ _id: 'zone/one' })).toBe(
            '/dashboard?view=map&riskZone=zone%2Fone',
        );
    });

    test('falls back to the normal map when no usable identifier exists', () => {
        expect(buildRiskZoneMapTarget({ name: 'Unidentified zone' })).toBe('/dashboard?view=map');
        expect(normalizeRiskZoneId(' '.repeat(129))).toBe('');
    });

    test('resolves the selected zone from the loaded risk-zone dataset', () => {
        const selectedZone = { _id: 'zone-2', coordinates: { lat: 12.4, lng: 122.6 } };
        const zones = [{ _id: 'zone-1' }, selectedZone];

        expect(findRiskZoneById(zones, 'zone-2')).toBe(selectedZone);
        expect(findRiskZoneById(zones, 'missing-zone')).toBeNull();
        expect(findRiskZoneById(null, 'zone-2')).toBeNull();
    });
});
