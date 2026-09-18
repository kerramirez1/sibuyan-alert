export const MAP_STATUS_CONFIG = Object.freeze({
    pending: Object.freeze({
        label: 'Pending',
        markerColor: '#F59E0B',
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
        dot: 'bg-amber-500',
        iconTone: 'bg-amber-50 text-amber-700',
        legendShape: 'circle',
    }),
    verified: Object.freeze({
        label: 'Verified',
        markerColor: '#2563EB',
        badge: 'border-blue-200 bg-blue-50 text-blue-700',
        dot: 'bg-blue-500',
        iconTone: 'bg-blue-50 text-blue-700',
        legendShape: 'circle',
    }),
    transferred: Object.freeze({
        label: 'Transferred',
        markerColor: '#7C3AED',
        badge: 'border-violet-200 bg-violet-50 text-violet-700',
        dot: 'bg-violet-500',
        iconTone: 'bg-violet-50 text-violet-700',
        legendShape: 'diamond',
    }),
    responding: Object.freeze({
        // One name for one lifecycle state, everywhere it appears: this is the
        // source for the tab label, the card label, the status badge, and the
        // legend entry, so they cannot drift apart into "Responding" and
        // "Active response" describing the same pins.
        label: 'Active response',
        markerColor: '#0891B2',
        badge: 'border-cyan-200 bg-cyan-50 text-cyan-700',
        dot: 'bg-cyan-600',
        iconTone: 'bg-cyan-50 text-cyan-700',
        legendShape: 'pulse',
    }),
    resolved: Object.freeze({
        label: 'Resolved',
        markerColor: '#16A34A',
        badge: 'border-green-200 bg-green-50 text-green-700',
        dot: 'bg-green-600',
        iconTone: 'bg-green-50 text-green-700',
        legendShape: 'circle',
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
 * Verified, transferred, and responding pins share one blue so reporters
 * read a single "being handled" state; motion (pulse) alone marks the
 * responding pin. Operational roles keep per-status colors.
 */
export const ACTIVE_INCIDENT_STATUS_KEY = 'active';

export const MAP_ACTIVE_INCIDENT_CONFIG = Object.freeze({
    label: 'Active incident',
    markerColor: '#2563EB',
    dot: 'bg-blue-500',
});

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

export const getMapLegendStatusKeys = ({ showPending = false, filterStatus = null, filterMode = 'public' } = {}) => {
    if (filterStatus === 'risk-zones') {
        return [];
    }

    if (filterStatus && filterStatus !== 'all') {
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
        // states into one legend entry; motion (pulse) marks responding.
        if (filterStatus === 'active' || filterStatus === 'incidents') {
            return [ACTIVE_INCIDENT_STATUS_KEY];
        }
        if (MAP_STATUS_CONFIG[filterStatus]) {
            return [filterStatus];
        }
    }

    if (filterMode === 'public') {
        return [ACTIVE_INCIDENT_STATUS_KEY];
    }

    return ACTIVE_MAP_STATUS_KEYS.filter((status) => (showPending || status !== 'pending') && status !== 'resolved');
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
