import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getEntityId } from '../../utils/reportResolution';

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
export const RESPONDER_VISIBLE_STATUSES = ['verified', 'transferred', 'responding', 'resolved'];
export const ADMIN_REVIEWABLE_STATUSES = ['pending'];
export const ADMIN_TRANSFERABLE_STATUSES = ['verified', 'transferred', 'responding'];
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
        SDH: 'Medical/SDH',
        BFP: 'BFP',
        LGU: 'MDRRMO',
    };

    return labels[agency] || agency || 'Unassigned';
};

export const hasResponderAssigned = (report) => (
    Boolean(report?.respondedBy) || (Array.isArray(report?.responders) && report.responders.length > 0)
);

export const getLatestTransfer = (report) => {
    const history = Array.isArray(report?.transferHistory) ? report.transferHistory : [];
    return history.length > 0 ? history[history.length - 1] : null;
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
    const assignedMunicipality = user.assignedMunicipality.trim().toLocaleLowerCase();
    const reportMunicipality = report?.municipalityName?.trim().toLocaleLowerCase();
    return Boolean(reportMunicipality) && reportMunicipality === assignedMunicipality;
};

export const getIncidentCapabilities = (user, report) => {
    const isAdmin = ADMIN_ROLES.includes(user?.role);
    const isResponder = user?.role === 'responder';
    const status = report?.status;
    const withinResponderScope = isWithinResponderScope(user, report);
    const assignedResponder = isAssignedResponder(user, report);
    const latestTransfer = getLatestTransfer(report);
    const isTargetMunicipalAdmin = (
        user?.role === 'municipal_admin'
        && Boolean(user.assignedMunicipality)
        && latestTransfer?.toMunicipalityName === user.assignedMunicipality
        && report?.municipalityName === user.assignedMunicipality
    );

    return {
        canInspect: Boolean(report),
        canVerify: isAdmin && ADMIN_REVIEWABLE_STATUSES.includes(status),
        canReject: isAdmin && ADMIN_REVIEWABLE_STATUSES.includes(status),
        canTransfer: isAdmin && ADMIN_TRANSFERABLE_STATUSES.includes(status),
        canAcknowledgeTransfer: isTargetMunicipalAdmin && !latestTransfer?.acknowledgedAt,
        canDelete: isAdmin && Boolean(report),
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
