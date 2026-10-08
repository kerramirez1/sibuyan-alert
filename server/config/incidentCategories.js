// Incident scope: road accidents plus fire and crime incidents.
// Maritime and natural-disaster incidents remain out of scope and must not
// be accepted here.
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
    fire: Object.freeze({
        label: 'Fire Incident',
        types: Object.freeze([
            'structural',
            'vegetation',
            'vehicular_fire',
            'other_fire',
        ]),
        emoji: '🔥',
    }),
    crime: Object.freeze({
        label: 'Crime Incident',
        types: Object.freeze([
            'theft',
            'assault',
            'vandalism',
            'other_crime',
        ]),
        emoji: '🚨',
    }),
});

export const INCIDENT_CATEGORY_NAMES = Object.freeze(Object.keys(INCIDENT_CATEGORIES));

export const isSupportedIncidentType = (category, type) => (
    Boolean(category && type)
    && INCIDENT_CATEGORIES[category]?.types.includes(type) === true
);

export default INCIDENT_CATEGORIES;
