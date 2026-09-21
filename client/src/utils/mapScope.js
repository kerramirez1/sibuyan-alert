/**
 * Map scope for the Municipal Administrator's incident map.
 *
 * A municipal administrator's data is municipality-scoped everywhere else in
 * this system — their queue, their analytics, their users. The map is the one
 * surface where narrowing to their own municipality can cost them the picture:
 * an incident just across a municipal boundary can be closer to their
 * responders than one at the far end of their own territory.
 *
 * Scope is therefore WHERE the map draws, never WHAT the account may see or do.
 * It widens no authorization: the island-wide set comes from the same public
 * feed every signed-in member already receives (`GET /api/reports?status=all`),
 * whose allowlist projection is redacted by construction and carries no
 * operational fields, and the administrator's own records are layered on top of
 * it. Their municipality-scoped operational queue, the incident dossier
 * endpoint, and every write are untouched and keep enforcing the assignment.
 *
 * This is deliberately NOT a municipality selector. The administrator's own
 * municipality always comes from the authenticated session, never from this
 * control, and the other option is not a municipality at all.
 */

import { deduplicateDashboardReports } from './dashboardReports';

export const MAP_SCOPE_MUNICIPALITY = 'municipality';
export const MAP_SCOPE_ISLAND = 'island';

/** The scope a municipal administrator's map opens on: their own municipality. */
export const DEFAULT_MAP_SCOPE = MAP_SCOPE_MUNICIPALITY;

/**
 * The control's options, in reading order.
 *
 * `My Municipality` rather than the municipality's name: the control answers
 * "which area is this map showing", and naming the office's own area by name in
 * the same row as two other municipal names would read as a municipality
 * picker — which this must never become. The name is not lost; it is in the
 * option's title and in the map's own contextual line.
 */
export const MAP_SCOPE_OPTIONS = Object.freeze([
    Object.freeze({ value: MAP_SCOPE_MUNICIPALITY, label: 'My Municipality' }),
    Object.freeze({ value: MAP_SCOPE_ISLAND, label: 'Entire Sibuyan Island' }),
]);

/** Only the municipal administrator's map carries a scope control. */
export const canUseMapScope = (role) => role === 'municipal_admin';

/** Any value that is not the island scope is the account's own municipality. */
export const normalizeMapScope = (value) => (
    value === MAP_SCOPE_ISLAND ? MAP_SCOPE_ISLAND : MAP_SCOPE_MUNICIPALITY
);

export const isIslandMapScope = (value) => normalizeMapScope(value) === MAP_SCOPE_ISLAND;

/**
 * The prepositional phrase that scopes a sentence about the map's contents:
 * "in Cajidiocan", "across Sibuyan Island". Composed here so the map's empty
 * state, the panel's empty state and the control's caption cannot describe
 * three different areas on one screen.
 */
export const getMapScopePhrase = (scope, municipality) => (
    isIslandMapScope(scope)
        ? 'across Sibuyan Island'
        : `in ${municipality || 'your municipality'}`
);

/**
 * The subtle line under the scope control while the map is island-wide.
 *
 * Only the island scope gets one. A caption that is always present is chrome
 * over the canvas; a caption that appears when the scope changes is the map
 * saying which area it is now drawing.
 */
export const getMapScopeCaption = (scope, municipality) => (
    isIslandMapScope(scope)
        ? 'Viewing incidents across Sibuyan Island'
        : `Viewing incidents in ${municipality || 'your municipality'}`
);

/**
 * Cache key for the island-wide set.
 *
 * Scoped by municipality and account like every other key in this store: the
 * payload is the same for everyone today, but a key that mixed accounts would
 * leak one administrator's snapshot into the next sign-in on a shared device
 * the moment the two ever differ.
 */
export const getIslandMapScopeCacheKey = ({ municipality, userId } = {}) => (
    `dashboard:island-scope:${municipality || 'unassigned'}:${userId || 'unknown'}`
);

/**
 * The report set the map draws for the active scope.
 *
 * Municipality scope is the operational set unchanged. Island scope is the
 * island-wide public set with the administrator's own records on top — the
 * operational record of an incident is the fuller one (reporter, responders,
 * evidence access, an actionable status), so it must win the id collision. That
 * ordering is the whole point of `deduplicateDashboardReports` keeping the last
 * occurrence of an id, and it is why the scoped array is spread second.
 */
export const mergeMapScopeReports = ({
    scope,
    municipalityReports = [],
    islandReports = [],
} = {}) => {
    const scoped = Array.isArray(municipalityReports) ? municipalityReports.filter(Boolean) : [];
    if (!isIslandMapScope(scope)) return deduplicateDashboardReports(scoped);

    const island = Array.isArray(islandReports) ? islandReports.filter(Boolean) : [];
    return deduplicateDashboardReports([...island, ...scoped]);
};

export default {
    MAP_SCOPE_MUNICIPALITY,
    MAP_SCOPE_ISLAND,
    DEFAULT_MAP_SCOPE,
    MAP_SCOPE_OPTIONS,
    canUseMapScope,
    normalizeMapScope,
    isIslandMapScope,
    getMapScopePhrase,
    getMapScopeCaption,
    getIslandMapScopeCacheKey,
    mergeMapScopeReports,
};
