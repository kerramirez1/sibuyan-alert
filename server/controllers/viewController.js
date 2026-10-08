import mongoose from 'mongoose';
import Report from '../models/Report.js';
import HighRiskZone from '../models/HighRiskZone.js';
import { buildViewerIdentity, recordViewEvent, readTopReach } from '../services/viewEventService.js';
import { VIEW_TARGET_TYPES } from '../models/ViewEvent.js';
import { buildMunicipalReportScope } from '../utils/analyticsScope.js';
import { getIncidentTypeLabel } from '../utils/incidentTypeLabel.js';

/**
 * Resolves the record a view points at, once.
 *
 * Two things depend on the answer, which is why there is a single lookup rather
 * than one per concern:
 *
 * 1. **The record must exist.** A view row whose target cannot be resolved can
 *    never be read back — both leaderboards join the aggregate to the record —
 *    so writing one would be an invisible row that still occupies a dedupe slot
 *    and a TTL window. Refusing the write is the honest answer.
 * 2. **The legacy `viewCount` bump needs the reporter**, to apply the same
 *    owner-self-view rule `recordReportView` uses.
 *
 * @returns {Promise<{ reporterId: string|null, viewCount: number }|null>}
 *          null when no such record exists.
 */
const resolveViewTarget = async ({ targetType, targetId }) => {
    if (targetType === 'report') {
        const report = await Report.findById(targetId).select('reporter viewCount');
        if (!report) return null;

        return {
            reporterId: report.reporter ? String(report.reporter) : null,
            viewCount: report.viewCount || 0,
        };
    }

    const zoneExists = await HighRiskZone.exists({ _id: targetId });
    return zoneExists ? { reporterId: null, viewCount: 0 } : null;
};

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
const bumpLegacyReportViewCount = async ({ targetType, targetId, viewerKey, target }) => {
    if (targetType !== 'report') return null;

    try {
        const viewerId = viewerKey.startsWith('user:') ? viewerKey.slice('user:'.length) : null;
        // Owner self-views do not measure reach — same rule as recordReportView.
        if (viewerId && target.reporterId && viewerId === target.reporterId) {
            return target.viewCount;
        }

        await Report.updateOne({ _id: targetId }, { $inc: { viewCount: 1 } });
        return target.viewCount + 1;
    } catch (error) {
        console.warn(`[recordView] Failed to bump viewCount for report ${targetId}:`, error?.message);
        return null;
    }
};

/**
 * Counts a reach row carries. Named once so the recording path and every read
 * path cannot drift into describing the same numbers differently.
 */
const REACH_COUNTS = ['uniqueViewers', 'publicViewers', 'guestViewers'];

const readCounts = (row = {}) => REACH_COUNTS.reduce((counts, key) => {
    counts[key] = row?.[key] || 0;
    return counts;
}, {});

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
 *
 * One person, one row: an authenticated view also removes the guest row this
 * browser wrote before it signed in, because both `guest` and `reporter` count as
 * public reach. Without that, browsing the public map and then logging in double
 * counted the same person on every record they had already opened.
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

        // Shape first, existence second: a malformed id is a client bug and gets
        // 400, while a well-formed id that resolves to nothing is a genuinely
        // missing record and gets 404. Collapsing the two would make the response
        // useless for telling a broken client from a deleted record.
        if (!mongoose.isValidObjectId(targetId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TARGET_ID',
                message: 'A valid targetId is required',
            });
        }

        const target = await resolveViewTarget({ targetType, targetId });

        if (!target) {
            return res.status(404).json({
                success: false,
                code: 'TARGET_NOT_FOUND',
                message: 'The record this view refers to does not exist',
            });
        }

        // The anonymous id rides along even on an authenticated request. It does
        // not change the identity above, but it lets the write collapse the guest
        // row this same browser created before signing in — without it, one person
        // would count twice for one record (see collapseGuestViewForTarget).
        const counted = await recordViewEvent({
            targetType,
            targetId,
            ...identity,
            anonymousId: req.body?.anonymousId,
        });

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
            target,
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
 * Returns unique-viewer counts per incident and per risk zone, highest public
 * reach first. This is the single implementation of the reach leaderboard: the
 * same numbers used to also be assembled inside `getAdminAnalytics`, which meant
 * two code paths described one metric and could disagree. The scoped copy was
 * never consumed by the client and the unscoped copy was, so the displayed
 * figure was the one without a municipality filter. That duplicate is gone.
 *
 * Both leaderboards are municipal, and the municipality comes from the session
 * alone. Zones used to be read island-wide here, on the reasoning that the map
 * shows every zone to every viewer — but visibility and this panel answer
 * different questions, and the island-wide read handed a Cajidiocan admin the
 * names of Magdiwang's zones. The map's hazard layer is untouched: this scopes
 * the leaderboard, not what anyone can see.
 *
 * Aggregates only — there is deliberately no endpoint that returns which
 * viewers opened a record. A per-viewer list would turn a reach metric into a
 * browsing history, which is not what this was built for and not something the
 * Data Privacy Act would look kindly on.
 */
export const getReachLeaderboard = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 50);
        const municipality = req.user?.assignedMunicipality;

        if (!municipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        // Incidents are municipal, so their reach is scoped exactly like every
        // other admin surface — same definition of "this office's incidents"
        // (origin, current, or transfer path, minus copies dismissed locally).
        // Zones are scoped by the municipality the office was assigned; the model
        // stores that name, so no geometry is involved.
        //
        // Both id sets are resolved up front and handed to the aggregation as an
        // allow-list, which is what makes the scope apply BEFORE its $limit. A
        // global top-N narrowed afterwards would silently return fewer rows than
        // asked for — or none at all — for a municipality whose records simply
        // are not in the island-wide top N, which is the bug this shape exists to
        // prevent. An empty id set is a real answer ("this office has no such
        // records"), and `readTopReach` returns no rows for it rather than
        // falling back to the unscoped read.
        const [scopedReportIds, scopedZoneIds] = await Promise.all([
            Report.distinct('_id', buildMunicipalReportScope(municipality)),
            HighRiskZone.distinct('_id', { municipality }),
        ]);

        const [reportRows, zoneRows] = await Promise.all([
            readTopReach({ targetType: 'report', limit, targetIds: scopedReportIds }),
            readTopReach({ targetType: 'zone', limit, targetIds: scopedZoneIds }),
        ]);

        const [reports, zones] = await Promise.all([
            reportRows.length
                ? Report.find({ _id: { $in: reportRows.map((row) => row._id) } })
                    .select('title incidentType municipalityName status')
                : [],
            zoneRows.length
                ? HighRiskZone.find({ _id: { $in: zoneRows.map((row) => row._id) } })
                    .select('name type municipality')
                : [],
        ]);

        const reportById = new Map(reports.map((record) => [String(record._id), record]));
        const zoneById = new Map(zones.map((record) => [String(record._id), record]));

        // Order comes from the aggregation (public reach first); mapping over the
        // aggregate rows rather than re-sorting keeps that one sort authoritative.
        // A row whose record has since been deleted is dropped: its view events
        // are removed on delete, so this is only a narrow race, and rendering a
        // record that no longer exists would be worse than showing one fewer row.
        const shape = (rows, byId, toRow) => rows
            .map((row) => {
                const record = byId.get(String(row._id));
                return record ? toRow(record, row) : null;
            })
            .filter(Boolean);

        return res.json({
            success: true,
            data: {
                reports: shape(reportRows, reportById, (record, row) => ({
                    id: String(record._id),
                    label: record.title || getIncidentTypeLabel(record.incidentType, 'Incident'),
                    municipalityName: record.municipalityName || '',
                    status: record.status || '',
                    ...readCounts(row),
                })),
                zones: shape(zoneRows, zoneById, (record, row) => ({
                    id: String(record._id),
                    label: record.name || record.type || 'Risk zone',
                    // Report and HighRiskZone name this field differently; zones
                    // carry `municipality`. Reading `municipalityName` off a zone
                    // silently produced an empty label on every row.
                    municipalityName: record.municipality || '',
                    status: '',
                    ...readCounts(row),
                })),
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
