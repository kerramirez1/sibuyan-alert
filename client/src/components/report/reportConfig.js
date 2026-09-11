import { INCIDENT_TYPE_OPTIONS } from '../../config/incidentTypes';

export const INCIDENT_CATEGORIES = {
    accident: {
        label: 'Road accident',
        // Derived from the canonical label map so the form and every display
        // path can never disagree about what a type is called.
        types: INCIDENT_TYPE_OPTIONS,
    },
};

export const SEVERITY_LEVELS = [
    { value: 'minor', label: 'Minor', dot: 'bg-emerald-500', description: 'No injuries or cosmetic damage only' },
    { value: 'moderate', label: 'Moderate', dot: 'bg-amber-500', description: 'Minor injuries requiring a medical checkup' },
    { value: 'severe', label: 'Severe', dot: 'bg-red-500', description: 'Serious injuries requiring urgent response' },
    { value: 'critical', label: 'Critical', dot: 'bg-red-800', description: 'Life-threatening injuries or fatalities' },
];
