/**
 * D7 Analytics / Historical Data — MongoDB View definition.
 *
 * DFD Level 1 shows D7 as a data store, but it is NOT a physical collection.
 * It is a read-only view derived from D2 (reports) so dashboards get a
 * privacy-safe historical dataset without duplicating data or going stale.
 *
 * - viewOn: `reports` (D2)
 * - Rows: published lifecycle states only (verified/transferred/responding/resolved)
 * - Projection: allowlisted analytics/history fields; PII and operational
 *   dossier details (rejectionReason, resolutionNotes, report messages,
 *   responder identities/notes) stay in D2 and remain RBAC-gated there.
 */

export const ANALYTICS_VIEW_NAME = 'analytics_view';
export const ANALYTICS_VIEW_SOURCE = 'reports';

// Mirrors PUBLIC_REPORT_STATUSES in utils/publicAnalytics.js (kept local so the
// view script has zero controller imports and stays dependency-light).
export const ANALYTICS_VIEW_STATUSES = Object.freeze([
    'verified',
    'transferred',
    'responding',
    'resolved',
]);

/**
 * Build the aggregation pipeline for the analytics_view.
 * Only view-compatible stages ($match/$addFields/$project) — no $lookup so the
 * view stays self-contained and fast on a single dyno.
 */
export const buildAnalyticsViewPipeline = () => ([
    {
        $match: {
            status: { $in: [...ANALYTICS_VIEW_STATUSES] },
        },
    },
    {
        $addFields: {
            // Single analytics-ready incident timestamp (legacy-safe).
            incidentDate: {
                $ifNull: ['$incidentTime', { $ifNull: ['$accidentTime', '$createdAt'] }],
            },
            casualtyTotal: {
                $add: [
                    { $ifNull: ['$casualties.injured', 0] },
                    { $ifNull: ['$casualties.fatalities', 0] },
                    { $ifNull: ['$casualties.missing', 0] },
                ],
            },
            respondersCount: {
                $cond: [{ $isArray: '$responders' }, { $size: '$responders' }, 0],
            },
            reportUpdatesCount: {
                $cond: [{ $isArray: '$reportUpdates' }, { $size: '$reportUpdates' }, 0],
            },
            evidenceCount: {
                $cond: [{ $isArray: '$images' }, { $size: '$images' }, 0],
            },
        },
    },
    {
        $project: {
            // Identity / history keys
            title: 1,
            description: 1,
            incidentCategory: 1,
            incidentType: 1,
            fireInvolved: 1,
            fireType: 1,
            status: 1,
            severity: 1,
            priority: 1,
            // Location dimensions (no raw reporter PII lives on reports anyway)
            address: 1,
            barangay: 1,
            barangayPsgcCode: 1,
            municipalityName: 1,
            originalMunicipalityName: 1,
            locationConfidence: 1,
            coordinates: 1,
            'locationCapture.source': 1,
            // Time dimensions
            incidentDate: 1,
            incidentTime: 1,
            reportedAt: 1,
            verifiedAt: 1,
            respondedAt: 1,
            resolvedAt: 1,
            createdAt: 1,
            updatedAt: 1,
            // Impact measures
            casualties: 1,
            casualtyTotal: 1,
            affectedArea: 1,
            viewCount: 1,
            respondersCount: 1,
            reportUpdatesCount: 1,
            evidenceCount: 1,
            // Operational aggregates only — no responder identities/notes.
            responders: {
                $map: {
                    input: { $ifNull: ['$responders', []] },
                    as: 'r',
                    in: {
                        unitType: '$$r.unitType',
                        respondedAt: '$$r.respondedAt',
                    },
                },
            },
            transferHistory: {
                $map: {
                    input: { $ifNull: ['$transferHistory', []] },
                    as: 't',
                    in: {
                        fromMunicipalityName: '$$t.fromMunicipalityName',
                        toMunicipalityName: '$$t.toMunicipalityName',
                        reason: '$$t.reason',
                        transferredAt: '$$t.transferredAt',
                        acknowledgedAt: '$$t.acknowledgedAt',
                    },
                },
            },
            // Reporter stays an opaque ObjectId here; names/contacts resolve
            // via D2/D1 under existing RBAC when an authorized dossier opens.
            reporter: 1,
            municipality: 1,
        },
    },
]);

const getDb = (dbOrConnection) => {
    if (!dbOrConnection) return null;
    if (typeof dbOrConnection.listCollections === 'function') return dbOrConnection;
    if (dbOrConnection.db && typeof dbOrConnection.db.listCollections === 'function') {
        return dbOrConnection.db;
    }
    return null;
};

/**
 * Idempotently create (or update) the analytics_view.
 * Safe to call on every boot — best-effort, never throws for missing DB in tests.
 *
 * @param {import('mongodb').Db|import('mongoose').Connection} dbOrConnection
 * @returns {{ name: string, action: 'created'|'updated'|'exists' }}
 */
export const ensureAnalyticsView = async (dbOrConnection) => {
    const db = getDb(dbOrConnection);
    if (!db) throw new Error('A MongoDB Db handle or Mongoose connection is required');

    const pipeline = buildAnalyticsViewPipeline();
    // Native Db returns a cursor (.toArray); some Mongoose shims return a
    // promise of the array instead. Accept both so boot never warns falsely.
    const listed = db.listCollections({ name: ANALYTICS_VIEW_NAME });
    const existing = typeof listed?.toArray === 'function' ? await listed.toArray() : await listed;

    if (existing.length === 0) {
        await db.createCollection(ANALYTICS_VIEW_NAME, {
            viewOn: ANALYTICS_VIEW_SOURCE,
            pipeline,
        });
        return { name: ANALYTICS_VIEW_NAME, action: 'created' };
    }

    const isView = existing[0]?.type === 'view';
    if (!isView) {
        throw new Error(
            `${ANALYTICS_VIEW_NAME} already exists as a regular collection; drop or rename it before creating the view`
        );
    }

    await db.runCommand({
        collMod: ANALYTICS_VIEW_NAME,
        viewOn: ANALYTICS_VIEW_SOURCE,
        pipeline,
    });
    return { name: ANALYTICS_VIEW_NAME, action: 'updated' };
};

export default {
    ANALYTICS_VIEW_NAME,
    ANALYTICS_VIEW_SOURCE,
    ANALYTICS_VIEW_STATUSES,
    buildAnalyticsViewPipeline,
    ensureAnalyticsView,
};
