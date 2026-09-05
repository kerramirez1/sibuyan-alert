import mongoose from 'mongoose';
import User from '../models/User.js';
import Report from '../models/Report.js';
import Municipality from '../models/Municipality.js';
import Notification from '../models/Notification.js';
import AuthSession from '../models/AuthSession.js';
import { sendVerificationEmail, sendReportStatusEmail } from '../services/emailService.js';
import { sendPushToUser, pushTemplates } from '../services/pushService.js';
import {
    broadcastReportRejected,
    broadcastReportResolved,
    broadcastReportVerified,
    broadcastVerifiedReportToResponders,
} from '../services/socketService.js';
import { deleteGridFsFilesByUrls } from '../services/gridFsService.js';
import {
    canViewOperationalReport,
    canViewReporterContact,
    isMunicipalAdminInReportScope,
} from '../utils/reportAccess.js';
import { toOperationalReport, toOperationalReportSummary } from '../utils/operationalReport.js';
import { normalizeCasualtyCounts } from '../utils/casualtyCounts.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

        if (role && ['ordinary', 'reporter', 'responder'].includes(role)) {
            query.role = role;
        } else {
            // Administrator accounts are not manageable from the municipal user list.
            query.role = { $in: ['ordinary', 'reporter', 'responder'] };
        }

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

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await User.countDocuments(query);

        // Get counts by role
        const scope = query.$and ? { $and: query.$and } : {};
        const [totalUsers, reporters, responders, pendingVerification] = await Promise.all([
            User.countDocuments({ role: { $in: ['ordinary', 'reporter', 'responder'] }, ...scope }),
            User.countDocuments({ role: 'reporter', ...scope }),
            User.countDocuments({ role: 'responder', ...scope }),
            User.countDocuments({ role: 'reporter', verificationStatus: 'pending', ...scope }),
        ]);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
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
                verificationStatus: user.verificationStatus,
                isVerified: user.isVerified,
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
        const scopeClause = {
            $and: [
                {
                    $or: [
                        { municipalityName: scopedMunicipality },
                        { originalMunicipalityName: scopedMunicipality },
                        { 'transferHistory.fromMunicipalityName': scopedMunicipality },
                    ],
                },
                // Read-only transferred copies an admin dismissed from their
                // own queue. Missing field (legacy docs) still matches $ne.
                { hiddenFromMunicipalities: { $ne: scopedMunicipality } },
            ],
        };
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
            const responderId = admin._id;

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
        if (safeSearch) {
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
        const reports = await Report.find(query)
            .populate('reporter', reporterProjection)
            .populate('verifiedBy', 'name')
            .populate('respondedBy', 'name email agency assignedMunicipality')
            .populate('resolvedBy', 'name email agency assignedMunicipality')
            .populate('transferHistory.transferredBy', 'name role assignedMunicipality')
            .populate('transferHistory.acknowledgedBy', 'name role assignedMunicipality')
            .populate('reportUpdates.author', 'name role agency')
            .populate('municipality', 'name code')
            .sort({ incidentTime: -1, createdAt: -1 })
            .limit(safeLimit)
            .skip((safePage - 1) * safeLimit);

        const total = await Report.countDocuments(query);

        // Counts use exactly the same municipal visibility scope as the queue.
        const statsQuery = scopeClause;

        const [pending, verified, transferred, rejected, responding, resolved] = await Promise.all([
            Report.countDocuments({ ...statsQuery, status: 'pending' }),
            Report.countDocuments({ ...statsQuery, status: 'verified' }),
            Report.countDocuments({ ...statsQuery, status: 'transferred' }),
            Report.countDocuments({ ...statsQuery, status: 'rejected' }),
            Report.countDocuments({ ...statsQuery, status: 'responding' }),
            Report.countDocuments({ ...statsQuery, status: 'resolved' }),
        ]);


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
                stats: {
                    pending,
                    verified,
                    transferred,
                    rejected,
                    responding,
                    resolved,
                    total: pending + verified + transferred + rejected + responding + resolved,
                },
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

        const report = await Report.findById(req.params.id).populate('reporter', 'name email pushSubscription notificationPreferences');

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
            report.casualties = correction;
        }

        // Update report status
        report.status = status;
        report.verifiedBy = admin._id;
        report.verifiedAt = new Date();
        if (rejectionReason) report.rejectionReason = rejectionReason;

        await report.save();

        // Get Socket.io instance
        const io = req.app.get('io');

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
            }
        }

        // Create notification for reporter
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

        // Send email notification
        if (report.reporter.notificationPreferences?.email !== false) {
            await sendReportStatusEmail(report.reporter, report, status, rejectionReason);
        }

        // Send push notification
        if (report.reporter.pushSubscription && report.reporter.notificationPreferences?.browserPush) {
            const template = status === 'verified'
                ? pushTemplates.reportVerified(report)
                : pushTemplates.reportRejected(report, rejectionReason);
            await sendPushToUser(report.reporter, template);
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

        await deleteGridFsFilesByUrls(report.images);

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
        const hasVerifiedReports = await Report.exists({
            reporter: user._id,
            status: { $in: ['verified', 'responding', 'resolved'] }
        });

        if (hasVerifiedReports) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete user with verified/responding/resolved reports. Reassign or archive reports first.',
            });
        }

        const reportsToDelete = await Report.find({ reporter: user._id }).select('images');
        const associatedFileUrls = [
            user.avatar,
            user.idDocument,
            user.selfiePhoto,
            ...reportsToDelete.flatMap((report) => report.images || []),
        ].filter(Boolean);

        // 1. Delete notifications
        await Notification.deleteMany({ recipient: user._id });

        // 2. Delete non-production reports from this account
        await Report.deleteMany({ reporter: user._id });

        // 3. Delete the user
        await AuthSession.deleteMany({ user: user._id });
        req.app.get('io')?.in(`user_${user._id}`).disconnectSockets(true);
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
export const getDashboardStats = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const admin = req.user;
        const municipality = admin.assignedMunicipality;
        if (!municipality) {
            return res.status(403).json({
                success: false,
                message: 'Municipality is not assigned to this administrator',
            });
        }

        const reportFilter = {
            $or: [
                { municipalityName: municipality },
                { originalMunicipalityName: municipality },
                { 'transferHistory.fromMunicipalityName': municipality },
            ],
        };
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
            Report.countDocuments({ ...reportFilter, createdAt: { $gte: sevenDaysAgo } }),
            Report.countDocuments({ ...reportFilter, createdAt: { $gte: thirtyDaysAgo } }),
            Report.find(reportFilter).sort({ createdAt: -1 }).limit(5).populate('reporter', 'name'),
            User.find(userScopeFilter).sort({ createdAt: -1 }).limit(5).select('name email role createdAt'),
            Report.aggregate([
                {
                    $match: {
                        ...reportFilter,
                        createdAt: { $gte: thirtyDaysAgo }
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
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
 * @desc    Respond to a verified report (MULTI-UNIT, NON-EXCLUSIVE)
 * @route   PUT /api/admin/reports/:id/respond
 * @access  Private (responder only)
 */
export const respondToReport = async (req, res) => {
    try {
        const responder = req.user;
        let { unitName, unitType } = req.body;

        // For agency-specific responders, auto-detect from their account
        if (responder.role === 'responder' && responder.agency) {
            unitType = unitType || responder.agency;
            unitName = unitName || responder.responderUnit || `${responder.agency} - ${responder.assignedMunicipality}`;
        }

        // Validate required fields
        if (!unitName || !unitType) {
            return res.status(400).json({
                success: false,
                message: 'Unit name and unit type are required',
            });
        }

        // Validate unitType
        const validTypes = ['MDRRMO', 'PNP', 'BFP', 'Medical Team', 'RESCUE', 'MEDICAL', 'BARANGAY'];
        if (!validTypes.includes(unitType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid unit type. Must be one of: ${validTypes.join(', ')}`,
            });
        }

        // Find the report
        const report = await Report.findById(req.params.id)
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

        // Check if this user/unit combination has already responded
        const alreadyResponded = report.responders?.some(
            r => r.user?.toString() === responder._id.toString() && r.unitName === unitName
        );

        if (alreadyResponded) {
            return res.status(409).json({
                success: false,
                message: `${unitName} has already responded to this report`,
            });
        }

        // Validate municipality access (responders can only respond to their municipality)
        if (!responder.assignedMunicipality || report.municipalityName !== responder.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'You can only respond to reports in your assigned municipality',
            });
        }

        // Add responder to the responders array
        if (!report.responders) {
            report.responders = [];
        }

        report.responders.push({
            user: responder._id,
            unitName,
            unitType,
            respondedAt: new Date(),
            notes: null,
        });

        // A transferred report may retain earlier mutual-aid responders, so
        // always move it back into the active response state.
        report.status = 'responding';

        // Update legacy fields for backward compatibility (first responder)
        if (report.responders.length === 1) {
            report.respondedBy = responder._id;
            report.respondedAt = new Date();
            report.responderAgency = unitType;
        }

        await report.save();

        // Get Socket.io instance
        const io = req.app.get('io');

        // Broadcast multi-unit response to all clients
        if (io) {
            const { broadcastMultiUnitResponse } = await import('../services/socketService.js');
            await broadcastMultiUnitResponse(io, report, responder, unitName, unitType);
        }

        // Create notification for the reporter
        const isFirstResponder = report.responders.length === 1;
        if (!report.reporter?._id) {
            console.warn('Skipping reporter notification because reporter account is unavailable');
        } else {
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
        }

        // Notify admins that a responder has engaged with this report
        const adminRecipientsQuery = {
            role: 'municipal_admin',
            assignedMunicipality: report.municipalityName,
            _id: { $ne: responder._id },
        };

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

        // Send push notification to reporter
        if (report.reporter?.pushSubscription && report.reporter.notificationPreferences?.browserPush) {
            await sendPushToUser(report.reporter, {
                title: isFirstResponder ? 'Help is on the way' : 'More help arriving',
                body: `${unitName} is responding to your report. ${report.responders.length} unit(s) responding.`,
                icon: '/icon-192x192.png',
                data: { url: '/my-reports' },
            });
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
            return res.status(403).json({
                success: false,
                message: 'Access denied - Only responders can resolve incident reports.',
            });
        }

        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name email pushSubscription notificationPreferences');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        // Only allow resolving reports that are in "responding" status
        if (report.status !== 'responding') {
            return res.status(400).json({
                success: false,
                message: `Cannot resolve a report with status "${report.status}". Only reports being responded to can be resolved.`,
            });
        }

        // Responders may only close incidents handled by their jurisdiction.
        if (!ensureReportScopeAccess(responder, report)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to resolve reports outside your jurisdiction',
            });
        }

        // Only the first responder or a joined responding unit can resolve.
        const isFirstResponder = report.respondedBy && report.respondedBy.toString() === responder._id.toString();
        const isJoinedResponder = report.responders?.some(r => r.user?.toString() === responder._id.toString());

        if (!isFirstResponder && !isJoinedResponder) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Only assigned responders can resolve this report.',
            });
        }

        // Update report
        report.status = 'resolved';
        report.resolvedBy = responder._id;
        report.resolvedAt = new Date();
        report.resolutionNotes = resolutionNotes || '';
        await report.save();

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
                        icon: '/icon-192x192.png',
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

        // Only allow transfer for verified, responding, or transferred reports
        const transferableStatuses = ['verified', 'responding', 'transferred'];
        if (!transferableStatuses.includes(report.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot transfer a report with status "${report.status}".`,
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

        // Perform the transfer
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
