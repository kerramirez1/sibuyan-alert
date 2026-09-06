export const INCIDENT_CATEGORIES = {
    accident: {
        label: 'Road accident',
        types: [
            { value: 'vehicular', label: 'Vehicular collision' },
            { value: 'motorcycle', label: 'Motorcycle accident' },
            { value: 'pedestrian', label: 'Hit and run / pedestrian' },
            { value: 'bicycle', label: 'Bicycle accident' },
            { value: 'self_accident', label: 'Self accident' },
            { value: 'mechanical', label: 'Mechanical failure' },
            { value: 'other', label: 'Other road incident' },
        ],
    },
};

export const SEVERITY_LEVELS = [
    { value: 'minor', label: 'Minor', dot: 'bg-emerald-500', description: 'No injuries or cosmetic damage only' },
    { value: 'moderate', label: 'Moderate', dot: 'bg-amber-500', description: 'Minor injuries requiring a medical checkup' },
    { value: 'severe', label: 'Severe', dot: 'bg-red-500', description: 'Serious injuries requiring urgent response' },
    { value: 'critical', label: 'Critical', dot: 'bg-red-800', description: 'Life-threatening injuries or fatalities' },
];
