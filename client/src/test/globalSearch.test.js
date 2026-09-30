import { describe, expect, test } from 'vitest';
import { GLOBAL_SEARCH_ROUTES, hasGlobalHeaderSearch } from '../utils/globalSearch';

/**
 * Where the application-wide header search is allowed to appear.
 *
 * The two easy mistakes this pins down:
 *
 *  - `/dashboard` is NOT the Dashboard. It is the Map — its own sidebar item,
 *    the default for every role. The Dashboard is `/admin` for municipal admins
 *    and responders and `/reporter` for reporters.
 *  - Analytics is `?view=analytics` on the map's route, but it is its own
 *    workspace and its own sidebar entry, so it does not inherit the search.
 */
describe('global header search routes', () => {
    test('the Dashboard routes carry it', () => {
        expect(hasGlobalHeaderSearch('/admin')).toBe(true);
        expect(hasGlobalHeaderSearch('/reporter')).toBe(true);
    });

    test('the map does not, despite the route being called /dashboard', () => {
        expect(hasGlobalHeaderSearch('/dashboard')).toBe(false);
        // Analytics is a view of the same route, but its own workspace.
        expect(hasGlobalHeaderSearch('/dashboard?view=analytics')).toBe(false);
        expect(hasGlobalHeaderSearch('/dashboard?view=map')).toBe(false);
    });

    test('the focused pages do not', () => {
        for (const path of [
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
        expect(hasGlobalHeaderSearch('/admin?tab=overview')).toBe(true);
        expect(hasGlobalHeaderSearch('/admin/reports?view=dispatch-queue')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporter?report=abc')).toBe(true);
    });

    test('a trailing slash does not change the answer', () => {
        expect(hasGlobalHeaderSearch('/admin/')).toBe(true);
        expect(hasGlobalHeaderSearch('/reporter/')).toBe(true);
        expect(hasGlobalHeaderSearch('/dashboard/')).toBe(false);
    });

    test('a prefix is not a match', () => {
        // `/administrator` must not inherit the admin dashboard's search.
        expect(hasGlobalHeaderSearch('/administrator')).toBe(false);
        expect(hasGlobalHeaderSearch('/reporters')).toBe(false);
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

    test('the exported list is exactly the two dashboard routes', () => {
        expect([...GLOBAL_SEARCH_ROUTES]).toEqual(['/admin', '/reporter']);
    });
});
