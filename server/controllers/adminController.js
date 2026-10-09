import mongoose from 'mongoose';
import User from '../models/User.js';
import Report from '../models/Report.js';
import Municipality from '../models/Municipality.js';
import Notification from '../models/Notification.js';
import AuthSession from '../models/AuthSession.js';
import { deleteViewEventsForTarget, deleteViewerAliasesForUser } from '../services/viewEventService.js';
import { sendVerificationEmail, sendReportStatusEmail, sendResponderInvitationEmail } from '../services/emailService.js';
import { sendPushToUser, pushTemplates } from '../services/pushService.js';
import {
    broadcastReportRejected,
    broadcastReportResolved,
    broadcastReportVerified,
    broadcastVerifiedReportToResponders,
} from '../services/socketService.js';
import { deleteGridFsFilesByUrls, getGridFsBucket, uploadFilesToGridFS } from '../services/gridFsService.js';
import { cleanupTempUploadFiles } from '../middleware/upload.js';
import {
    canViewOperationalReport,
    canViewReporterContact,
    isMunicipalAdminInReportScope,
} from '../utils/reportAccess.js';
import { toOperationalReport, toOperationalReportSummary } from '../utils/operationalReport.js';
import { normalizeCasualtyCounts } from '../utils/casualtyCounts.js';
import { calculateReportPriority } from '../utils/reportPriority.js';
import { resolveQueryPolicy } from '../config/queryPolicy.js';
import { invalidate } from '../utils/apiCache.js';
import {
    CREATABLE_UNIT_TYPES,
    isSupportedResponderUnitType,
    normalizeUnitType,
    getUnitTypeLabel,
} from '../config/responderUnits.js';
import { armDispatchAcknowledgement } from '../services/dispatchEscalationService.js';
import { buildMunicipalReportScope } from '../utils/analyticsScope.js';
import { buildUserVerificationPayload } from '../utils/userPayload.js';
import {
    getPhilippineCalendarMonthRange,
    getPhilippineCalendarWeekRange,
    PHILIPPINES_TIMEZONE,
} from '../utils/publicAnalytics.js';
import { resolveRecipientClientUrl } from '../utils/invitationUrl.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Canonical incident lifecycle states. Used to shape the queue's status
// counters from a single $group result instead of one count per state.
const REPORT_STATUS_KEYS = ['pending', 'verified', 'transferred', 'rejected', 'responding', 'resolved'];

// A regex shorter than this matches most of the collection, so it costs a full
// scan and returns a useless result. Rejected at the edge instead.
const MIN_SEARCH_LENGTH = 3;

const sanitizeSearch = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 100);
};

const ensureReportScopeAccess = (user, report) => {
    if (!user?.assignedMunicipality) return false;
    return report.municipalityName === user.assignedMunicipality;
};

const getMunicipalityScopedUserIds = async (municipalityName) => {
    const [assignedUsers, reporterIdsFromReports] = await Promise.all([
        User.find({ assignedMunicipality: municipalityName }).select('_id'),
        Report.distinct('reporter', {
            municipalityName: municipalityName,
            reporter: { $ne: null },
        }),
    ]);

    const allowed = new Set(assignedUsers.map((user) => user._id.toString()));
    reporterIdsFromReports.forEach((id) => {
        if (id) allowed.add(id.toString());
    });

    return Array.from(allowed);
};

const ensureUserScopeAccess = async (adminUser, targetUser) => {
    if (!adminUser.assignedMunicipality) {
        return { allowed: false, message: 'Municipality is not assigned to this administrator' };
    }

    if (targetUser.role === 'municipal_admin' || targetUser.role === 'admin') {
        return { allowed: false, message: 'Not authorized to manage this account' };
    }

    if (targetUser.role === 'responder') {
        const allowed = targetUser.assignedMunicipality === adminUser.assignedMunicipality;
        return {
            allowed,
            message: allowed ? null : 'Responder belongs to a different municipality',
        };
    }

    if (targetUser.role === 'reporter') {
        if (targetUser.assignedMunicipality) {
            const allowed = targetUser.assignedMunicipality === adminUser.assignedMunicipality;
            return {
                allowed,
                message: allowed ? null : 'Reporter belongs to a different municipality',
            };
        }

        const municipalities = await Report.distinct('municipalityName', {
            reporter: targetUser._id,
            municipalityName: { $ne: null },
        });

        if (!municipalities.length) {
            return { allowed: false, message: 'Reporter municipality is not yet assigned' };
        }

        const allowed = municipalities.every((muni) => muni === adminUser.assignedMunicipality);
        return {
            allowed,
            message: allowed ? null : 'Reporter has reports in a different municipality',
        };
    }

    return { allowed: false, message: 'Not authorized to manage this account' };
};

/**
 * @desc    Get all users
 * @route   GET /api/admin/users
 * @access  Private (admin only)
 */
export const getUsers = async (req, res) => {
    try {
        const { role, verificationStatus, page = 1, limit = 20, search } = req.query;
        const safeSearch = sanitizeSearch(search);
        const adminUser = req.user;

        const query = {};

        if (role && ['ordinary', 'reporter', 'responder', 'municipal_admin'].includes(role)) {
            query.role = role;
        } else {
            // Administrator accounts are visible in the municipal user list but
            // not manageable from it — ensureUserScopeAccess still refuses
            // municipal_admin targets for every management action.
            query.role = { $in: ['ordinary', 'reporter', 'responder', 'municipal_admin'] };
        }

        // The viewing administrator never sees their own account — the list
        // shows the people they manage, not themselves.
        query._id = { $ne: adminUser._id };

        if (verificationStatus) query.verificationStatus = verificationStatus;
        if (safeSearch) {
            const pattern = escapeRegex(safeSearch);
            query.$or = [
                { name: { $regex: pattern, $options: 'i' } },
                { email: { $regex: pattern, $options: 'i' } },
            ];
        }

        if (!adminUser.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        if (adminUser.assignedMunicipality) {
            const scopedUserIds = await getMunicipalityScopedUserIds(adminUser.assignedMunicipality);
            query.$and = [
                ...(query.$and || []),
                {
                    _id: { $in: scopedUserIds },
                },
            ];
        }

        const parsedPage = Number.parseInt(page, 10);
        const parsedLimit = Number.parseInt(limit, 10);
        const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 1000) : 1;
        const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(safeLimit)
            .skip((safePage - 1) * safeLimit);

        const total = await User.countDocuments(query);

        // Get counts by role
        const scope = query.$and ? { $and: query.$and } : {};
        const [totalUsers, reporters, responders, pendingVerification] = await Promise.all([
            User.countDocuments({ role: { $in: ['ordinary', 'reporter', 'responder', 'municipal_admin'] }, _id: { $ne: adminUser._id }, ...scope }),
            User.countDocuments({ role: 'reporter', ...scope }),
            User.countDocuments({ role: 'responder', ...scope }),
            User.countDocuments({ role: 'reporter', verificationStatus: 'pending', ...scope }),
        ]);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
                },
                stats: {
                    totalUsers,
                    reporters,
                    responders,
                    pendingVerification,
                },
            },
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get users',
        });
    }
};

/**
 * @desc    Get single user
 * @route   GET /api/admin/users/:id
 * @access  Private (admin only)
 */
export const getUserById = async (req, res) => {
    try {
        const adminUser = req.user;
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('verifiedBy', 'name email');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const scopeCheck = await ensureUserScopeAccess(adminUser, user);
        if (!scopeCheck.allowed) {
            return res.status(403).json({
                success: false,
                message: scopeCheck.message,
            });
        }

        // Get user's report count
        const reportCount = await Report.countDocuments({ reporter: user._id });

        res.json({
            success: true,
            data: {
                ...user.toObject(),
                reportCount,
            },
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user',
        });
    }
};

/**
 * @desc    Verify or reject a reporter
 * @route   PUT /api/admin/users/:id/verify
 * @access  Private (admin only)
 */
export const verifyReporter = async (req, res) => {
    try {
        const adminUser = req.user;
        const { status, feedback } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be approved or rejected',
            });
        }

        const user = await User.findById(req.params.id).select('+verificationHistory');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (user.role !== 'reporter') {
            return res.status(400).json({
                success: false,
                message: 'Only reporters can be verified',
            });
        }

        if (!user.assignedMunicipality) {
            return res.status(400).json({
                success: false,
                message: 'Reporter municipality is missing. Please require municipality at registration.',
            });
        }

        const scopeCheck = await ensureUserScopeAccess(adminUser, user);
        if (!scopeCheck.allowed) {
            return res.status(403).json({
                success: false,
                message: scopeCheck.message,
            });
        }

        // Update verification status
        user.verificationStatus = status;
        user.isVerified = status === 'approved';
        user.verifiedBy = req.user._id;
        user.verifiedAt = new Date();
        const normalizedFeedback = feedback?.trim() || null;
        user.verificationFeedback = normalizedFeedback;
        user.recordVerificationEvent({
            action: status,
            actor: req.user._id,
            feedback: normalizedFeedback,
        });

        await user.save();

        // Get Socket.io instance
        const io = req.app.get('io');

        // Create in-app notification
        await Notification.createAndSend(
            {
                recipient: user._id,
                type: status === 'approved' ? 'reporter_verified' : 'reporter_rejected',
                title: status === 'approved'
                    ? 'Account Verified'
                    : 'Verification Update',
                message: status === 'approved'
                    ? 'Your reporter account has been approved. You can now submit reports!'
                    : feedback || 'Your verification was not approved.',
                data: { status, feedback },
            },
            io
        );

        // Send email notification (best-effort; in-app notification already guarantees delivery in app)
        let emailDelivery = { success: false, reason: 'email_disabled_or_not_attempted' };
        if (user.notificationPreferences?.email !== false) {
            emailDelivery = await sendVerificationEmail(user, status, feedback);
            if (!emailDelivery?.success) {
                console.warn('Verification email not sent:', {
                    userId: user._id.toString(),
                    email: user.email,
                    reason: emailDelivery?.error || 'unknown_email_error',
                });
            }
        }

        // Send push notification
        if (user.pushSubscription && user.notificationPreferences?.browserPush) {
            const template = status === 'approved'
                ? pushTemplates.reporterVerified()
                : pushTemplates.reporterRejected(feedback);
            await sendPushToUser(user, template);
        }

        res.json({
            success: true,
            message: `Reporter ${status === 'approved' ? 'verified' : 'rejected'} successfully`,
            data: {
                id: user._id,
                email: user.email,
                name: user.name,
                ...buildUserVerificationPayload(user),
                notification: {
                    inAppSent: true,
                    emailAttempted: user.notificationPreferences?.email !== false,
                    emailSent: !!emailDelivery?.success,
                },
            },
        });
    } catch (error) {
        console.error('Verify reporter error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify reporter',
        });
    }
};

/**
 * @desc    Get all reports (including pending)
 * @route   GET /api/admin/reports
 * @access  Private (municipal administrators and responders)
 * @note    Results are municipality-scoped and role-filtered
 */
export const getAllReports = async (req, res) => {
    try {
        const {
            status,
            category,
            page = 1,
            limit = 20,
            search,
            startDate,
            endDate,
            reportId,
            responderView,
        } = req.query;

        const parsedPage = Number.parseInt(page, 10);
        const parsedLimit = Number.parseInt(limit, 10);
        const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
        const safeLimit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 20;

        const safeSearch = sanitizeSearch(search);
        const query = {};
        const admin = req.user;

        if (!admin.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this account',
            });
        }

        const scopedMunicipality = admin.assignedMunicipality;
        // The responder's own id: used both by the list-query view filters
        // below and by the $facet view-count aggregation further down, so the
        // two can never disagree about whose assignments count.
        const responderId = admin._id;
        // Single municipal visibility definition shared with analytics
        // (utils/analyticsScope.js): origin-inclusive + dismissed excluded.
        // Read-only transferred copies an admin dismissed from their
        // own queue still match $ne (legacy docs without the field too).
        const scopeClause = buildMunicipalReportScope(scopedMunicipality);
        query.$and = [scopeClause];

        if (reportId) {
            if (!mongoose.isValidObjectId(reportId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid incident report identifier',
                });
            }
            query._id = reportId;
        }

        // Responder views are filtered on the server so actionable incidents are
        // never lost behind an unrelated first page of report history.
        if (admin.role === 'responder') {
            const responderVisibleStatuses = ['pending', 'verified', 'transferred', 'responding', 'resolved'];

            if (!reportId && responderView === 'available') {
                query.municipalityName = scopedMunicipality;
                query.$and.push({
                    $or: [
                        { status: 'transferred' },
                        {
                            status: 'verified',
                            respondedBy: null,
                            'responders.0': { $exists: false },
                        },
                    ],
                });
            } else if (!reportId && responderView === 'municipalActive') {
                query.municipalityName = scopedMunicipality;
                query.status = { $in: ['verified', 'transferred', 'responding'] };
            } else if (!reportId && responderView === 'active') {
                query.status = 'responding';
                query.$and.push({
                    $or: [
                        { respondedBy: responderId },
                        { 'responders.user': responderId },
                    ],
                });
            } else if (!reportId && responderView === 'history') {
                query.status = 'resolved';
                query.$and.push({
                    $or: [
                        { respondedBy: responderId },
                        { 'responders.user': responderId },
                        { resolvedBy: responderId },
                    ],
                });
            } else if (status && responderVisibleStatuses.includes(status)) {
                query.status = status;
            } else {
                query.status = { $in: responderVisibleStatuses };
            }
        } else if (status) {
            query.status = status;
        }
        if (category) query.incidentCategory = category;
        // A case-insensitive $regex cannot use an index, so any search here is a
        // collection scan by nature — that is inherent to substring matching and
        // is why the term length is policed instead. A one- or two-character term
        // matches most of the collection: maximum cost, minimum usefulness. Below
        // the threshold the filter is skipped so the queue falls back to its
        // scoped list rather than paying a full scan for a meaningless filter.
        //
        // A real fix would be a $text index, but $text matches whole words and
        // cannot do substring matching, so it is a UX change rather than a
        // drop-in optimisation. Recorded as a deliberate trade-off.
        if (safeSearch && safeSearch.length >= MIN_SEARCH_LENGTH) {
            const pattern = escapeRegex(safeSearch);
            query.$and = [
                ...(query.$and || []),
                {
                    $or: [
                        { address: { $regex: pattern, $options: 'i' } },
                        { description: { $regex: pattern, $options: 'i' } },
                        { title: { $regex: pattern, $options: 'i' } },
                        { municipalityName: { $regex: pattern, $options: 'i' } },
                    ],
                },
            ];
        }
        if (startDate || endDate) {
            query.incidentTime = {};
            if (startDate) query.incidentTime.$gte = new Date(startDate);
            if (endDate) query.incidentTime.$lte = new Date(endDate);
        }

        const reporterProjection = admin.role === 'responder'
            ? 'name isVerified'
            : 'name email avatar isVerified';

        const policy = resolveQueryPolicy();

        // Counts use exactly the same municipal visibility scope as the queue.
        const statsQuery = scopeClause;

        // This endpoint previously cost 16 round trips per page load: one find,
        // eight populates, one total count, and six separate status counts.
        // Reduced to seven:
        //   - Four populates were dropped. The queue renders the *summary*
        //     serializer, which reads reporter / respondedBy / resolvedBy /
        //     responders / municipality only. verifiedBy, the transfer actors,
        //     and update authors are read by the full dossier view, not here.
        //   - Six status counts became one $group aggregation.
        //   - .lean() skips Mongoose document hydration; the summary serializer
        //     already handles plain objects.
        //   - maxTimeMS bounds each statement so a pathological query fails
        //     fast instead of holding a weak-signal client's connection open.
        //
        // Sort is view-aware: the responder dispatch queue ('available' view)
        // orders longest-waiting first (verifiedAt asc, createdAt asc as
        // tiebreak). verifiedAt is set on every verification, so queue rows
        // carry it; sorting this view on incidentTime would let erroneous
        // future dates top the queue above genuinely waiting incidents. All
        // other admin/responder views keep the newest-first incidentTime sort.
        const sortSpec = admin.role === 'responder' && responderView === 'available'
            ? { verifiedAt: 1, createdAt: 1 }
            : { incidentTime: -1, createdAt: -1 };

        // Responder view-tab counts: one $facet round trip whose pipelines
        // mirror the list-query view filters above exactly (same scopeClause
        // base, same $and/$or shapes, same responderId), so a tab's count
        // always matches what the tab lists. Only responders need these;
        // other roles resolve an empty bucket list and get no viewCounts key.
        const viewCountPipeline = admin.role === 'responder'
            ? [
                {
                    $facet: {
                        available: [
                            {
                                $match: {
                                    $and: [
                                        scopeClause,
                                        { municipalityName: scopedMunicipality },
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
                                },
                            },
                            { $count: 'count' },
                        ],
                        municipalActive: [
                            {
                                $match: {
                                    $and: [
                                        scopeClause,
                                        { municipalityName: scopedMunicipality },
                                        { status: { $in: ['verified', 'transferred', 'responding'] } },
                                    ],
                                },
                            },
                            { $count: 'count' },
                        ],
                        active: [
                            {
                                $match: {
                                    $and: [
                                        scopeClause,
                                        { status: 'responding' },
                                        {
                                            $or: [
                                                { respondedBy: responderId },
                                                { 'responders.user': responderId },
                                            ],
                                        },
                                    ],
                                },
                            },
                            { $count: 'count' },
                        ],
                        history: [
                            {
                                $match: {
                                    $and: [
                                        scopeClause,
                                        { status: 'resolved' },
                                        {
                                            $or: [
                                                { respondedBy: responderId },
                                                { 'responders.user': responderId },
                                                { resolvedBy: responderId },
                                            ],
                                        },
                                    ],
                                },
                            },
                            { $count: 'count' },
                        ],
                    },
                },
            ]
            : null;
        const [reports, total, statusGroups, viewCountDocs] = await Promise.all([
            Report.find(query)
                .populate('reporter', reporterProjection)
                .populate('respondedBy', 'name email agency assignedMunicipality')
                .populate('resolvedBy', 'name email agency assignedMunicipality')
                .populate('responders.user', 'name agency assignedMunicipality')
                .populate('municipality', 'name code')
                .sort(sortSpec)
                .limit(safeLimit)
                .skip((safePage - 1) * safeLimit)
                .maxTimeMS(policy.maxTimeMs)
                .lean(),
            Report.countDocuments(query).maxTimeMS(policy.maxTimeMs),
            // Counts use exactly the same municipal visibility scope as the queue.
            Report.aggregate([
                { $match: statsQuery },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]).option({ maxTimeMS: policy.maxTimeMs }),
            viewCountPipeline
                ? Report.aggregate(viewCountPipeline).option({ maxTimeMS: policy.maxTimeMs })
                : Promise.resolve([]),
        ]);

        const statusCounts = statusGroups.reduce((acc, entry) => {
            if (entry?._id) acc[entry._id] = entry.count;
            return acc;
        }, {});

        const stats = REPORT_STATUS_KEYS.reduce((acc, status) => {
            acc[status] = statusCounts[status] || 0;
            return acc;
        }, {});
        stats.total = REPORT_STATUS_KEYS.reduce((sum, status) => sum + stats[status], 0);

        // Nested inside stats so no new top-level response key appears; the
        // brief verified no code iterates stats keys. Non-responders get no
        // viewCounts key, keeping their response shape byte-identical.
        if (admin.role === 'responder') {
            const [facetResult = {}] = viewCountDocs;
            // $count yields no document for an empty bucket, so a missing
            // bucket defaults to 0 — the zero is the point ("walang laman").
            const facetCount = (key) => facetResult[key]?.[0]?.count ?? 0;
            stats.viewCounts = {
                available: facetCount('available'),
                municipalActive: facetCount('municipalActive'),
                active: facetCount('active'),
                history: facetCount('history'),
                all: stats.total || 0,
            };
        }


        res.json({
            success: true,
            data: {
                reports: reports.map(toOperationalReportSummary),
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
                },
                stats,
                adminMunicipality: admin.assignedMunicipality || null,
            },
        });
    } catch (error) {
        console.error('Get all reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reports',
        });
    }
};

/**
 * @desc    Get a protected operational incident record
 * @route   GET /api/admin/reports/:id
 * @access  Private (in-scope municipal administrators and eligible responders)
 */
export const getOperationalReportById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_REPORT_ID',
                message: 'Invalid incident report identifier',
            });
        }

        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name email avatar isVerified')
            .populate('verifiedBy', 'name')
            .populate('respondedBy', 'name email agency assignedMunicipality')
            .populate('resolvedBy', 'name email agency assignedMunicipality')
            .populate('responders.user', 'name agency assignedMunicipality')
            .populate('transferHistory.transferredBy', 'name role assignedMunicipality')
            .populate('transferHistory.acknowledgedBy', 'name role assignedMunicipality')
            .populate('reportUpdates.author', 'name role agency')
            .populate('municipality', 'name code');

        if (!report) {
            return res.status(404).json({
                success: false,
                code: 'REPORT_NOT_FOUND',
                message: 'Report not found',
            });
        }

        if (!canViewOperationalReport(req.user, report)) {
            return res.status(403).json({
                success: false,
                code: 'REPORT_RESTRICTED',
                message: req.user.role === 'responder'
                    ? 'Operational details are available only for verified in-scope incidents or incidents assigned to you'
                    : 'Not authorized to view this incident record',
            });
        }

        // Inspections count as views, mirroring the public detail endpoint.
        Report.updateOne({ _id: report._id }, { $inc: { viewCount: 1 } }).catch(() => {});

        return res.json({
            success: true,
            data: {
                ...toOperationalReport(report, {
                    includeReporterContact: canViewReporterContact(req.user, report),
                    includeAdministrative: isMunicipalAdminInReportScope(req.user, report),
                }),
                viewCount: (report.viewCount || 0) + 1,
            },
        });
    } catch (error) {
        console.error('Get operational report error:', {
            reportId: String(req.params.id || ''),
            status: error?.status,
            name: error?.name,
            message: error?.message,
        });
        return res.status(500).json({
            success: false,
            code: 'REPORT_DETAILS_UNAVAILABLE',
            message: 'Failed to load operational incident details',
        });
    }
};


/**
 * @desc    Verify or reject a report
 * @route   PUT /api/admin/reports/:id/verify
 * @access  Private (admin only)
 */
export const verifyReport = async (req, res) => {
    try {
        const admin = req.user;
        const { status, rejectionReason } = req.body;

        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be verified or rejected',
            });
        }

        // `let`: the pre-read below serves the authorization/validation gates;
        // the atomic claim further down reassigns it to the winning write.
        let report = await Report.findById(req.params.id).populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        // Only pending reports may be verified or rejected. Re-verifying a
        // report that is already in a downstream lifecycle state (responding,
        // resolved, transferred) would emit duplicate notifications, corrupt
        // the incident state machine, and re-alert all responders.
        if (report.status !== 'pending') {
            return res.status(409).json({
                success: false,
                message: `Cannot ${status === 'verified' ? 'verify' : 'reject'} a report with status "${report.status}"`,
            });
        }

        if (!ensureReportScopeAccess(admin, report)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to manage reports outside your municipality',
            });
        }

        if (!report.reporter) {
            return res.status(409).json({
                success: false,
                message: 'Cannot verify report because reporter account is unavailable',
            });
        }

        // MVP correction path: the reviewing admin may fix citizen-entered
        // casualty counts before publication. Accepted on verify only —
        // casualties are immutable once the incident leaves pending.
        const { casualties: casualtyCorrection } = req.body;
        let casualtyUpdate;
        if (casualtyCorrection !== undefined) {
            if (status !== 'verified') {
                return res.status(400).json({
                    success: false,
                    message: 'Casualty corrections are only accepted when verifying a report',
                });
            }
            const correction = normalizeCasualtyCounts(casualtyCorrection);
            if (!correction) {
                return res.status(400).json({
                    success: false,
                    message: 'Casualty counts must be non-negative whole numbers',
                });
            }
            casualtyUpdate = correction;
        }

        // Atomic claim: exactly one concurrent verify/reject wins the
        // pending -> verified/rejected transition. The filter carries the
        // status guard, so a loser finds no document and gets the 409 below
        // instead of emitting a duplicate broadcast/notification set.
        const now = new Date();
        const atomicUpdate = {
            status,
            verifiedBy: admin._id,
            verifiedAt: now,
        };
        if (rejectionReason) atomicUpdate.rejectionReason = rejectionReason;
        if (casualtyUpdate) {
            atomicUpdate.casualties = casualtyUpdate;
            // findOneAndUpdate bypasses the pre-save hook, so the priority
            // recalculation the hook would have run is applied here with the
            // identical derivation (shared helper).
            atomicUpdate.priority = calculateReportPriority(report.severity, casualtyUpdate);
        }

        // Verification is the moment the incident is handed to responders, so
        // it is also the moment the acknowledgement clock starts. Armed as
        // part of the same atomic write — there is no window where a verified
        // report has no deadline.
        if (status === 'verified') {
            atomicUpdate.dispatch = armDispatchAcknowledgement({}, undefined, now).dispatch;
        }

        const updatedReport = await Report.findOneAndUpdate(
            { _id: report._id, status: 'pending' },
            { $set: atomicUpdate },
            { new: true },
        ).populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!updatedReport) {
            // Lost the race: another admin transitioned the report between
            // our read and this write. Re-read the status for an accurate
            // message; the 409 shape itself is unchanged.
            const current = await Report.findById(report._id).select('status').lean();
            const currentStatus = current?.status || report.status;
            return res.status(409).json({
                success: false,
                message: `Cannot ${status === 'verified' ? 'verify' : 'reject'} a report with status "${currentStatus}"`,
            });
        }

        // From here on, `report` is the winning write; every broadcast
        // and notification below fires exactly once, for the winner only.
        report = updatedReport;

        // Get Socket.io instance
        const io = req.app.get('io');

        // Public aggregates are cached. A verification changes the published
        // counts, so the cached stats are dropped here rather than waiting for
        // the TTL to lapse.
        if (status === 'verified') invalidate('stats:');

        // Emit real-time updates
        if (io) {
            if (status === 'verified') {
                // 1. Broadcast to all users (public notification)
                broadcastReportVerified(io, report);

                // 2. AUTO-BROADCAST ALERT TO RESPONDER UNITS IN MUNICIPALITY
                // Use municipalityName (not ObjectId) to match frontend room names
                if (report.municipalityName) {
                    broadcastVerifiedReportToResponders(io, report, report.municipalityName);
                }
            } else {
                // Notify reporter about rejection
                broadcastReportRejected(io, report.reporter._id, report._id, rejectionReason);

                io.to(`municipality_${report.municipalityName}`).emit('reportRejectedUpdate', {
                    id: report._id,
                    status: 'rejected',
                });

                // Pending pins are visible to all members now: drop the pin
                // everywhere with an id-only payload (reason stays owner-only
                // in the user-room emit above).
                io.emit('reportRejected', { id: report._id });
            }
        }

        // Create notification for reporter (best-effort: never turn a saved
        // state transition into a 500 — client would retry into a 409)
        try {
            await Notification.createAndSend(
                {
                    recipient: report.reporter._id,
                    type: status === 'verified' ? 'report_verified' : 'report_rejected',
                    title: status === 'verified'
                        ? 'Report Verified'
                        : 'Report Not Verified',
                    message: status === 'verified'
                        ? `Your report at ${report.address} is now visible on the map.`
                        : rejectionReason || 'Your report could not be verified.',
                    data: { reportId: report._id, status },
                },
                io
            );
        } catch (notifyError) {
            console.error('Post-verify reporter notification failed (best-effort):', notifyError?.message || notifyError);
        }

        // Create persistent notifications for all responders in the municipality
        if (status === 'verified' && report.municipalityName) {
            try {
                const responders = await User.find({
                    role: 'responder',
                    assignedMunicipality: report.municipalityName,
                }).select('_id');

                console.log(`📢 Notifying ${responders.length} responders in ${report.municipalityName}`);

                for (const responder of responders) {
                    await Notification.createAndSend(
                        {
                            recipient: responder._id,
                            type: 'report_verified',
                            title: 'New Verified Incident',
                            message: `${report.incidentType || report.incidentCategory} at ${report.address || 'Unknown Location'} — requires response.`,
                            data: { reportId: report._id, status: 'verified', severity: report.severity },
                        },
                        io
                    );
                    console.log(`  ✅ Notification sent to responder ${responder._id}`);
                }
            } catch (err) {
                console.error('Failed to notify responders:', err);
            }
        }

        // Send email notification (best-effort)
        if (report.reporter.notificationPreferences?.email !== false) {
            try {
                await sendReportStatusEmail(report.reporter, report, status, rejectionReason);
            } catch (emailError) {
                console.error('Post-verify email failed (best-effort):', emailError?.message || emailError);
            }
        }

        // Send push notification (best-effort)
        if (report.reporter.pushSubscription && report.reporter.notificationPreferences?.browserPush) {
            try {
                const template = status === 'verified'
                    ? pushTemplates.reportVerified(report)
                    : pushTemplates.reportRejected(report, rejectionReason);
                await sendPushToUser(report.reporter, template);
            } catch (pushError) {
                console.error('Post-verify push failed (best-effort):', pushError?.message || pushError);
            }
        }

        res.json({
            success: true,
            message: `Report ${status} successfully`,
            data: report,
        });
    } catch (error) {
        console.error('Verify report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify report',
        });
    }
};

/**
 * @desc    Delete a report
 * @route   DELETE /api/admin/reports/:id
 * @access  Private (admin only)
 */
export const deleteReport = async (req, res) => {
    try {
        const admin = req.user;
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        if (!ensureReportScopeAccess(admin, report)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete reports outside your municipality',
            });
        }

        await report.deleteOne();

        // Reach rows describe a record that no longer exists. The TTL would
        // eventually remove them, but until then they keep occupying dedupe
        // slots. Best-effort: the deletion is what the caller asked for, and a
        // cleanup failure must not report the whole operation as failed.
        await deleteViewEventsForTarget({ targetType: 'report', targetId: report._id });

        await deleteGridFsFilesByUrls([...(report.images || []), ...(report.resolutionImages || [])]);

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('reportDeleted', { id: req.params.id });
        }

        res.json({
            success: true,
            message: 'Report deleted successfully',
        });
    } catch (error) {
        console.error('Delete report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete report',
        });
    }
};

/**
 * @desc    Dismiss a transferred-out read-only copy from the origin
 *          municipality's queue. The record itself is untouched, so the
 *          owning (target) municipality keeps full operational access.
 * @route   POST /api/admin/reports/:id/dismiss
 * @access  Private (municipal_admin of an origin municipality only)
 */
export const dismissTransferredReport = async (req, res) => {
    try {
        const admin = req.user;
        if (!admin.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this account',
            });
        }

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        // Only read-only transferred-out copies qualify: the record must have
        // transfer history (an acknowledged transfer keeps its downstream
        // status like responding/resolved, so status alone can't gate this).
        const hasTransferHistory = Array.isArray(report.transferHistory) && report.transferHistory.length > 0;
        if (!hasTransferHistory) {
            return res.status(400).json({
                success: false,
                message: 'Only transferred reports can be dismissed from the queue',
            });
        }

        if (report.municipalityName === admin.assignedMunicipality) {
            return res.status(400).json({
                success: false,
                message: 'Reports in your municipality must be managed or deleted, not dismissed',
            });
        }

        const originMunicipalities = [
            report.originalMunicipalityName,
            ...(Array.isArray(report.transferHistory)
                ? report.transferHistory.map((entry) => entry?.fromMunicipalityName)
                : []),
        ].filter(Boolean);
        if (!originMunicipalities.includes(admin.assignedMunicipality)) {
            return res.status(403).json({
                success: false,
                message: 'Only an origin municipality of this transfer can dismiss it',
            });
        }

        await Report.updateOne(
            { _id: report._id },
            { $addToSet: { hiddenFromMunicipalities: admin.assignedMunicipality } }
        );

        res.json({
            success: true,
            message: 'Report removed from your queue. The owning municipality retains full access.',
        });
    } catch (error) {
        console.error('Dismiss transferred report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to dismiss report',
        });
    }
};

/**
 * @desc    Delete a user
 * @route   DELETE /api/admin/users/:id
 * @access  Private (admin only)
 */
export const deleteUser = async (req, res) => {
    try {
        const adminUser = req.user;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Prevent deleting self
        if (user._id.toString() === adminUser._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delete your own account',
            });
        }

        const scopeCheck = await ensureUserScopeAccess(adminUser, user);
        if (!scopeCheck.allowed) {
            return res.status(403).json({
                success: false,
                message: scopeCheck.message,
            });
        }

        // Check if user has verified reports (prevent orphaning production records)
        // P2-8: extended beyond the reporter's own production reports — a user
        // referenced as a responder, verifier, or resolver is part of the
        // incident audit trail and must not be deleted either.
        // F3: transfer history, dispatch acknowledgement, and report updates
        // are audit references too.
        const hasBlockingReports = await Report.exists({
            $or: [
                { reporter: user._id, status: { $in: ['verified', 'responding', 'resolved'] } },
                { 'responders.user': user._id },
                { verifiedBy: user._id },
                { resolvedBy: user._id },
                { respondedBy: user._id },
                { 'transferHistory.transferredBy': user._id },
                { 'transferHistory.acknowledgedBy': user._id },
                { 'dispatch.acknowledgedBy': user._id },
                { 'reportUpdates.author': user._id },
            ],
        });

        if (hasBlockingReports) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete user linked to incident reports (as reporter, responder, verifier, resolver, or in transfer/dispatch/update history). Reassign or archive reports first.',
            });
        }

        const reportsToDelete = await Report.find({ reporter: user._id }).select('images resolutionImages');
        const associatedFileUrls = [
            user.avatar,
            user.idDocument,
            user.selfiePhoto,
            ...reportsToDelete.flatMap((report) => [...(report.images || []), ...(report.resolutionImages || [])]),
        ].filter(Boolean);

        // 1. Delete notifications
        await Notification.deleteMany({ recipient: user._id });

        // 2. Delete non-production reports from this account
        await Report.deleteMany({ reporter: user._id });

        // 3. Delete the user's sessions, then the browser aliases that would
        //    otherwise keep attributing signed-out views to an account that no
        //    longer exists.
        await AuthSession.deleteMany({ user: user._id });
        await deleteViewerAliasesForUser({ userId: user._id });
        req.app.get('io')?.in(`user_${user._id}`).disconnectSockets(true)?.catch?.(() => {});
        await user.deleteOne();

        // 4. Remove GridFS files after database references are gone.
        await deleteGridFsFilesByUrls(associatedFileUrls);

        res.json({
            success: true,
            message: 'User and all associated data deleted successfully',
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
        });
    }
};

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/admin/dashboard
 * @access  Private (admin only)
 */
/**
 * How long a responder invitation stays valid. The same window the password-reset
 * flow uses, because the invitation IS a password-setup link.
 */
const RESPONDER_INVITATION_TTL_MS = 3600000; // 1 hour

/**
 * Mints a fresh single-use invitation secret for `user` and emails the link.
 *
 * The secret is 32 random bytes; only its SHA-256 hash is stored, so reading the
 * database cannot reconstruct a working link. Reissuing overwrites the previous
 * secret, which is what makes the link single-use in practice — the old token
 * stops matching the moment a new one is minted.
 *
 * The emailed link is validated before anything is sent: a missing/relative
 * CLIENT_URL, or a localhost CLIENT_URL in production, would produce a link no
 * recipient can open, and SMTP would still accept the message — a silent
 * "delivered" with a dead link. Those cases are reported as delivery failures
 * with a named cause instead, so the administrator is pointed at the server
 * configuration rather than at the responder's address.
 *
 * Returns the delivery outcome instead of throwing, so a caller that has just
 * created an account can report a mail failure without unwinding the account.
 * `failureCode` is one of `URL_MISCONFIGURED`, `EMAIL_NOT_CONFIGURED` or
 * `DELIVERY_FAILED`, and is safe to show to an administrator. The token and
 * URL are never logged and never returned: the URL is the credential.
 */
const issueResponderInvitation = async (user, { actor = null, municipality = null, action = 'invited', roleLabel = 'responder' } = {}) => {
    const crypto = await import('crypto');
    const inviteToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(inviteToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + RESPONDER_INVITATION_TTL_MS);

    // A minted-but-never-emailed secret is inert: unguessable, expired in an
    // hour, and overwritten by the next issue. Validating first keeps the
    // failure audit accurate without a second code path.
    const recipientBase = resolveRecipientClientUrl();
    let delivered = false;
    let failureCode = null;
    let failureReason = null;
    let correlationId = null;
    if (!recipientBase.url) {
        failureCode = 'URL_MISCONFIGURED';
        failureReason = recipientBase.error;
    } else {
        const inviteUrl = `${recipientBase.url}/reset-password/${inviteToken}`;
        try {
            const result = await sendResponderInvitationEmail(user.email, user.name, inviteUrl, {
                municipality,
                agency: getUnitTypeLabel(user.agency),
                invitedBy: actor?.name || '',
                roleLabel,
            });
            delivered = Boolean(result?.success);
            if (!delivered) {
                // The service owns the classification — it is the only layer that
                // sees the transport's own verdict on the recipient. Anything it
                // does not name falls back to a generic delivery failure.
                failureCode = result?.code || 'DELIVERY_FAILED';
                failureReason = result?.error || 'The mail server rejected the message';
                correlationId = result?.messageId || null;
            }
        } catch (error) {
            failureCode = 'DELIVERY_FAILED';
            failureReason = error?.message || 'The invitation email could not be sent';
        }
    }

    user.recordProvisioningEvent({
        action: delivered ? action : 'invitation_failed',
        actor: actor?._id || null,
        municipality,
    });
    await user.save();

    if (!delivered) {
        // Account id and the transport's message id are the correlation handles —
        // both are opaque, neither is a secret. Deliberately no URL and no token:
        // the URL is the credential, and the recipient address is masked inside
        // the service so the log line cannot become a contact record.
        console.error(
            `[responder-invite] Delivery failed for account ${user._id} (${failureCode})` +
            `${correlationId ? ` messageId=${correlationId}` : ''}: ${failureReason}`,
        );
    }

    return { delivered, failureCode, failureReason };
};

/**
 * Administrator-safe explanation of an invitation delivery failure.
 *
 * Each cause points at a different person and a different fix, which is the whole
 * point of separating them: a rejected address is the administrator's to re-check,
 * CLIENT_URL and SMTP are the operator's, and an unconfirmed send is neither —
 * it is the mail provider's, and only a provider-side check can settle it.
 *
 * Never names a secret, token, or URL.
 */
const describeInvitationFailure = (failureCode) => {
    if (failureCode === 'URL_MISCONFIGURED') {
        return 'the invitation link address (CLIENT_URL) is not set to a public address the recipient can open';
    }
    if (failureCode === 'EMAIL_NOT_CONFIGURED') {
        return 'email delivery is not configured on the server (SMTP)';
    }
    if (failureCode === 'RECIPIENT_REJECTED') {
        return 'the mail server did not accept that recipient address — check it for a typo';
    }
    if (failureCode === 'DELIVERY_UNCONFIRMED') {
        return 'the mail server did not confirm it accepted the message';
    }
    return 'the mail server did not accept the message';
};

/**
 * The responder shape this endpoint returns. Never includes the invitation
 * secret, the stored hash, or any credential — there is no password to return.
 */
const toProvisionedResponderPayload = (user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    agency: user.agency,
    responderUnit: user.responderUnit,
    assignedMunicipality: user.assignedMunicipality,
    createdAt: user.createdAt,
});

/**
 * @desc    Provision a responder account for the caller's own municipality.
 * @route   POST /api/admin/users/responder
 * @access  Private (municipal_admin)
 *
 * The municipality comes from the session and nowhere else. The validator already
 * rejects a supplied `assignedMunicipality`, and this handler would not read one
 * even if it arrived — two independent reasons a cross-municipality creation
 * cannot succeed.
 *
 * No password is set. Login refuses an account that has none, so the account is
 * inert until the responder follows the emailed invitation and chooses their own
 * password. That is also why the administrator never sees a credential: none is
 * ever generated for them to see.
 */
export const createResponder = async (req, res) => {
    try {
        const adminUser = req.user;
        const municipality = adminUser?.assignedMunicipality;

        if (!municipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        // Legacy `LGU` normalises to MDRRMO rather than being rejected, matching
        // how stored accounts are read everywhere else.
        const agency = normalizeUnitType(String(req.body?.agency || '').trim());
        // The form no longer collects a unit name. Stored as null to match the
        // schema default rather than an empty string, and the response flows that
        // read it already fall back when it is absent.
        const responderUnit = String(req.body?.responderUnit || '').trim() || null;

        // Narrower than "a stored value the app understands": RESCUE and MEDICAL
        // stay valid on existing accounts but are no longer assignable to a new
        // one. `isSupportedResponderUnitType` would accept them, so the creatable
        // set is the right guard here.
        if (!CREATABLE_UNIT_TYPES.includes(agency)) {
            return res.status(400).json({
                success: false,
                message: `Agency must be one of: ${CREATABLE_UNIT_TYPES.join(', ')}`,
            });
        }

        // Checked against the normalised address, matching the schema's own
        // lowercase+trim, so "A@B.com" cannot slip past a check for "a@b.com".
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({
                success: false,
                code: 'EMAIL_IN_USE',
                message: 'An account with this email already exists',
            });
        }

        const responder = new User({
            email,
            name,
            // Both of these are the server's decision, never the client's.
            role: 'responder',
            assignedMunicipality: municipality,
            agency,
            responderUnit,
            createdBy: adminUser._id,
        });

        const { delivered, failureCode } = await issueResponderInvitation(responder, {
            actor: adminUser,
            municipality,
        });

        return res.status(201).json({
            success: true,
            data: {
                user: toProvisionedResponderPayload(responder),
                invitationSent: delivered,
                // A delivery failure is not a creation failure: the account exists
                // and is inert. The administrator gets the cause — server
                // configuration versus a rejected message — plus an explicit
                // retry rather than an ambiguous half-created state.
                message: delivered
                    ? `Invitation sent to ${responder.email}`
                    : `Account created, but the invitation email could not be sent (${describeInvitationFailure(failureCode)}). Use "Resend invitation" to try again.`,
            },
        });
    } catch (error) {
        // The unique index is the real duplicate guard; the check above only
        // exists to return a friendly message before the insert is attempted.
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                code: 'EMAIL_IN_USE',
                message: 'An account with this email already exists',
            });
        }
        console.error('Create responder error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create the responder account',
        });
    }
};

/**
 * @desc    Provision a municipal_admin account for the caller's own municipality.
 * @route   POST /api/admin/users/admin
 * @access  Private (municipal_admin)
 *
 * Mirrors createResponder: the municipality comes from the session and nowhere
 * else; the validator already rejected a client-supplied one with a 400, so a
 * supplied value can never widen or narrow this scope. Sovereignty is
 * preserved by construction — an administrator can only ever provision for the
 * office they already belong to.
 */
export const createAdmin = async (req, res) => {
    try {
        const adminUser = req.user;
        const municipality = adminUser?.assignedMunicipality;

        if (!municipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();

        // Checked against the normalised address, matching the schema's own
        // lowercase+trim, so "A@B.com" cannot slip past a check for "a@b.com".
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({
                success: false,
                code: 'EMAIL_IN_USE',
                message: 'An account with this email already exists',
            });
        }

        const newAdmin = new User({
            email,
            name,
            // Both of these are the server's decision, never the client's.
            role: 'municipal_admin',
            assignedMunicipality: municipality,
            createdBy: adminUser._id,
        });

        const { delivered, failureCode } = await issueResponderInvitation(newAdmin, {
            actor: adminUser,
            municipality,
            roleLabel: 'admin',
        });

        return res.status(201).json({
            success: true,
            data: {
                user: toProvisionedResponderPayload(newAdmin),
                invitationSent: delivered,
                // A delivery failure is not a creation failure: the account exists
                // and is inert. The administrator gets the cause — server
                // configuration versus a rejected message — plus an explicit
                // retry rather than an ambiguous half-created state.
                message: delivered
                    ? `Invitation sent to ${newAdmin.email}`
                    : `Account created, but the invitation email could not be sent (${describeInvitationFailure(failureCode)}). Use "Resend invitation" to try again.`,
            },
        });
    } catch (error) {
        // The unique index is the real duplicate guard; the check above only
        // exists to return a friendly message before the insert is attempted.
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                code: 'EMAIL_IN_USE',
                message: 'An account with this email already exists',
            });
        }
        console.error('Create admin error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create the admin account',
        });
    }
};

/**
 * @desc    Re-issue a responder's invitation.
 * @route   POST /api/admin/users/:id/invite
 * @access  Private (municipal_admin)
 *
 * The recovery path for a failed delivery, and for a link that expired or was
 * already used. Scoped through `ensureUserScopeAccess`, the same helper every
 * other user-management action uses, so an administrator cannot invite a
 * responder belonging to another office.
 */
export const resendResponderInvitation = async (req, res) => {
    try {
        const adminUser = req.user;
        // `+password` because the field is select:false and "has this responder
        // already activated?" is exactly what that flag answers.
        const user = await User.findById(req.params.id).select('+password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Sovereignty exception, invite-only: a municipal_admin may re-issue an
        // invitation for an admin of their OWN municipality — the same boundary
        // as creation. Every other capability (verify, delete, …) still refuses
        // municipal_admin targets through ensureUserScopeAccess.
        if (user.role === 'municipal_admin') {
            const sameOffice = Boolean(adminUser.assignedMunicipality)
                && user.assignedMunicipality === adminUser.assignedMunicipality;
            if (!sameOffice) {
                return res.status(403).json({ success: false, message: 'Not authorized to manage this account' });
            }
        } else {
            const scopeCheck = await ensureUserScopeAccess(adminUser, user);
            if (!scopeCheck.allowed) {
                return res.status(403).json({ success: false, message: scopeCheck.message });
            }
        }

        // Invitations are only issued for provisioned accounts (responders and
        // municipal admins created through the Add-user dialog); reporters and
        // the administrator themself are never invite-receivers.
        const roleLabel = user.role === 'municipal_admin' ? 'admin' : 'responder';
        if (!['responder', 'municipal_admin'].includes(user.role)) {
            return res.status(400).json({
                success: false,
                message: 'Invitations are only issued for responder and admin accounts',
            });
        }

        if (user.password) {
            return res.status(409).json({
                success: false,
                code: 'ALREADY_ACTIVATED',
                message: `This ${roleLabel} has already set a password`,
            });
        }

        const { delivered, failureCode } = await issueResponderInvitation(user, {
            actor: adminUser,
            municipality: adminUser.assignedMunicipality,
            action: 'invitation_resent',
            roleLabel,
        });

        if (!delivered) {
            // Server-side misconfiguration names the configuration; only a
            // rejected message points at the address.
            const message = failureCode === 'DELIVERY_FAILED'
                ? 'The invitation email could not be sent. Check the address and try again.'
                : `The invitation email could not be sent (${describeInvitationFailure(failureCode)}). Fix the server configuration and try again.`;
            return res.status(502).json({
                success: false,
                code: 'INVITATION_DELIVERY_FAILED',
                message,
            });
        }

        return res.json({
            success: true,
            data: {
                invitationSent: true,
                message: `Invitation sent to ${user.email}`,
            },
        });
    } catch (error) {
        console.error('Resend responder invitation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send the invitation',
        });
    }
};

export const getDashboardStats = async (req, res) => {
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

        // Same municipal visibility scope as the incident queue and the
        // analytics endpoint: every incident that touched this office, minus
        // copies dismissed locally. (Shared: utils/analyticsScope.js)
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
            recentReports,
            recentUsers,
            reportsByDay,
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
            Report.find(reportFilter).sort({ createdAt: -1 }).limit(5).populate('reporter', 'name'),
            User.find(userScopeFilter).sort({ createdAt: -1 }).limit(5).select('name email role createdAt'),
            Report.aggregate([
                {
                    $match: {
                        ...reportFilter,
                        createdAt: { $gte: monthRange.startAt, $lt: monthRange.endAt }
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: PHILIPPINES_TIMEZONE } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
        ]);

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
                },
                recentReports,
                recentUsers,
                chartData: {
                    reportsByDay,
                },
            },
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard statistics',
        });
    }
};

/**
 * @desc    Live socket presence for the administrator's municipality
 * @route   GET /api/admin/presence
 * @access  Private (municipal_admin only)
 * @note    Counts unique socket-authenticated users currently joined to the
 *          municipal rooms. Single-dyno accurate (in-memory adapter); with a
 *          shared adapter it reflects this instance only.
 */
export const getPresence = async (req, res) => {
    try {
        const admin = req.user;
        if (!admin?.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        const io = req.app.get('io');
        if (!io) {
            return res.status(503).json({
                success: false,
                code: 'REALTIME_UNAVAILABLE',
                message: 'Realtime service is temporarily unavailable',
            });
        }

        const municipality = admin.assignedMunicipality;
        const [memberSockets, responderSockets] = await Promise.all([
            io.in(`municipality_${municipality}`).fetchSockets(),
            io.in(`municipality_${municipality}_responders`).fetchSockets(),
        ]);

        const onlineById = new Map();
        for (const socket of [...memberSockets, ...responderSockets]) {
            const socketUser = socket.data?.user;
            if (socketUser?.id) onlineById.set(String(socketUser.id), socketUser);
        }
        const onlineUsers = [...onlineById.values()];
        const respondersOnline = onlineUsers.filter((socketUser) => socketUser.role === 'responder').length;
        const adminsOnline = onlineUsers.filter((socketUser) => socketUser.role === 'municipal_admin').length;

        res.json({
            success: true,
            data: {
                municipality,
                respondersOnline,
                adminsOnline,
                operatorsOnline: onlineUsers.length,
                updatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('Get presence error:', error?.message || error);
        res.status(500).json({
            success: false,
            message: 'Failed to get live presence',
        });
    }
};

/**
 * @desc    Respond to a verified report (MULTI-UNIT, NON-EXCLUSIVE)
 * @route   PUT /api/admin/reports/:id/respond
 * @access  Private (responder only)
 */
export const respondToReport = async (req, res) => {
    try {
        const responder = req.user;
        let { unitName, unitType } = req.body;

        // For agency-specific responders, auto-detect from their account.
        // The agency is normalised because legacy accounts still carry the
        // `LGU` alias, which is not itself a valid unit type.
        if (responder.role === 'responder' && responder.agency) {
            const agency = normalizeUnitType(responder.agency);
            unitType = unitType || agency;
            unitName = unitName || responder.responderUnit || `${agency} - ${responder.assignedMunicipality}`;
        }

        // Validate required fields
        if (!unitName || !unitType) {
            return res.status(400).json({
                success: false,
                message: 'Unit name and unit type are required',
            });
        }

        // Validate unitType against the canonical list. This previously held its
        // own copy, which is how it drifted from the schema's enum.
        if (!isSupportedResponderUnitType(unitType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid unit type. Must be one of: ${RESPONDER_UNIT_TYPES.join(', ')}`,
            });
        }

        // Find the report. `let`: the pre-read serves the validation gates;
        // the atomic claim below reassigns it to the winning write.
        let report = await Report.findById(req.params.id)
            .populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        // Verified and transferred reports can start a response; additional
        // units can join a response already in progress.
        if (!['verified', 'transferred', 'responding'].includes(report.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot respond to a report with status "${report.status}".`,
            });
        }

        // Validate municipality access (responders can only respond to their municipality)
        if (!responder.assignedMunicipality || report.municipalityName !== responder.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'You can only respond to reports in your assigned municipality',
            });
        }

        // Atomic claim: the duplicate guard (same user + unitName) lives in
        // the filter, so two concurrent responds for one unit produce exactly
        // one responders entry and one notification set. A null result means
        // we lost the race (duplicate) or the status moved underneath us —
        // disambiguated below so each case keeps its existing error shape.
        const respondedAt = new Date();
        const updatedReport = await Report.findOneAndUpdate(
            {
                _id: report._id,
                status: { $in: ['verified', 'transferred', 'responding'] },
                responders: { $not: { $elemMatch: { user: responder._id, unitName } } },
            },
            {
                $push: {
                    responders: {
                        user: responder._id,
                        unitName,
                        unitType,
                        respondedAt,
                        notes: null,
                    },
                },
                // A transferred report may retain earlier mutual-aid responders,
                // so always move it back into the active response state.
                $set: { status: 'responding' },
            },
            { new: true },
        ).populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!updatedReport) {
            const current = await Report.findById(report._id).select('status').lean();
            if (!current || !['verified', 'transferred', 'responding'].includes(current.status)) {
                return res.status(current ? 400 : 404).json({
                    success: false,
                    message: current
                        ? `Cannot respond to a report with status "${current.status}".`
                        : 'Report not found',
                });
            }
            return res.status(409).json({
                success: false,
                message: `${unitName} has already responded to this report`,
            });
        }

        // From here on, `report` is the winning write; the broadcast and every
        // notification below fire exactly once, for the winner only.
        report = updatedReport;

        // Exactly one writer can observe a single-entry responders array, so
        // the legacy first-responder fields and the escalation-clock stop are
        // applied exactly once, by the genuine first responder. Both updates
        // carry their own idempotency guards.
        const isFirstResponder = updatedReport.responders.length === 1;
        if (isFirstResponder) {
            // Update legacy fields for backward compatibility (first responder)
            await Report.updateOne(
                { _id: updatedReport._id, respondedBy: { $exists: false } },
                { $set: { respondedBy: responder._id, respondedAt, responderAgency: unitType } },
            );

            // Responding IS the acknowledgement. The first unit to declare
            // itself en route stops the escalation clock; a later unit joining
            // must not overwrite the original ack time, which is the audit
            // record of how long the incident waited for a response.
            await Report.updateOne(
                {
                    _id: updatedReport._id,
                    dispatch: { $exists: true },
                    'dispatch.acknowledgedAt': null,
                },
                {
                    $set: {
                        'dispatch.acknowledgedAt': respondedAt,
                        'dispatch.acknowledgedBy': responder._id,
                        'dispatch.nextEscalationAt': null,
                    },
                },
            );
        }

        // Get Socket.io instance
        const io = req.app.get('io');

        // Broadcast multi-unit response to all clients
        if (io) {
            const { broadcastMultiUnitResponse } = await import('../services/socketService.js');
            await broadcastMultiUnitResponse(io, report, responder, unitName, unitType);
        }

        // Create notification for the reporter (best-effort)
        // (`isFirstResponder` was computed from the winning write above.)
        if (!report.reporter?._id) {
            console.warn('Skipping reporter notification because reporter account is unavailable');
        } else {
            try {
                await Notification.createAndSend(
                    {
                        recipient: report.reporter._id,
                        type: 'report_responding',
                        title: isFirstResponder ? 'Responder Dispatched' : 'Additional Unit Responding',
                        message: isFirstResponder
                            ? `${unitName} is now responding to your report at ${report.address}.`
                            : `${unitName} has joined the response. Total units: ${report.responders.length}`,
                        data: {
                            reportId: report._id,
                            responderId: responder._id,
                            unitName,
                            unitType,
                            totalResponders: report.responders.length,
                        },
                    },
                    io
                );
            } catch (notifyError) {
                console.error('Post-respond reporter notification failed (best-effort):', notifyError?.message || notifyError);
            }
        }

        // Notify admins that a responder has engaged with this report (best-effort)
        const adminRecipientsQuery = {
            role: 'municipal_admin',
            assignedMunicipality: report.municipalityName,
            _id: { $ne: responder._id },
        };

        try {
            const adminRecipients = await User.find(adminRecipientsQuery).select('_id');
            await Promise.all(
                adminRecipients.map((adminUser) =>
                    Notification.createAndSend(
                    {
                        recipient: adminUser._id,
                        type: 'report_responding',
                        title: isFirstResponder ? 'Responder Dispatched' : 'Additional Unit Joined',
                        message: isFirstResponder
                            ? `${unitName} is now responding at ${report.address}.`
                            : `${unitName} joined response at ${report.address}. Total units: ${report.responders.length}.`,
                        data: {
                            reportId: report._id,
                            responderId: responder._id,
                            unitName,
                            unitType,
                            totalResponders: report.responders.length,
                            municipalityName: report.municipalityName || null,
                        },
                    },
                    io
                )
            )
        );
        } catch (adminNotifyError) {
            console.error('Post-respond admin notification failed (best-effort):', adminNotifyError?.message || adminNotifyError);
        }

        // Send push notification to reporter (best-effort)
        if (report.reporter?.pushSubscription && report.reporter.notificationPreferences?.browserPush) {
            try {
                await sendPushToUser(report.reporter, {
                    title: isFirstResponder ? 'Help is on the way' : 'More help arriving',
                    body: `${unitName} is responding to your report. ${report.responders.length} unit(s) responding.`,
                    icon: '/icons/icon-192.png',
                    data: { url: '/my-reports' },
                });
            } catch (pushError) {
                console.error('Post-respond push failed (best-effort):', pushError?.message || pushError);
            }
        }

        res.json({
            success: true,
            message: `${unitName} is now responding to this report`,
            data: {
                ...report.toObject(),
                totalResponders: report.responders.length,
                respondingUnits: report.responders.map(r => ({
                    unitName: r.unitName,
                    unitType: r.unitType,
                    respondedAt: r.respondedAt,
                })),
            },
        });
    } catch (error) {
        console.error('Respond to report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to respond to report',
        });
    }
};

/**
 * @desc    Resolve a report (only the assigned responder can resolve)
 * @route   PUT /api/admin/reports/:id/resolve
 * @access  Private (assigned responder only)
 */
export const resolveReport = async (req, res) => {
    try {
        const { resolutionNotes } = req.body;
        const responder = req.user;

        if (!responder || responder.role !== 'responder') {
            // F5: no temp file survives a rejected request.
            await cleanupTempUploadFiles(req.files);
            return res.status(403).json({
                success: false,
                message: 'Access denied - Only responders can resolve incident reports.',
            });
        }

        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!report) {
            await cleanupTempUploadFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        // Only allow resolving reports that are in "responding" status
        if (report.status !== 'responding') {
            await cleanupTempUploadFiles(req.files);
            return res.status(400).json({
                success: false,
                message: `Cannot resolve a report with status "${report.status}". Only reports being responded to can be resolved.`,
            });
        }

        // Responders may only close incidents handled by their jurisdiction.
        if (!ensureReportScopeAccess(responder, report)) {
            await cleanupTempUploadFiles(req.files);
            return res.status(403).json({
                success: false,
                message: 'Not authorized to resolve reports outside your jurisdiction',
            });
        }

        // Only the first responder or a joined responding unit can resolve.
        const isFirstResponder = report.respondedBy && report.respondedBy.toString() === responder._id.toString();
        const isJoinedResponder = report.responders?.some(r => r.user?.toString() === responder._id.toString());

        if (!isFirstResponder && !isJoinedResponder) {
            await cleanupTempUploadFiles(req.files);
            return res.status(403).json({
                success: false,
                message: 'Access denied - Only assigned responders can resolve this report.',
            });
        }

        // Resolution photos ride the same multipart request so they are stored
        // atomically with the resolve. They land in `resolutionImages` — never
        // in the reporter's `images[]` — with the same URL shape as evidence.
        const storedResolutionUrls = [];
        if (req.files?.length) {
            const rawPhotoIds = Array.isArray(req.body.photoIds)
                ? req.body.photoIds
                : (typeof req.body.photoIds === 'string' ? [req.body.photoIds] : []);
            try {
                for (let index = 0; index < req.files.length; index += 1) {
                    const file = req.files[index];
                    const photoId = typeof rawPhotoIds[index] === 'string' && rawPhotoIds[index].trim()
                        ? rawPhotoIds[index].trim()
                        : null;
                    if (photoId) {
                        // Idempotency: a retried resolve carries the photoIds
                        // assigned at selection time; a photoId already attached
                        // to this report is skipped, never duplicated.
                        const alreadyAttached = await getGridFsBucket()
                            .find({ 'metadata.photoId': photoId, 'metadata.resourceId': report._id })
                            .limit(1)
                            .toArray();
                        if (alreadyAttached.length > 0) continue;
                    }
                    const [stored] = await uploadFilesToGridFS([file], {
                        category: 'resolution',
                        visibility: 'private',
                        ownerId: responder._id,
                        resourceId: report._id,
                        municipalityName: report.municipalityName,
                        photoId,
                    });
                    storedResolutionUrls.push(stored.url);
                }
            } catch (storageError) {
                console.error('Resolution photo storage error:', storageError);
                // A partial store must not leave orphaned resolution photos.
                await deleteGridFsFilesByUrls(storedResolutionUrls).catch(() => {});
                await cleanupTempUploadFiles(req.files);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to store resolution photos',
                });
            }
            report.resolutionImages = [...(report.resolutionImages || []), ...storedResolutionUrls];
            // The bytes are in GridFS now; the disk copies must not linger.
            await cleanupTempUploadFiles(req.files);
        }

        // Update report
        report.status = 'resolved';
        report.resolvedBy = responder._id;
        report.resolvedAt = new Date();
        report.resolutionNotes = resolutionNotes || '';
        try {
            await report.save();
        } catch (saveError) {
            // The photos are already in GridFS but the report never recorded
            // them: best-effort delete so they cannot become orphans. Only the
            // save is wrapped — post-save failures (e.g. broadcast) must never
            // delete files the report references.
            await deleteGridFsFilesByUrls(storedResolutionUrls).catch(() => {});
            throw saveError;
        }

        // Populate for response
        await report.populate('respondedBy', 'name email agency assignedMunicipality');
        await report.populate('resolvedBy', 'name email agency assignedMunicipality');

        // Get Socket.io instance
        const io = req.app.get('io');
        const agencyLabel = responder.agency === 'LGU' ? 'MDRRMO' : responder.agency;

        broadcastReportResolved(io, report, responder, agencyLabel);

        // Notification delivery is best-effort and must not turn a successful
        // state transition into an API error.
        if (!report.reporter?._id) {
            console.warn('Skipping resolution notification because reporter account is unavailable');
        } else {
            try {
                await Notification.createAndSend(
                    {
                        recipient: report.reporter._id,
                        type: 'report_resolved',
                        title: 'Incident Resolved',
                        message: `Your report at ${report.address} has been resolved by ${agencyLabel} (${responder.name}).${resolutionNotes ? ` Notes: ${resolutionNotes}` : ''}`,
                        data: {
                            reportId: report._id,
                            responderId: responder._id,
                            agency: responder.agency,
                        },
                    },
                    io
                );

                if (report.reporter.pushSubscription && report.reporter.notificationPreferences?.browserPush) {
                    await sendPushToUser(report.reporter, {
                        title: 'Incident Resolved',
                        body: `Your report at ${report.address} has been resolved by ${agencyLabel}.`,
                        icon: '/icons/icon-192.png',
                        data: { url: '/my-reports' },
                    });
                }
            } catch (notificationError) {
                console.error('Failed to notify reporter about resolution:', notificationError);
            }
        }

        res.json({
            success: true,
            message: `Report resolved successfully by ${agencyLabel}`,
            data: report,
        });
    } catch (error) {
        console.error('Resolve report error:', error);
        // F5: no temp file survives a rejected request.
        await cleanupTempUploadFiles(req.files);
        res.status(500).json({
            success: false,
            message: 'Failed to resolve report',
        });
    }
};

/**
 * @desc    Transfer response authority to a neighboring municipality
 * @route   PUT /api/admin/reports/:id/transfer
 * @access  Private (admin/municipal_admin only)
 */
export const transferReport = async (req, res) => {
    try {
        const { targetMunicipalityId, reason } = req.body;
        const admin = req.user;

        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        // Only allow transfer for verified or transferred reports with no ongoing response
        const transferableStatuses = ['verified', 'transferred'];
        const hasActiveResponse = report.status === 'responding'
            || (Array.isArray(report.responders) && report.responders.length > 0)
            || Boolean(report.respondedBy);

        if (!transferableStatuses.includes(report.status) || hasActiveResponse) {
            return res.status(400).json({
                success: false,
                message: hasActiveResponse
                    ? 'Cannot transfer an incident with an ongoing response.'
                    : `Cannot transfer a report with status "${report.status}".`,
            });
        }

        // Verify the admin has scope access to the report BEFORE transferring
        if (!ensureReportScopeAccess(admin, report)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to manage or transfer reports outside your jurisdiction',
            });
        }

        // Find target municipality
        const targetMuni = await Municipality.findById(targetMunicipalityId);
        if (!targetMuni) {
            return res.status(404).json({
                success: false,
                message: 'Target municipality not found',
            });
        }

        if (targetMuni._id.toString() === report.municipality?.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot transfer to the current handling municipality',
            });
        }

        const fromMuniId = report.municipality;
        const fromMuniName = report.municipalityName;
        const originalMuniId = report.originalMunicipality || fromMuniId;
        const originalMuniName = report.originalMunicipalityName
            || report.transferHistory?.[0]?.fromMunicipalityName
            || fromMuniName;

        // Perform the transfer. `municipalityName` remains the handling office
        // for scoping/dispatch; original* fields preserve where the incident happened.
        report.originalMunicipality = originalMuniId;
        report.originalMunicipalityName = originalMuniName;
        report.municipality = targetMuni._id;
        report.municipalityName = targetMuni.name;
        report.status = 'transferred';

        report.transferHistory.push({
            fromMunicipality: fromMuniId,
            fromMunicipalityName: fromMuniName,
            toMunicipality: targetMuni._id,
            toMunicipalityName: targetMuni.name,
            reason,
            transferredBy: admin._id,
        });

        await report.save();

        // Broadcast real-time update
        const io = req.app.get('io');
        if (io) {
            const { broadcastReportTransfer } = await import('../services/socketService.js');
            broadcastReportTransfer(io, report, fromMuniName, targetMuni.name, reason);
        }

        // Notify target municipal admins & responders
        try {
            const targetAdmins = await User.find({
                role: { $in: ['municipal_admin', 'responder'] },
                assignedMunicipality: targetMuni.name,
            }).select('_id');

            for (const targetUser of targetAdmins) {
                await Notification.createAndSend(
                    {
                        recipient: targetUser._id,
                        type: 'report_transferred',
                        title: 'Incident Transferred',
                        message: `Incident at ${report.address} has been transferred to your municipality from ${fromMuniName}. Reason: ${reason}`,
                        data: {
                            reportId: report._id,
                            fromMunicipality: fromMuniName,
                            toMunicipality: targetMuni.name,
                            reason,
                        },
                    },
                    io
                );
            }
        } catch (err) {
            console.error('Failed to notify target municipality users:', err);
        }

        res.json({
            success: true,
            message: `Report successfully transferred to ${targetMuni.name}`,
            data: report,
        });
    } catch (error) {
        console.error('Transfer report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to transfer report',
        });
    }
};

/**
 * @desc    Acknowledge the latest municipality transfer without blocking response
 * @route   PUT /api/admin/reports/:id/acknowledge-transfer
 * @access  Private (target municipal_admin only)
 */
export const acknowledgeTransfer = async (req, res) => {
    try {
        const municipalAdmin = req.user;

        if (municipalAdmin?.role !== 'municipal_admin' || !municipalAdmin.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Only the target municipal administrator can acknowledge a transfer',
            });
        }

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        const latestTransfer = report.transferHistory?.[report.transferHistory.length - 1];
        if (!latestTransfer) {
            return res.status(409).json({
                success: false,
                message: 'This report has no transfer to acknowledge',
            });
        }

        const isCurrentTarget = (
            latestTransfer.toMunicipalityName === municipalAdmin.assignedMunicipality
            && report.municipalityName === municipalAdmin.assignedMunicipality
        );
        if (!isCurrentTarget) {
            return res.status(403).json({
                success: false,
                message: 'Only the current target municipality can acknowledge this transfer',
            });
        }

        if (latestTransfer.acknowledgedAt) {
            await report.populate('transferHistory.transferredBy', 'name role assignedMunicipality');
            await report.populate('transferHistory.acknowledgedBy', 'name role assignedMunicipality');
            return res.json({
                success: true,
                message: 'Transfer already acknowledged',
                data: report,
            });
        }

        latestTransfer.acknowledgedBy = municipalAdmin._id;
        latestTransfer.acknowledgedAt = new Date();
        await report.save();
        await report.populate('transferHistory.transferredBy', 'name role assignedMunicipality');
        await report.populate('transferHistory.acknowledgedBy', 'name role assignedMunicipality');

        const io = req.app.get('io');
        if (io) {
            const { broadcastTransferAcknowledged } = await import('../services/socketService.js');
            broadcastTransferAcknowledged(io, report, latestTransfer, municipalAdmin);
        }

        const transferringAdminId = latestTransfer.transferredBy?._id || latestTransfer.transferredBy;
        if (transferringAdminId && transferringAdminId.toString() !== municipalAdmin._id.toString()) {
            try {
                await Notification.createAndSend(
                    {
                        recipient: transferringAdminId,
                        type: 'report_transfer_acknowledged',
                        title: 'Transfer Acknowledged',
                        message: `${municipalAdmin.assignedMunicipality} acknowledged the transferred incident at ${report.address}.`,
                        data: {
                            reportId: report._id,
                            municipality: municipalAdmin.assignedMunicipality,
                            acknowledgedAt: latestTransfer.acknowledgedAt,
                        },
                    },
                    io
                );
            } catch (notificationError) {
                console.error('Failed to notify the transferring administrator:', notificationError);
            }
        }

        res.json({
            success: true,
            message: 'Transfer acknowledged successfully',
            data: report,
        });
    } catch (error) {
        console.error('Acknowledge transfer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to acknowledge transfer',
        });
    }
};

export default {
    getUsers,
    getUserById,
    verifyReporter,
    getAllReports,
    getOperationalReportById,
    verifyReport,
    respondToReport,
    resolveReport,
    deleteReport,
    dismissTransferredReport,
    deleteUser,
    getDashboardStats,
    transferReport,
    acknowledgeTransfer,
};
