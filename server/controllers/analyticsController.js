import User from '../models/User.js';
import Report from '../models/Report.js';
import HighRiskZone from '../models/HighRiskZone.js';
import { canViewAllMunicipalities } from '../utils/municipalityScope.js';
import {
    getPhilippineCalendarMonthRange,
    PUBLIC_REPORT_STATUSES,
} from '../utils/publicAnalytics.js';

const getMunicipalityScopedUserIds = async (municipalityName) => {
    const [assignedUsers, reporterIdsFromReports] = await Promise.all([
        User.find({ assignedMunicipality: municipalityName }).select('_id'),
        Report.distinct('reporter', {
            municipalityName: municipalityName,
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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const admin = req.user;
        const municipality = admin.assignedMunicipality;
        const showAll = req.query.showAll === 'true' && canViewAllMunicipalities(admin);

        // Filter reports by municipality if admin is assigned to one (unless showAll)
        const reportFilter = (municipality && !showAll) ? { municipalityName: municipality } : {};
        const scopedUserIds = (municipality && !showAll)
            ? await getMunicipalityScopedUserIds(municipality)
            : null;
        const userScopeFilter = scopedUserIds ? { _id: { $in: scopedUserIds }, role: { $ne: 'admin' } } : {};
        const reporterScopeFilter = scopedUserIds ? { _id: { $in: scopedUserIds }, role: 'reporter' } : { role: 'reporter' };
        const responderScopeFilter = scopedUserIds ? { _id: { $in: scopedUserIds }, role: 'responder' } : { role: 'responder' };

        const [
            totalUsers,
            totalReporters,
            pendingVerifications,
            totalReports,
            pendingReports,
            verifiedReports,
            reportsThisWeek,
            reportsThisMonth,
            reportsByMunicipality,
            reporterStats,
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
            Report.countDocuments({ ...reportFilter, createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 7)) } }),
            Report.countDocuments({ ...reportFilter, createdAt: { $gte: thirtyDaysAgo } }),
            Report.aggregate([
                { $match: reportFilter },
                { $group: { _id: '$municipalityName', count: { $sum: 1 } } },
            ]),
            User.aggregate([
                { $match: responderScopeFilter },
                { $group: { _id: '$isOnDuty', count: { $sum: 1 } } }
            ]),
            Report.find(reportFilter).sort({ createdAt: -1 }).limit(5).populate('reporter', 'name'),
            User.find(userScopeFilter).sort({ createdAt: -1 }).limit(5).select('name email role createdAt'),
            Report.aggregate([
                { $match: { ...reportFilter, createdAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            // Barangay-level breakdown of verified/resolved reports
            Report.aggregate([
                { $match: { ...reportFilter, status: { $in: ['verified', 'resolved', 'responding'] }, barangay: { $nin: [null, ''] } } },
                {
                    $group: {
                        _id: '$barangay',
                        count: { $sum: 1 },
                        injured: { $sum: '$casualties.injured' },
                        fatalities: { $sum: '$casualties.fatalities' },
                    }
                },
                { $sort: { count: -1 } },
            ]),
        ]);

        const assignedResponderCounts = {
            online: reporterStats.find(r => r._id === true)?.count || 0,
            offline: reporterStats.find(r => r._id === false)?.count || 0,
        };

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    reporters: totalReporters,
                    pendingVerifications,
                    respondersOnline: assignedResponderCounts.online,
                    respondersOffline: assignedResponderCounts.offline,
                },
                reports: {
                    total: totalReports,
                    pending: pendingReports,
                    verified: verifiedReports,
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
                    barangay: item._id,
                    count: item.count,
                    injured: item.injured || 0,
                    fatalities: item.fatalities || 0,
                })),
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
        const filter = responder.assignedMunicipality ? { municipalityName: responder.assignedMunicipality } : {};

        const [
            activeIncidents,
            myResolvedToday,
        ] = await Promise.all([
            Report.countDocuments({ ...filter, status: { $in: ['pending', 'responding', 'verified'] } }),
            Report.countDocuments({
                ...filter,
                status: 'resolved',
                'responders.user': responder._id,
                resolvedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }),
        ]);

        res.json({
            success: true,
            data: {
                activeIncidents,
                myResolvedToday,
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
