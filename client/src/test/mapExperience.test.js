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

    test('opens operators on their incidents and guests on the whole island', () => {
        // Operators arrive looking for where things happened; an anonymous
        // visitor arrives without knowing the island at all, so the island — with
        // the incidents visible in their place on it — is what they should see.
        expect(getMapExperience({ role: 'responder' }).framesReportsOnOpen).toBe(true);
        expect(getMapExperience({ role: 'municipal_admin' }).framesReportsOnOpen).toBe(true);
        expect(getMapExperience({ role: 'reporter' }).framesReportsOnOpen).toBe(true);
        expect(getMapExperience({ role: 'guest' }).framesReportsOnOpen).toBe(false);
        // No role at all is the guest path, and it must not inherit operator
        // framing by omission.
        expect(getMapExperience({}).framesReportsOnOpen).toBe(false);
        expect(getMapExperience().framesReportsOnOpen).toBe(false);
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

    test('gives every signed-in role the identical rail', () => {
        const responder = getMapExperience({ role: 'responder', municipality: 'Cajidiocan' });
        const admin = getMapExperience({ role: 'municipal_admin', municipality: 'Cajidiocan' });
        const reporter = getMapExperience({ role: 'reporter' });

        const signedInRail = [
            ['all', 'All open', 'status'],
            ['pending', 'Pending review', 'status'],
            ['active', 'Active incidents', 'status'],
            ['risk-zones', 'Risk zones', 'layers'],
            ['resolved', 'Resolved archive', 'layers'],
        ];

        // One rail, three roles, byte-identical: the same tabs in the same order
        // with the same names. The role used to pick between two lists, which is
        // what made the same incident arrive as a different product per account.
        for (const experience of [responder, admin, reporter]) {
            expect(experience.filters.map(({ value, label, group }) => [value, label, group]))
                .toEqual(signedInRail);
        }

        // And the rail is not where a capability lives: the verbs are separate
        // fields, so a shared tab set cannot widen anybody's permissions.
        expect(responder.canRespond).toBe(true);
        expect(responder.canDispatch).toBe(true);
        expect(admin.canVerify).toBe(true);
        expect(admin.canRespond).toBe(false);
        expect(reporter.canRespond).toBe(false);
        expect(reporter.canVerify).toBe(false);
        expect(reporter.canDispatch).toBe(false);

        // The guest rail is the same shape minus the one tab whose data never
        // reaches an anonymous viewer, and there is no separate 'active' tab
        // because for a guest `all` and `active` resolve to the same set —
        // pending is the only difference between them, and a guest is never sent
        // pending rows. That is why `all` keeps that label here.
        const guest = getMapExperience({ role: 'guest' });
        expect(guest.filters.map(({ value, label, group }) => [value, label, group])).toEqual([
            ['all', 'Active Incidents', 'status'],
            ['risk-zones', 'Risk zones', 'layers'],
            ['resolved', 'Resolved archive', 'layers'],
        ]);
        expect(guest.filters.map(({ value }) => value)).not.toContain('pending');
        expect(guest.showPendingReports).toBe(false);
    });
});
