import { describe, expect, test } from 'vitest';
import { getMapExperience } from '../config/mapExperience';

describe('shared role-aware map experience', () => {
    test.each([
        ['guest', undefined, false, false],
        ['reporter', 'reporter', false, true],
        ['admin', 'municipal_admin', true, false],
        ['responder', 'responder', true, false],
    ])('configures the %s mode without expanding permissions', (mode, role, showPendingReports, showSubmitReport) => {
        const experience = getMapExperience({ role, municipality: 'Cajidiocan', agency: 'MDRRMO' });

        expect(experience.mode).toBe(mode);
        expect(experience.showPendingReports).toBe(showPendingReports);
        expect(experience.showSubmitReport).toBe(showSubmitReport);
        expect(experience.canRespond).toBe(role === 'responder');
        expect(experience.canResolve).toBe(role === 'responder');
    });

    test('uses distinct operational filter labels with shared filter values', () => {
        const responder = getMapExperience({ role: 'responder', municipality: 'Cajidiocan' });
        const admin = getMapExperience({ role: 'municipal_admin', municipality: 'Cajidiocan' });

        expect(responder.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'responding']);
        expect(admin.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'responding']);
        expect(responder.filters[1].label).toBe('Awaiting response');
        expect(admin.filters[1].label).toBe('Needs review');
        expect(responder.filterMode).toBe('response');
        expect(admin.filterMode).toBe('review');
    });
});
