import { describe, expect, test } from 'vitest';
import { getPhysicalMunicipality, getTransferLine, getTransferOrigin } from '../utils/incidentDetails';

describe('physical (event) municipality', () => {
    test('prefers the origin snapshot over the handling municipality', () => {
        expect(getPhysicalMunicipality({
            municipalityName: 'San Fernando',
            originalMunicipalityName: 'Cajidiocan',
            transferHistory: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'San Fernando' }],
        })).toBe('Cajidiocan');
    });

    test('falls back through transfer trail, current, and ref object', () => {
        expect(getPhysicalMunicipality({
            municipalityName: 'San Fernando',
            transferTrail: [{ fromMunicipalityName: 'Magdiwang', toMunicipalityName: 'San Fernando' }],
        })).toBe('Magdiwang');
        expect(getPhysicalMunicipality({ municipalityName: 'Magdiwang' })).toBe('Magdiwang');
        expect(getPhysicalMunicipality({ municipality: { name: 'Cajidiocan' } })).toBe('Cajidiocan');
        expect(getPhysicalMunicipality(null)).toBe('');
        expect(getPhysicalMunicipality({})).toBe('');
    });

    test('transfer origin disambiguation still works from the trail', () => {
        expect(getTransferOrigin({
            municipalityName: 'San Fernando',
            originalMunicipalityName: 'Cajidiocan',
            transferTrail: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'San Fernando' }],
        })).toBe('Cajidiocan');
        expect(getTransferOrigin({ municipalityName: 'Cajidiocan' })).toBeNull();
    });

    test('transfer line speaks to the viewer: origin and owner read "to", others read "from"', () => {
        const transferred = {
            municipalityName: 'San Fernando',
            originalMunicipalityName: 'Cajidiocan',
            transferHistory: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'San Fernando' }],
        };
        expect(getTransferLine(transferred, { assignedMunicipality: 'Cajidiocan' }))
            .toBe('Transferred to San Fernando');
        expect(getTransferLine(transferred, { isOwner: true }))
            .toBe('Transferred to San Fernando');
        expect(getTransferLine(transferred, { assignedMunicipality: 'San Fernando' }))
            .toBe('Transferred from Cajidiocan');
        expect(getTransferLine(transferred, {}))
            .toBe('Transferred from Cajidiocan');
        expect(getTransferLine({ municipalityName: 'Cajidiocan' }, { isOwner: true })).toBe('');
    });
});
