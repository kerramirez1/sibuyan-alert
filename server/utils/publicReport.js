const toNonNegativeInteger = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const getDocumentValue = (document, key) => document?.[key];

const getEntityId = (entity) => {
    if (!entity) return '';
    const id = entity._id ?? entity.id ?? entity;
    return id?.toString?.() || String(id);
};

const CURRENT_REDACTION_VERSION = '3.4';
const CURRENT_DETECTOR_VERSION = 'picojs-facefinder-2.3';

const buildRedactedPreviewUrl = (reportId, index, redactionVersion = CURRENT_REDACTION_VERSION) => (
    `/api/reports/${reportId}/evidence/${index}/preview?rv=${encodeURIComponent(
        redactionVersion === CURRENT_REDACTION_VERSION ? redactionVersion : CURRENT_REDACTION_VERSION
    )}`
);

const getPublicMunicipality = (municipality) => {
    if (!municipality || typeof municipality !== 'object') return undefined;
    const value = {};
    if (municipality.name) value.name = municipality.name;
    if (municipality.code) value.code = municipality.code;
    return Object.keys(value).length ? value : undefined;
};

const getRespondingAgencies = (report) => {
    const agencies = new Set();
    if (report?.responderAgency) agencies.add(report.responderAgency);
    const responders = Array.isArray(report?.responders) ? report.responders : [];
    for (const responder of responders) {
        if (responder?.unitType) agencies.add(responder.unitType);
    }
    return [...agencies];
};

/**
 * Builds normalized evidence descriptor based strictly on server authorization.
 */
export const buildReportEvidenceObject = (report, { isOwner = false, isOperational = false } = {}) => {
    const rawImages = Array.isArray(report?.images) ? report.images : [];
    const count = rawImages.length;
    const reportId = getEntityId(report?._id || report?.id);

    if (count === 0) {
        return {
            evidenceCount: 0,
            count: 0,
            viewerAccess: 'none',
            accessLevel: 'none',
            items: [],
        };
    }

    if (isOwner || isOperational) {
        return {
            evidenceCount: count,
            count,
            viewerAccess: 'original',
            accessLevel: 'original',
            items: rawImages.map((source, index) => ({
                id: String(index),
                index,
                redactedPreviewUrl: buildRedactedPreviewUrl(reportId, index),
                previewUrl: source,
                originalUrl: source,
                accessLevel: 'original',
                alt: `Incident evidence photo ${index + 1}`,
                redactionType: 'none',
                detectionStatus: 'no_faces_detected',
                isOwner,
            })),
        };
    }

    return {
        evidenceCount: count,
        count,
        viewerAccess: 'redacted',
        accessLevel: 'redacted',
        items: rawImages.map((_, index) => {
            const evidenceMetadata = Array.isArray(report?.evidenceMetadata) ? report.evidenceMetadata : [];
            const meta = evidenceMetadata.find((m) => Number(m?.index) === index) || evidenceMetadata[index];
            const metadataIsCurrent = meta?.redactionVersion === CURRENT_REDACTION_VERSION
                && meta?.detectorVersion === CURRENT_DETECTOR_VERSION;
            const detectionStatus = metadataIsCurrent ? (meta?.detectionStatus || 'processing') : 'processing';
            const redactionType = metadataIsCurrent
                ? (meta?.redactionType || (detectionStatus === 'no_faces_detected' ? 'none' : 'privacy_preview'))
                : 'privacy_preview';

            let alt = `Incident evidence photo ${index + 1}`;
            if (detectionStatus === 'faces_detected') {
                alt = `Incident evidence photo ${index + 1}, faces blurred for privacy`;
            } else if (
                detectionStatus === 'detector_failed'
                || detectionStatus === 'derivative_failed'
                || detectionStatus === 'invalid_image'
                || redactionType === 'fallback_blur'
                || redactionType === 'svg_fallback'
            ) {
                alt = `Incident evidence photo ${index + 1}, privacy-safe preview`;
            }

            return {
                id: String(index),
                index,
                redactedPreviewUrl: buildRedactedPreviewUrl(reportId, index, meta?.redactionVersion),
                previewUrl: buildRedactedPreviewUrl(reportId, index, meta?.redactionVersion),
                accessLevel: 'redacted',
                alt,
                redactionType: 'public_soft_blur',
                detectionStatus,
                redactionVersion: metadataIsCurrent ? meta.redactionVersion : CURRENT_REDACTION_VERSION,
                detectorVersion: metadataIsCurrent ? meta.detectorVersion : CURRENT_DETECTOR_VERSION,
            };
        }),
    };


};

/**
 * Build the only report representation allowed on public feeds.
 * The allowlist is intentional: new private model fields do not become public
 * automatically when the Report schema evolves.
 */
export const toPublicReport = (report, { viewerId, isOperational = false } = {}) => {
    const reporterId = getEntityId(getDocumentValue(report, 'reporter'));
    const currentViewerId = getEntityId(viewerId);
    const isOwner = Boolean(currentViewerId && reporterId && currentViewerId === reporterId);
    const municipality = getPublicMunicipality(getDocumentValue(report, 'municipality'));
    const casualties = getDocumentValue(report, 'casualties') || {};
    const evidence = buildReportEvidenceObject(report, { isOwner, isOperational });

    const publicReport = {
        _id: getEntityId(getDocumentValue(report, '_id')),
        incidentCategory: getDocumentValue(report, 'incidentCategory'),
        incidentType: getDocumentValue(report, 'incidentType'),
        title: getDocumentValue(report, 'title'),
        description: getDocumentValue(report, 'description') || '',
        address: getDocumentValue(report, 'address'),
        barangay: getDocumentValue(report, 'barangay'),
        municipalityName: getDocumentValue(report, 'municipalityName'),
        coordinates: getDocumentValue(report, 'coordinates'),
        incidentTime: getDocumentValue(report, 'incidentTime'),
        status: getDocumentValue(report, 'status'),
        severity: getDocumentValue(report, 'severity'),
        casualties: {
            injured: toNonNegativeInteger(casualties.injured),
            fatalities: toNonNegativeInteger(casualties.fatalities),
            missing: toNonNegativeInteger(casualties.missing),
        },
        respondingAgencies: getRespondingAgencies(report),
        verifiedAt: getDocumentValue(report, 'verifiedAt'),
        respondedAt: getDocumentValue(report, 'respondedAt'),
        resolvedAt: getDocumentValue(report, 'resolvedAt'),
        createdAt: getDocumentValue(report, 'createdAt'),
        updatedAt: getDocumentValue(report, 'updatedAt'),
        isOwnedByCurrentUser: isOwner,
        evidence,
        evidenceCount: evidence.evidenceCount,
    };

    if (isOwner || isOperational) {
        publicReport.images = Array.isArray(report?.images) ? report.images : [];
    }

    if (municipality) publicReport.municipality = municipality;
    return publicReport;
};

export default toPublicReport;
