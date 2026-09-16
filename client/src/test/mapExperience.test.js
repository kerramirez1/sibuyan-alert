import { describe, expect, test } from 'vitest';
import { getMapExperience } from '../config/mapExperience';

describe('shared role-aware map experience', () => {
    test.each([
        ['guest', undefined, false, false],
        // Reporters see community pending pins (read-only); actions stay closed.
        ['reporter', 'reporter', true, true],
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

    test('uses role-aware filter lists with shared status values', () => {
        const responder = getMapExperience({ role: 'responder', municipality: 'Cajidiocan' });
        const admin = getMapExperience({ role: 'municipal_admin', municipality: 'Cajidiocan' });
        const guest = getMapExperience({ role: 'guest' });
        const reporter = getMapExperience({ role: 'reporter' });

        expect(responder.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'verified', 'responding', 'transferred', 'resolved', 'risk-zones']);
        expect(admin.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'verified', 'responding', 'transferred', 'resolved', 'risk-zones']);
        // Guest mirrors the reporter's folded shape minus pending. There is no
        // separate 'active' tab because for a guest `all` and `active` resolve to
        // the same set — pending is the only difference between them, and guests
        // are never sent pending rows. That is why `all` keeps the "Active
        // Incidents" label rather than the reporter's "All open".
        expect(guest.filters.map(({ value }) => value)).toEqual(['all', 'resolved', 'risk-zones']);
        expect(guest.filters.find(({ value }) => value === 'all')?.label).toBe('Active Incidents');
        // The pending tab is the RBAC boundary: it is the one thing a guest must
        // never be given, because the data behind it never reaches them.
        expect(guest.filters.map(({ value }) => value)).not.toContain('pending');
        // Reporter folds operational jargon (verified/transferred/responding)
        // into a single "Active incidents" tab so counts reconcile with no
        // hidden remainder: All open = Pending review + Active incidents.
        expect(reporter.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'active', 'resolved', 'risk-zones']);
        expect(reporter.filters.find(({ value }) => value === 'all')?.label).toBe('All open');

        expect(responder.filterMode).toBe('response');
        expect(admin.filterMode).toBe('review');
        expect(guest.filterMode).toBe('public');
        expect(reporter.filterMode).toBe('public');
    });
});
