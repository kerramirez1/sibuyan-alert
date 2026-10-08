/**
 * Canonical per-type display labels for the server.
 *
 * Mirrors the client-side canonical map in `client/src/config/incidentTypes.js`.
 * The type KEYS are owned by `server/config/incidentCategories.js` (the
 * validation source of truth); this module owns only the display labels so
 * server-side projections (e.g. viewController) render the same wording as
 * every client display path. A test asserts the two stay in sync.
 */
const INCIDENT_TYPE_LABELS = Object.freeze({
    vehicular: 'Vehicular collision',
    motorcycle: 'Motorcycle accident',
    pedestrian: 'Hit and run / pedestrian',
    bicycle: 'Bicycle accident',
    self_accident: 'Self accident',
    mechanical: 'Mechanical failure',
    other: 'Other road incident',
    structural: 'Structural fire',
    vegetation: 'Forest/grass fire',
    vehicular_fire: 'Vehicle fire',
    other_fire: 'Other fire incident',
    theft: 'Theft',
    assault: 'Assault',
    vandalism: 'Vandalism',
    other_crime: 'Other crime incident',
});

export { INCIDENT_TYPE_LABELS };

/**
 * Resolves a display label for an incident type.
 * Unknown values fall back rather than throwing, so legacy or foreign data
 * still renders as something readable.
 */
export const getIncidentTypeLabel = (type, fallback = 'Incident') => {
    if (!type || typeof type !== 'string') return fallback;
    return INCIDENT_TYPE_LABELS[type] ?? fallback;
};

export default { INCIDENT_TYPE_LABELS, getIncidentTypeLabel };
