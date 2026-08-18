const RESPONDER_OPERATIONAL_STATUSES = new Set([
    'pending',
    'verified',
    'transferred',
    'responding',
    'resolved',
]);

export const getEntityId = (entity) => {
    if (!entity) return '';
    const id = entity._id ?? entity.id ?? entity;
    return id?.toString?.() || String(id);
};

export const isAssignedResponder = (user, report) => {
    const userId = getEntityId(user);
    if (!userId || !report) return false;

    if (getEntityId(report.respondedBy) === userId || getEntityId(report.resolvedBy) === userId) {
        return true;
    }

    return Array.isArray(report.responders)
        && report.responders.some((entry) => getEntityId(entry?.user) === userId);
};

const getScopedMunicipalities = (report) => [
    report?.municipalityName,
    report?.originalMunicipalityName,
    ...(Array.isArray(report?.transferHistory)
        ? report.transferHistory.map((t) => t?.fromMunicipalityName).filter(Boolean)
        : []),
].filter(Boolean);

export const isMunicipalAdminInReportScope = (user, report) => Boolean(
    user?.role === 'municipal_admin'
    && user.assignedMunicipality
    && getScopedMunicipalities(report).includes(user.assignedMunicipality)
);

export const isResponderInReportScope = (user, report) => {
    if (user?.role !== 'responder' || !report) return false;
    if (isAssignedResponder(user, report)) return true;

    return Boolean(
        user.assignedMunicipality
        && getScopedMunicipalities(report).includes(user.assignedMunicipality)
        && RESPONDER_OPERATIONAL_STATUSES.has(report.status)
    );
};

export const canViewOperationalReport = (user, report) => (
    isMunicipalAdminInReportScope(user, report) || isResponderInReportScope(user, report)
);

export const canViewReporterContact = (user, report) => (
    isMunicipalAdminInReportScope(user, report) || isAssignedResponder(user, report)
);

export const canViewReportEvidence = (user, report) => {
    if (!user || !report) return false;
    if (getEntityId(report.reporter) === getEntityId(user)) return true;
    return canViewOperationalReport(user, report);
};

export default {
    getEntityId,
    isAssignedResponder,
    isMunicipalAdminInReportScope,
    isResponderInReportScope,
    canViewOperationalReport,
    canViewReporterContact,
    canViewReportEvidence,
};
