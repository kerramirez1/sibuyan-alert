// Incident scope: road accidents, fire incidents, and road hazards.
// Maritime and natural-disaster incidents remain out of scope and must not
// be accepted here. The 'other' category does not widen that scope: it only
// gives the reporter a free-text detail (incidentCategoryDetail) for
// incidents that fit none of the three, and the form points maritime and
// crime reports to the Coast Guard and the PNP instead.
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
    hazard: Object.freeze({
        label: 'Road Hazard',
        types: Object.freeze([
            'fallen_tree',
            'fallen_post',
            'road_debris',
            'landslide',
            'other_hazard',
        ]),
        emoji: '⚠️',
    }),
    other: Object.freeze({
        label: 'Other',
        types: Object.freeze([
            'other',
        ]),
        emoji: '📋',
    }),
});

export const INCIDENT_CATEGORY_NAMES = Object.freeze(Object.keys(INCIDENT_CATEGORIES));

export const isSupportedIncidentType = (category, type) => (
    Boolean(category && type)
    && INCIDENT_CATEGORIES[category]?.types.includes(type) === true
);

export default INCIDENT_CATEGORIES;
