import { describe, expect, test } from 'vitest';
import { GLOBAL_SEARCH_ROUTES, hasGlobalHeaderSearch } from '../utils/globalSearch';

/**
 * Where the application-wide header search is allowed to appear.
 *
 * The two easy mistakes this pins down:
 *
 *  - The map dashboard is `/dashboard` — the sidebar's "Map" item, the incident
 *    map for every role. The sidebar's "Dashboard" item points at `/admin` or
 *    `/reporter`, and neither of those carries the global search anymore.
 *  - Query strings are stripped by design, so `/dashboard?view=analytics`
 *    carries the search even though Analytics is its own workspace — picking a
 *    result navigates to the map view anyway.
 */
describe('global header search routes', () => {
    test('the map dashboard carries it', () => {
        expect(hasGlobalHeaderSearch('/dashboard')).toBe(true);
        expect(hasGlobalHeaderSearch('/dashboard?view=map')).toBe(true);
        // Accepted consequence of query-stripping: Analytics is a view of the
        // same route, so the search shows there too.
        expect(hasGlobalHeaderSearch('/dashboard?view=analytics')).toBe(true);
        expect(hasGlobalHeaderSearch('/dashboard/')).toBe(true);
    });

    test('the admin and reporter dashboards do not', () => {
        expect(hasGlobalHeaderSearch('/admin')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporter')).toBe(false);
        expect(hasGlobalHeaderSearch('/admin/')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporter/')).toBe(false);
        expect(hasGlobalHeaderSearch('/admin?tab=overview')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporter?report=abc')).toBe(false);
    });

    test('the focused pages do not', () => {
        for (const path of [
            '/admin',
            '/reporter',
            '/admin/reports',
            '/admin/users',
            '/admin/zones',
            '/accident-history',
            '/my-reports',
            '/profile',
            '/notifications',
            '/report',
        ]) {
            expect(hasGlobalHeaderSearch(path)).toBe(false);
        }
    });

    test('a query string does not change the answer', () => {
        // The router keeps the query on the pathname it hands over in some
        // callers; the rule has to see through it either way.
        expect(hasGlobalHeaderSearch('/dashboard?view=map')).toBe(true);
        expect(hasGlobalHeaderSearch('/admin/reports?view=dispatch-queue')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporter?report=abc')).toBe(false);
    });

    test('a trailing slash does not change the answer', () => {
        expect(hasGlobalHeaderSearch('/dashboard/')).toBe(true);
        expect(hasGlobalHeaderSearch('/admin/')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporter/')).toBe(false);
    });

    test('a prefix is not a match', () => {
        // A route that merely starts with a listed route must not match it.
        expect(hasGlobalHeaderSearch('/administrator')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporters')).toBe(false);
        expect(hasGlobalHeaderSearch('/dashboard-admin')).toBe(false);
    });

    test('the root is not a match', () => {
        expect(hasGlobalHeaderSearch('/')).toBe(false);
    });

    test('junk input is not a match rather than a throw', () => {
        expect(hasGlobalHeaderSearch(undefined)).toBe(false);
        expect(hasGlobalHeaderSearch(null)).toBe(false);
        expect(hasGlobalHeaderSearch('')).toBe(false);
        expect(hasGlobalHeaderSearch(42)).toBe(false);
    });

    test('the exported list is exactly the map dashboard route', () => {
        expect([...GLOBAL_SEARCH_ROUTES]).toEqual(['/dashboard']);
    });
});
