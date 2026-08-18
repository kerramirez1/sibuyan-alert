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
        label: 'Responding',
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

export const MAP_RISK_ZONE_CONFIG = Object.freeze({
    label: 'High-risk zone',
    markerColor: '#DC2626',
});

export const MAP_RISK_TYPE_CONFIG = Object.freeze({
    accident_prone: Object.freeze({ label: 'Accident prone', badge: 'border-red-200 bg-red-50 text-red-700' }),
    landslide_prone: Object.freeze({ label: 'Landslide prone', badge: 'border-amber-200 bg-amber-50 text-amber-700' }),
    fire_risk: Object.freeze({ label: 'Fire hazard', badge: 'border-orange-200 bg-orange-50 text-orange-700' }),
    other: Object.freeze({ label: 'Hazard zone', badge: 'border-gray-200 bg-gray-50 text-gray-700' }),
});

export const getMapRiskTypeConfig = (type) => (
    MAP_RISK_TYPE_CONFIG[type] || MAP_RISK_TYPE_CONFIG.other
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
        if (MAP_STATUS_CONFIG[filterStatus]) {
            return [filterStatus];
        }
    }

    if (filterMode === 'public') {
        return ['verified', 'responding'];
    }

    return ACTIVE_MAP_STATUS_KEYS.filter((status) => (showPending || status !== 'pending') && status !== 'resolved');
};

export default MAP_STATUS_CONFIG;
