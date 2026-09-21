import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import HazardArea from '../models/HazardArea.js';
import { buildHazardAreaDocuments } from '../utils/hazardDataset.js';
import {
    HAZARD_DATASET_IDS,
    HAZARD_DATASET_ORDER,
    getHazardDataset,
    isKnownHazardDataset,
} from '../config/hazardDatasets.js';

/**
 * Imports every registered NOAH hazard dataset into MongoDB.
 *
 * Usage:
 *   npm run import:hazards                          # every dataset
 *   npm run import:hazards -- --dataset landslide   # one dataset
 *   npm run import:hazards -- --skip-missing        # tolerate unbuilt files
 *
 * `--skip-missing` exists because a fresh clone will not have every dataset
 * built yet, and a partial import is more useful than a failed one — the layers
 * that do exist still reach the map.
 */

const DATA_DIR = path.resolve(process.cwd(), 'data');

/**
 * Points whose hazard class was confirmed against the source geometry before
 * being written here, so the import can prove the geospatial index works.
 *
 * These are not arbitrary coordinates: each is the representative interior point
 * of a polygon in the corresponding class, which is why it must keep resolving
 * to the same class. If a future dataset swap moves one, that is a real signal
 * the geometry changed — not a flaky check.
 *
 * `expected: null` asserts the point is in no class at all, which is what
 * catches an over-broad geometry.
 */
const VERIFICATION_POINTS = Object.freeze({
    landslide: [
        { label: 'high hazard', lat: 12.391799, lng: 122.568231, expected: 3 },
        { label: 'medium hazard', lat: 12.382368, lng: 122.660220, expected: 2 },
        { label: 'no hazard', lat: 12.350000, lng: 122.500000, expected: null },
    ],
});

/** Highest class wins, matching the service, so the check agrees with the API. */
const resolveClassAt = async (datasetId, lat, lng) => {
    const matches = await HazardArea.find({
        isActive: true,
        datasetId,
        geometry: {
            $geoIntersects: {
                $geometry: { type: 'Point', coordinates: [lng, lat] },
            },
        },
    }).select('hazardClass').lean();

    if (matches.length === 0) return null;
    return matches.reduce((highest, row) => Math.max(highest, row.hazardClass), 0);
};

const parseArgs = (argv) => {
    const requested = [];
    let skipMissing = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--skip-missing') {
            skipMissing = true;
        } else if (arg === '--dataset') {
            requested.push(argv[index + 1]);
            index += 1;
        } else if (arg.startsWith('--dataset=')) {
            requested.push(arg.slice('--dataset='.length));
        }
    }

    return { requested: requested.filter(Boolean), skipMissing };
};

const importDataset = async (datasetId) => {
    const dataset = getHazardDataset(datasetId);
    const datasetPath = path.join(DATA_DIR, dataset.file);

    const raw = await fs.readFile(datasetPath, 'utf8');
    const documents = buildHazardAreaDocuments(JSON.parse(raw), dataset);

    await HazardArea.bulkWrite(documents.map((document) => ({
        updateOne: {
            // Scoped by dataset: class numbers repeat across datasets, so
            // `{ hazardClass }` alone would collide landslide 3 with surge 3.
            filter: { datasetId: document.datasetId, hazardClass: document.hazardClass },
            update: { $set: document },
            upsert: true,
        },
    })), { ordered: true });

    const points = VERIFICATION_POINTS[datasetId] || [];
    for (const point of points) {
        const resolved = await resolveClassAt(datasetId, point.lat, point.lng);
        if (resolved !== point.expected) {
            throw new Error(
                `[${datasetId}] Point-in-polygon verification failed for ${point.label} `
                + `at ${point.lat}, ${point.lng}: expected class ${point.expected ?? 'none'}, `
                + `resolved ${resolved ?? 'none'}.`
            );
        }
    }

    const polygons = documents.reduce((total, document) => {
        const geometry = document.geometry;
        return total + (geometry.type === 'MultiPolygon' ? geometry.coordinates.length : 1);
    }, 0);

    console.log(
        `  ✓ ${datasetId}: ${documents.length} classes, ${polygons} polygons, `
        + `${points.length} point check(s) passed`
    );
};

const main = async () => {
    const { requested, skipMissing } = parseArgs(process.argv.slice(2));

    const unknown = requested.filter((id) => !isKnownHazardDataset(id));
    if (unknown.length > 0) {
        console.error(`Unknown dataset id(s): ${unknown.join(', ')}`);
        console.error(`Known datasets: ${HAZARD_DATASET_IDS.join(', ')}`);
        process.exitCode = 1;
        return;
    }

    const targets = requested.length > 0
        ? requested
        : HAZARD_DATASET_ORDER.filter((id) => HAZARD_DATASET_IDS.includes(id));

    try {
        await connectDB();
        console.log(`Importing ${targets.length} hazard dataset(s)...\n`);

        const failures = [];
        for (const datasetId of targets) {
            try {
                await importDataset(datasetId);
            } catch (error) {
                if (error?.code === 'ENOENT' && skipMissing) {
                    console.warn(`  – ${datasetId}: skipped (not built: ${error.path})`);
                    continue;
                }
                // A missing file without --skip-missing is a hard failure: the
                // operator asked for a layer and did not get it, and a silently
                // absent hazard layer reads as "no hazard here" on the map.
                failures.push(`[${datasetId}] ${error.message}`);
            }
        }

        if (failures.length > 0) {
            throw new Error(`${failures.length} dataset(s) failed:\n  ${failures.join('\n  ')}`);
        }

        console.log('Ensuring geospatial indexes...');
        await HazardArea.createIndexes();

        // Scoped to the registry, matching the point lookup: a collection that
        // still holds rows for an unregistered dataset must not inflate the
        // number the operator reads as "what the map can draw".
        const total = await HazardArea.countDocuments({
            isActive: true,
            datasetId: { $in: HAZARD_DATASET_IDS },
        });
        console.log(`\nImported ${total} hazard area documents.`);
    } catch (error) {
        console.error(`\nFailed to import hazard datasets: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

main();
