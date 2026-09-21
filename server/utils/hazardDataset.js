import { SIBUYAN_HAZARD_EXTENT } from '../config/hazardDatasets.js';

/**
 * Validation for imported NOAH hazard datasets.
 *
 * Parameterised by a dataset descriptor from `config/hazardDatasets.js`, because
 * every hazard layer shares the same shape and the same failure modes. The
 * validation is deliberately strict: a hazard layer that silently loses a class
 * renders as "no hazard here", which is the one direction this must never be
 * wrong in.
 *
 * The source files are not consistent about their class field — landslide uses
 * `LH`, flood and storm surge use `HAZ`, and the published metadata for
 * landslide claims `HAZ` while the shipped shapefile uses `LH`. By the time a
 * dataset reaches this module the build script has already normalised the field
 * to `haz`, so this validator only ever reads `haz` and never trusts the
 * upstream documentation about field names.
 */

/**
 * Minimum ring positions per polygon.
 *
 * A ring of four positions is a triangle: technically valid, but it means the
 * source geometry was collapsed somewhere in the pipeline. The simplified
 * Sibuyan extracts all sit far above this, so the floor only catches a genuinely
 * broken dataset rather than a legitimately small patch.
 */
const MIN_RING_POSITIONS = 4;

/** A dataset this far outside the island is the wrong file, not a data quirk. */
const BOUNDS_TOLERANCE_DEGREES = 0.001;

const isPolygonGeometry = (geometry) => (
    ['Polygon', 'MultiPolygon'].includes(geometry?.type)
    && Array.isArray(geometry?.coordinates)
    && geometry.coordinates.length > 0
);

/**
 * Counts coordinate positions across arbitrarily nested ring arrays.
 *
 * The NOAH polygons are MultiPolygons, so a fixed-depth walk would either miss
 * rings or crash on a Polygon-shaped input.
 */
export const countRingPositions = (coordinates) => {
    if (!Array.isArray(coordinates)) return 0;
    if (coordinates.length >= 2 && coordinates.every(Number.isFinite)) return 1;
    return coordinates.reduce((count, item) => count + countRingPositions(item), 0);
};

const collectBounds = (coordinates, acc) => {
    if (!Array.isArray(coordinates)) return acc;
    if (coordinates.length >= 2 && coordinates.every(Number.isFinite)) {
        const [lng, lat] = coordinates;
        acc.minLng = Math.min(acc.minLng, lng);
        acc.maxLng = Math.max(acc.maxLng, lng);
        acc.minLat = Math.min(acc.minLat, lat);
        acc.maxLat = Math.max(acc.maxLat, lat);
        return acc;
    }
    return coordinates.reduce((inner, item) => collectBounds(item, inner), acc);
};

/**
 * Validates one dataset's GeoJSON and converts it into HazardArea documents.
 *
 * @param {Object} featureCollection parsed GeoJSON
 * @param {Object} dataset descriptor from `config/hazardDatasets.js`
 * @returns {Array<Object>} documents ready for HazardArea.bulkWrite
 */
export const buildHazardAreaDocuments = (featureCollection, dataset) => {
    if (!dataset?.id || !Array.isArray(dataset.classes) || dataset.classes.length === 0) {
        throw new Error('A hazard dataset descriptor with at least one class is required.');
    }
    if (featureCollection?.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
        throw new Error(`[${dataset.id}] Hazard dataset must be a GeoJSON FeatureCollection.`);
    }
    if (featureCollection.features.length === 0) {
        throw new Error(`[${dataset.id}] Hazard dataset contains no features.`);
    }

    // Validated against the island's geographic extent, NOT the operational
    // report bounds. The operational box is narrower than the island, so using
    // it here rejected the island's own western and southern margins and forced
    // the layers to be clipped short.
    const allowed = {
        minLng: SIBUYAN_HAZARD_EXTENT.minLng - BOUNDS_TOLERANCE_DEGREES,
        minLat: SIBUYAN_HAZARD_EXTENT.minLat - BOUNDS_TOLERANCE_DEGREES,
        maxLng: SIBUYAN_HAZARD_EXTENT.maxLng + BOUNDS_TOLERANCE_DEGREES,
        maxLat: SIBUYAN_HAZARD_EXTENT.maxLat + BOUNDS_TOLERANCE_DEGREES,
    };

    const seenClasses = new Set();
    const documents = featureCollection.features.map((feature) => {
        const hazardClass = Number(feature?.properties?.haz);

        if (!dataset.classes.includes(hazardClass)) {
            throw new Error(
                `[${dataset.id}] Unexpected hazard class ${feature?.properties?.haz}. `
                + `Expected one of ${dataset.classes.join(', ')}.`
            );
        }
        if (seenClasses.has(hazardClass)) {
            throw new Error(`[${dataset.id}] Duplicate hazard class ${hazardClass}.`);
        }
        seenClasses.add(hazardClass);

        if (!isPolygonGeometry(feature.geometry)) {
            throw new Error(`[${dataset.id}] Geometry is missing or invalid for class ${hazardClass}.`);
        }

        const positions = countRingPositions(feature.geometry.coordinates);
        if (positions < MIN_RING_POSITIONS) {
            throw new Error(`[${dataset.id}] Geometry for class ${hazardClass} is empty or degenerate.`);
        }

        const geometryBounds = collectBounds(feature.geometry.coordinates, {
            minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity,
        });
        const outsideSibuyan = (
            geometryBounds.minLng < allowed.minLng
            || geometryBounds.maxLng > allowed.maxLng
            || geometryBounds.minLat < allowed.minLat
            || geometryBounds.maxLat > allowed.maxLat
        );
        if (outsideSibuyan) {
            throw new Error(
                `[${dataset.id}] Geometry for class ${hazardClass} extends outside the Sibuyan bounding box.`
            );
        }

        return {
            datasetId: dataset.id,
            hazardType: dataset.hazardType,
            hazardClass,
            hazardLabel: dataset.classLabels[hazardClass] || `Class ${hazardClass}`,
            geometry: feature.geometry,
            dataset: {
                source: dataset.source,
                sourceUrl: dataset.sourceUrl,
                sourceVersion: dataset.sourceVersion,
                licence: dataset.licence,
                attribution: dataset.attribution,
                derivation: dataset.derivation,
            },
            isActive: true,
        };
    });

    const missing = dataset.classes.filter((cls) => !seenClasses.has(cls));
    if (missing.length > 0) {
        throw new Error(
            `[${dataset.id}] Dataset is missing class(es): ${missing.join(', ')}. `
            + 'This usually means the source does not cover Sibuyan Island at all — '
            + 'check the archive bounding box before assuming the layer is empty.'
        );
    }

    return documents;
};

/** Total polygon count across all classes, for logging and readiness checks. */
export const countDatasetPolygons = (featureCollection) => (
    (featureCollection?.features || []).reduce((total, feature) => {
        const geometry = feature?.geometry;
        if (geometry?.type === 'MultiPolygon') return total + geometry.coordinates.length;
        if (geometry?.type === 'Polygon') return total + 1;
        return total;
    }, 0)
);

export default {
    buildHazardAreaDocuments,
    countDatasetPolygons,
    countRingPositions,
};
