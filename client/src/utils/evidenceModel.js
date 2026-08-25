import { resolveAssetUrl } from './assets';

/**
 * Checks if a string URL or identifier refers to a raw protected GridFS original file or upload path.
 */
export const isProtectedOriginalFileUrl = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return /\/api\/files\//i.test(trimmed)
        || /\/uploads\//i.test(trimmed)
        || /^[0-9a-fA-F]{24}$/.test(trimmed);
};

/**
 * Checks if a URL strictly matches the canonical server-generated public redacted preview endpoint pattern:
 * /api/reports/:reportId/evidence/:index/preview (optionally versioned with ?rv=...)
 */
export const isAuthorizedRedactedPreviewEndpoint = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return /^\/api\/reports\/[^/]+\/evidence\/\d+\/preview(?:\?rv=[A-Za-z0-9._-]+)?$/i.test(trimmed)
        || /^https?:\/\/[^/]+\/api\/reports\/[^/]+\/evidence\/\d+\/preview(?:\?rv=[A-Za-z0-9._-]+)?$/i.test(trimmed);
};

/**
 * Normalizes an incident evidence descriptor into a strict, single-source-of-truth model.
 * 
 * Invariants:
 * 1. The backend is the ONLY authority for evidence access. Local props cannot elevate access.
 * 2. In redacted mode ('redacted'), the ONLY valid source is a verified server redacted preview endpoint.
 *    Original URLs, GridFS file IDs, raw report.images, and unverified blobs are rejected.
 * 3. In original mode ('original'), the source is tagged with sourceKind: 'authorized-original'
 *    and accessed via authenticated protected file requests.
 * 
 * @param {Object} evidence - Server-provided evidence descriptor
 * @param {Object} options - { isOwner, isOperational, rawImages }
 * @returns {{ evidenceCount: number, viewerAccess: 'redacted'|'original'|'none', items: Array<Object> }}
 */
export const normalizeEvidenceDescriptor = (evidence, { isOwner = false, isOperational = false, rawImages = [] } = {}) => {
    // 1. Strict server-only authorization determination
    const serverViewerAccess = evidence?.viewerAccess;
    const isOriginalAuthorized = serverViewerAccess === 'original';
    const viewerAccess = isOriginalAuthorized ? 'original' : 'redacted';

    const declaredCount = Number(evidence?.evidenceCount ?? evidence?.count);
    const rawItems = Array.isArray(evidence?.items) ? evidence.items : [];
    const count = Math.max(
        Number.isFinite(declaredCount) && declaredCount >= 0 ? Math.floor(declaredCount) : 0,
        rawItems.length,
        isOriginalAuthorized && Array.isArray(rawImages) ? rawImages.length : 0
    );

    if (count === 0 && rawItems.length === 0) {
        return {
            evidenceCount: 0,
            count: 0,
            viewerAccess: 'none',
            items: [],
        };
    }

    if (viewerAccess === 'redacted') {
        const items = rawItems.map((item, idx) => {
            const index = Number.isFinite(Number(item?.index)) ? Number(item.index) : idx;

            // Candidate URL must strictly be the canonical server-generated preview endpoint.
            // Prefer a valid canonical candidate instead of allowing an invalid redactedPreviewUrl
            // to mask a valid previewUrl.
            const candidateUrls = [item?.redactedPreviewUrl, item?.previewUrl]
                .filter((value) => typeof value === 'string' && value.trim())
                .map((value) => value.trim());
            const rawCandidate = candidateUrls.find((value) => isAuthorizedRedactedPreviewEndpoint(value)) || '';

            // Reject any protected GridFS or unauthorized sources
            const isForbiddenOriginal = candidateUrls.some((value) => isProtectedOriginalFileUrl(value)) && !rawCandidate;

            // In redacted mode, accept ONLY canonical server-generated redacted preview endpoints
            const isCanonicalRedactedEndpoint = isAuthorizedRedactedPreviewEndpoint(rawCandidate);
            const validPreviewUrl = (!isForbiddenOriginal && isCanonicalRedactedEndpoint) ? rawCandidate : '';
            const resolvedSrc = validPreviewUrl ? resolveAssetUrl(validPreviewUrl) : '';


            const detectionStatus = item?.detectionStatus
                || (item?.redactionType === 'face_blur' ? 'faces_detected' : 'processing');
            const redactionType = item?.redactionType || (detectionStatus === 'no_faces_detected' ? 'none' : 'privacy_preview');

            let defaultAlt = `Incident evidence photo ${index + 1}`;
            if (detectionStatus === 'faces_detected') {
                defaultAlt = `Incident evidence photo ${index + 1}, faces blurred for privacy`;
            } else if (detectionStatus === 'detector_failed' || detectionStatus === 'invalid_image' || detectionStatus === 'processing') {
                defaultAlt = `Incident evidence photo ${index + 1}, privacy-safe preview`;
            }

            return {
                id: String(item?.id ?? idx),
                index,
                viewerAccess: 'redacted',
                sourceKind: 'redacted-preview',
                src: resolvedSrc,
                redactedPreviewUrl: validPreviewUrl,
                originalUrl: undefined,
                isForbiddenOriginal,
                isUnavailable: !resolvedSrc,
                detectionStatus,
                redactionType,
                redactionVersion: item?.redactionVersion || null,
                detectorVersion: item?.detectorVersion || null,
                alt: item?.alt || defaultAlt,
                isOwner: false,
                isOperational: false,
            };
        });

        return {
            evidenceCount: count,
            count,
            viewerAccess: 'redacted',
            items,
        };
    }

    // viewerAccess === 'original' (authorized report owner or operational responder/admin)
    let items = [];
    if (rawItems.length > 0) {
        items = rawItems.map((item, idx) => {
            const index = Number.isFinite(Number(item?.index)) ? Number(item.index) : idx;
            const originalUrl = item?.originalUrl || item?.previewUrl || item?.source || '';
            const redactedPreviewUrl = item?.redactedPreviewUrl || '';

            return {
                id: String(item?.id ?? idx),
                index,
                viewerAccess: 'original',
                sourceKind: 'authorized-original',
                src: originalUrl,
                originalUrl,
                redactedPreviewUrl,
                isForbiddenOriginal: false,
                isUnavailable: !originalUrl,
                detectionStatus: item?.detectionStatus || 'no_faces_detected',
                redactionType: item?.redactionType || 'none',
                alt: item?.alt || `Incident evidence photo ${index + 1}`,
                isOwner: Boolean(isOwner || item?.isOwner),
                isOperational: Boolean(isOperational || item?.isOperational),
            };
        });
    } else if (Array.isArray(rawImages) && rawImages.length > 0) {
        items = rawImages.map((img, idx) => ({
            id: String(idx),
            index: idx,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: img,
            originalUrl: img,
            redactedPreviewUrl: undefined,
            isForbiddenOriginal: false,
            isUnavailable: !img,
            detectionStatus: 'no_faces_detected',
            redactionType: 'none',
            alt: `Incident evidence photo ${idx + 1}`,
            isOwner: Boolean(isOwner),
            isOperational: Boolean(isOperational),
        }));
    }

    return {
        evidenceCount: Math.max(count, items.length),
        count: Math.max(count, items.length),
        viewerAccess: 'original',
        items,
    };
};

export default {
    isProtectedOriginalFileUrl,
    isAuthorizedRedactedPreviewEndpoint,
    normalizeEvidenceDescriptor,
};
