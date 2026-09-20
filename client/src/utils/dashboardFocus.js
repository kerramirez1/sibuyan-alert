/**
 * The two query keys a dashboard URL uses to name ONE record.
 *
 * `report` is an incident a search result or the incident queue asked the map to
 * open; `riskZone` is a hazard area a search result or the zone list asked it to
 * show. Neither is component state: the dashboard reads both straight off the
 * URL (see `focusedMapReportId` and `focusedRiskZoneId` in DashboardPage) and the
 * map treats whatever they name as the thing it was asked to draw — it flies its
 * camera there, pins it outside the active filter, and opens its details.
 *
 * That is exactly right for an arrival and exactly wrong for a scope change. A
 * viewer who lands on a hazard zone from the search box and then selects "Active
 * incidents" has said what the map should show, and the zoomed-to zone is not
 * part of it — but while the param lived on, the map kept forcing the hazard
 * layer visible over a tab that does not draw it, and the URL kept advertising a
 * zone that was no longer on screen. Clearing the focus is therefore a URL
 * edit, not a state reset, which is why it lives in a util both the page and its
 * tests can reach.
 */
export const DASHBOARD_FOCUS_PARAMS = Object.freeze(['report', 'riskZone']);

/**
 * The query without the focused record, or `null` when there was none to remove.
 *
 * `null` rather than an unchanged copy, because the caller navigates with
 * whatever it gets back and every navigation pushes a history entry: returning a
 * copy would put a duplicate URL in the back stack for a click that changed
 * nothing. Callers read it as "nothing to clean up here".
 *
 * Only the focus keys are dropped. `view`, a camera link's `lat`/`lng`/`zoom`,
 * and an arrival's `panel` all describe where the viewer is rather than which
 * record is focused, and a scope change does not move them.
 */
export const withoutFocusedEntity = (searchParams) => {
    const source = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(searchParams || '');

    if (!DASHBOARD_FOCUS_PARAMS.some((key) => source.has(key))) return null;

    const next = new URLSearchParams(source);
    DASHBOARD_FOCUS_PARAMS.forEach((key) => next.delete(key));
    return next;
};

export default withoutFocusedEntity;
