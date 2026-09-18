/**
 * `/dashboard` has two faces, and this module is the only place that decides
 * which one a URL opens.
 *
 * The map is the default for every role, including the municipal admin.
 * Analytics is an opt-in municipal-oversight surface, reached by
 * `?view=analytics` or by the `?panel=history` deep link that only the analytics
 * workspace understands. An explicit `view` always wins, so `?view=map`,
 * a stale bookmark, or no query at all resolves to the map.
 *
 * The rule lives here rather than inline in the page because two callers need
 * it and they must agree: `DashboardPage` decides which workspace to render, and
 * `MainLayout` decides which nav item to mark current. When the rule was written
 * out twice, the sidebar could highlight Analytics while the page showed the
 * map. One function cannot disagree with itself.
 */

/** Roles allowed on the analytics workspace. */
export const ANALYTICS_ROLES = Object.freeze(['municipal_admin']);

export const DASHBOARD_MAP_VIEW = 'map';
export const DASHBOARD_ANALYTICS_VIEW = 'analytics';

export const canViewAnalytics = (role) => ANALYTICS_ROLES.includes(role);

export const resolveDashboardView = ({ role, requestedView, panelView } = {}) => {
    if (!canViewAnalytics(role)) return DASHBOARD_MAP_VIEW;

    // An explicit `view` always decides, including `view=map`. The panel
    // fallback exists only for links that predate the view parameter, and a
    // leftover `?panel=history` must not outrank a deliberate `?view=map`.
    if (requestedView !== null && requestedView !== undefined) {
        return requestedView === DASHBOARD_ANALYTICS_VIEW
            ? DASHBOARD_ANALYTICS_VIEW
            : DASHBOARD_MAP_VIEW;
    }

    return panelView === 'history' ? DASHBOARD_ANALYTICS_VIEW : DASHBOARD_MAP_VIEW;
};
