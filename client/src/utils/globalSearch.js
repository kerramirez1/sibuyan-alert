/**
 * Which routes carry the application-wide header search.
 *
 * The information architecture this encodes:
 *
 *   Dashboard  — one search that reaches everything, because the dashboard is
 *                where "find anything" belongs.
 *   Everywhere — the page's own controls, scoped to what the page shows.
 *
 * Two things about this list are easy to get wrong from the route names alone:
 *
 * 1. **The Dashboard is not `/dashboard`.** The sidebar's "Dashboard" item points
 *    at `/admin` for municipal admins and responders and at `/reporter` for
 *    reporters (MainLayout's primary home link). `/dashboard` has its own sidebar
 *    item — "Map" — and is the incident map for every role.
 * 2. **Analytics is a view of the map's route**, reached by `?view=analytics`. It
 *    is its own sidebar entry and its own workspace, so it takes its place with
 *    the other focused pages rather than inheriting the dashboard's search.
 *
 * The rule lives here rather than inline in `MainLayout` for the same reason
 * `resolveDashboardView` does: a second caller — a test, or a page that wants to
 * know whether it owns a global search — must not be able to disagree with the
 * header. One list cannot disagree with itself.
 */

/** Routes whose header carries the application-wide search. */
export const GLOBAL_SEARCH_ROUTES = Object.freeze(['/admin', '/reporter']);

/**
 * Trailing slashes and query strings are stripped before comparison: `/admin/`
 * and `/admin?tab=x` are the same page, and a router that normalises one but not
 * the other would otherwise show or hide the search at random.
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
