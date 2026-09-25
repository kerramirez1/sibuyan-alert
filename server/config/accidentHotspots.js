/**
 * Accident-hotspot analysis parameters.
 *
 * These numbers describe *this system's* analysis, not a safety standard. They
 * live here, in one object, for a specific reason: the map draws whatever the
 * server derived, so the day an operations decision says "three reports in 100 m
 * is not enough", the change is one value — not a hunt through a Mongo pipeline,
 * a route and a MapLibre expression. The payload carries the resolved rule back
 * to the client, so the map, the legend and the empty-state copy cannot describe
 * a different rule than the one that produced the data.
 *
 * Env-overridable, in the same shape as `queryPolicy.js`: a malformed value
 * falls back to the documented default rather than taking the layer down.
 */

export const ACCIDENT_HOTSPOT_RULE_DEFAULTS = Object.freeze({
    /**
     * The spatial coverage of one hotspot, in metres.
     *
     * A report joins a hotspot when it is within this distance of that hotspot's
     * own anchor coordinate. The drawn circle is exactly this radius, so the
     * area an operator sees on the map is the area the rule used — not an
     * approximation of it.
     */
    radiusMeters: 100,

    /** All-time historical analysis: includes all validated reports. */
    timeScope: 'all_time',
    windowDays: null,

    /**
     * Reports needed in one 100 m area before it is classified at all.
     *
     * The floor is what makes "one accident is not accident-prone" a property of
     * the analysis rather than a comment: below this count a cluster is dropped
     * entirely, and it can never be clamped to 1 (see the guard below), because a
     * single record is not evidence of a pattern no matter how it is configured.
     */
    mediumMinReports: 3,

    /** Reports needed for the stronger class. */
    highMinReports: 6,
});

/**
 * Hard safety ceiling on reports processed into one derivation to prevent
 * runaway memory/CPU loops, while allowing the complete historical dataset
 * to be processed without arbitrary truncation.
 */
export const ACCIDENT_HOTSPOT_SAFETY_CEILING = 50_000;
export const ACCIDENT_HOTSPOT_MAX_REPORTS = ACCIDENT_HOTSPOT_SAFETY_CEILING;

const readPositiveNumber = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The rule actually in force, with the invariants the classes depend on.
 *
 * Two of them are structural rather than cosmetic:
 *
 * - `mediumMinReports` can never fall below 2. An "accident-prone area" made of
 *   one accident is not a weaker version of this layer, it is a different and
 *   misleading claim.
 * - `highMinReports` must sit above `mediumMinReports`, or a cluster could be
 *   both classes at once and the two switches would fight over the same points.
 */
export const resolveAccidentHotspotRule = (env = process.env) => {
    const mediumMinReports = Math.max(
        2,
        Math.round(readPositiveNumber(env.ACCIDENT_HOTSPOT_MEDIUM_MIN_REPORTS, ACCIDENT_HOTSPOT_RULE_DEFAULTS.mediumMinReports))
    );
    const configuredHigh = Math.round(
        readPositiveNumber(env.ACCIDENT_HOTSPOT_HIGH_MIN_REPORTS, ACCIDENT_HOTSPOT_RULE_DEFAULTS.highMinReports)
    );

    return Object.freeze({
        radiusMeters: readPositiveNumber(env.ACCIDENT_HOTSPOT_RADIUS_METERS, ACCIDENT_HOTSPOT_RULE_DEFAULTS.radiusMeters),
        timeScope: 'all_time',
        windowDays: null,
        mediumMinReports,
        highMinReports: configuredHigh > mediumMinReports
            ? configuredHigh
            : Math.max(mediumMinReports + 1, ACCIDENT_HOTSPOT_RULE_DEFAULTS.highMinReports),
    });
};

export default {
    ACCIDENT_HOTSPOT_RULE_DEFAULTS,
    ACCIDENT_HOTSPOT_SAFETY_CEILING,
    ACCIDENT_HOTSPOT_MAX_REPORTS,
    resolveAccidentHotspotRule,
};
