import mongoose from 'mongoose';
import Report from '../models/Report.js';
import HighRiskZone from '../models/HighRiskZone.js';
import { buildViewerIdentity, recordViewEvent, readTopReach } from '../services/viewEventService.js';
import { VIEW_TARGET_TYPES } from '../models/ViewEvent.js';

/**
 * Keeps the report's legacy `viewCount` counter alive alongside the deduped
 * reach row.
 *
 * These two numbers mean different things and both are wanted:
 *   `viewCount`      — total opens, repeats included. Accident History and My
 *                      Reports already display it, so letting it freeze would
 *                      be a visible regression.
 *   ViewEvent rows   — distinct viewers, repeats collapsed. This is the new
 *                      reach figure.
 *
 * The owner's own opens are skipped, matching `recordReportView` exactly, so the
 * two counters stay comparable instead of drifting apart by the author's own
 * page loads. A failure here is logged and swallowed: the reach row is already
 * written, and a legacy counter is not worth failing the request over.
 */
const bumpLegacyReportViewCount = async ({ targetType, targetId, viewerKey }) => {
    if (targetType !== 'report' || !mongoose.isValidObjectId(targetId)) return null;

    try {
        const report = await Report.findById(targetId).select('reporter viewCount');
        if (!report) return null;

        const reporterId = report.reporter ? String(report.reporter) : null;
        const viewerId = viewerKey.startsWith('user:') ? viewerKey.slice('user:'.length) : null;
        // Owner self-views do not measure reach — same rule as recordReportView.
        if (viewerId && reporterId && viewerId === reporterId) {
            return report.viewCount || 0;
        }

        await Report.updateOne({ _id: report._id }, { $inc: { viewCount: 1 } });
        return (report.viewCount || 0) + 1;
    } catch (error) {
        console.warn(`[recordView] Failed to bump viewCount for report ${targetId}:`, error?.message);
        return null;
    }
};

/**
 * @desc    Record that the current viewer opened one record's details.
 * @route   POST /api/views
 * @access  Public (optional auth — guests are counted anonymously)
 *
 * Body: { targetType: 'report' | 'zone', targetId, anonymousId? }
 *
 * Repeat calls from the same viewer are safe and expected: the write is an
 * upsert keyed by (targetType, targetId, viewerKey), so a refresh updates a
 * timestamp instead of adding a row. The client is therefore free to fire this
 * whenever a detail panel opens without any client-side "have I counted this?"
 * bookkeeping, which is what keeps the instrumentation simple.
 *
 * A request with no usable identity is answered 200 `counted: false` rather than
 * being folded into an "anonymous" bucket. Counting id-less requests would let a
 * client that never sends an id inflate reach on every call — the exact failure
 * the dedupe exists to prevent. The 200 shape matches `recordReportView`, which
 * already answers that way for owner self-views.
 */
export const recordView = async (req, res) => {
    try {
        const targetType = typeof req.body?.targetType === 'string' ? req.body.targetType.trim() : '';
        const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim() : '';

        if (!VIEW_TARGET_TYPES.includes(targetType)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TARGET_TYPE',
                message: `targetType must be one of: ${VIEW_TARGET_TYPES.join(', ')}`,
            });
        }

        const identity = buildViewerIdentity({
            user: req.user,
            anonymousId: req.body?.anonymousId,
        });

        if (!identity) {
            return res.json({ success: true, data: { counted: false } });
        }

        const counted = await recordViewEvent({ targetType, targetId, ...identity });

        if (!counted) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TARGET_ID',
                message: 'A valid targetId is required',
            });
        }

        // `viewCount` is returned for reports so existing surfaces can keep
        // their optimistic counter update. It is the TOTAL-opens figure, not the
        // deduped reach — the two are different numbers by design.
        const viewCount = await bumpLegacyReportViewCount({
            targetType,
            targetId,
            viewerKey: identity.viewerKey,
        });

        return res.json({
            success: true,
            data: viewCount === null ? { counted: true } : { counted: true, viewCount },
        });
    } catch (error) {
        console.error('Record view event error:', error);
        return res.status(500).json({
            success: false,
            message: 'Could not record the view',
        });
    }
};

/**
 * @desc    Reach leaderboards for the admin dashboard.
 * @route   GET /api/views/reach
 * @access  Private (admin)
 *
 * Returns unique-viewer counts per incident and per risk zone, highest first.
 *
 * Aggregates only — there is deliberately no endpoint that returns which
 * viewers opened a record. A per-viewer list would turn a reach metric into a
 * browsing history, which is not what this was built for and not something the
 * Data Privacy Act would look kindly on.
 */
export const getReachLeaderboard = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 50);

        const [reportRows, zoneRows] = await Promise.all([
            readTopReach({ targetType: 'report', limit }),
            readTopReach({ targetType: 'zone', limit }),
        ]);

        const [reports, zones] = await Promise.all([
            reportRows.length
                ? Report.find({ _id: { $in: reportRows.map((row) => row._id) } })
                    .select('title incidentType municipalityName status')
                : [],
            zoneRows.length
                ? HighRiskZone.find({ _id: { $in: zoneRows.map((row) => row._id) } })
                    .select('name type municipalityName')
                : [],
        ]);

        const reportById = new Map(reportRows.map((row) => [String(row._id), row]));
        const zoneById = new Map(zoneRows.map((row) => [String(row._id), row]));

        const shape = (records, index, labelOf) => records
            .map((record) => {
                const row = index.get(String(record._id));
                return {
                    id: String(record._id),
                    label: labelOf(record),
                    municipalityName: record.municipalityName || '',
                    status: record.status || '',
                    uniqueViewers: row?.uniqueViewers || 0,
                    guestViewers: row?.guestViewers || 0,
                };
            })
            .sort((a, b) => b.uniqueViewers - a.uniqueViewers);

        return res.json({
            success: true,
            data: {
                note: 'Unique viewers who opened the details. Repeat views from the same viewer count once.',
                reports: shape(reports, reportById, (record) => record.title || record.incidentType || 'Incident'),
                zones: shape(zones, zoneById, (record) => record.name || record.type || 'Risk zone'),
            },
        });
    } catch (error) {
        console.error('Get reach leaderboard error:', error);
        return res.status(500).json({
            success: false,
            message: 'Could not load reach data',
        });
    }
};

export default { recordView, getReachLeaderboard };
