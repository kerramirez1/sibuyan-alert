export const INCIDENT_CATEGORIES = Object.freeze({
    accident: Object.freeze({
        label: 'Vehicle Accident',
        types: Object.freeze([
            'vehicular',
            'motorcycle',
            'pedestrian',
            'bicycle',
            'maritime',
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
