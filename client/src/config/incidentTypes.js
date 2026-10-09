/**
 * Canonical incident type labels — the single source of truth for display.
 *
 * Why this module exists: the report form labelled a type one way
 * ("Hit and run / pedestrian") while every display path regenerated a label by
 * title-casing the raw enum value, yielding "Pedestrian". The nuance the
 * reporter selected was silently dropped, and the formatter itself had been
 * copied into four separate files.
 *
 * Both the form options and the display helper read from this map, so the label
 * a user selects is the label they later see.
 *
 * Values mirror the server's canonical list in
 * `server/config/incidentCategories.js`. A test asserts the two stay in sync.
 */

export const INCIDENT_TYPE_LABELS = Object.freeze({
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

/**
 * Canonical per-category type lists. Mirrors the server's
 * `INCIDENT_CATEGORIES` in `server/config/incidentCategories.js` — a test
 * asserts the two stay in sync, so changing the server's type list means
 * changing this one too.
 */
export const CATEGORY_TYPES = Object.freeze({
    accident: Object.freeze(['vehicular', 'motorcycle', 'pedestrian', 'bicycle', 'self_accident', 'mechanical', 'other']),
    fire: Object.freeze(['structural', 'vegetation', 'vehicular_fire', 'other_fire']),
    hazard: Object.freeze(['fallen_tree', 'fallen_post', 'road_debris', 'landslide', 'other_hazard']),
});

/** Ordered `{ value, label }` options for one category's type select. */
export const getIncidentTypeOptions = (category) => Object.freeze(
    (CATEGORY_TYPES[category] || []).map((value) => Object.freeze({ value, label: getIncidentTypeLabel(value) }))
);

/** Ordered `{ value, label }` options for form selects (all categories). */
export const INCIDENT_TYPE_OPTIONS = Object.freeze(
    Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => Object.freeze({ value, label }))
);

const toTitleCase = (value) => value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * Resolves a display label for an incident type.
 *
 * Unknown values fall back to a title-cased rendering of the raw value rather
 * than a generic placeholder, so legacy data still reads as something specific.
 */
export const getIncidentTypeLabel = (type, fallback = 'Unspecified incident') => {
    if (!type || typeof type !== 'string') return fallback;
    return INCIDENT_TYPE_LABELS[type] ?? (toTitleCase(type) || fallback);
};

/**
 * Convenience for components holding a whole report object. Reads the legacy
 * `accidentType` field so pre-migration records still resolve.
 */
export const getReportIncidentTypeLabel = (report, fallback = 'Unspecified incident') => (
    getIncidentTypeLabel(report?.incidentType || report?.accidentType, fallback)
);

export default {
    INCIDENT_TYPE_LABELS,
    INCIDENT_TYPE_OPTIONS,
    CATEGORY_TYPES,
    getIncidentTypeOptions,
    getIncidentTypeLabel,
    getReportIncidentTypeLabel,
};
