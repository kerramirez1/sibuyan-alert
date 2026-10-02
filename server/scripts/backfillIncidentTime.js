/**
 * One-off backfill: correct Report.incidentTime values stored ~8h ahead.
 *
 * BACKGROUND
 * The report wizard's datetime-local input produced a timezone-naive string
 * ("2026-10-02T14:30") that the client sent as-is. The server parsed it with
 * Date.parse, which treats naive ISO strings as UTC. Reporters are all in
 * Asia/Manila (UTC+8), so the stored instant landed ~8h in the future.
 * Client fix: buildSubmitFields now sends new Date(naive).toISOString(),
 * i.e. the true UTC instant.
 *
 * ASSUMPTION (documented, do not widen silently): every reporter is in
 * Asia/Manila, which is UTC+8 year-round with no DST. A fixed -8h shift
 * therefore exactly undoes the naive-as-UTC misparse for every affected
 * document. If reporting ever spans timezones, this script must be replaced
 * with per-document timezone reconstruction.
 *
 * SCOPE
 * Only documents created before the fix's deploy date are touched
 * (default cutoff: 2026-10-02T16:00:00Z, the start of 2026-10-03 in Manila —
 * any report filed after the client fix already carries a true instant).
 * Override with --before=<ISO instant>.
 *
 * SAFETY
 * Dry-run is the default: it prints the affected count plus min/max
 * incidentTime before and after the shift, and writes nothing.
 * Pass --apply to perform the updateMany.
 *
 * Usage:
 *   node scripts/backfillIncidentTime.js                 # dry run
 *   node scripts/backfillIncidentTime.js --apply         # perform the shift
 *   node scripts/backfillIncidentTime.js --apply --before=2026-10-05T00:00:00Z
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Report from '../models/Report.js';

const SHIFT_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8, no DST
const DEFAULT_CUTOFF_ISO = '2026-10-02T16:00:00Z'; // 2026-10-03 00:00 Asia/Manila

const parseArgs = () => {
    const args = { apply: false, before: DEFAULT_CUTOFF_ISO };
    for (const raw of process.argv.slice(2)) {
        if (raw === '--apply') args.apply = true;
        else if (raw.startsWith('--before=')) args.before = raw.slice('--before='.length);
        else {
            console.error(`Unknown argument: ${raw}`);
            process.exitCode = 1;
        }
    }
    return args;
};

const fmt = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : 'n/a');

const backfill = async () => {
    const { apply, before } = parseArgs();
    const cutoff = new Date(before);
    if (Number.isNaN(cutoff.getTime())) {
        console.error(`Invalid --before instant: ${before}`);
        process.exitCode = 1;
        return;
    }

    try {
        await connectDB();

        const filter = {
            createdAt: { $lt: cutoff },
            incidentTime: { $exists: true, $ne: null },
        };

        const stats = await Report.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    minIncidentTime: { $min: '$incidentTime' },
                    maxIncidentTime: { $max: '$incidentTime' },
                },
            },
        ]);

        const { count = 0, minIncidentTime = null, maxIncidentTime = null } = stats[0] || {};
        const shiftDate = (date) => (date ? new Date(date.getTime() - SHIFT_MS) : null);

        console.log(`Cutoff (createdAt <): ${cutoff.toISOString()}`);
        console.log(`Mode: ${apply ? 'APPLY — writing the shift' : 'DRY RUN — no writes'}`);
        console.log(`Affected reports: ${count}`);
        console.log(`incidentTime min: ${fmt(minIncidentTime)}  ->  ${fmt(shiftDate(minIncidentTime))}`);
        console.log(`incidentTime max: ${fmt(maxIncidentTime)}  ->  ${fmt(shiftDate(maxIncidentTime))}`);

        if (!apply) {
            console.log('Dry run complete. Re-run with --apply to perform the shift.');
            return;
        }

        if (count === 0) {
            console.log('Nothing to update.');
            return;
        }

        const result = await Report.updateMany(filter, [
            { $set: { incidentTime: { $subtract: ['$incidentTime', SHIFT_MS] } } },
        ]);
        console.log(`Shifted incidentTime by -8h on ${result.modifiedCount} report(s).`);
    } finally {
        await mongoose.disconnect();
    }
};

backfill().catch((error) => {
    console.error('Backfill failed:', error?.message || error);
    process.exitCode = 1;
});
