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

/**
 * Whether the evidence section belongs on the page at all.
 *
 * Operators and the report's own owner always get it — including when it holds
 * nothing. That empty state is the point: "no photos were attached" is a fact an
 * operator deciding what to dispatch has to be able to read, and a section that
 * is simply absent cannot state it. Absent reads identically to "the gallery did
 * not load", which is exactly the question nobody could answer before.
 *
 * It used to take a `hasEvidence` flag and return false without it, which hid the
 * section from operators too. Public viewers are unaffected either way: they are
 * not entitled to the evidence view, so the restricted notice is what they get
 * (see `showRestrictedNotice`) rather than an empty state describing something
 * they cannot see.
 */
export const canViewEvidence = (role, isOwner = false) => (
    isOperationalRole(role) || isOwner
);

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
    // The server's own declaration outranks role inference, and never the other
    // way round. A payload that says `redacted` — the public projection, which is
    // the shape every island-wide pin arrives in — carries redacted descriptors
    // as its `items`, so inferring "original" from the viewer's role would label
    // it as unprotected evidence the server had already withheld. `original` is
    // still inferred from role for payloads that declare nothing, which is every
    // operational summary and every legacy record.
    const declaredViewerAccess = report.evidence?.viewerAccess;
    const viewerAccess = (declaredViewerAccess === 'redacted' || declaredViewerAccess === 'none')
        ? declaredViewerAccess
        : (declaredViewerAccess === 'original' || ((operationalRole || isOwnerComputed) && (hasImages || hasEvidenceItems)))
            ? 'original'
            : (declaredViewerAccess || (hasEvidence ? 'redacted' : 'none'));

    return {
        isOperational: operationalRole,
        isAdmin: admin,
        isOwner: isOwnerComputed,
        viewerAccess,
        showCoordinates: canViewExactCoordinates(viewerRole, isOwnerComputed),
        showReporterInfo: canViewReporterIdentity(viewerRole, isOwnerComputed),
        showReporterContact: canViewReporterContact(viewerRole, isOwnerComputed, Boolean(report.isAssignedResponder)),
        showEvidence: canViewEvidence(viewerRole, isOwnerComputed),
        showOperationalDetails: canViewOperationalDetails(viewerRole),
        showResponseCoordination: canViewResponseCoordination(viewerRole, isOwnerComputed),
        showTransferHistory: canViewTransferHistory(viewerRole),
        showLocationQuality: canViewLocationQuality(viewerRole),
        showRestrictedNotice: !operationalRole && !isOwnerComputed,
    };
};
