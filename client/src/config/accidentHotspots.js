/**
 * Accident-prone layer presentation config.
 *
 * The landslide layers are external GIS data and this module only decides how
 * they look. This one is different in kind: its hotspots are derived server-side
 * from the system's own accident reports (see
 * `server/utils/accidentHotspots.js`), so the *analysis rule* belongs to the
 * server and everything visual belongs here — the class colours, the layer ids,
 * and the exact words the legend uses.
 *
 * The one thing that crosses that line is the hotspot's radius, and it has to:
 * the server says how wide a hotspot is (metres), and only the map can turn
 * metres into pixels for the current zoom. The radius is read off the payload's
 * `rule`, so the circle an operator measures with the scale bar is the same 100 m
 * the reports were clustered by.
 */

/** One source, two class layers — the same shape the hazard layers use. */
export const ACCIDENT_HOTSPOT_SOURCE_ID = 'accident-hotspots';

/**
 * Where the layer starts being drawn: the same zoom the susceptibility layers
 * appear at. Below it the island is one shape on screen and a 100 m circle has
 * nowhere to land.
 */
export const ACCIDENT_HOTSPOT_MIN_ZOOM = 10;

export const ACCIDENT_HOTSPOT_MEDIUM_CLASS = 2;
export const ACCIDENT_HOTSPOT_HIGH_CLASS = 3;

/** Declared order, worst last: the legend reads medium then high. */
export const ACCIDENT_HOTSPOT_CLASS_VALUES = Object.freeze([
    ACCIDENT_HOTSPOT_MEDIUM_CLASS,
    ACCIDENT_HOTSPOT_HIGH_CLASS,
]);

/** A stable reference never to re-create a source or layer by accident. */
export const EMPTY_ACCIDENT_HOTSPOT_CLASSES = Object.freeze([]);

const CLASS_SLUGS = Object.freeze({
    [ACCIDENT_HOTSPOT_MEDIUM_CLASS]: 'medium',
    [ACCIDENT_HOTSPOT_HIGH_CLASS]: 'high',
});

export const accidentHotspotCircleLayerId = (classValue) => (
    `accident-hotspot-${CLASS_SLUGS[Number(classValue)] || 'unknown'}-circle`
);

/**
 * The rule this client assumes when a payload arrives without one.
 *
 * Mirrors `ACCIDENT_HOTSPOT_RULE_DEFAULTS` on the server, and both are asserted
 * literally in their own tests, so a drift between the two shows up as a failing
 * test rather than as a map that describes a different rule than the data was
 * derived with.
 */
export const ACCIDENT_HOTSPOT_DEFAULT_RULE = Object.freeze({
    radiusMeters: 100,
    windowDays: 30,
    mediumMinReports: 3,
    highMinReports: 6,
});

/**
 * The smallest circle this layer draws, in pixels.
 *
 * A scale-true 100 m circle is about 1.3 px at island zoom, which is not a
 * hotspot anyone can see. Below roughly zoom 12.4 the layer therefore draws this
 * minimum dot instead, and from there inwards the circle is exactly the analysis
 * area — at zoom 13 it is ~11 px, at 16 (the operational ceiling) ~86 px, both
 * confirmed against the map's own scale bar. The alternative was hiding the layer
 * at the zoom where an operator most wants the overview.
 */
export const ACCIDENT_HOTSPOT_MIN_RADIUS_PX = 7;

/**
 * MapLibre renders a 512 px world, so the equator is 78 271.5 m per pixel at
 * zoom 0 — and a metre is that much narrower towards the poles.
 */
const EQUATOR_METERS_PER_PIXEL_AT_ZOOM_ZERO = 78271.517;

/** Mid-island. Latitude moves the radius by <0.1% across Sibuyan's full extent. */
const REFERENCE_LATITUDE = 12.4;

/** Ground resolution of the rendered map, in metres per pixel. */
export const metersPerPixel = (zoom, latitude = REFERENCE_LATITUDE) => (
    (EQUATOR_METERS_PER_PIXEL_AT_ZOOM_ZERO * Math.cos((latitude * Math.PI) / 180)) / (2 ** zoom)
);

/** How many pixels a ground distance occupies at a zoom. */
export const hotspotRadiusPixels = (zoom, radiusMeters, latitude = REFERENCE_LATITUDE) => (
    Number(radiusMeters) / metersPerPixel(zoom, latitude)
);

/** The zooms the radius ramp spans: the layer's first zoom, barangay, street. */
const RADIUS_STOPS = Object.freeze([ACCIDENT_HOTSPOT_MIN_ZOOM, 13, 16]);

/**
 * A circle that is 100 m on the ground, clamped to stay visible.
 *
 * `interpolate` with `exponential: 2` is not a stylistic choice: the Web Mercator
 * scale doubles with every zoom level, so a base-2 ramp between two stops is the
 * exact ground radius at every zoom in between, not an approximation of it. The
 * latitude factor is folded in at build time (see REFERENCE_LATITUDE).
 *
 * Both classes share this: the hotspot area is the same 100 m for medium and for
 * high. What separates them is intensity, and drawing medium smaller would say
 * the medium area is a different size, which it is not.
 */
export const buildAccidentHotspotRadiusExpression = (
    radiusMeters = ACCIDENT_HOTSPOT_DEFAULT_RULE.radiusMeters,
    { minRadiusPx = ACCIDENT_HOTSPOT_MIN_RADIUS_PX } = {}
) => {
    const meters = Number(radiusMeters);
    const radius = Number.isFinite(meters) && meters > 0
        ? meters
        : ACCIDENT_HOTSPOT_DEFAULT_RULE.radiusMeters;

    const stops = RADIUS_STOPS.flatMap((zoom) => [
        zoom,
        Number(hotspotRadiusPixels(zoom, radius).toFixed(3)),
    ]);

    return [
        'max',
        ['interpolate', ['exponential', 2], ['zoom'], ...stops],
        Number(minRadiusPx),
    ];
};

/**
 * How each class is drawn.
 *
 * The ramp is rose, deliberately away from the amber/red the landslide
 * susceptibility polygons wear: the two layers can be on at once, and a hotspot
 * that looked exactly like a high-susceptibility slope would be read as one. The
 * shape separates them as well — a labelled circle is a place, a filled polygon
 * is a surface.
 *
 * Intensity is what separates Medium from High, and it moves colour, fill opacity
 * and stroke weight together — any one of them alone is hard to judge on
 * satellite imagery. Size is *not* part of it: both circles are the 100 m
 * analysis area, so a bigger dot would misstate where the hotspot ends.
 */
export const ACCIDENT_HOTSPOT_CLASS_PAINT = Object.freeze({
    [ACCIDENT_HOTSPOT_MEDIUM_CLASS]: Object.freeze({
        color: '#FB7185',
        fillOpacity: 0.25,
        strokeOpacity: 0.8,
        strokeWidth: 1.1,
    }),
    [ACCIDENT_HOTSPOT_HIGH_CLASS]: Object.freeze({
        color: '#E11D48',
        fillOpacity: 0.45,
        strokeOpacity: 0.95,
        strokeWidth: 1.8,
    }),
});

const FALLBACK_COLOR = '#6B7280';

export const getAccidentHotspotPaint = (classValue) => (
    ACCIDENT_HOTSPOT_CLASS_PAINT[Number(classValue)] || null
);

export const getAccidentHotspotColor = (classValue) => (
    getAccidentHotspotPaint(classValue)?.color || FALLBACK_COLOR
);

/** Selects one class out of the shared source. */
export const buildAccidentHotspotFilterExpression = (classValue) => (
    ['==', ['get', 'class'], Number(classValue)]
);

/**
 * The legend wording, which is also the toggle's accessible name.
 *
 * "Accident-Prone Area" and not "Susceptibility": the landslide layers publish a
 * government susceptibility rating, and this layer must not borrow that word for
 * something the system inferred from its own reports. The switch names the class
 * and the kind of area in one phrase, so a screen reader hears the same thing the
 * map draws.
 */
export const ACCIDENT_HOTSPOT_LEGEND_LABELS = Object.freeze({
    [ACCIDENT_HOTSPOT_MEDIUM_CLASS]: 'Medium Accident-Prone Area',
    [ACCIDENT_HOTSPOT_HIGH_CLASS]: 'High Accident-Prone Area',
});

export const getAccidentHotspotLegendLabel = (classValue) => (
    ACCIDENT_HOTSPOT_LEGEND_LABELS[Number(classValue)] || 'Accident-Prone Area'
);

/**
 * The one sentence that keeps this layer from being read as official data.
 *
 * It travels with the control rather than living in a doc somewhere, because the
 * person looking at the map is the one who might otherwise assume a government
 * agency produced the circles under their cursor.
 */
export const ACCIDENT_HOTSPOT_DISCLAIMER = 'Derived from Sibuyan Alert accident reports, not an official government hazard classification.';

/**
 * The rule in force for a payload, with the client defaults filling any gap.
 *
 * A payload with no rule (an older cached response) still renders — it just
 * describes the documented defaults — and every consumer (the drawn radius, the
 * empty-state text) reads the same object, so they cannot disagree.
 */
export const resolveAccidentHotspotRule = (layer) => {
    const rule = layer?.rule || {};

    return {
        radiusMeters: Number(rule.radiusMeters) > 0
            ? Number(rule.radiusMeters)
            : ACCIDENT_HOTSPOT_DEFAULT_RULE.radiusMeters,
        windowDays: Number(rule.windowDays) > 0
            ? Number(rule.windowDays)
            : ACCIDENT_HOTSPOT_DEFAULT_RULE.windowDays,
        mediumMinReports: Number(rule.mediumMinReports) > 0
            ? Number(rule.mediumMinReports)
            : ACCIDENT_HOTSPOT_DEFAULT_RULE.mediumMinReports,
        highMinReports: Number(rule.highMinReports) > 0
            ? Number(rule.highMinReports)
            : ACCIDENT_HOTSPOT_DEFAULT_RULE.highMinReports,
    };
};

/**
 * Why a class has nothing to draw, in the rule's own terms.
 *
 * Stated as the rule rather than as "no data": an operator who sees an empty
 * High layer needs to know whether that means six reports or sixty, and the
 * thresholds are the only honest answer.
 */
export const describeEmptyHotspotClass = (rule, classValue) => {
    const minimum = Number(classValue) === ACCIDENT_HOTSPOT_HIGH_CLASS
        ? rule?.highMinReports
        : rule?.mediumMinReports;
    const radius = rule?.radiusMeters;
    const days = rule?.windowDays;

    return `No area with ${minimum}+ validated reports within ${radius} m in the last ${days} days.`;
};

/**
 * A feature this client can actually draw.
 *
 * Same idea as `isRenderableHazardType`: a class with no paint rule would take
 * the grey fallback and read as a third, undocumented severity, so it is dropped
 * instead. Non-finite coordinates are dropped for the same reason a null island
 * report is dropped server-side — one bad point must not become a hotspot.
 */
export const isRenderableAccidentHotspotFeature = (feature) => {
    const [lng, lat] = feature?.geometry?.coordinates || [];
    const classValue = Number(feature?.properties?.class);

    return feature?.geometry?.type === 'Point'
        && Number.isFinite(Number(lat))
        && Number.isFinite(Number(lng))
        && Boolean(getAccidentHotspotPaint(classValue));
};

/** The classes present in a payload, in legend order. */
export const getAccidentHotspotClasses = (layer) => {
    const declared = Array.isArray(layer?.classes)
        ? layer.classes.map((entry) => Number(entry?.value ?? entry)).filter((value) => getAccidentHotspotPaint(value))
        : [];

    return declared.length > 0 ? declared : [...ACCIDENT_HOTSPOT_CLASS_VALUES];
};

export default {
    ACCIDENT_HOTSPOT_SOURCE_ID,
    ACCIDENT_HOTSPOT_MIN_ZOOM,
    ACCIDENT_HOTSPOT_CLASS_VALUES,
    ACCIDENT_HOTSPOT_DEFAULT_RULE,
    ACCIDENT_HOTSPOT_MIN_RADIUS_PX,
    accidentHotspotCircleLayerId,
    metersPerPixel,
    hotspotRadiusPixels,
    buildAccidentHotspotRadiusExpression,
    buildAccidentHotspotFilterExpression,
    getAccidentHotspotColor,
    getAccidentHotspotPaint,
    getAccidentHotspotLegendLabel,
    resolveAccidentHotspotRule,
    describeEmptyHotspotClass,
    isRenderableAccidentHotspotFeature,
    getAccidentHotspotClasses,
};
