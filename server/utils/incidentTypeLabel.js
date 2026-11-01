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
    fallen_tree: 'Fallen tree',
    fallen_post: 'Fallen post/pole',
    road_debris: 'Debris on road',
    landslide: 'Landslide/rockfall',
    other_hazard: 'Other road hazard',
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

/**
 * Resolves the display label for a whole report. Every category resolves
 * through the flat type map above, except 'other': that category's type is
 * the reporter's own words, so staff and the owner see "Other — <detail>".
 * Public payloads never carry the detail, so their label is the bare
 * "Other incident" — the detail is the reporter's free text and stays on
 * the operational side.
 */
export const getReportIncidentTypeLabel = (report, { publicView = false } = {}) => {
    const type = report?.incidentType || report?.accidentType;
    if (report?.incidentCategory === 'other' && (type === 'other' || !type)) {
        const detail = typeof report?.incidentCategoryDetail === 'string'
            ? report.incidentCategoryDetail.trim()
            : '';
        if (!publicView && detail) return `Other — ${detail}`;
        return 'Other incident';
    }
    return getIncidentTypeLabel(type, 'Incident');
};

export default { INCIDENT_TYPE_LABELS, getIncidentTypeLabel, getReportIncidentTypeLabel };
