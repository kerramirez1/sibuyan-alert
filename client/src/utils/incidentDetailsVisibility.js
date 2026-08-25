/**
 * Role-Based Incident Details Visibility Helpers
 *
 * Defines centralized, deterministic rules for what information each role can view.
 * Supported roles:
 * - 'guest' (public unauthenticated viewer)
 * - 'reporter' (authenticated incident reporter)
 * - 'responder' (emergency service personnel)
 * - 'municipal_admin' / 'admin' / 'system_admin' (administrative operators)
 */

export const isOperationalRole = (role) => (
    ['responder', 'municipal_admin', 'admin', 'system_admin'].includes(role)
);

export const isAdminRole = (role) => (
    ['municipal_admin', 'admin', 'system_admin'].includes(role)
);

export const canViewExactCoordinates = (role, isOwner = false) => (
    isOperationalRole(role) || isOwner
);

export const canViewReporterIdentity = (role, isOwner = false) => (
    isOperationalRole(role) || isOwner
);

export const canViewReporterContact = (role, isOwner = false, isAssignedResponder = false) => (
    isAdminRole(role) || isOwner || isAssignedResponder
);

export const canViewEvidence = (role, isOwner = false, hasEvidence = false) => {
    if (!hasEvidence) return false;
    return isOperationalRole(role) || isOwner;
};

export const canViewOperationalDetails = (role) => (
    isOperationalRole(role)
);

export const canViewResponseCoordination = (role, isOwner = false) => (
    isOperationalRole(role) || isOwner
);

export const canViewTransferHistory = (role) => (
    isOperationalRole(role)
);

export const canViewLocationQuality = (role) => (
    isOperationalRole(role)
);

/**
 * Returns a comprehensive capability and section visibility descriptor
 * for rendering incident details.
 */
export const getIncidentVisibilityRules = ({
    viewerRole = 'guest',
    report = {},
    isOwner = false,
} = {}) => {
    const isOwnerComputed = Boolean(isOwner || report.isOwnedByCurrentUser);
    const operationalRole = isOperationalRole(viewerRole);
    const admin = isAdminRole(viewerRole);

    const hasImages = Array.isArray(report.images) && report.images.length > 0;
    const declaredEvidenceCount = Number(report.evidenceCount ?? report.evidence?.evidenceCount ?? report.evidence?.count) || 0;
    const hasEvidenceItems = Array.isArray(report.evidence?.items) && report.evidence.items.length > 0;
    const hasEvidence = hasImages || declaredEvidenceCount > 0 || hasEvidenceItems;
    const viewerAccess = (report.evidence?.viewerAccess === 'original' || ((operationalRole || isOwnerComputed) && (hasImages || hasEvidenceItems)))
        ? 'original'
        : (report.evidence?.viewerAccess || (hasEvidence ? 'redacted' : 'none'));

    return {
        isOperational: operationalRole,
        isAdmin: admin,
        isOwner: isOwnerComputed,
        viewerAccess,
        showCoordinates: canViewExactCoordinates(viewerRole, isOwnerComputed),
        showReporterInfo: canViewReporterIdentity(viewerRole, isOwnerComputed),
        showReporterContact: canViewReporterContact(viewerRole, isOwnerComputed, Boolean(report.isAssignedResponder)),
        showEvidence: canViewEvidence(viewerRole, isOwnerComputed, hasEvidence),
        showOperationalDetails: canViewOperationalDetails(viewerRole),
        showResponseCoordination: canViewResponseCoordination(viewerRole, isOwnerComputed),
        showTransferHistory: canViewTransferHistory(viewerRole),
        showLocationQuality: canViewLocationQuality(viewerRole),
        showRestrictedNotice: !operationalRole && !isOwnerComputed,
    };
};
