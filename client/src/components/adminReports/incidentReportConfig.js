export const INCIDENT_LIFECYCLE = [
    'pending',
    'verified',
    'transferred',
    'responding',
    'resolved',
    'rejected',
];

export const INCIDENT_STATUS = {
    pending: {
        label: 'Pending',
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        dotClassName: 'bg-amber-500',
    },
    verified: {
        label: 'Verified',
        className: 'border-blue-200 bg-blue-50 text-blue-800',
        dotClassName: 'bg-blue-500',
    },
    transferred: {
        label: 'Transferred',
        className: 'border-violet-200 bg-violet-50 text-violet-800',
        dotClassName: 'bg-violet-500',
    },
    responding: {
        label: 'Responding',
        className: 'border-indigo-200 bg-indigo-50 text-indigo-800',
        dotClassName: 'bg-indigo-500',
    },
    resolved: {
        label: 'Resolved',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        dotClassName: 'bg-emerald-500',
    },
    rejected: {
        label: 'Rejected',
        className: 'border-red-200 bg-red-50 text-red-800',
        dotClassName: 'bg-red-500',
    },
};

export const SEVERITY_STYLES = {
    critical: 'border-red-300 bg-red-50 text-red-800',
    severe: 'border-orange-300 bg-orange-50 text-orange-800',
    moderate: 'border-amber-200 bg-amber-50 text-amber-800',
    minor: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export const ADMIN_ROLES = ['admin', 'municipal_admin'];
export const RESPONDER_ACTIONABLE_STATUSES = ['verified', 'transferred', 'responding'];
export const ADMIN_REVIEWABLE_STATUSES = ['pending'];
export const ADMIN_TRANSFERABLE_STATUSES = ['verified', 'transferred', 'responding'];

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

    const currentUserId = (user._id || user.id)?.toString();
    const firstResponderId = report.respondedBy?._id || report.respondedBy;
    const joined = report.responders?.some((entry) => {
        const responderId = entry.user?._id || entry.user;
        return responderId?.toString() === currentUserId;
    });

    return firstResponderId?.toString() === currentUserId || Boolean(joined);
};

export const isWithinResponderScope = (user, report) => {
    if (user?.role !== 'responder') return false;
    if (!user.assignedMunicipality) return true;
    return report?.municipalityName === user.assignedMunicipality;
};

export const getIncidentCapabilities = (user, report) => {
    const isAdmin = ADMIN_ROLES.includes(user?.role);
    const isResponder = user?.role === 'responder';
    const status = report?.status;
    const withinResponderScope = isWithinResponderScope(user, report);
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
        canRespond: isResponder && withinResponderScope && RESPONDER_ACTIONABLE_STATUSES.includes(status),
        canResolve: isResponder && withinResponderScope && status === 'responding' && isAssignedResponder(user, report),
    };
};

export const getRoleStatuses = (role) => (
    ADMIN_ROLES.includes(role)
        ? INCIDENT_LIFECYCLE
        : INCIDENT_LIFECYCLE.filter((status) => status !== 'rejected')
);

export const getIncidentDate = (report) => report?.incidentTime || report?.accidentTime;

export const getCoordinates = (report) => {
    const lat = Number(report?.coordinates?.lat);
    const lng = Number(report?.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};
