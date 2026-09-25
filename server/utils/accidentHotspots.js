/**
 * Accident-prone area derivation.
 *
 * The landslide layers are government GIS data: PHIVOLCS drew the polygons and
 * this system only draws them. Accident-prone areas are the opposite — nothing
 * has drawn them, and the only evidence the system holds is its own accident
 * reports. So they are *derived*: validated reports are grouped into hotspots,
 * and a hotspot's class is the number of validated reports inside it.
 *
 * Four properties make that honest rather than decorative:
 *
 * - **Only validated records count.** `ACCIDENT_HOTSPOT_STATUSES` is the
 *   publishable set the rest of the app already treats as "this happened":
 *   `pending` is unverified and `rejected` was dismissed, so neither may pull a
 *   hotspot onto the map. Deleted reports are not in the collection at all, and a
 *   record without usable coordinates is dropped rather than guessed at.
 * - **A hotspot is an area, not a point.** Reports are grouped by distance: a
 *   report joins a hotspot when it lies within the rule's radius of that
 *   hotspot's own anchor. One accident is therefore never a hotspot, and the
 *   radius is the same number the map draws.
 * - **The thresholds are configuration, not truth.** How many reports make an
 *   area worth flagging is an operational decision with no universal answer, so
 *   it lives in `config/accidentHotspots.js` and travels in the payload.
 * - **No report ever reaches the client.** A hotspot carries an anchor, a count
 *   and a class. Reporter, address, title, description and report ids are never
 *   selected — not filtered out at the end, but never in the pipeline.
 *
 * This is deliberately NOT official hazard data, and the payload says so through
 * `source` and `derivedFromReports`: it is the system's own read of its own
 * reports, over a rolling window, by a published rule.
 */

import { SIBUYAN_HAZARD_EXTENT } from '../config/hazardDatasets.js';
import {
    ACCIDENT_HOTSPOT_RULE_DEFAULTS,
    resolveAccidentHotspotRule,
} from '../config/accidentHotspots.js';

export { ACCIDENT_HOTSPOT_RULE_DEFAULTS, resolveAccidentHotspotRule };

/**
 * Lifecycle states that count as a validated accident.
 *
 * Same publishable set as `getReports` and the public map. `transferred` is
 * included on purpose: it means the record was verified and reassigned to
 * another municipality, which is still a validated accident at that location.
 * Leaving it out is what makes the older `getHighRiskZones` aggregation report
 * nothing on an island whose only report is transferred.
 */
export const ACCIDENT_HOTSPOT_STATUSES = Object.freeze([
    'verified',
    'transferred',
    'responding',
    'resolved',
]);

/** Class values, following the same numbering the hazard layers use. */
export const ACCIDENT_HOTSPOT_CLASSES = Object.freeze({
    medium: 2,
    high: 3,
});

/**
 * How far outside the island extent a report may sit and still be plotted.
 *
 * The extent is a coarse envelope for "is this plausibly Sibuyan", not a
 * surveyed coastline, and a report pinned on a beach or a pier can round a few
 * metres outside it. Dropping those would silently lose real accidents, so the
 * tolerance is roughly one kilometre. A report from another island, or a null
 * island (0, 0), is still rejected.
 */
const BOUNDS_TOLERANCE_DEGREES = 0.01;

/** The envelope a report must fall inside to be plotted. */
export const ACCIDENT_HOTSPOT_BOUNDS = Object.freeze({
    minLat: SIBUYAN_HAZARD_EXTENT.minLat - BOUNDS_TOLERANCE_DEGREES,
    maxLat: SIBUYAN_HAZARD_EXTENT.maxLat + BOUNDS_TOLERANCE_DEGREES,
    minLng: SIBUYAN_HAZARD_EXTENT.minLng - BOUNDS_TOLERANCE_DEGREES,
    maxLng: SIBUYAN_HAZARD_EXTENT.maxLng + BOUNDS_TOLERANCE_DEGREES,
});

/** Mean Earth radius, for the haversine below. */
const EARTH_RADIUS_METERS = 6_371_008.8;

/**
 * The query filter for "reports that may contribute to a hotspot".
 *
 * Exported so the aggregation and the tests share one definition: a report
 * counts when it is validated, recent, and has numeric coordinates inside the
 * island envelope. The filter is applied in the database rather than after the
 * fetch, because the alternative is transferring every report's coordinates on
 * every map load just to discard most of them.
 */
/**
 * The query filter for "reports that may contribute to a hotspot".
 *
 * Exported so the aggregation and the tests share one definition: a report
 * counts when it is validated and has numeric coordinates inside the island
 * envelope. The all-time layer includes all historical validated reports.
 */
export const buildAccidentHotspotMatch = (firstArg, secondArg) => {
    const rule = (firstArg instanceof Date ? secondArg : firstArg) || resolveAccidentHotspotRule();

    const match = {
        status: { $in: [...ACCIDENT_HOTSPOT_STATUSES] },
        'coordinates.lat': {
            $type: 'number',
            $gte: ACCIDENT_HOTSPOT_BOUNDS.minLat,
            $lte: ACCIDENT_HOTSPOT_BOUNDS.maxLat,
        },
        'coordinates.lng': {
            $type: 'number',
            $gte: ACCIDENT_HOTSPOT_BOUNDS.minLng,
            $lte: ACCIDENT_HOTSPOT_BOUNDS.maxLng,
        },
    };

    // If a legacy caller specifically supplies a positive windowDays override without all_time scope
    if (Number(rule?.windowDays) > 0 && rule?.timeScope !== 'all_time') {
        const now = (firstArg instanceof Date) ? firstArg : new Date();
        match.incidentTime = { $gte: new Date(now.getTime() - (rule.windowDays * 24 * 60 * 60 * 1000)) };
    }

    return match;
};

/** Whether a coordinate may be plotted. Mirrors the query filter, for points. */
export const isValidHotspotCoordinate = (lat, lng) => {
    const latitude = Number(lat);
    const longitude = Number(lng);

    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= ACCIDENT_HOTSPOT_BOUNDS.minLat
        && latitude <= ACCIDENT_HOTSPOT_BOUNDS.maxLat
        && longitude >= ACCIDENT_HOTSPOT_BOUNDS.minLng
        && longitude <= ACCIDENT_HOTSPOT_BOUNDS.maxLng;
};

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a flat approximation: at 100 m the difference is
 * negligible, but the comparison is the whole rule here, so it should be the
 * right formula rather than one that happens to be close enough on this island.
 */
export const haversineMeters = (from, to) => {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;

    const deltaLat = toRadians(Number(to.lat) - Number(from.lat));
    const deltaLng = toRadians(Number(to.lng) - Number(from.lng));
    const lat1 = toRadians(Number(from.lat));
    const lat2 = toRadians(Number(to.lat));

    const a = (Math.sin(deltaLat / 2) ** 2)
        + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLng / 2) ** 2));

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** Rounds to ~0.1 m. The drawn radius is 100 m, so finer precision is noise. */
const roundCoordinate = (value) => Number(Number(value).toFixed(6));

/**
 * Creates an incremental cluster accumulator for streaming/cursor processing.
 *
 * Maintains fixed anchor grouping with spatial grid indexing (~0.002 deg cells, ~220 m)
 * so anchor lookups are O(1) while strictly preserving the deterministic earliest-anchor
 * matching rule and exact haversine distance verification.
 */
export const createHotspotClusterer = ({ radiusMeters = ACCIDENT_HOTSPOT_RULE_DEFAULTS.radiusMeters } = {}) => {
    const radius = Number(radiusMeters);
    const reach = Number.isFinite(radius) && radius > 0 ? radius : ACCIDENT_HOTSPOT_RULE_DEFAULTS.radiusMeters;

    const CELL_SIZE = 0.002;
    const grid = new Map();
    const hotspots = [];
    let totalConsidered = 0;

    const cellKey = (cLat, cLng) => `${Math.floor(cLat / CELL_SIZE)}:${Math.floor(cLng / CELL_SIZE)}`;

    const addPoint = (point) => {
        const lat = Number(point?.lat);
        const lng = Number(point?.lng);
        if (!isValidHotspotCoordinate(lat, lng)) return false;

        totalConsidered += 1;

        const cellLat = Math.floor(lat / CELL_SIZE);
        const cellLng = Math.floor(lng / CELL_SIZE);

        let earliestMatch = null;
        let earliestMatchIndex = Number.POSITIVE_INFINITY;

        for (let dLat = -1; dLat <= 1; dLat += 1) {
            for (let dLng = -1; dLng <= 1; dLng += 1) {
                const key = `${cellLat + dLat}:${cellLng + dLng}`;
                const candidates = grid.get(key);
                if (candidates) {
                    for (const candidateIndex of candidates) {
                        if (candidateIndex < earliestMatchIndex) {
                            const candidate = hotspots[candidateIndex];
                            if (haversineMeters(candidate, { lat, lng }) <= reach) {
                                earliestMatch = candidate;
                                earliestMatchIndex = candidateIndex;
                            }
                        }
                    }
                }
            }
        }

        if (earliestMatch) {
            earliestMatch.count += 1;
            return true;
        }

        const newIndex = hotspots.length;
        const newHotspot = { lat, lng, count: 1 };
        hotspots.push(newHotspot);

        const currentKey = cellKey(lat, lng);
        if (!grid.has(currentKey)) {
            grid.set(currentKey, [newIndex]);
        } else {
            grid.get(currentKey).push(newIndex);
        }

        return true;
    };

    const getHotspots = () => hotspots.map((hotspot) => ({
        lat: roundCoordinate(hotspot.lat),
        lng: roundCoordinate(hotspot.lng),
        count: hotspot.count,
    }));

    return {
        addPoint,
        getHotspots,
        get totalReports() {
            return totalConsidered;
        },
    };
};

/**
 * Groups reports into hotspots, each with a fixed anchor.
 *
 * The anchor is the hotspot's first (earliest) report, and a later report joins
 * it when it lies within `radiusMeters` of that anchor. Anchoring at the first
 * report rather than at a running centroid is deliberate, and it keeps two
 * promises at once:
 *
 * - **The drawing is the rule.** A circle of exactly this radius drawn on the
 *   anchor is guaranteed to contain every member, because membership was decided
 *   against that same centre.
 * - **A hotspot stays bounded.** Chain-grouping (A near B, B near C, C near D…)
 *   turns a run of scattered accidents into one hotspot spanning kilometres.
 *
 * Order matters, so the caller sorts deterministically (earliest first, then by
 * id) and the same data always produces the same hotspots.
 *
 * @param {Array<{lat: number, lng: number}>} points reports in consideration order
 * @param {{ radiusMeters?: number }} [options]
 * @returns {Array<{lat: number, lng: number, count: number}>} hotspots, in
 *   discovery order, each with the number of reports in it
 */
export const clusterAccidentReports = (points, { radiusMeters = ACCIDENT_HOTSPOT_RULE_DEFAULTS.radiusMeters } = {}) => {
    const clusterer = createHotspotClusterer({ radiusMeters });
    for (const point of Array.isArray(points) ? points : []) {
        clusterer.addPoint(point);
    }
    return clusterer.getHotspots();
};

/**
 * Drops the hotspots that are not a pattern, and classes the rest.
 *
 * Below `mediumMinReports` a hotspot is removed rather than shown faintly: two
 * accidents at a junction are two accidents, and colouring them "accident-prone"
 * would be the system asserting a pattern the data does not support. The
 * thresholds are read from the rule, so this function never contains a number
 * anyone would have to hunt for.
 */
export const classifyHotspotClusters = (clusters, rule = resolveAccidentHotspotRule()) => {
    const { mediumMinReports, highMinReports } = rule;

    return (Array.isArray(clusters) ? clusters : [])
        .filter((cluster) => Number(cluster?.count) >= mediumMinReports)
        .map((cluster) => ({
            lat: cluster.lat,
            lng: cluster.lng,
            count: Number(cluster.count),
            class: Number(cluster.count) >= highMinReports
                ? ACCIDENT_HOTSPOT_CLASSES.high
                : ACCIDENT_HOTSPOT_CLASSES.medium,
        }))
        // Worst first, then by position: two requests for unchanged data produce
        // byte-identical payloads, which is what the ETag assumes.
        .sort((left, right) => (
            right.count - left.count
            || left.lat - right.lat
            || left.lng - right.lng
        ));
};

/**
 * One GeoJSON point per hotspot — the anchor the circle is drawn around.
 *
 * Points, not polygons: the hotspot is a distance rule, and drawing a boundary
 * would present an analysis parameter as a surveyed perimeter. The radius itself
 * is not repeated per feature; it belongs to the layer's rule, where it can only
 * have one value.
 */
export const buildHotspotFeatureCollection = (clusters) => ({
    type: 'FeatureCollection',
    features: (Array.isArray(clusters) ? clusters : []).map((cluster) => ({
        type: 'Feature',
        properties: {
            class: cluster.class,
            count: cluster.count,
        },
        geometry: {
            type: 'Point',
            coordinates: [cluster.lng, cluster.lat],
        },
    })),
});

/**
 * Assembles the map layer payload from the validated reports or precomputed clusters.
 *
 * @param {Array<{lat: number, lng: number}>|Array<{lat: number, lng: number, count: number}>} reportsOrClusters
 * @param {object} [rule] the resolved analysis rule
 * @param {object} [totalsMetadata] completeness and report count metadata
 */
export const buildAccidentHotspotLayer = (reportsOrClusters, rule = resolveAccidentHotspotRule(), totalsMetadata = {}) => {
    const rawClusters = Array.isArray(reportsOrClusters) && reportsOrClusters.length > 0 && typeof reportsOrClusters[0]?.count === 'number'
        ? reportsOrClusters
        : clusterAccidentReports(reportsOrClusters, { radiusMeters: rule.radiusMeters });

    const hotspots = classifyHotspotClusters(rawClusters, rule);
    const totalReports = totalsMetadata.reports ?? (Array.isArray(reportsOrClusters) ? reportsOrClusters.length : 0);
    const truncated = Boolean(totalsMetadata.truncated);

    return {
        datasetId: 'accident_hotspots',
        label: 'Accident-prone',
        source: 'Sibuyan Alert accident reports',
        derivedFromReports: true,
        method: 'radius_cluster',
        scope: 'all_time',
        timeScope: rule.timeScope || 'all_time',
        rule: Object.freeze({ ...rule }),
        classes: [
            { value: ACCIDENT_HOTSPOT_CLASSES.medium, label: 'Medium' },
            { value: ACCIDENT_HOTSPOT_CLASSES.high, label: 'High' },
        ],
        features: buildHotspotFeatureCollection(hotspots).features,
        totals: {
            reports: totalReports,
            hotspots: hotspots.length,
            clusteredReports: hotspots.reduce((total, hotspot) => total + hotspot.count, 0),
            isComplete: !truncated,
            truncated,
        },
    };
};

/**
 * Validator for the conditional GET.
 *
 * Built from the payload itself rather than from a version stamp: fingerprint
 * folds in rule.timeScope, thresholds, and hotspot locations.
 */
export const accidentHotspotValidator = (layer) => {
    const features = Array.isArray(layer?.features) ? layer.features : [];
    const rule = layer?.rule || {};
    const rulePart = [
        rule.radiusMeters,
        rule.timeScope || 'all_time',
        rule.mediumMinReports,
        rule.highMinReports,
    ].join(',');

    const hotspots = features
        .map((feature) => {
            const [lng, lat] = feature?.geometry?.coordinates || [];
            return `${lng},${lat}:${feature?.properties?.count}`;
        })
        .join('|');

    return `${rulePart}::${hotspots}`;
};

export default {
    ACCIDENT_HOTSPOT_STATUSES,
    ACCIDENT_HOTSPOT_CLASSES,
    ACCIDENT_HOTSPOT_BOUNDS,
    ACCIDENT_HOTSPOT_RULE_DEFAULTS,
    resolveAccidentHotspotRule,
    buildAccidentHotspotMatch,
    isValidHotspotCoordinate,
    haversineMeters,
    createHotspotClusterer,
    clusterAccidentReports,
    classifyHotspotClusters,
    buildHotspotFeatureCollection,
    buildAccidentHotspotLayer,
    accidentHotspotValidator,
};
