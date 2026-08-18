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

    test('uses role-aware operational and public filter lists with shared status values', () => {
        const responder = getMapExperience({ role: 'responder', municipality: 'Cajidiocan' });
        const admin = getMapExperience({ role: 'municipal_admin', municipality: 'Cajidiocan' });
        const guest = getMapExperience({ role: 'guest' });
        const reporter = getMapExperience({ role: 'reporter' });

        expect(responder.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'verified', 'responding', 'transferred', 'resolved', 'risk-zones']);
        expect(admin.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'verified', 'responding', 'transferred', 'resolved', 'risk-zones']);
        expect(guest.filters.map(({ value }) => value)).toEqual(['all', 'verified', 'responding', 'resolved', 'risk-zones']);
        expect(reporter.filters.map(({ value }) => value)).toEqual(['all', 'verified', 'responding', 'resolved', 'risk-zones']);

        expect(responder.filterMode).toBe('response');
        expect(admin.filterMode).toBe('review');
        expect(guest.filterMode).toBe('public');
        expect(reporter.filterMode).toBe('public');
    });
});
