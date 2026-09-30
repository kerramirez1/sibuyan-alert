# 2026-09-30 (cont.) — Global header search scoped to the Dashboard

## The finding that shaped the whole change

**`/dashboard` is NOT the Dashboard.** The sidebar's "Dashboard" item points at
`/admin` for municipal admins and responders and at `/reporter` for reporters
(`MainLayout`'s primary home link, ~line 224-255). `/dashboard` has its own sidebar
item — **"Map"** — and is the incident map for every role by default
(`resolveDashboardView` in `utils/dashboardView.js`). Analytics is `?view=analytics`
on that same route.

So the request's list — "Incident Reports, Users, Map, Risk Zones, Analytics,
Accident History" — maps to: `/admin/reports`, `/admin/users`, `/dashboard`,
`/admin/zones`, `/dashboard?view=analytics`, `/accident-history`. Reading the route
names instead of the nav labels would have kept the search on the map and removed
it from the actual dashboard.

## Change

- **New `client/src/utils/globalSearch.js`** — `GLOBAL_SEARCH_ROUTES = ['/admin',
  '/reporter']` and `hasGlobalHeaderSearch(pathname)`, normalising trailing slashes
  and query strings. The rule lives in a module for the same reason
  `resolveDashboardView` does: two callers must not be able to disagree. A test
  pins that `/administrator` and `/reporters` are not matches.
- **`MainLayout.jsx`** — both entry points gated: the desktop inline bar and the
  mobile icon toggle, plus the mobile search row it opens. Leaving the icon behind
  would have opened a row that renders nothing.
- **Header balance** needed no new markup: the brand group already carries `flex-1`,
  so it absorbs the freed width and the header reads as brand-left /
  controls-right rather than three columns with a hole in the middle. Notifications
  are untouched.
- **Incident Reports copy** — the scope note no longer mentions the header search
  (there is none on that page now). Status filters are unchanged: All statuses,
  Pending, Verified, Transferred, Active response, Resolved, Rejected.

**Then removed entirely** at the user's request: the note first read "These incident
records only — the header search covers the whole application", became "Searches
incident records in this view", and was then deleted. The visible "Search incidents"
label already carries the scope, and on this page there is no second search to
disambiguate against, so the line was explaining something the reader could see.
The `filter-bar__scope` class stays — the responder variant still uses it for the
active view's description in the status row.

`ReportSearch` is used in `MainLayout` only — no other entry point exists, and the
mobile bottom nav has no search.

## Verification

- `globalSearch.test.js` (9, new) — the route rule, including the `/dashboard`
  trap, query strings, trailing slashes, prefixes, and junk input.
- `MainLayout.test.jsx` (+10) — present on `/admin` and `/reporter`; absent on
  reports, users, zones, accident history, the map, and profile; the mobile toggle
  goes with it; notifications survive. `ReportSearch` renders its input as
  `role="combobox"`, which is the handle used.
- `AdminReportsPage.test.jsx` (30) and `ReportSearch.test.jsx` — unaffected, all pass.
- Lint 0/0, build clean.

No header screenshot: rendering `MainLayout` standalone needs the auth and socket
contexts, and there is no local MongoDB. The change is subtractive — the search is
simply not rendered — so the risk is low, but it is a static judgement, not a
visual one.
