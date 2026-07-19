import Report from '../models/Report.js';
import User from '../models/User.js';
import Municipality from '../models/Municipality.js';
import Notification from '../models/Notification.js';
import { isWithinSibuyanBounds } from '../services/geocoding.js';
import { processLocation, getResponseTimeEstimate } from '../services/locationService.js';
import { sendNewReportAlertEmail } from '../services/emailService.js';
import { sendPushToUsers, pushTemplates } from '../services/pushService.js';
import { deleteGridFsFilesByUrls, uploadFilesToGridFS } from '../services/gridFsService.js';

/**
 * Incident Categories Configuration
 */
const INCIDENT_CATEGORIES = {
    accident: {
        label: 'Vehicle Accident',
        types: ['vehicular', 'motorcycle', 'pedestrian', 'bicycle', 'maritime', 'other'],
        emoji: '🚗',
    },
};

/**
 * @desc    Create a new incident report
 * @route   POST /api/reports
 * @access  Private (verified reporters only)
 */
export const createReport = async (req, res) => {
    let report = null;
    let uploadedImageUrls = [];

    try {
        const {
            incidentCategory,
            incidentType,
            description,
            address,
            barangay,
            incidentTime,
            accidentTime, // Legacy support
            accidentType, // Legacy support
            severity,
            lat,
            lng,
        } = req.body;

        // Parse casualties and affected area from form data
        const casualties = {
            injured: parseInt(req.body['casualties[injured]']) || 0,
            fatalities: parseInt(req.body['casualties[fatalities]']) || 0,
            missing: parseInt(req.body['casualties[missing]']) || 0,
        };

        const affectedArea = {
            householdsAffected: parseInt(req.body['affectedArea[householdsAffected]']) || 0,
            evacuees: parseInt(req.body['affectedArea[evacuees]']) || 0,
        };

        // Validate required fields
        const finalIncidentTime = incidentTime || accidentTime;
        if (!finalIncidentTime) {
            return res.status(400).json({
                success: false,
                message: 'Incident time is required',
            });
        }

        // Determine category and type (with legacy support)
        const finalCategory = incidentCategory || 'accident';
        const finalType = incidentType || accidentType || 'vehicular';

        // Validate category
        if (!INCIDENT_CATEGORIES[finalCategory]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid incident category',
            });
        }

        // ===== AUTOMATED LOCATION PROCESSING =====
        // Use the LocationService to:
        // 1. Convert address to coordinates (geocoding)
        // 2. Determine the nearest municipality for response
        const locationResult = await processLocation({
            address,
            barangay,
            lat: lat ? parseFloat(lat) : undefined,
            lng: lng ? parseFloat(lng) : undefined,
        });

        if (!locationResult.success) {
            const errorMessage = locationResult.warnings.length > 0
                ? locationResult.warnings.join('. ')
                : 'Could not process location. Please provide valid coordinates or address.';

            return res.status(400).json({
                success: false,
                message: errorMessage,
            });
        }

        // Validate the location is within Sibuyan Island
        if (!isWithinSibuyanBounds(locationResult.coordinates.lat, locationResult.coordinates.lng)) {
            return res.status(400).json({
                success: false,
                message: 'Location must be within Sibuyan Island',
                warnings: locationResult.warnings,
            });
        }

        // Get response time estimate
        const responseEstimate = locationResult.municipalityName
            ? getResponseTimeEstimate(
                locationResult.coordinates.lat,
                locationResult.coordinates.lng,
                locationResult.municipalityName
            )
            : null;



        // Persist validated evidence in MongoDB GridFS only after location validation succeeds.
        if (req.files?.length) {
            const storedImages = await uploadFilesToGridFS(req.files, {
                category: 'report_evidence',
                visibility: 'public',
                ownerId: req.user._id,
                municipalityName: locationResult.municipalityName,
            });
            uploadedImageUrls = storedImages.map(({ url }) => url);
        }

        // Create the report with processed location data
        report = await Report.create({
            reporter: req.user._id,
            incidentCategory: finalCategory,
            incidentType: finalType,
            description,
            address: locationResult.address,
            barangay: barangay || null,
            coordinates: locationResult.coordinates,
            municipality: locationResult.municipalityId,
            municipalityName: locationResult.municipalityName,
            incidentTime: new Date(finalIncidentTime),
            accidentTime: new Date(finalIncidentTime), // Legacy compatibility
            accidentType: finalType, // Legacy compatibility
            severity: severity || 'moderate',
            casualties,
            affectedArea,
            images: uploadedImageUrls,
            status: 'pending',
            // Store location processing metadata
            locationSource: locationResult.source,
            responseEstimate: responseEstimate || undefined,
        });

        // Populate reporter info
        await report.populate('reporter', 'name email avatar');
        await report.populate('municipality', 'name code');

        // Get Socket.io instance
        const io = req.app.get('io');

        // Pending reports are only broadcast to authorized operational users.
        // Public clients receive the report after verification.
        if (io) {
            const categoryConfig = INCIDENT_CATEGORIES[finalCategory];
            const newReportPayload = {
                id: report._id,
                category: finalCategory,
                categoryLabel: categoryConfig.label,
                type: finalType,
                address: report.address,
                municipality: locationResult.municipalityName,
                coordinates: report.coordinates,
                status: report.status,
                incidentTime: report.incidentTime,
                severity: report.severity,
                priority: report.priority,
                casualties: report.casualties,
                responseEstimate,
            };

            let reportAudience = io.to('role_admin');
            if (locationResult.municipalityName) {
                reportAudience = reportAudience.to(`municipality_${locationResult.municipalityName}`);
            }
            reportAudience.emit('newReport', newReportPayload);

            // Notify municipality-specific responder room using municipality NAME
            // (frontend joins rooms as `municipality_${user.assignedMunicipality}`)
            if (locationResult.municipalityName) {
                const municipalityRoom = `municipality_${locationResult.municipalityName}`;
                const responderRoom = `municipality_${locationResult.municipalityName}_responders`;

                // Alert responders in this municipality about the new report
                io.to(responderRoom).emit('newReportAlert', {
                    id: report._id,
                    category: finalCategory,
                    incidentType: finalType,
                    address: report.address,
                    municipalityName: locationResult.municipalityName,
                    severity: report.severity,
                    coordinates: report.coordinates,
                    responseEstimate,
                    timestamp: new Date(),
                });

                // Also emit to the general municipality room
                io.to(municipalityRoom).emit('localIncident', {
                    id: report._id,
                    category: finalCategory,
                    address: report.address,
                    severity: report.severity,
                    responseEstimate,
                });
            }
        }

        // Notify admins — include municipal_admin and responder roles (filtered by municipality)
        const categoryConfig = INCIDENT_CATEGORIES[finalCategory];

        // Build query to find relevant admin users
        const adminQuery = {
            $or: [
                // Super admins always get notified
                { role: 'admin' },
                // Municipal admins only for the matching municipality
                ...(locationResult.municipalityName ? [
                    { role: 'municipal_admin', assignedMunicipality: locationResult.municipalityName },
                ] : []),
            ]
        };

        const admins = await User.find(adminQuery);

        // Create in-app notifications for each admin/responder
        for (const admin of admins) {
            await Notification.createAndSend(
                {
                    recipient: admin._id,
                    type: 'new_report',
                    title: `${categoryConfig.emoji} New ${categoryConfig.label} Report`,
                    message: `New ${categoryConfig.label.toLowerCase()} reported at ${report.address}${locationResult.municipalityName ? ` (${locationResult.municipalityName})` : ''}`,
                    data: { reportId: report._id, category: finalCategory, municipality: locationResult.municipalityName },
                },
                io
            );

            // Send email notification
            if (admin.notificationPreferences?.email) {
                await sendNewReportAlertEmail(admin.email, report, req.user);
            }
        }

        // Send push notifications to admins
        await sendPushToUsers(
            admins.filter((a) => a.pushSubscription && a.notificationPreferences?.browserPush),
            pushTemplates.newReport(report)
        );

        res.status(201).json({
            success: true,
            message: 'Incident report submitted successfully. It will be visible after verification.',
            data: report,
        });
    } catch (error) {
        if (!report && uploadedImageUrls.length) {
            await deleteGridFsFilesByUrls(uploadedImageUrls);
        }
        console.error('Create report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create report',
            error: error.message,
        });
    }
};

/**
 * @desc    Get all verified reports (public)
 * @route   GET /api/reports
 * @access  Public
 */
export const getReports = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            startDate,
            endDate,
            severity,
            type,
            category,
            municipality,
            status = 'verified',
        } = req.query;

        const query = {};

        // Public feeds may only expose reports that have passed verification.
        // "all" means all publishable lifecycle states, not every database state.
        const publishableStatuses = ['verified', 'transferred', 'responding', 'resolved'];
        if (status === 'all') {
            query.status = { $in: publishableStatuses };
        } else if (publishableStatuses.includes(status)) {
            query.status = status;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid public report status',
            });
        }

        // Filter by category
        if (category) {
            query.incidentCategory = category;
        }

        // Filter by date range
        if (startDate || endDate) {
            query.incidentTime = {};
            if (startDate) query.incidentTime.$gte = new Date(startDate);
            if (endDate) query.incidentTime.$lte = new Date(endDate);
        }

        // Filter by severity
        if (severity) {
            query.severity = severity;
        }

        // Filter by type
        if (type) {
            query.incidentType = type;
        }

        // Filter by municipality
        if (municipality) {
            query.municipality = municipality;
        }

        const reports = await Report.find(query)
            .select('-transferHistory -resolutionNotes')
            .populate('reporter', 'name avatar')
            .populate('municipality', 'name code')
            .sort({ incidentTime: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Report.countDocuments(query);

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
            },
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reports',
        });
    }
};

/**
 * @desc    Get single report by ID
 * @route   GET /api/reports/:id
 * @access  Public (verified) / Private (pending - owner/admin only)
 */
export const getReportById = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name avatar')
            .populate('verifiedBy', 'name')
            .populate('reportUpdates.author', 'name role agency')
            .populate('municipality', 'name code emergencyContacts responseCapabilities');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        const isOwner = Boolean(
            req.user && report.reporter?._id?.toString() === req.user._id.toString()
        );
        const isAdmin = req.user?.role === 'admin';

        // Match the public list visibility rules for individual report access.
        const publicViewableStatuses = ['verified', 'transferred', 'responding', 'resolved'];
        if (!publicViewableStatuses.includes(report.status)) {
            if (!isOwner && !isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view this report',
                });
            }
        }

        // Increment view count
        report.viewCount += 1;
        await report.save();

        const responseData = report.toObject();
        if (!isOwner && !isAdmin) {
            delete responseData.transferHistory;
            delete responseData.resolutionNotes;
            delete responseData.rejectionReason;
        }

        res.json({
            success: true,
            data: responseData,
        });
    } catch (error) {
        console.error('Get report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get report',
        });
    }
};

/**
 * @desc    Get my submitted reports
 * @route   GET /api/reports/my-reports
 * @access  Private
 */
export const getMyReports = async (req, res) => {
    try {
        const reports = await Report.find({ reporter: req.user._id })
            .populate('municipality', 'name code')
            .populate('respondedBy', 'name agency assignedMunicipality')
            .populate('resolvedBy', 'name agency assignedMunicipality')
            .populate('reportUpdates.author', 'name role agency')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: reports,
        });
    } catch (error) {
        console.error('Get my reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get your reports',
        });
    }
};

/**
 * @desc    Add a reporter update to an existing report
 * @route   POST /api/reports/:id/updates
 * @access  Private (report owner reporter / admin)
 */
export const addReportUpdate = async (req, res) => {
    try {
        const { message, tag = 'general' } = req.body;
        const normalizedMessage = typeof message === 'string' ? message.trim() : '';

        if (!normalizedMessage || normalizedMessage.length < 5) {
            return res.status(400).json({
                success: false,
                message: 'Update message must be at least 5 characters long',
            });
        }

        const allowedTags = ['general', 'transported', 'stabilized', 'need_help', 'false_alarm', 'other'];
        const normalizedTag = allowedTags.includes(tag) ? tag : 'general';

        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name email');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        const isOwner = report.reporter?._id?.toString() === req.user._id.toString();
        const isAdmin = ['admin', 'municipal_admin'].includes(req.user.role);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this report',
            });
        }

        if (['resolved', 'rejected'].includes(report.status) && !isAdmin) {
            return res.status(400).json({
                success: false,
                message: 'This report is already closed and can no longer be updated',
            });
        }

        report.reportUpdates.push({
            author: req.user._id,
            authorRole: req.user.role,
            message: normalizedMessage,
            tag: normalizedTag,
        });

        await report.save();
        await report.populate('reportUpdates.author', 'name role agency');

        const latestUpdate = report.reportUpdates[report.reportUpdates.length - 1];
        const io = req.app.get('io');

        if (io) {
            const payload = {
                id: report._id,
                municipalityName: report.municipalityName || null,
                status: report.status,
                update: latestUpdate,
                report: {
                    _id: report._id,
                    status: report.status,
                    reportUpdates: report.reportUpdates,
                },
            };

            // Reporter's own devices/tabs
            if (report.reporter?._id) {
                io.to(`user_${report.reporter._id}`).emit('reportUpdatedByReporter', payload);
            }

            // Municipality responders/admin viewers
            if (report.municipalityName) {
                io.to(`municipality_${report.municipalityName}`).emit('reportUpdatedByReporter', payload);
                io.to(`municipality_${report.municipalityName}_responders`).emit('reportUpdatedByReporter', payload);
            }
        }

        // Notify admins/responders (municipality-scoped + global admin)
        const recipientsQuery = {
            $or: [
                { role: 'admin' },
                ...(report.municipalityName ? [
                    { role: 'municipal_admin', assignedMunicipality: report.municipalityName },
                    { role: 'responder', assignedMunicipality: report.municipalityName },
                ] : []),
            ],
        };

        const recipients = await User.find(recipientsQuery).select('_id');
        for (const recipient of recipients) {
            if (recipient._id.toString() === req.user._id.toString()) continue;
            await Notification.createAndSend(
                {
                    recipient: recipient._id,
                    type: 'report_update',
                    title: 'Reporter Update Received',
                    message: `${req.user.name || 'Reporter'} updated incident at ${report.address}`,
                    data: {
                        reportId: report._id,
                        tag: normalizedTag,
                        municipality: report.municipalityName || null,
                    },
                },
                io
            );
        }

        res.status(201).json({
            success: true,
            message: 'Report update submitted successfully',
            data: {
                report,
                latestUpdate,
            },
        });
    } catch (error) {
        console.error('Add report update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add report update',
        });
    }
};

/**
 * @desc    Get high-risk zones
 * @route   GET /api/reports/high-risk-zones
 * @access  Public
 */
export const getHighRiskZones = async (req, res) => {
    try {
        const zones = await Report.getHighRiskZones();

        res.json({
            success: true,
            data: zones,
        });
    } catch (error) {
        console.error('Get high-risk zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get high-risk zones',
        });
    }
};

/**
 * @desc    Get map configuration (Sibuyan bounds)
 * @route   GET /api/reports/map-config
 * @access  Public
 */
export const getMapConfig = async (req, res) => {
    try {
        const { getSibuyanBounds } = await import('../services/geocoding.js');
        const config = getSibuyanBounds();

        res.json({
            success: true,
            data: config,
        });
    } catch (error) {
        console.error('Get map config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get map configuration',
        });
    }
};

/**
 * @desc    Get statistics
 * @route   GET /api/reports/stats
 * @access  Public
 */
export const getStats = async (req, res) => {
    try {
        const { category, municipality, municipalityName } = req.query;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Build match query
        // Public aggregates include every published lifecycle state. Pending and
        // rejected reports remain private to operational users.
        const matchQuery = { status: { $in: ['verified', 'transferred', 'responding', 'resolved'] } };
        if (category) matchQuery.incidentCategory = category;
        if (municipality) matchQuery.municipality = municipality;
        if (municipalityName) matchQuery.municipalityName = municipalityName;

        const [
            totalReports,
            recentCount,
            recentReports,
            byType,
            byMunicipality,
        ] = await Promise.all([
            Report.countDocuments(matchQuery),
            Report.countDocuments({ ...matchQuery, createdAt: { $gte: thirtyDaysAgo } }),
            Report.find(matchQuery)
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('reporter', 'name')
                .populate('municipality', 'name'),
            Report.aggregate([
                { $match: matchQuery },
                { $group: { _id: '$incidentType', count: { $sum: 1 } } },
            ]),
            Report.aggregate([
                { $match: matchQuery },
                { $group: { _id: '$municipalityName', count: { $sum: 1 } } },
            ]),
        ]);

        res.json({
            success: true,
            data: {
                totalReports,
                reportsLast30Days: recentCount,
                recentReports,
                byType: byType.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                byMunicipality: byMunicipality.reduce((acc, item) => {
                    if (item._id) acc[item._id] = item.count;
                    return acc;
                }, {}),
            },
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get statistics',
        });
    }
};

/**
 * @desc    Get municipalities list
 * @route   GET /api/reports/municipalities
 * @access  Public
 */
export const getMunicipalities = async (req, res) => {
    try {
        const municipalities = await Municipality.find({ isActive: true })
            .select('name code center bounds emergencyContacts responseCapabilities barangays')
            .sort({ name: 1 });

        res.json({
            success: true,
            data: municipalities,
        });
    } catch (error) {
        console.error('Get municipalities error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get municipalities',
        });
    }
};

/**
 * @desc    Get incident categories configuration
 * @route   GET /api/reports/categories
 * @access  Public
 */
export const getCategories = async (req, res) => {
    try {
        res.json({
            success: true,
            data: INCIDENT_CATEGORIES,
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get categories',
        });
    }
};

/**
 * @desc    Geocode an address and determine municipality
 * @route   POST /api/reports/geocode
 * @access  Public
 * 
 * This endpoint demonstrates the automated location processing:
 * 1. Converts address to coordinates (geocoding)
 * 2. Determines nearest municipality for response
 * 3. Calculates estimated response time
 */
export const geocodeLocation = async (req, res) => {
    try {
        const { address, barangay, lat, lng } = req.body;

        if (!address && !barangay && (lat === undefined || lng === undefined)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an address, barangay, or coordinates',
            });
        }

        // Use the automated location processing service
        const locationResult = await processLocation({
            address,
            barangay,
            lat: lat !== undefined ? parseFloat(lat) : undefined,
            lng: lng !== undefined ? parseFloat(lng) : undefined,
        });

        if (!locationResult.success) {
            return res.status(400).json({
                success: false,
                message: locationResult.warnings.join('. ') || 'Could not process location',
                warnings: locationResult.warnings,
            });
        }

        // Get response time estimate
        const responseEstimate = locationResult.municipalityName
            ? getResponseTimeEstimate(
                locationResult.coordinates.lat,
                locationResult.coordinates.lng,
                locationResult.municipalityName
            )
            : null;

        // Check if within Sibuyan bounds
        const isWithinBounds = isWithinSibuyanBounds(
            locationResult.coordinates.lat,
            locationResult.coordinates.lng
        );

        res.json({
            success: true,
            data: {
                coordinates: locationResult.coordinates,
                address: locationResult.address,
                municipality: {
                    id: locationResult.municipalityId,
                    name: locationResult.municipalityName,
                },
                responseEstimate,
                source: locationResult.source, // 'provided', 'local', 'geocoded', 'reverse_geocoded'
                isWithinSibuyanBounds: isWithinBounds,
                warnings: locationResult.warnings,
            },
            message: `Location processed via ${locationResult.source}. Municipality: ${locationResult.municipalityName || 'Unknown'}`,
        });
    } catch (error) {
        console.error('Geocode location error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to geocode location',
            error: error.message,
        });
    }
};

export default {
    createReport,
    getReports,
    getReportById,
    getMyReports,
    addReportUpdate,
    getHighRiskZones,
    getMapConfig,
    getStats,
    getMunicipalities,
    getCategories,
    geocodeLocation,
};

