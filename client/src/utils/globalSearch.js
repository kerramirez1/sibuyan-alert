/**
 * Which routes carry the application-wide header search.
 *
 * The information architecture this encodes:
 *
 *   Map dashboard (`/dashboard`) — the only route carrying the global search,
 *                because search results land on the map: picking a result
 *                navigates to `/dashboard?view=map&report=<id>` (or
 *                `?riskZone=<id>`), so every role searches from the map itself.
 *   Everywhere — the page's own controls, scoped to what the page shows. The
 *                admin and reporter dashboards rely on their own scoped page
 *                controls instead of the global search.
 *
 * One accepted consequence of the query-stripping rule below:
 * `/dashboard?view=analytics` also shows the search, even though Analytics is
 * its own sidebar entry and its own workspace. Picking a result navigates to
 * the map view, which is where the result lives anyway — so the search never
 * promises something the page cannot show.
 *
 * Two things about this list are easy to get wrong from the route names alone:
 *
 * 1. **The Dashboard is not `/dashboard`.** The sidebar's "Dashboard" item points
 *    at `/admin` for municipal admins and responders and at `/reporter` for
 *    reporters — and neither of those carries the global search anymore. The
 *    search lives on the map dashboard at `/dashboard`, the sidebar's "Map"
 *    item, which is the incident map for every role.
 * 2. **Query strings are stripped by design**, so the search follows the route,
 *    not the view: `/dashboard?view=map` and `/dashboard?view=analytics` both
 *    carry it, while `/admin?tab=overview` does not.
 *
 * The rule lives here rather than inline in `MainLayout` for the same reason
 * `resolveDashboardView` does: a second caller — a test, or a page that wants to
 * know whether it owns a global search — must not be able to disagree with the
 * header. One list cannot disagree with itself.
 */

/** Routes whose header carries the application-wide search. */
export const GLOBAL_SEARCH_ROUTES = Object.freeze(['/dashboard']);

/**
 * Trailing slashes and query strings are stripped before comparison:
 * `/dashboard/` and `/dashboard?view=map` are the same page, and a router that
 * normalises one but not the other would otherwise show or hide the search at
 * random.
 */
const normalizePathname = (pathname) => {
    if (typeof pathname !== 'string' || !pathname) return '';
    const path = pathname.split('?')[0].split('#')[0];
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

/** Whether the given location renders the application-wide header search. */
export const hasGlobalHeaderSearch = (pathname) => (
    GLOBAL_SEARCH_ROUTES.includes(normalizePathname(pathname))
);

export default { GLOBAL_SEARCH_ROUTES, hasGlobalHeaderSearch };
