import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getEntityId } from '../../utils/reportResolution';
import { normalizeMunicipalityKey } from '../../utils/safeCollection';

export const INCIDENT_LIFECYCLE = [
    'pending',
    'verified',
    'transferred',
    'responding',
    'resolved',
    'rejected',
];

export const INCIDENT_STATUS = Object.freeze(Object.fromEntries(
    INCIDENT_LIFECYCLE.map((status) => [status, Object.freeze({
        label: MAP_STATUS_CONFIG[status].label,
        className: MAP_STATUS_CONFIG[status].badge,
        dotClassName: MAP_STATUS_CONFIG[status].dot,
    })]),
));

export const SEVERITY_STYLES = {
    critical: 'border-red-300 bg-red-50 text-red-800',
    severe: 'border-orange-300 bg-orange-50 text-orange-800',
    moderate: 'border-amber-200 bg-amber-50 text-amber-800',
    minor: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export const SEVERITY_INDICATOR_STYLES = Object.freeze({
    critical: Object.freeze({ dot: 'bg-red-600', text: 'text-red-700 dark:text-red-400' }),
    severe: Object.freeze({ dot: 'bg-orange-600', text: 'text-orange-700 dark:text-orange-400' }),
    moderate: Object.freeze({ dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' }),
    minor: Object.freeze({ dot: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-400' }),
});

export const ADMIN_ROLES = ['municipal_admin'];
export const RESPONDER_ACTIONABLE_STATUSES = ['verified', 'transferred', 'responding'];
export const RESPONDER_VISIBLE_STATUSES = ['pending', 'verified', 'transferred', 'responding', 'resolved'];
export const ADMIN_REVIEWABLE_STATUSES = ['pending'];
export const ADMIN_TRANSFERABLE_STATUSES = ['verified', 'transferred'];
export const RESPONDER_QUEUE_VIEWS = Object.freeze({
    available: 'dispatch-queue',
    municipalActive: 'active-incidents',
    active: 'active-responses',
    history: 'response-history',
    all: '',
});

export const getResponderViewFromQuery = (value) => {
    const match = Object.entries(RESPONDER_QUEUE_VIEWS)
        .find(([, queryValue]) => queryValue && queryValue === value);
    return match?.[0] || 'all';
};

export const getAgencyLabel = (agency) => {
    const labels = {
        MDRRMO: 'MDRRMO',
        PNP: 'PNP',
        'Medical Team': 'Medical Team',
        BFP: 'BFP',
        LGU: 'MDRRMO',
    };

    return labels[agency] || agency || 'Unassigned';
};

export const hasResponderAssigned = (report) => (
    Boolean(report?.respondedBy) || (Array.isArray(report?.responders) && report.responders.length > 0)
);

/**
 * The newest transfer leg, from whichever shape the caller holds.
 *
 * Full details carry `transferHistory` (actors, reasons, timestamps); list
 * summaries carry a names-only `transferTrail` — the same split `getTransferOrigin`
 * and `hasTransferTrail` already handle. Reading only the first, as this did, made
 * every summary look untransferred: the queue row and the map's incident pane
 * could both name the transferring municipality and still refuse to acknowledge
 * it, because the capability never found a transfer to acknowledge.
 */
export const getLatestTransfer = (report) => {
    if (Array.isArray(report?.transferHistory) && report.transferHistory.length > 0) {
        return report.transferHistory[report.transferHistory.length - 1];
    }
    if (Array.isArray(report?.transferTrail) && report.transferTrail.length > 0) {
        return report.transferTrail[report.transferTrail.length - 1];
    }
    return null;
};

export const isAssignedResponder = (user, report) => {
    if (user?.role !== 'responder' || !report) return false;

    const currentUserId = getEntityId(user);
    if (!currentUserId) return false;

    const joined = report.responders?.some((entry) => (
        getEntityId(entry?.user ?? entry) === currentUserId
    ));

    return getEntityId(report.respondedBy) === currentUserId || Boolean(joined);
};

export const isWithinResponderScope = (user, report) => {
    if (user?.role !== 'responder') return false;
    if (!user.assignedMunicipality) return true;
    const assignedMunicipality = normalizeMunicipalityKey(user.assignedMunicipality);
    if (!assignedMunicipality) return true;
    const reportMunicipality = normalizeMunicipalityKey(report?.municipalityName);
    return Boolean(reportMunicipality) && reportMunicipality === assignedMunicipality;
};

export const isWithinMunicipalAdminScope = (user, report) => {
    if (!ADMIN_ROLES.includes(user?.role)) return false;
    if (!user.assignedMunicipality) return true;
    const assignedMunicipality = normalizeMunicipalityKey(user.assignedMunicipality);
    if (!assignedMunicipality) return true;
    const reportMunicipality = normalizeMunicipalityKey(report?.municipalityName);
    return Boolean(reportMunicipality) && reportMunicipality === assignedMunicipality;
};

export const isTransferOriginMunicipality = (user, report) => {
    if (!ADMIN_ROLES.includes(user?.role) || !user.assignedMunicipality || !report) return false;
    const assigned = normalizeMunicipalityKey(user.assignedMunicipality);
    if (!assigned) return false;
    const history = Array.isArray(report.transferHistory) && report.transferHistory.length > 0
        ? report.transferHistory
        : report.transferTrail;
    const origins = [
        report.originalMunicipalityName,
        ...(Array.isArray(history)
            ? history.map((entry) => entry?.fromMunicipalityName)
            : []),
    ]
        .filter(Boolean)
        .map((name) => normalizeMunicipalityKey(name))
        .filter(Boolean);
    return origins.includes(assigned);
};

const hasTransferTrail = (report) => (
    (Array.isArray(report?.transferHistory) && report.transferHistory.length > 0)
    || (Array.isArray(report?.transferTrail) && report.transferTrail.length > 0)
);

export const getIncidentCapabilities = (user, report) => {
    const isAdmin = ADMIN_ROLES.includes(user?.role);
    const isResponder = user?.role === 'responder';
    const status = report?.status;
    const withinAdminScope = isWithinMunicipalAdminScope(user, report);
    const withinResponderScope = isWithinResponderScope(user, report);
    const assignedResponder = isAssignedResponder(user, report);
    const latestTransfer = getLatestTransfer(report);
    const isTargetMunicipalAdmin = (
        user?.role === 'municipal_admin'
        && Boolean(user.assignedMunicipality)
        && latestTransfer?.toMunicipalityName === user.assignedMunicipality
        && report?.municipalityName === user.assignedMunicipality
    );

    const hasActiveResponse = (
        status === 'responding'
        || (Array.isArray(report?.responders) && report.responders.length > 0)
        || Boolean(report?.respondedBy)
    );

    return {
        canInspect: Boolean(report),
        canVerify: isAdmin && withinAdminScope && ADMIN_REVIEWABLE_STATUSES.includes(status),
        canReject: isAdmin && withinAdminScope && ADMIN_REVIEWABLE_STATUSES.includes(status),
        canTransfer: isAdmin
            && withinAdminScope
            && ADMIN_TRANSFERABLE_STATUSES.includes(status)
            && !hasActiveResponse,
        canAcknowledgeTransfer: isTargetMunicipalAdmin && !latestTransfer?.acknowledgedAt,
        canDelete: isAdmin && withinAdminScope && Boolean(report),
        // Origin admin may remove a transferred-out read-only copy from their
        // own queue at any downstream status (an acknowledged transfer keeps
        // e.g. responding/resolved). The owning municipality is unaffected
        // (server-enforced).
        canDismiss: isAdmin
            && !withinAdminScope
            && hasTransferTrail(report)
            && isTransferOriginMunicipality(user, report),
        canRespond: isResponder
            && withinResponderScope
            && RESPONDER_ACTIONABLE_STATUSES.includes(status)
            && !assignedResponder,
        canResolve: isResponder && withinResponderScope && status === 'responding' && assignedResponder,
    };
};

export const getRoleStatuses = (role) => (
    ADMIN_ROLES.includes(role)
        ? INCIDENT_LIFECYCLE
        : role === 'responder'
            ? RESPONDER_VISIBLE_STATUSES
            : INCIDENT_LIFECYCLE.filter((status) => status !== 'rejected')
);

export const getIncidentDate = (report) => report?.incidentTime || report?.accidentTime;

export const getCoordinates = (report) => {
    const lat = Number(report?.coordinates?.lat);
    const lng = Number(report?.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};
