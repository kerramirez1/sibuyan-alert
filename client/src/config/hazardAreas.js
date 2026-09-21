/**
 * Hazard layer presentation config.
 *
 * The server owns what each dataset *is* (geometry, classes, labels, licence).
 * This module owns how it *looks* and what it means for the zone form, because
 * that is the only part that is client-specific.
 *
 * Layers are generated per dataset rather than declared one by one: the server
 * returns a list, and each entry carries the `datasetId` its layer ids are built
 * from. Adding a hazard type server-side therefore needs no change here beyond
 * a colour ramp.
 */

export const HAZARD_MIN_ZOOM = 10;

/**
 * Fills per hazard type, keyed by class.
 *
 * Colours are deliberately distinct from the incident status palette
 * (`mapVisuals.js`): a hazard polygon and an incident marker must never be
 * mistakable for one another. They answer different questions, and this layer is
 * context behind the pins rather than a record among them.
 *
 * Landslide uses an amber/red ramp because it is slope failure. Colour encodes
 * the hazard, not the class number, so a viewer reads severity from the shade.
 *
 * The blue storm surge ramp that used to live here was removed with the storm
 * surge datasets themselves — the registry now serves landslide only.
 */
const HAZARD_TYPE_PALETTE = Object.freeze({
    landslide: Object.freeze({ 1: '#FCD34D', 2: '#F79009', 3: '#D92D20' }),
});

const FALLBACK_COLOR = '#6B7280';

/** Stable layer ids, derived from the dataset id so they cannot collide. */
export const hazardSourceId = (datasetId) => `hazard-${datasetId}`;
export const hazardFillLayerId = (datasetId) => `hazard-${datasetId}-fill`;
export const hazardOutlineLayerId = (datasetId) => `hazard-${datasetId}-outline`;

export const getHazardColor = (hazardType, hazardClass) => (
    HAZARD_TYPE_PALETTE[hazardType]?.[Number(hazardClass)] || FALLBACK_COLOR
);

/**
 * Whether this client can render the given hazard type at all.
 *
 * The palette is the client's statement of which hazard types it knows how to
 * draw. A type with no colour rule is not renderable: every one of its polygons
 * would take the flat grey fallback, which on the map and in the legend reads as
 * a real hazard class. Callers use this to drop such a layer rather than paint
 * it — the server may still be sending a dataset this client no longer knows
 * (an unregistered one, or a stale cached payload from before a deploy).
 */
export const isRenderableHazardType = (hazardType) => Boolean(
    hazardType && HAZARD_TYPE_PALETTE[hazardType]
);

/**
 * Builds the MapLibre `match` expression that colours a layer by its `haz`
 * property, so one layer can render several classes without one MapLibre layer
 * per class.
 */
export const buildHazardColorExpression = (hazardType, classes) => {
    const expression = ['match', ['get', 'haz']];
    for (const entry of classes) {
        expression.push(entry.value, getHazardColor(hazardType, entry.value));
    }
    expression.push(FALLBACK_COLOR);
    return expression;
};

/**
 * Zoom window the opacity fade spans.
 *
 * `HAZARD_MIN_ZOOM` is the zoom the layer starts being drawn at; 13 is
 * municipal / barangay scale; 16 is the operational camera ceiling
 * (`OPERATIONAL_MAX_ZOOM` in `mapProvider.js`, left literal here so this module
 * stays free of the map-engine imports). Those are the only zooms this layer is
 * ever seen at, so the fade spans exactly them and does not depend on the zoom a
 * particular map happens to open at.
 */
const FADE_START_ZOOM = HAZARD_MIN_ZOOM;
const FADE_MID_ZOOM = 13;
const FADE_END_ZOOM = 16;

/**
 * Fill opacity for the hazard reference layers, fading as the camera closes in.
 *
 * These polygons are context behind the pins, not records among them. At the
 * island overview the layer has to carry the hazard story on its own, but at
 * street level what an operator is reading is the imagery underneath — the
 * slope, the road, the building — and an opaque surface over it hides exactly the
 * detail that makes a zone placement possible. One flat opacity has to choose
 * between those two jobs, so it fades instead.
 *
 * The far stop is the opacity this layer carried at every zoom before the fade
 * (0.34 fill, 0.75 outline), so the overview still reads the way it did, and the
 * near stop stays well above zero: a hazard layer that vanishes when zoomed in is
 * a hazard layer an operator stops trusting.
 */
export const HAZARD_FILL_OPACITY = Object.freeze([
    'interpolate',
    ['linear'],
    ['zoom'],
    FADE_START_ZOOM, 0.45,
    FADE_MID_ZOOM, 0.3,
    FADE_END_ZOOM, 0.12,
]);

/**
 * Outline opacity, fading with the fill.
 *
 * The two have to move together: a full-strength boundary around a faded fill is
 * the harshest version of this layer, because the eye follows the outline while
 * the surface it encloses dissolves. Colour and width are untouched — only how
 * much of them reaches the screen.
 */
export const HAZARD_OUTLINE_OPACITY = Object.freeze([
    'interpolate',
    ['linear'],
    ['zoom'],
    FADE_START_ZOOM, 0.75,
    FADE_MID_ZOOM, 0.45,
    FADE_END_ZOOM, 0.15,
]);

/**
 * Normalizes the API's hazard payload into what the UI needs.
 *
 * `available: false` is a first-class outcome, not an error to swallow: the
 * difference between "this point is clear" and "we could not check" is the
 * difference between a confident and a reckless hazard zone, so the caller is
 * always told which one it got.
 *
 * The `tone` is per result, not global: a point can be high landslide and clear
 * storm surge, and collapsing that into one word would lose the distinction that
 * makes the layers worth having.
 */
export const describeHazards = (payload) => {
    if (!payload || payload.available !== true) {
        return {
            known: false,
            reason: payload?.reason || 'unavailable',
            results: [],
            suggestion: null,
        };
    }

    const results = (Array.isArray(payload.results) ? payload.results : [])
        .map((hazard) => {
            // `Number(null)` is 0 and 0 is finite, so a null class has to be
            // rejected before the numeric coercion or a "clear" reading becomes
            // hazard class 0.
            const rawClass = hazard?.hazardClass;
            const hazardClass = rawClass === null || rawClass === undefined || !Number.isFinite(Number(rawClass))
                ? null
                : Number(rawClass);

            return {
                datasetId: hazard.datasetId,
                hazardType: hazard.hazardType,
                hazardClass,
                label: hazard.hazardLabel || null,
                classDescription: hazard.classDescription || null,
                color: getHazardColor(hazard.hazardType, hazardClass),
                suggestedZoneType: hazard.suggestedZoneType || null,
                attribution: hazard.source || null,
            };
        });

    // The server returns results in registry order, so the first suggestion is
    // deterministic rather than dependent on query timing.
    const suggestion = results.find((result) => result.suggestedZoneType) || null;

    return {
        known: true,
        reason: payload.reason || (results.length > 0 ? 'in_hazard' : 'clear'),
        results,
        suggestion: suggestion
            ? { zoneType: suggestion.suggestedZoneType, datasetId: suggestion.datasetId }
            : null,
    };
};

/** One-line summary of every hazard at a point, for a compact form readout. */
export const summarizeHazards = (described) => {
    if (!described) return null;
    if (!described.known) return 'Hazard: could not be checked';
    if (described.results.length === 0) return 'Hazard: none mapped here';
    return `Hazard: ${described.results.map((r) => `${r.label} ${r.hazardType.replace(/_/g, ' ')}`).join(', ')}`;
};

export default {
    HAZARD_MIN_ZOOM,
    HAZARD_FILL_OPACITY,
    HAZARD_OUTLINE_OPACITY,
    hazardSourceId,
    hazardFillLayerId,
    hazardOutlineLayerId,
    getHazardColor,
    isRenderableHazardType,
    buildHazardColorExpression,
    describeHazards,
    summarizeHazards,
};
