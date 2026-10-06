import mongoose from 'mongoose';
import { getGridFsBucket } from './gridFsService.js';

/**
 * GridFS orphan sweeper (P2-7).
 *
 * Evidence uploads can orphan GridFS files: the file lands in the bucket but
 * the report write fails afterwards (or the report is later deleted without
 * its files). This job deletes files whose metadata.resourceId no longer
 * matches any Report, and logs the counts.
 *
 * Follows the same background-task pattern as the dispatch escalation
 * sweeper: an unref'd interval, a stop function, and skip-on-overlap so a
 * slow database never stacks sweeps.
 */

const ORPHAN_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

const toObjectIdOrNull = (value) => {
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
        return new mongoose.Types.ObjectId(value);
    }
    return null;
};

export const sweepGridFsOrphans = async () => {
    const bucket = getGridFsBucket();

    const files = await bucket
        .find(
            { 'metadata.resourceId': { $ne: null } },
            { projection: { 'metadata.resourceId': 1 } }
        )
        .toArray();

    const resourceIds = [];
    const seen = new Set();
    for (const file of files) {
        const resourceId = toObjectIdOrNull(file?.metadata?.resourceId);
        if (!resourceId) continue;
        const key = String(resourceId);
        if (!seen.has(key)) {
            seen.add(key);
            resourceIds.push(resourceId);
        }
    }

    if (resourceIds.length === 0) {
        return { checked: 0, deleted: 0 };
    }

    const Report = mongoose.model('Report');
    const existing = await Report.find({ _id: { $in: resourceIds } })
        .select('_id')
        .lean();
    const existingIds = new Set(existing.map((report) => String(report._id)));
    const orphanIds = resourceIds.filter((id) => !existingIds.has(String(id)));

    let deleted = 0;
    for (const resourceId of orphanIds) {
        const orphanFiles = await bucket.find({ 'metadata.resourceId': resourceId }).toArray();
        for (const orphan of orphanFiles) {
            try {
                await bucket.delete(orphan._id);
                deleted += 1;
            } catch (error) {
                console.warn(
                    `GridFS orphan sweep: failed to delete ${orphan._id}:`,
                    error?.message || error
                );
            }
        }
    }

    return { checked: resourceIds.length, deleted };
};

export const startGridFsOrphanSweeper = ({ intervalMs } = {}) => {
    const period = Number.isFinite(intervalMs) && intervalMs > 0
        ? intervalMs
        : ORPHAN_SWEEP_INTERVAL_MS;
    let sweepInFlight = false;

    const runSweep = async () => {
        // Skip rather than queue: a slow database must not build a backlog of
        // overlapping sweeps.
        if (sweepInFlight) return;
        sweepInFlight = true;
        try {
            const { checked, deleted } = await sweepGridFsOrphans();
            console.log(
                `🧹 GridFS orphan sweep: checked ${checked} referenced reports, deleted ${deleted} orphan files`
            );
        } catch (error) {
            console.error('GridFS orphan sweep failed:', error?.message || error);
        } finally {
            sweepInFlight = false;
        }
    };

    // Sweep once at startup (dynos restart often; a pure 24h interval might
    // otherwise never fire), then on the daily cadence.
    runSweep();
    const timer = setInterval(runSweep, period);

    // Never hold the process open on account of a background sweep.
    timer.unref?.();

    console.log('🧹 GridFS orphan sweeper started (daily)');

    return () => clearInterval(timer);
};

export default { sweepGridFsOrphans, startGridFsOrphanSweeper };
