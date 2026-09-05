// MVP scope: road accidents only. Maritime, fire, and natural-disaster
// incidents are out of scope and must not be accepted here.
export const INCIDENT_CATEGORIES = Object.freeze({
    accident: Object.freeze({
        label: 'Road Accident',
        types: Object.freeze([
            'vehicular',
            'motorcycle',
            'pedestrian',
            'bicycle',
            'self_accident',
            'mechanical',
            'other',
        ]),
        emoji: '🚗',
    }),
});

export const INCIDENT_CATEGORY_NAMES = Object.freeze(Object.keys(INCIDENT_CATEGORIES));

export const isSupportedIncidentType = (category, type) => (
    Boolean(category && type)
    && INCIDENT_CATEGORIES[category]?.types.includes(type) === true
);

export default INCIDENT_CATEGORIES;
