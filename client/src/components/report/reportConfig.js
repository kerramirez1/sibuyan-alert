import { getIncidentTypeOptions } from '../../config/incidentTypes';

export const INCIDENT_CATEGORIES = {
    accident: {
        label: 'Road accident',
        // Derived from the canonical label map so the form and every display
        // path can never disagree about what a type is called.
        types: getIncidentTypeOptions('accident'),
    },
    fire: {
        label: 'Fire',
        types: getIncidentTypeOptions('fire'),
    },
    hazard: {
        label: 'Road Hazard',
        types: getIncidentTypeOptions('hazard'),
    },
};

export const SEVERITY_LEVELS = [
    { value: 'minor', label: 'Minor', dot: 'bg-emerald-500', description: 'No injuries or cosmetic damage only' },
    { value: 'moderate', label: 'Moderate', dot: 'bg-amber-500', description: 'Minor injuries requiring a medical checkup' },
    { value: 'severe', label: 'Severe', dot: 'bg-red-500', description: 'Serious injuries requiring urgent response' },
    { value: 'critical', label: 'Critical', dot: 'bg-red-800', description: 'Life-threatening injuries or fatalities' },
];

/**
 * Per-category severity descriptions for the report form. The scale itself
 * (values, labels, dots) never changes — only the helper copy under the
 * severity dropdown adapts, so a fire or road hazard report is not described
 * in injury terms.
 */
export const SEVERITY_DESCRIPTIONS = {
    accident: {
        minor: 'No injuries or cosmetic damage only',
        moderate: 'Minor injuries requiring a medical checkup',
        severe: 'Serious injuries requiring urgent response',
        critical: 'Life-threatening injuries or fatalities',
    },
    fire: {
        minor: 'Small, contained fire; no spread risk',
        moderate: 'Growing fire; nearby structures or vegetation at risk',
        severe: 'Large fire; urgent response needed',
        critical: 'Uncontrolled fire threatening lives or structures',
    },
    hazard: {
        minor: 'Minor obstruction; road still passable',
        moderate: 'Partial road blockage; pass with caution',
        severe: 'Road heavily blocked; urgent clearing needed',
        critical: 'Road completely impassable or immediate danger',
    },
};

/**
 * Resolves the severity helper copy for a category. Unknown categories fall
 * back to the generic SEVERITY_LEVELS description; unknown severities fall
 * back to an empty string.
 */
export const getSeverityDescription = (category, severityValue) => SEVERITY_DESCRIPTIONS[category]?.[severityValue]
    ?? SEVERITY_LEVELS.find((l) => l.value === severityValue)?.description
    ?? '';
