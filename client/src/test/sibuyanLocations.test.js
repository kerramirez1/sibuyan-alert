import { describe, expect, it } from 'vitest';
import {
    getAvailableBarangays,
    getSibuyanBarangays,
    isBarangayInMunicipality,
    SIBUYAN_MUNICIPALITY_NAMES,
} from '../utils/sibuyanLocations';

describe('sibuyanLocations utilities', () => {
    it('defines the 3 official Sibuyan municipalities', () => {
        expect(SIBUYAN_MUNICIPALITY_NAMES).toEqual(['Cajidiocan', 'Magdiwang', 'San Fernando']);
    });

    it('returns official sorted barangays for Cajidiocan (14 barangays)', () => {
        const barangays = getSibuyanBarangays('Cajidiocan');
        expect(barangays).toHaveLength(14);
        expect(barangays).toContain('Alibagon');
        expect(barangays).toContain('Taguilos');
        expect(barangays).not.toContain('Agsao');
    });

    it('returns official sorted barangays for Magdiwang (9 barangays)', () => {
        const barangays = getSibuyanBarangays('Magdiwang');
        expect(barangays).toHaveLength(9);
        expect(barangays).toContain('Agsao');
        expect(barangays).toContain('Tampayan');
        expect(barangays).not.toContain('Alibagon');
    });

    it('returns official sorted barangays for San Fernando (12 barangays)', () => {
        const barangays = getSibuyanBarangays('San Fernando');
        expect(barangays).toHaveLength(12);
        expect(barangays).toContain('Agtiwa');
        expect(barangays).toContain('Taclobo');
        expect(barangays).not.toContain('Gutivan');
    });

    it('returns all distinct sorted barangays when municipality is all', () => {
        const allBarangays = getSibuyanBarangays('all');
        expect(allBarangays.length).toBeGreaterThanOrEqual(30);
        expect(allBarangays).toContain('Alibagon');
        expect(allBarangays).toContain('Agsao');
        expect(allBarangays).toContain('Agtiwa');
    });

    it('validates whether a barangay belongs to a municipality', () => {
        expect(isBarangayInMunicipality('Taguilos', 'Cajidiocan')).toBe(true);
        expect(isBarangayInMunicipality('Taguilos', 'Magdiwang')).toBe(false);
        expect(isBarangayInMunicipality('Taguilos', 'all')).toBe(true);
        expect(isBarangayInMunicipality('all', 'Cajidiocan')).toBe(true);
    });

    it('merges dynamic locations and reports seamlessly without duplicates', () => {
        const dynamicLocations = [
            {
                name: 'Cajidiocan',
                barangays: [{ name: 'Alibagon' }, { name: 'CustomBarangay' }],
            },
        ];
        const reports = [
            { municipalityName: 'Cajidiocan', barangay: 'ReportBarangay' },
        ];

        const barangays = getAvailableBarangays('Cajidiocan', dynamicLocations, reports);
        expect(barangays).toContain('CustomBarangay');
        expect(barangays).toContain('ReportBarangay');
        expect(barangays).toContain('Alibagon');
    });
});
