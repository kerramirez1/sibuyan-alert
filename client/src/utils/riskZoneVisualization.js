import { getMapCoordinates } from './mapReports';
import { MAP_RISK_ZONE_CONFIG } from '../config/mapVisuals';

export const RISK_ZONE_SOURCE_ID = 'risk-zones-visualization';
export const RISK_ZONE_EXTRUSION_LAYER_ID = 'risk-zones-extrusion';
export const RISK_ZONE_FILL_LAYER_ID = 'risk-zones-fill';
export const RISK_ZONE_OUTLINE_LAYER_ID = 'risk-zones-outline';
export const RISK_ZONE_MIN_ZOOM = 9;

export const RISK_ZONE_COLORS = Object.freeze({
    landslide_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    accident_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    fire_risk: MAP_RISK_ZONE_CONFIG.markerColor,
    other: MAP_RISK_ZONE_CONFIG.markerColor,
});

const SEVERITY_HEIGHTS_METERS = Object.freeze({
    low: 35,
    medium: 70,
    high: 120,
    critical: 180,
});

const EARTH_RADIUS_METERS = 6_371_008.8;
const MIN_RADIUS_METERS = 10;
const MAX_RADIUS_METERS = 5_000;
const MIN_POLYGON_POINTS = 16;
const MAX_POLYGON_POINTS = 64;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const toRadians = (degrees) => degrees * (Math.PI / 180);
const toDegrees = (radians) => radians * (180 / Math.PI);

const normalizeLongitude = (longitude) => {
    const normalized = ((longitude + 540) % 360) - 180;
    return Object.is(normalized, -0) ? 0 : normalized;
};

const getPolygonPointCount = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 32;
    return Math.round(clamp(numericValue, MIN_POLYGON_POINTS, MAX_POLYGON_POINTS));
};

const getRadiusMeters = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 100;
    return clamp(numericValue, MIN_RADIUS_METERS, MAX_RADIUS_METERS);
};

/** Builds a bounded geodesic circle so malformed API data cannot create excessive geometry. */
export const createRiskZoneCircle = (coordinates, radiusMeters, points = 32) => {
    const center = getMapCoordinates({ coordinates });
    if (!center) return null;

    const segmentCount = getPolygonPointCount(points);
    const angularDistance = getRadiusMeters(radiusMeters) / EARTH_RADIUS_METERS;
    const latitude = toRadians(center.lat);
    const longitude = toRadians(center.lng);
    const ring = [];

    for (let index = 0; index < segmentCount; index += 1) {
        const bearing = (index / segmentCount) * (2 * Math.PI);
        const destinationLatitude = Math.asin(
            Math.sin(latitude) * Math.cos(angularDistance)
            + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
        );
        const destinationLongitude = longitude + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
            Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude)
        );
        ring.push([
            normalizeLongitude(toDegrees(destinationLongitude)),
            toDegrees(destinationLatitude),
        ]);
    }

    ring.push([...ring[0]]);
    return ring;
};

/** Returns bounds for the zone's real radius so camera focus preserves the full hazard area. */
export const getRiskZoneBounds = (zone, { points = 32 } = {}) => {
    const coordinates = getMapCoordinates(zone);
    const radiusMeters = Number(zone?.radius);
    if (!coordinates || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;

    const ring = createRiskZoneCircle(coordinates, radiusMeters, points);
    if (!ring?.length) return null;

    return ring.reduce((bounds, [lng, lat]) => ([
        [Math.min(bounds[0][0], lng), Math.min(bounds[0][1], lat)],
        [Math.max(bounds[1][0], lng), Math.max(bounds[1][1], lat)],
    ]), [
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ]);
};

export const buildRiskZoneFeatureCollection = (zones = [], { points = 32 } = {}) => {
    const records = Array.isArray(zones) ? zones : [];
    const features = [];

    records.forEach((zone, index) => {
        const coordinates = getMapCoordinates(zone);
        if (!coordinates) return;

        const radiusMeters = getRadiusMeters(zone?.radius);
        const ring = createRiskZoneCircle(coordinates, radiusMeters, points);
        if (!ring) return;

        const type = Object.hasOwn(RISK_ZONE_COLORS, zone?.type) ? zone.type : 'other';
        const severity = Object.hasOwn(SEVERITY_HEIGHTS_METERS, zone?.severity)
            ? zone.severity
            : 'low';
        const rawId = zone?._id ?? zone?.id ?? `risk-zone-${index}`;

        features.push({
            type: 'Feature',
            id: String(rawId),
            properties: {
                zoneId: String(rawId),
                name: String(zone?.name || 'High-risk zone').slice(0, 100),
                type,
                severity,
                radiusMeters,
                color: RISK_ZONE_COLORS[type],
                extrusionHeight: SEVERITY_HEIGHTS_METERS[severity],
            },
            geometry: {
                type: 'Polygon',
                coordinates: [ring],
            },
        });
    });

    return { type: 'FeatureCollection', features };
};

export default buildRiskZoneFeatureCollection;
