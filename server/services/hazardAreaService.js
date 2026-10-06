import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import HazardArea from '../models/HazardArea.js';
import { isCoordinatePair } from '../utils/locationPolicy.js';
import {
    HAZARD_DATASET_IDS,
    HAZARD_DATASET_ORDER,
    getHazardDataset,
    getZoneTypeSuggestion,
    isKnownHazardDataset,
} from '../config/hazardDatasets.js';

/**
 * Hazard lookups and map-layer payloads for every registered NOAH dataset.
 *
 * Two different reads live here on purpose:
 *
 * - **Point lookup** (`resolveHazardsForCoordinates`) goes to MongoDB and uses
 *   the 2dsphere index. It answers the question an administrator actually asks
 *   while placing a pin: "what is known about this spot?".
 * - **Layer payloads** (`getHazardLayer`) are served straight from the dataset
 *   files. The geometry never changes at runtime, so routing megabytes of
 *   polygons through the database on every cold cache would be pure overhead.
 *   Each file is read once and memoised, and its ETag is derived from the bytes,
 *   so a redeploy with new data invalidates every client automatically.
 */

const HAZARD_COUNT_CACHE_TTL_MS = 60 * 1000;
let hazardCountCache = { count: null, checkedAt: 0 };

const DATA_DIR = path.resolve(process.cwd(), 'data');
const layerCache = new Map();

const resolveDatasetPath = (dataset) => (
    process.env.SIBUYAN_HAZARD_DATA_DIR
        ? path.resolve(process.env.SIBUYAN_HAZARD_DATA_DIR, dataset.file)
        : path.join(DATA_DIR, dataset.file)
);

/** Cached active-area count so every pin drop does not pay a countDocuments. */
export const getActiveHazardAreaCount = async () => {
    const now = Date.now();
    if (hazardCountCache.count !== null && (now - hazardCountCache.checkedAt) < HAZARD_COUNT_CACHE_TTL_MS) {
        return hazardCountCache.count;
    }
    // Scoped to the registry on purpose: an environment whose collection still
    // holds rows for a dataset no longer registered (e.g. a removed layer)
    // must not report the hazard layers as present and ready.
    const count = await HazardArea.countDocuments({
        isActive: true,
        datasetId: { $in: HAZARD_DATASET_IDS },
    });
    hazardCountCache = { count, checkedAt: now };
    return count;
};

/**
 * Resolves every hazard area containing a coordinate, across all datasets.
 *
 * Returns `dataset_missing` rather than an empty result when nothing has been
 * imported, so callers can distinguish "this point is clear" from "we cannot
 * know". The two must never be conflated on a hazard surface.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ datasetIds?: string[] }} [options] restrict to specific datasets
 */
export const resolveHazardsForCoordinates = async (lat, lng, { datasetIds } = {}) => {
    if (!isCoordinatePair(lat, lng)) {
        return { status: 'invalid_coordinates', hazards: [] };
    }

    if ((await getActiveHazardAreaCount()) === 0) {
        return { status: 'dataset_missing', hazards: [] };
    }

    // The registry is the source of truth, not the collection. Already-imported
    // rows for a dataset that has since been unregistered (storm surge, for
    // example) must never be returned: without this default the point lookup
    // would keep answering with layers the map no longer draws, and the
    // registry-order sort would place them ahead of every known dataset because
    // `indexOf` returns -1 for an unknown id.
    const registryScope = Array.isArray(datasetIds) && datasetIds.length > 0
        ? datasetIds
        : HAZARD_DATASET_IDS;

    const filter = {
        isActive: true,
        datasetId: { $in: registryScope },
        geometry: {
            $geoIntersects: {
                $geometry: {
                    type: 'Point',
                    coordinates: [Number(lng), Number(lat)],
                },
            },
        },
    };

    const matches = await HazardArea.find(filter)
        .select('datasetId hazardType hazardClass hazardLabel')
        .lean();

    if (matches.length === 0) return { status: 'clear', hazards: [] };

    // One result per dataset, highest class wins within it. Classes are not
    // comparable across datasets, so the reduction is deliberately scoped to a
    // single dataset rather than picking a global "worst".
    const byDataset = new Map();
    for (const match of matches) {
        const current = byDataset.get(match.datasetId);
        if (!current || match.hazardClass > current.hazardClass) byDataset.set(match.datasetId, match);
    }

    const hazards = [...byDataset.values()]
        .map((match) => ({
            datasetId: match.datasetId,
            hazardType: match.hazardType,
            hazardClass: match.hazardClass,
            hazardLabel: match.hazardLabel,
            suggestedZoneType: getZoneTypeSuggestion(match.datasetId, match.hazardClass),
        }))
        // Registry order, so the caller's first result is stable rather than
        // dependent on which document MongoDB happened to return first.
        .sort((a, b) => HAZARD_DATASET_ORDER.indexOf(a.datasetId) - HAZARD_DATASET_ORDER.indexOf(b.datasetId));

    return { status: 'in_hazard', hazards };
};

/**
 * Compact API-facing shape for the geocode response.
 *
 * Never throws: hazard enrichment is additive, and a hazard lookup failure must
 * not break the location verification an administrator depends on. A failure is
 * reported as `available: false` so the client can say "unknown" instead of
 * silently implying the point is safe.
 */
export const describeHazardsAt = async (lat, lng, options) => {
    try {
        const resolution = await resolveHazardsForCoordinates(lat, lng, options);

        if (resolution.status === 'invalid_coordinates') {
            return { available: false, reason: 'invalid_coordinates', results: [] };
        }
        if (resolution.status === 'dataset_missing') {
            return { available: false, reason: 'dataset_missing', results: [] };
        }

        return {
            available: true,
            reason: resolution.status,
            results: resolution.hazards.map((hazard) => {
                const dataset = getHazardDataset(hazard.datasetId);
                return {
                    ...hazard,
                    classDescription: dataset?.classDescriptions?.[hazard.hazardClass] || null,
                    source: dataset?.attribution || null,
                    licence: dataset?.licence || null,
                };
            }),
        };
    } catch (error) {
        console.error('Hazard lookup failed:', error?.message || error);
        return { available: false, reason: 'lookup_failed', results: [] };
    }
};

/**
 * Reads and memoises one dataset file, returning its map-layer payload.
 *
 * @param {string} datasetId
 * @returns {{ payload: Object, etag: string, byteLength: number, dataset: Object }}
 * @throws {Error} with `code === 'ENOENT'` when the dataset file is absent
 */
export const getHazardLayer = (datasetId) => {
    if (!isKnownHazardDataset(datasetId)) {
        const error = new Error(`Unknown hazard dataset: ${datasetId}`);
        error.code = 'UNKNOWN_DATASET';
        throw error;
    }

    const dataset = getHazardDataset(datasetId);
    const resolvedPath = resolveDatasetPath(dataset);
    const cached = layerCache.get(datasetId);
    if (cached && cached.path === resolvedPath) return cached;

    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const collection = JSON.parse(raw);

    // Derived from the bytes, not the parsed object, so reformatting the file
    // without changing the data does not needlessly bust client caches.
    const entry = {
        path: resolvedPath,
        etag: `W/"${createHash('sha1').update(raw).digest('hex').slice(0, 32)}"`,
        byteLength: Buffer.byteLength(raw),
        dataset,
        payload: {
            type: collection.type,
            features: collection.features,
            datasetId: dataset.id,
            hazardType: dataset.hazardType,
            label: dataset.label,
            shortLabel: dataset.shortLabel,
            description: dataset.description,
            attribution: dataset.attribution,
            licence: dataset.licence,
            source: dataset.source,
            sourceVersion: dataset.sourceVersion,
            zoneType: dataset.zoneType,
            classes: dataset.classes.map((value) => ({
                value,
                label: dataset.classLabels[value],
                description: dataset.classDescriptions?.[value] || null,
            })),
        },
    };

    layerCache.set(datasetId, entry);
    return entry;
};

/**
 * Every registered dataset's layer payload, in display order, with a combined
 * validator.
 *
 * A dataset registered but not yet built is an expected state on a fresh clone.
 * It is skipped with a warning rather than failing the whole catalog, so the
 * layers that do exist still reach the map.
 *
 * The combined ETag folds in each layer's own ETag, so rebuilding any single
 * dataset invalidates the catalog for every client without touching the others.
 *
 * @returns {{ payloads: Object[], etag: string, byteLength: number, missing: string[] }}
 */
export const getHazardLayerCatalog = () => {
    const payloads = [];
    const missing = [];
    const etags = [];
    let byteLength = 0;

    for (const datasetId of HAZARD_DATASET_ORDER) {
        if (!HAZARD_DATASET_IDS.includes(datasetId)) continue;
        try {
            const layer = getHazardLayer(datasetId);
            payloads.push(layer.payload);
            etags.push(layer.etag);
            byteLength += layer.byteLength;
        } catch (error) {
            // P2-3: a corrupt dataset file (JSON.parse SyntaxError) must not
            // 500 the whole catalog — mark that layer missing and return the
            // remaining layers, preserving the per-layer graceful degradation
            // the `missing` mechanism was built for. Unknown failures still
            // propagate.
            if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
            console.warn(`Hazard dataset unreadable, skipping: ${datasetId} (${error?.message || error})`);
            missing.push(datasetId);
        }
    }

    return {
        payloads,
        missing,
        byteLength,
        etag: `W/"${createHash('sha1').update(etags.join('|')).digest('hex').slice(0, 32)}"`,
    };
};

/** Test-only: drops the memoised count and layers so cases stay isolated. */
export const resetHazardAreaCaches = () => {
    hazardCountCache = { count: null, checkedAt: 0 };
    layerCache.clear();
};

export default {
    getActiveHazardAreaCount,
    resolveHazardsForCoordinates,
    describeHazardsAt,
    getHazardLayer,
    getHazardLayerCatalog,
    resetHazardAreaCaches,
};
