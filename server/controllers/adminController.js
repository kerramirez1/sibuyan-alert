import User from '../models/User.js';
import Report from '../models/Report.js';
import Municipality from '../models/Municipality.js';
import Notification from '../models/Notification.js';
import { sendVerificationEmail, sendReportStatusEmail } from '../services/emailService.js';
import { sendPushNotification, pushTemplates } from '../services/pushService.js';
import { broadcastVerifiedReportToResponders, broadcastReportVerified, broadcastReportRejected } from '../services/socketService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeSearch = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 100);
};

const canViewAllMunicipalities = (user) => ['admin', 'municipal_admin'].includes(user.role);

const ensureReportScopeAccess = (user, report) => {
    if (!user.assignedMunicipality) return true;
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
    if (adminUser.role !== 'municipal_admin') {
        return { allowed: true };
    }

    if (['admin', 'municipal_admin'].includes(targetUser.role)) {
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

        if (role) {
            query.role = role;
        } else {
            // By default, exclude admins from the list to prevent accidental deletion
            query.role = { $ne: 'admin' };
        }

        if (verificationStatus) query.verificationStatus = verificationStatus;
        if (safeSearch) {
            const pattern = escapeRegex(safeSearch);
            query.$or = [
                { name: { $regex: pattern, $options: 'i' } },
                { email: { $regex: pattern, $options: 'i' } },
            ];
        }

        if (adminUser.role === 'municipal_admin' && adminUser.assignedMunicipality) {
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
        const [totalUsers, reporters, admins, pendingVerification] = await Promise.all(
            adminUser.role === 'municipal_admin' && adminUser.assignedMunicipality
                ? [
                    User.countDocuments(query),
                    User.countDocuments({
                        role: 'reporter',
                        ...(query.$and ? { $and: query.$and } : {}),
                    }),
                    User.countDocuments({ role: 'admin' }),
                    User.countDocuments({
                        role: 'reporter',
                        verificationStatus: 'pending',
                        ...(query.$and ? { $and: query.$and } : {}),
                    }),
                ]
                : [
                    User.countDocuments(),
                    User.countDocuments({ role: 'reporter' }),
                    User.countDocuments({ role: 'admin' }),
                    User.countDocuments({ verificationStatus: 'pending' }),
                ]
        );

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
                    admins,
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

        const user = await User.findById(req.params.id);

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
        if (feedback) user.verificationFeedback = feedback;

        await user.save();

        // Get Socket.io instance
        const io = req.app.get('io');

        // Create in-app notification
        await Notification.createAndSend(
            {
                recipient: user._id,
                type: status === 'approved' ? 'reporter_verified' : 'reporter_rejected',
                title: status === 'approved'
                    ? '🎉 Account Verified!'
                    : '⚠️ Verification Update',
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
            await sendPushNotification(user.pushSubscription, template);
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
 * @access  Private (admin only)
 * @note    Municipal admins only see reports in their jurisdiction
 */
export const getAllReports = async (req, res) => {
    try {
        const {
            status,
            category,
            municipality,
            page = 1,
            limit = 20,
            search,
            startDate,
            endDate
        } = req.query;

        const showAll = req.query.showAll === 'true' && canViewAllMunicipalities(req.user);
        const safeSearch = sanitizeSearch(search);
        const query = {};
        const admin = req.user;

        // Municipal admins can only see reports in their jurisdiction or originally theirs (unless showAll)
        if (admin.assignedMunicipality && !showAll) {
            query.$and = [{
                $or: [
                    { municipalityName: admin.assignedMunicipality },
                    { originalMunicipalityName: admin.assignedMunicipality }
                ],
            }];
        } else if (municipality) {
            // Super admin can filter by municipality
            query.$and = [{
                $or: [
                    { municipalityName: municipality },
                    { originalMunicipalityName: municipality }
                ],
            }];
        }

        // Responders can see pending + active lifecycle reports (but not rejected)
        if (admin.role === 'responder') {
            const responderVisibleStatuses = ['pending', 'verified', 'transferred', 'responding', 'resolved'];
            if (status && responderVisibleStatuses.includes(status)) {
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

        const reports = await Report.find(query)
            .populate('reporter', 'name email avatar isVerified')
            .populate('verifiedBy', 'name')
            .populate('respondedBy', 'name email agency assignedMunicipality')
            .populate('resolvedBy', 'name email agency assignedMunicipality')
            .populate('reportUpdates.author', 'name role agency')
            .populate('municipality', 'name code')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Report.countDocuments(query);

        // Get counts by status (scoped to admin's jurisdiction unless showAll)
        const statsQuery = (admin.assignedMunicipality && !showAll)
            ? { municipalityName: admin.assignedMunicipality }
            : {};

        const [pending, verified, rejected, responding, resolved] = await Promise.all([
            Report.countDocuments({ ...statsQuery, status: 'pending' }),
            Report.countDocuments({ ...statsQuery, status: 'verified' }),
            Report.countDocuments({ ...statsQuery, status: 'rejected' }),
            Report.countDocuments({ ...statsQuery, status: 'responding' }),
            Report.countDocuments({ ...statsQuery, status: 'resolved' }),
        ]);


        res.json({
            success: true,
            data: {
                reports,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
                stats: {
                    pending,
                    verified,
                    rejected,
                    responding,
                    resolved,
                    total: pending + verified + rejected + responding + resolved,
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

                let reviewAudience = io.to('role_admin');
                if (report.municipalityName) {
                    reviewAudience = reviewAudience.to(`municipality_${report.municipalityName}`);
                }
                reviewAudience.emit('reportRejectedUpdate', {
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
                    ? '✅ Report Verified'
                    : '❌ Report Not Verified',
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
                            title: '🚨 New Verified Incident',
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
            await sendPushNotification(report.reporter.pushSubscription, template);
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

        // 1. Delete associated files
        if (user.avatar && user.avatar.startsWith('/uploads')) {
            const avatarPath = path.join(__dirname, '..', user.avatar);
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
            }
        }

        if (user.idDocument && user.idDocument.startsWith('/uploads')) {
            const idPath = path.join(__dirname, '..', user.idDocument);
            if (fs.existsSync(idPath)) {
                fs.unlinkSync(idPath);
            }
        }

        // 2. Delete notifications
        await Notification.deleteMany({ recipient: user._id });

        // 3. Delete non-production reports from this account
        await Report.deleteMany({ reporter: user._id });

        // 4. Delete the user
        await user.deleteOne();

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
        const showAll = req.query.showAll === 'true' && canViewAllMunicipalities(admin);

        // Filter reports by municipality if admin is assigned to one (unless showAll)
        const reportFilter = (municipality && !showAll) ? { municipalityName: municipality } : {};
        const scopedUserIds = (municipality && !showAll)
            ? await getMunicipalityScopedUserIds(municipality)
            : null;
        const userScopeFilter = scopedUserIds ? { _id: { $in: scopedUserIds }, role: { $ne: 'admin' } } : {};
        const reporterScopeFilter = scopedUserIds ? { _id: { $in: scopedUserIds }, role: 'reporter' } : { role: 'reporter' };

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
 * @desc    Update my responder duty status (on duty / off duty)
 * @route   PUT /api/admin/responders/me/duty-status
 * @access  Private (responder only)
 */
export const updateMyDutyStatus = async (req, res) => {
    try {
        if (req.user.role !== 'responder') {
            return res.status(403).json({
                success: false,
                message: 'Only responder accounts can change duty status',
            });
        }

        const { isOnDuty } = req.body;
        if (typeof isOnDuty !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'isOnDuty must be a boolean value',
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        user.isOnDuty = isOnDuty;
        await user.save();

        const io = req.app.get('io');
        if (io) {
            const payload = {
                userId: user._id.toString(),
                name: user.name,
                role: user.role,
                assignedMunicipality: user.assignedMunicipality,
                agency: user.agency,
                isOnDuty: user.isOnDuty,
            };

            io.to(`user_${user._id}`).emit('dutyStatusUpdated', payload);
            if (user.assignedMunicipality) {
                io.to(`municipality_${user.assignedMunicipality}`).emit('userDutyStatusChanged', payload);
            }
            io.emit('onlineUsersUpdate', {
                onlineCount: null,
                dutyStatusChanged: true,
                userId: user._id.toString(),
            });
        }

        res.json({
            success: true,
            message: isOnDuty ? 'You are now ON DUTY' : 'You are now OFF DUTY',
            data: {
                id: user._id,
                isOnDuty: user.isOnDuty,
                role: user.role,
                assignedMunicipality: user.assignedMunicipality,
                agency: user.agency,
            },
        });
    } catch (error) {
        console.error('Update duty status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update duty status',
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
        const validTypes = ['MDRRMO', 'PNP', 'BFP', 'SDH', 'RESCUE', 'MEDICAL', 'BARANGAY'];
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
            r => r.user.toString() === responder._id.toString() && r.unitName === unitName
        );

        if (alreadyResponded) {
            return res.status(409).json({
                success: false,
                message: `${unitName} has already responded to this report`,
            });
        }

        // Validate municipality access (responders can only respond to their municipality)
        if (responder.role === 'responder' || responder.role === 'municipal_admin') {
            if (responder.assignedMunicipality && report.municipalityName !== responder.assignedMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only respond to reports in your assigned municipality',
                });
            }
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
                    title: isFirstResponder ? '🚨 Responder Dispatched!' : '🚑 Additional Unit Responding!',
                    message: isFirstResponder
                        ? `${unitType} ${unitName} is now responding to your report at ${report.address}.`
                        : `${unitType} ${unitName} has joined the response. Total units: ${report.responders.length}`,
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
            $or: [
                { role: 'admin' },
                ...(report.municipalityName
                    ? [{ role: 'municipal_admin', assignedMunicipality: report.municipalityName }]
                    : []),
            ],
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
                            ? `${unitType} ${unitName} is now responding at ${report.address}.`
                            : `${unitType} ${unitName} joined response at ${report.address}. Total units: ${report.responders.length}.`,
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
            await sendPushNotification(report.reporter.pushSubscription, {
                title: isFirstResponder ? '🚨 Help is on the way!' : '🚑 More help arriving!',
                body: `${unitType} ${unitName} is responding to your report. ${report.responders.length} unit(s) responding.`,
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
        const isJoinedResponder = report.responders?.some(r => r.user && r.user.toString() === responder._id.toString());

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

        if (io) {
            // Notify ALL clients that this report is now resolved
            io.emit('reportResolved', {
                id: report._id,
                resolvedBy: {
                    _id: responder._id,
                    name: responder.name,
                    agency: responder.agency,
                    agencyLabel,
                },
                resolvedAt: report.resolvedAt,
                resolutionNotes: report.resolutionNotes,
                status: 'resolved',
            });
        }

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
                        title: '✅ Incident Resolved',
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
                    await sendPushNotification(report.reporter.pushSubscription, {
                        title: '✅ Incident Resolved',
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
                        title: '🔄 Cross-Border Incident Transferred',
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

export default {
    getUsers,
    getUserById,
    verifyReporter,
    getAllReports,
    verifyReport,
    respondToReport,
    resolveReport,
    deleteReport,
    deleteUser,
    getDashboardStats,
    updateMyDutyStatus,
    transferReport,
};
