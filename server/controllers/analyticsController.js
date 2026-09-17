import User from '../models/User.js';
import Report from '../models/Report.js';
import HighRiskZone from '../models/HighRiskZone.js';
import {
    getPhilippineCalendarDayRange,
    getPhilippineCalendarMonthRange,
    getPhilippineCalendarWeekRange,
    PHILIPPINES_TIMEZONE,
    PUBLIC_REPORT_STATUSES,
} from '../utils/publicAnalytics.js';
import { buildMunicipalReportScope } from '../utils/analyticsScope.js';
import { readTopReach } from '../services/viewEventService.js';

const RESPONDER_ACTIVE_STATUSES = ['verified', 'transferred', 'responding'];
const RESPONDER_PRIORITY_ZONE_SEVERITIES = ['critical', 'high'];

const getMunicipalityScopedUserIds = async (municipalityName) => {
    // Reporters belong to the scope of every municipality their reports
    // touched (current, origin, or transfer path) — mirroring the report
    // scope — so a transfer never drops the reporter from the origin office.
    const reporterOriginClause = {
        $or: [
            { municipalityName: municipalityName },
            { originalMunicipalityName: municipalityName },
            { 'transferHistory.fromMunicipalityName': municipalityName },
        ],
    };
    const [assignedUsers, reporterIdsFromReports] = await Promise.all([
        User.find({ assignedMunicipality: municipalityName }).select('_id'),
        Report.distinct('reporter', {
            ...reporterOriginClause,
            reporter: { $ne: null },
        }),
    ]);

    const scoped = new Set(assignedUsers.map((user) => user._id.toString()));
    reporterIdsFromReports.forEach((id) => {
        if (id) scoped.add(id.toString());
    });

    return Array.from(scoped);
};

export const getAdminAnalytics = async (req, res) => {
    try {
        const monthRange = getPhilippineCalendarMonthRange();
        const weekRange = getPhilippineCalendarWeekRange();

        const admin = req.user;
        const municipality = admin.assignedMunicipality;

        if (!municipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        // Same municipal visibility scope as the incident queue: every
        // incident that touched this office, minus copies dismissed locally.
        // (Shared definition: utils/analyticsScope.js)
        const reportFilter = buildMunicipalReportScope(municipality);
        const scopedUserIds = await getMunicipalityScopedUserIds(municipality);
        const userScopeFilter = { _id: { $in: scopedUserIds }, role: { $in: ['ordinary', 'reporter', 'responder'] } };
        const reporterScopeFilter = { _id: { $in: scopedUserIds }, role: 'reporter' };

        const [
            totalUsers,
            totalReporters,
            pendingVerifications,
            totalReports,
            pendingReports,
            verifiedReports,
            transferredReports,
            respondingReports,
            resolvedReports,
            rejectedReports,
            reportsThisWeek,
            reportsThisMonth,
            reportsByMunicipality,
            recentReports,
            recentUsers,
            reportsByDay,
            reportsByBarangay,
        ] = await Promise.all([
            User.countDocuments(userScopeFilter),
            User.countDocuments(reporterScopeFilter),
            User.countDocuments({ ...reporterScopeFilter, verificationStatus: 'pending' }),
            Report.countDocuments(reportFilter),
            Report.countDocuments({ ...reportFilter, status: 'pending' }),
            Report.countDocuments({ ...reportFilter, status: 'verified' }),
            Report.countDocuments({ ...reportFilter, status: 'transferred' }),
            Report.countDocuments({ ...reportFilter, status: 'responding' }),
            Report.countDocuments({ ...reportFilter, status: 'resolved' }),
            Report.countDocuments({ ...reportFilter, status: 'rejected' }),
            Report.countDocuments({ ...reportFilter, createdAt: { $gte: weekRange.startAt, $lt: weekRange.endAt } }),
            Report.countDocuments({ ...reportFilter, createdAt: { $gte: monthRange.startAt, $lt: monthRange.endAt } }),
            Report.aggregate([
                { $match: reportFilter },
                // Event-based: group where the incident happened (origin),
                // not which office currently handles it after a transfer.
                { $group: { _id: { $ifNull: ['$originalMunicipalityName', '$municipalityName'] }, count: { $sum: 1 } } },
            ]),
            Report.find(reportFilter).sort({ createdAt: -1 }).limit(5).populate('reporter', 'name'),
            User.find(userScopeFilter).sort({ createdAt: -1 }).limit(5).select('name email role createdAt'),
            Report.aggregate([
                { $match: { ...reportFilter, createdAt: { $gte: monthRange.startAt, $lt: monthRange.endAt } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: PHILIPPINES_TIMEZONE } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            // Barangay hotspots across every published lifecycle state.
            Report.aggregate([
                { $match: { ...reportFilter, status: { $in: [...PUBLIC_REPORT_STATUSES] }, barangay: { $nin: [null, ''] } } },
                {
                    $group: {
                        _id: { $toLower: '$barangay' },
                        barangay: { $first: '$barangay' },
                        count: { $sum: 1 },
                        injured: { $sum: { $ifNull: ['$casualties.injured', 0] } },
                        fatalities: { $sum: { $ifNull: ['$casualties.fatalities', 0] } },
                        missing: { $sum: { $ifNull: ['$casualties.missing', 0] } },
                    }
                },
                { $sort: { count: -1 } },
            ]),
        ]);

        // Reach leaderboards.
        //
        // Two steps on purpose. ViewEvent stores no municipality, so the
        // municipal scope has to be applied against the records themselves:
        // pull a wider candidate window from the aggregation, then narrow it
        // with the same `reportFilter` the rest of this endpoint uses. That
        // keeps the aggregation cheap (one indexed group) while guaranteeing an
        // admin only ever sees their own municipality's rows.
        //
        // Bounded and fault-tolerant. Reach is supplementary to every other
        // number here, so it must never be able to stall or fail the endpoint:
        // an unreachable or slow view_events collection degrades to an empty
        // leaderboard rather than a hung dashboard. Without the timeout a
        // buffering aggregation would hold the whole response open, which is
        // exactly what happened the first time this shipped.
        const REACH_CANDIDATE_LIMIT = 50;
        const REACH_ROWS = 10;
        const REACH_TIMEOUT_MS = 2000;

        const withReachTimeout = (promise) => {
            let timer = null;
            const timeout = new Promise((resolve) => {
                timer = setTimeout(() => resolve(null), REACH_TIMEOUT_MS);
                // Do not hold the process open for a telemetry read.
                if (typeof timer?.unref === 'function') timer.unref();
            });
            return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
        };

        let reportReach = [];
        let zoneReach = [];
        try {
            const [reportRows, zoneRows] = await withReachTimeout(Promise.all([
                readTopReach({ targetType: 'report', limit: REACH_CANDIDATE_LIMIT }),
                readTopReach({ targetType: 'zone', limit: REACH_CANDIDATE_LIMIT }),
            ])) || [];
            reportReach = Array.isArray(reportRows) ? reportRows : [];
            zoneReach = Array.isArray(zoneRows) ? zoneRows : [];
        } catch (reachError) {
            console.warn('[getAdminAnalytics] Reach lookup failed, continuing without it:', reachError?.message);
        }

        const [reachReports, reachZones] = await Promise.all([
            reportReach.length
                ? Report.find({ _id: { $in: reportReach.map((row) => row._id) }, ...reportFilter })
                    .select('title incidentType municipalityName status')
                : [],
            zoneReach.length
                ? HighRiskZone.find({ _id: { $in: zoneReach.map((row) => row._id) } })
                    .select('name type municipalityName')
                : [],
        ]);

        const reportReachById = new Map(reportReach.map((row) => [String(row._id), row]));
        const zoneReachById = new Map(zoneReach.map((row) => [String(row._id), row]));

        const reachReportRows = reachReports
            .map((report) => {
                const row = reportReachById.get(String(report._id));
                return {
                    id: String(report._id),
                    label: report.title || report.incidentType || 'Incident',
                    status: report.status || '',
                    municipalityName: report.municipalityName || '',
                    uniqueViewers: row?.uniqueViewers || 0,
                    guestViewers: row?.guestViewers || 0,
                };
            })
            .sort((a, b) => b.uniqueViewers - a.uniqueViewers)
            .slice(0, REACH_ROWS);

        const reachZoneRows = reachZones
            .map((zone) => {
                const row = zoneReachById.get(String(zone._id));
                return {
                    id: String(zone._id),
                    label: zone.name || zone.type || 'Risk zone',
                    status: '',
                    municipalityName: zone.municipalityName || '',
                    uniqueViewers: row?.uniqueViewers || 0,
                    guestViewers: row?.guestViewers || 0,
                };
            })
            .sort((a, b) => b.uniqueViewers - a.uniqueViewers)
            .slice(0, REACH_ROWS);

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    reporters: totalReporters,
                    pendingVerifications,
                },
                reports: {
                    total: totalReports,
                    pending: pendingReports,
                    verified: verifiedReports,
                    transferred: transferredReports,
                    responding: respondingReports,
                    resolved: resolvedReports,
                    rejected: rejectedReports,
                    thisWeek: reportsThisWeek,
                    thisMonth: reportsThisMonth,
                    byMunicipality: reportsByMunicipality.reduce((acc, item) => {
                        if (item._id) acc[item._id] = item.count;
                        return acc;
                    }, {}),
                },
                recentReports,
                recentUsers,
                chartData: {
                    reportsByDay,
                },
                reportsByBarangay: reportsByBarangay.map(item => ({
                    barangay: item.barangay || item._id,
                    count: item.count,
                    injured: item.injured || 0,
                    fatalities: item.fatalities || 0,
                    missing: item.missing || 0,
                })),
                reach: {
                    // A view means someone OPENED this record's details. Seeing
                    // a pin on the map is not counted, and neither is loading
                    // the dashboard — so this is "how many people opened it",
                    // never "how many people saw it". The note travels with the
                    // data so any consumer renders it with the right meaning.
                    note: 'Unique viewers who opened the details. Repeat views from the same viewer count once.',
                    reports: reachReportRows,
                    zones: reachZoneRows,
                },
            },
        });
    } catch (error) {
        console.error('Get admin analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get admin analytics',
        });
    }
};

export const getResponderAnalytics = async (req, res) => {
    try {
        const responder = req.user;
        if (!responder.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this responder',
            });
        }
        const municipalityScope = buildMunicipalReportScope(responder.assignedMunicipality);
        // Dispatch-queue parity: the "available/active" badges describe work
        // this office currently holds, so they pin to current municipality.
        const currentMunicipalityScope = {
            $and: [
                municipalityScope,
                { municipalityName: responder.assignedMunicipality },
            ],
        };
        const { startAt, endAt } = getPhilippineCalendarDayRange();

        const [
            activeIncidents,
            availableIncidents,
            myResolvedToday,
            myActiveDeployments,
            resolvedToday,
            activeRiskZones,
            reportsByBarangay,
            criticalHighRiskZones,
        ] = await Promise.all([
            Report.countDocuments({ ...currentMunicipalityScope, status: { $in: RESPONDER_ACTIVE_STATUSES } }),
            // Badge must match the dispatch-queue list definition exactly:
            // current municipality only. Without the pin, transferred-OUT
            // reports (visible via transferHistory.from) inflate the badge
            // while never appearing in the queue.
            Report.countDocuments({
                $and: [
                    municipalityScope,
                    { municipalityName: responder.assignedMunicipality },
                    {
                        $or: [
                            { status: 'transferred' },
                            {
                                status: 'verified',
                                respondedBy: null,
                                'responders.0': { $exists: false },
                            },
                        ],
                    },
                ],
            }),
            Report.countDocuments({
                $and: [
                    municipalityScope,
                    {
                        status: 'resolved',
                        resolvedAt: { $gte: startAt, $lt: endAt },
                        $or: [
                            { resolvedBy: responder._id },
                            { respondedBy: responder._id },
                            { 'responders.user': responder._id },
                        ],
                    },
                ],
            }),
            Report.countDocuments({
                $and: [
                    municipalityScope,
                    {
                        status: { $in: ['responding', 'transferred'] },
                        $or: [
                            { respondedBy: responder._id },
                            { 'responders.user': responder._id },
                        ],
                    },
                ],
            }),
            Report.countDocuments({
                ...currentMunicipalityScope,
                status: 'resolved',
                resolvedAt: { $gte: startAt, $lt: endAt },
            }),
            HighRiskZone.countDocuments({
                municipality: responder.assignedMunicipality,
                isActive: true,
            }),
            Report.aggregate([
                { $match: { ...municipalityScope, status: { $in: [...PUBLIC_REPORT_STATUSES] }, barangay: { $nin: [null, ''] } } },
                {
                    $group: {
                        _id: { $toLower: '$barangay' },
                        barangay: { $first: '$barangay' },
                        count: { $sum: 1 },
                        injured: { $sum: { $ifNull: ['$casualties.injured', 0] } },
                        fatalities: { $sum: { $ifNull: ['$casualties.fatalities', 0] } },
                        missing: { $sum: { $ifNull: ['$casualties.missing', 0] } },
                    },
                },
                { $sort: { count: -1 } },
            ]),
            HighRiskZone.find({
                municipality: responder.assignedMunicipality,
                isActive: true,
                severity: { $in: RESPONDER_PRIORITY_ZONE_SEVERITIES },
            })
                // With the filtered values, ascending lexical order places
                // critical before high; creation time breaks ties.
                .sort({ severity: 1, createdAt: -1 })
                .limit(5)
                .select('name description type severity barangay radius coordinates'),
        ]);

        res.json({
            success: true,
            data: {
                activeIncidents,
                availableIncidents,
                myResolvedToday,
                myActiveDeployments,
                resolvedToday,
                activeRiskZones,
                reportsByBarangay: (reportsByBarangay || []).map((item) => ({
                    barangay: item.barangay || item._id,
                    count: item.count,
                    injured: item.injured || 0,
                    fatalities: item.fatalities || 0,
                    missing: item.missing || 0,
                })),
                criticalHighRiskZones: criticalHighRiskZones || [],
            },
        });
    } catch (error) {
        console.error('Get responder analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get responder analytics',
        });
    }
};

export const getReporterAnalytics = async (req, res) => {
    try {
        const reporter = req.user;

        const [
            pendingReports,
            verifiedReports,
            resolvedReports,
        ] = await Promise.all([
            Report.countDocuments({ reporter: reporter._id, status: 'pending' }),
            Report.countDocuments({ reporter: reporter._id, status: 'verified' }),
            Report.countDocuments({ reporter: reporter._id, status: 'resolved' }),
        ]);

        res.json({
            success: true,
            data: {
                myReports: {
                    pending: pendingReports,
                    verified: verifiedReports,
                    resolved: resolvedReports,
                },
                trustPoints: verifiedReports + resolvedReports, // Simple logic
            },
        });
    } catch (error) {
        console.error('Get reporter analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reporter analytics',
        });
    }
};

export const getPublicAnalytics = async (req, res) => {
    try {
        const period = getPhilippineCalendarMonthRange();
        const publishedStatusFilter = () => ({ $in: [...PUBLIC_REPORT_STATUSES] });

        const [
            verifiedThisMonth,
            activeHighRiskZones,
            totalReportsAllTime,
        ] = await Promise.all([
            Report.countDocuments({
                status: publishedStatusFilter(),
                $or: [
                    {
                        verifiedAt: {
                            $gte: period.startAt,
                            $lt: period.endAt,
                        },
                    },
                    {
                        // Legacy reports created before verifiedAt was introduced.
                        verifiedAt: null,
                        createdAt: {
                            $gte: period.startAt,
                            $lt: period.endAt,
                        },
                    },
                ],
            }),
            HighRiskZone.countDocuments({ isActive: true }),
            Report.countDocuments({ status: publishedStatusFilter() }),
        ]);

        res.json({
            success: true,
            data: {
                // Keep both keys for backward compatibility with existing frontend mappings
                verifiedThisMonth,
                verifiedReportsThisMonth: verifiedThisMonth,
                activeHighRiskZones,
                totalReportsAllTime,
                systemStatus: 'Active',
                period: {
                    type: 'calendar_month',
                    timezone: period.timezone,
                    year: period.year,
                    month: period.month,
                    startAt: period.startAt.toISOString(),
                    endAt: period.endAt.toISOString(),
                },
            },
        });
    } catch (error) {
        console.error('Get public analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get public analytics',
        });
    }
};
