/**
 * Unfinished-form draft for the incident report form.
 *
 * Split from the offline queue on purpose:
 *   - `offlineReportQueue` (IndexedDB) holds reports the reporter SUBMITTED.
 *   - this draft (localStorage) holds a form that was NEVER submitted — the
 *     reporter closed the tab, failed validation, or lost power mid-typing.
 *
 * Photos are never stored here (File objects do not survive localStorage and
 * would blow the 5MB quota). A restored draft tells the reporter to re-attach
 * photos. Auth tokens are never stored here either.
 */

import {
    REPORT_DRAFT_MAX_AGE_MS,
    REPORT_DRAFT_STORAGE_KEY,
} from '../config/reportSubmission';

export const REPORT_DRAFT_VERSION = 1;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeCasualties = (casualties) => {
    const source = isRecord(casualties) ? casualties : {};
    const pick = (key) => {
        const raw = source[key];
        if (raw === '' || raw === null || raw === undefined) return '';
        const parsed = Number.parseInt(String(raw), 10);
        if (!Number.isFinite(parsed)) return '';
        return Math.min(999, Math.max(0, parsed));
    };
    return { injured: pick('injured'), fatalities: pick('fatalities'), missing: pick('missing') };
};

const sanitizeText = (value, maxLength) => {
    if (typeof value !== 'string') return '';
    return value.slice(0, maxLength);
};

const sanitizeLocation = (location) => {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
};

const sanitizeLocationCapture = (capture) => {
    if (!isRecord(capture) || typeof capture.source !== 'string') return null;
    const accuracy = capture.accuracyMeters === null || capture.accuracyMeters === undefined
        ? null
        : Number(capture.accuracyMeters);
    return {
        source: capture.source.slice(0, 32),
        accuracyMeters: accuracy !== null && Number.isFinite(accuracy) ? accuracy : null,
        capturedAt: typeof capture.capturedAt === 'string' ? capture.capturedAt.slice(0, 64) : null,
    };
};

/**
 * True when the form holds anything worth restoring. A pristine form (defaults
 * + no location + no text) is not a draft — storing it would resurrect an
 * empty form over a fresh one on every visit.
 */
export const isDraftWorthy = ({ formData, selectedLocation } = {}) => {
    if (sanitizeLocation(selectedLocation)) return true;
    if (!isRecord(formData)) return false;
    if (sanitizeText(formData.description, 2000).trim()) return true;
    if (sanitizeText(formData.address, 500).trim()) return true;
    if (sanitizeText(formData.barangay, 200).trim()) return true;
    if (sanitizeText(formData.incidentTime, 64).trim()) return true;
    const casualties = sanitizeCasualties(formData.casualties);
    if (casualties.injured !== '' || casualties.fatalities !== '' || casualties.missing !== '') return true;
    if (formData.severity && formData.severity !== 'moderate') return true;
    if (formData.incidentType && formData.incidentType !== 'vehicular') return true;
    if (formData.incidentCategory && formData.incidentCategory !== 'accident') return true;
    return false;
};

export const buildDraftPayload = ({ formData, selectedLocation, locationCapture } = {}) => ({
    version: REPORT_DRAFT_VERSION,
    updatedAt: Date.now(),
    formData: {
        incidentCategory: sanitizeText(formData?.incidentCategory, 64) || 'accident',
        incidentType: sanitizeText(formData?.incidentType, 64) || 'vehicular',
        description: sanitizeText(formData?.description, 2000),
        address: sanitizeText(formData?.address, 500),
        barangay: sanitizeText(formData?.barangay, 200),
        incidentTime: sanitizeText(formData?.incidentTime, 64),
        severity: sanitizeText(formData?.severity, 32) || 'moderate',
        casualties: sanitizeCasualties(formData?.casualties),
    },
    selectedLocation: sanitizeLocation(selectedLocation),
    locationCapture: sanitizeLocationCapture(locationCapture),
});

const readStorage = () => {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(REPORT_DRAFT_STORAGE_KEY);
    } catch {
        return null;
    }
};

export const saveReportDraft = ({ formData, selectedLocation, locationCapture } = {}) => {
    try {
        if (typeof localStorage === 'undefined') return false;
        if (!isDraftWorthy({ formData, selectedLocation })) {
            try {
                localStorage.removeItem(REPORT_DRAFT_STORAGE_KEY);
            } catch {
                // Removing a pristine draft is best-effort only.
            }
            return false;
        }
        localStorage.setItem(
            REPORT_DRAFT_STORAGE_KEY,
            JSON.stringify(buildDraftPayload({ formData, selectedLocation, locationCapture })),
        );
        return true;
    } catch {
        // Private mode / quota full: the form simply stays in memory.
        return false;
    }
};

/**
 * @returns {{formData, selectedLocation, locationCapture, updatedAt}|null}
 *   null when there is no draft, it expired, or it fails validation.
 */
export const loadReportDraft = (now = Date.now()) => {
    const raw = readStorage();
    if (!raw) return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || parsed.version !== REPORT_DRAFT_VERSION) return null;
    if (!Number.isFinite(parsed.updatedAt) || (now - parsed.updatedAt) > REPORT_DRAFT_MAX_AGE_MS) return null;
    if (!isRecord(parsed.formData)) return null;

    const payload = buildDraftPayload({
        formData: parsed.formData,
        selectedLocation: parsed.selectedLocation,
        locationCapture: parsed.locationCapture,
    });
    if (!isDraftWorthy({ formData: payload.formData, selectedLocation: payload.selectedLocation })) return null;
    return {
        formData: payload.formData,
        selectedLocation: payload.selectedLocation,
        locationCapture: payload.locationCapture,
        updatedAt: parsed.updatedAt,
    };
};

export const clearReportDraft = () => {
    try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.removeItem(REPORT_DRAFT_STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
};

export default {
    buildDraftPayload,
    clearReportDraft,
    isDraftWorthy,
    loadReportDraft,
    saveReportDraft,
};
