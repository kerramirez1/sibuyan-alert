export const MAP_STATUS_CONFIG = Object.freeze({
    pending: Object.freeze({
        label: 'Pending',
        markerColor: '#F59E0B',
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
        dot: 'bg-amber-500',
        iconTone: 'bg-amber-50 text-amber-700',
    }),
    verified: Object.freeze({
        label: 'Verified',
        markerColor: '#2563EB',
        badge: 'border-blue-200 bg-blue-50 text-blue-700',
        dot: 'bg-blue-500',
        iconTone: 'bg-blue-50 text-blue-700',
    }),
    transferred: Object.freeze({
        label: 'Transferred',
        markerColor: '#7C3AED',
        badge: 'border-violet-200 bg-violet-50 text-violet-700',
        dot: 'bg-violet-500',
        iconTone: 'bg-violet-50 text-violet-700',
    }),
    responding: Object.freeze({
        // One name for one lifecycle state, everywhere it appears: this is the
        // source for the tab label, the card label, the status badge, and the
        // legend entry, so they cannot drift apart into "Responding" and
        // "Active response" describing the same pins.
        //
        // Note this is the *operational* name, and the cyan below is the colour
        // this state keeps in the UI chrome (tab swatch, badges, list rows). The
        // marker it draws on the canvas is the pulsing blue dot named "Being
        // responded to" on every rail — see MAP_RESPONDING_INCIDENT_CONFIG below.
        label: 'Active response',
        markerColor: '#0891B2',
        badge: 'border-cyan-200 bg-cyan-50 text-cyan-700',
        dot: 'bg-cyan-600',
        iconTone: 'bg-cyan-50 text-cyan-700',
    }),
    resolved: Object.freeze({
        label: 'Resolved',
        markerColor: '#16A34A',
        badge: 'border-green-200 bg-green-50 text-green-700',
        dot: 'bg-green-600',
        iconTone: 'bg-green-50 text-green-700',
    }),
    rejected: Object.freeze({
        label: 'Rejected',
        markerColor: '#64748B',
        badge: 'border-slate-200 bg-slate-50 text-slate-700',
        dot: 'bg-slate-500',
        iconTone: 'bg-slate-50 text-slate-700',
        legendShape: 'circle',
    }),
});

/**
 * Unified public active-incident presentation (reporter/guest map).
 * Verified, transferred, and responding all share one blue so reporters read a
 * single "being handled" state. Colour therefore cannot separate the three, so
 * shape and motion do: verified and transferred stay teardrop pins, and the one
 * incident somebody is already handling is a dot inside a travelling ring. That
 * split is visible in a screenshot and under `prefers-reduced-motion`, which a
 * colour-only difference would not be. There is no per-role palette to fall back
 * to: every rail draws one incident the same way, and the operational chrome
 * (badges, tab swatches, list rows) still names the exact status by colour.
 *
 * `MAP_STATUS_CONFIG.verified.markerColor` is therefore the same blue this entry
 * declares, and the transferred violet is no longer drawn on the canvas at all —
 * both are kept in `MAP_STATUS_CONFIG` because the chrome still uses them.
 */
export const ACTIVE_INCIDENT_STATUS_KEY = 'active';

export const MAP_ACTIVE_INCIDENT_CONFIG = Object.freeze({
    label: 'Active incident',
    markerColor: '#2563EB',
    dot: 'bg-blue-500',
});

/**
 * How the responding marker is drawn, on every map: same blue as the active pin,
 * different shape, plus a pulse.
 *
 * A separate entry from `MAP_STATUS_CONFIG.responding` on purpose, because it is
 * a separate presentation of the same state — the operational chrome names the
 * state ("Active response", cyan swatch) and this one names what the marker does
 * ("Being responded to", blue dot). Both names point at one lifecycle value, and
 * `MAP_STATUS_CONFIG.responding` remains the single owner of that value.
 *
 * It applies to responder and admin maps too, which is the point: one incident
 * should not be a dot to a reporter and a pin to the operator dispatching it.
 * The pulse is reused rather than re-created, so the legend swatch and the
 * marker cannot drift (see `RespondingDotSymbol` in MapLegend).
 */
export const RESPONDING_INCIDENT_STATUS_KEY = 'responding-dot';

export const MAP_RESPONDING_INCIDENT_CONFIG = Object.freeze({
    label: 'Being responded to',
    markerColor: MAP_STATUS_CONFIG.verified.markerColor,
    dot: 'bg-blue-500',
});

/**
 * Severity, as the one table every surface reads.
 *
 * Severity is the incident's own gravity and is unrelated to its lifecycle
 * status, so it keeps a separate (warmer) ramp instead of borrowing the status
 * colours: a verified incident and a pending one can be equally severe, and a
 * reader who sees amber here should think "how bad", never "what stage".
 *
 * `label` and `dot` are what the details view and the record rows need; `badge`
 * is there so a severity chip can be drawn without a second lookup. The default
 * is `moderate`, matching the rest of the app: a report that never recorded a
 * severity is presented as moderate rather than as unknown-and-therefore-alarming.
 */
export const MAP_SEVERITY_CONFIG = Object.freeze({
    minor: Object.freeze({ label: 'Minor', dot: 'bg-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' }),
    moderate: Object.freeze({ label: 'Moderate', dot: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700' }),
    severe: Object.freeze({ label: 'Severe', dot: 'bg-orange-500', badge: 'border-orange-200 bg-orange-50 text-orange-700' }),
    critical: Object.freeze({ label: 'Critical', dot: 'bg-red-500', badge: 'border-red-200 bg-red-50 text-red-700' }),
});

export const getMapSeverityConfig = (severity) => (
    MAP_SEVERITY_CONFIG[String(severity || '').trim().toLowerCase()] || MAP_SEVERITY_CONFIG.moderate
);

export const MAP_RISK_ZONE_CONFIG = Object.freeze({
    label: 'High-risk zone',
    markerColor: '#DC2626',
});

export const MAP_RISK_TYPE_CONFIG = Object.freeze({
    accident_prone: Object.freeze({ label: 'Accident prone', badge: 'border-red-200 bg-red-50 text-red-700' }),
    landslide_prone: Object.freeze({ label: 'Landslide prone', badge: 'border-amber-200 bg-amber-50 text-amber-700' }),
    flood_prone: Object.freeze({ label: 'Flood prone', badge: 'border-blue-200 bg-blue-50 text-blue-700' }),
    other: Object.freeze({ label: 'Hazard zone', badge: 'border-gray-200 bg-gray-50 text-gray-700' }),
});

export const getMapRiskTypeConfig = (type) => (
    MAP_RISK_TYPE_CONFIG[type] || MAP_RISK_TYPE_CONFIG.other
);

/**
 * Central hazard-layer visibility predicate shared by the map canvas and the
 * legend. High-risk zones render only in the dedicated 'risk-zones' filter,
 * keeping active ongoing incident reports ('all') and permanent road hazard
 * zones cleanly separated and avoiding marker count confusion.
 */
export const isRiskZoneLayerVisibleForFilter = (filterStatus) => (
    filterStatus === 'risk-zones'
);

export const ACTIVE_MAP_STATUS_KEYS = Object.freeze([
    'pending',
    'verified',
    'transferred',
    'responding',
    'resolved',
]);

export const getMapLegendStatusKeys = ({ showPending = false, filterStatus = null } = {}) => {
    if (filterStatus === 'risk-zones') {
        return [];
    }

    // Every rail renders the same tab set now (see mapExperience), so the legend
    // answers one question — what does this tab draw? — instead of first asking
    // which role is looking.
    if (!filterStatus || filterStatus === 'all') {
        // 'All open' includes pending whenever the viewer receives pending rows,
        // so its legend names the pending pin too. Without this the tab drew an
        // amber pin the legend never mentioned, which reads as an unexplained
        // mark rather than as an unverified incident.
        return [
            ...(showPending ? ['pending'] : []),
            ACTIVE_INCIDENT_STATUS_KEY,
            RESPONDING_INCIDENT_STATUS_KEY,
        ];
    }

    if (filterStatus) {
        if (filterStatus === 'pending') {
            return showPending ? ['pending'] : [];
        }
        // The Ready to dispatch tab is the verified + transferred pair, so its
        // legend has to name both markers. Falling through to the generic
        // branch below would list every status the map can draw, which would
        // describe pins that are not on screen.
        if (filterStatus === 'dispatch') {
            return ['verified', 'transferred'];
        }
        // Reporter "Active incidents" tab collapses the three operational
        // states into one legend entry, plus the responding dot — which is the
        // one member of that set drawn as a different shape.
        if (filterStatus === 'active' || filterStatus === 'incidents') {
            return [ACTIVE_INCIDENT_STATUS_KEY, RESPONDING_INCIDENT_STATUS_KEY];
        }
        // The responding tab shows the dot on every rail, so it is named as the
        // dot. Falling through to the status lookup would label the pulse
        // "Active response" with a cyan pin the canvas no longer draws.
        if (filterStatus === 'responding') {
            return [RESPONDING_INCIDENT_STATUS_KEY];
        }
        if (MAP_STATUS_CONFIG[filterStatus]) {
            return [filterStatus];
        }
    }

    // Two entries, because the map draws two things: the unified active pin, and
    // the responding dot that is a different shape. Without the second one the
    // pulse has no explanation, and an unexplained animation is noise.
    return [ACTIVE_INCIDENT_STATUS_KEY, RESPONDING_INCIDENT_STATUS_KEY];
};

/**
 * The representative marker color for a status filter.
 *
 * It lives here, beside `getMapLegendStatusKeys`, because both answer the same
 * question — which statuses does this tab show? A tab that shows a pair (the
 * dispatch tab) is drawn with its first member's color rather than with a
 * hardcoded gray that would read as "unknown status".
 *
 * Returns `null` for the two filters that are not statuses: `all` (every active
 * incident) and `risk-zones` (hazard areas, drawn red). The caller supplies the
 * dot for those.
 */
export const getMapFilterStatusDot = (filterStatus) => {
    if (!filterStatus || filterStatus === 'all' || filterStatus === 'risk-zones') {
        return null;
    }

    if (filterStatus === 'dispatch') {
        return MAP_STATUS_CONFIG.verified.dot;
    }

    if (filterStatus === 'active' || filterStatus === 'incidents') {
        return MAP_ACTIVE_INCIDENT_CONFIG.dot;
    }

    return MAP_STATUS_CONFIG[filterStatus]?.dot || null;
};

export default MAP_STATUS_CONFIG;
