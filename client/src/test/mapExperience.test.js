import { describe, expect, test } from 'vitest';
import { getMapExperience } from '../config/mapExperience';

describe('shared role-aware map experience', () => {
    test.each([
        ['guest', undefined, false],
        // Reporters see community pending pins (read-only); actions stay closed.
        ['reporter', 'reporter', true],
        ['admin', 'municipal_admin', true],
        ['responder', 'responder', true],
    ])('configures the %s mode without expanding permissions', (mode, role, showPendingReports) => {
        const experience = getMapExperience({ role, municipality: 'Cajidiocan', agency: 'MDRRMO' });

        expect(experience.mode).toBe(mode);
        expect(experience.showPendingReports).toBe(showPendingReports);
        expect(experience.canRespond).toBe(role === 'responder');
        expect(experience.canResolve).toBe(role === 'responder');
    });

    test('does not expose a submit-report flag to the map page', () => {
        // The map has no submit control. A config flag that promised one was
        // never read by any component, so the flag and the copy that referenced
        // it were both removed. This asserts the dead flag stays gone: if a
        // future change needs a submit affordance on the map, it has to add the
        // control and the flag together.
        for (const role of [undefined, 'reporter', 'municipal_admin', 'responder']) {
            expect(getMapExperience({ role })).not.toHaveProperty('showSubmitReport');
        }
    });

    test('uses role-aware filter lists with shared status values', () => {
        const responder = getMapExperience({ role: 'responder', municipality: 'Cajidiocan' });
        const admin = getMapExperience({ role: 'municipal_admin', municipality: 'Cajidiocan' });
        const guest = getMapExperience({ role: 'guest' });
        const reporter = getMapExperience({ role: 'reporter' });

        // Operational roles fold verified + transferred into one 'dispatch' tab.
        // Both are separate lifecycle values that describe one situation the
        // operator acts on — "verified and waiting for a responder" — so they get
        // one tab with one name, and the count matches the admin's dispatch card.
        expect(responder.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'dispatch', 'responding', 'resolved', 'risk-zones']);
        expect(admin.filters.map(({ value }) => value)).toEqual(['all', 'pending', 'dispatch', 'responding', 'resolved', 'risk-zones']);
        expect(responder.filters.find(({ value }) => value === 'dispatch')?.label).toBe('Ready to dispatch');
        expect(admin.filters.find(({ value }) => value === 'dispatch')?.label).toBe('Ready to dispatch');
        // One lifecycle state, one name: the tab label comes from the same
        // vocabulary as the card and the legend entry.
        expect(responder.filters.find(({ value }) => value === 'responding')?.label).toBe('Active response');
        expect(admin.filters.find(({ value }) => value === 'responding')?.label).toBe('Active response');
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
