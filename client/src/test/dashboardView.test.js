import { describe, expect, test } from 'vitest';
import {
    ANALYTICS_ROLES,
    DASHBOARD_ANALYTICS_VIEW,
    DASHBOARD_MAP_VIEW,
    canViewAnalytics,
    resolveDashboardView,
} from '../utils/dashboardView';

describe('dashboard view resolution', () => {
    test('opens the incident map with no query at all', () => {
        expect(resolveDashboardView()).toBe(DASHBOARD_MAP_VIEW);
        expect(resolveDashboardView({})).toBe(DASHBOARD_MAP_VIEW);
        expect(resolveDashboardView({ role: 'municipal_admin' })).toBe(DASHBOARD_MAP_VIEW);
    });

    test('gives the municipal admin both views', () => {
        const role = 'municipal_admin';

        // Default is the map — the numbers that start triage sit above it now.
        expect(resolveDashboardView({ role })).toBe(DASHBOARD_MAP_VIEW);
        expect(resolveDashboardView({ role, requestedView: 'map' })).toBe(DASHBOARD_MAP_VIEW);
        // Analytics is the opt-in half, by URL or by the history deep link.
        expect(resolveDashboardView({ role, requestedView: 'analytics' })).toBe(DASHBOARD_ANALYTICS_VIEW);
        expect(resolveDashboardView({ role, panelView: 'history' })).toBe(DASHBOARD_ANALYTICS_VIEW);
        // A deep link that still carries `view=map` is a map request, not a vote
        // for analytics: the panel param must not outrank the explicit view.
        expect(resolveDashboardView({ role, requestedView: 'map', panelView: 'history' })).toBe(DASHBOARD_MAP_VIEW);
    });

    test('never opens analytics for a role that may not see it', () => {
        for (const role of [undefined, null, 'guest', 'reporter', 'responder']) {
            expect(canViewAnalytics(role)).toBe(false);
            expect(resolveDashboardView({ role, requestedView: 'analytics' })).toBe(DASHBOARD_MAP_VIEW);
            expect(resolveDashboardView({ role, panelView: 'history' })).toBe(DASHBOARD_MAP_VIEW);
        }
    });

    test('ignores an unknown view parameter instead of rendering nothing', () => {
        // A stale bookmark or a typo must still land on a real workspace.
        expect(resolveDashboardView({ role: 'municipal_admin', requestedView: 'chartz' })).toBe(DASHBOARD_MAP_VIEW);
        expect(resolveDashboardView({ role: 'reporter', requestedView: 'analytics' })).toBe(DASHBOARD_MAP_VIEW);
    });

    test('is the single owner of the analytics role list', () => {
        // The map is public; analytics is municipal oversight. If that ever
        // widens, it widens here and both callers follow.
        expect(ANALYTICS_ROLES).toEqual(['municipal_admin']);
    });
});
