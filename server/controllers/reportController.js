import Report from '../models/Report.js';
import mongoose from 'mongoose';
import { toPublicReport, buildReportEvidenceObject } from '../utils/publicReport.js';
import { canViewOperationalReport, getEntityId } from '../utils/reportAccess.js';
import User from '../models/User.js';
import Municipality from '../models/Municipality.js';
import Notification from '../models/Notification.js';
import { isWithinSibuyanBounds } from '../services/geocoding.js';
import { processLocation, getResponseTimeEstimate } from '../services/locationService.js';
import { parseLocationCapture } from '../utils/locationPolicy.js';
import { sendNewReportAlertEmail } from '../services/emailService.js';
import { sendPushToUsers, pushTemplates } from '../services/pushService.js';
import { deleteGridFsFilesByUrls, uploadFilesToGridFS, findGridFsFile, getGridFsBucket } from '../services/gridFsService.js';
import { generateRedactedEvidenceDerivative } from '../services/evidenceDerivativeService.js';
import { INCIDENT_CATEGORIES } from '../config/incidentCategories.js';

const toValidatedCount = (value) => Number(value ?? 0);

const persistEvidenceMetadata = async (reportId, evidenceIndex, derivativeMetadata) => {
    const metadata = {
        index: evidenceIndex,
        detectionStatus: derivativeMetadata.detectionStatus,
        redactionType: derivativeMetadata.redactionType,
        facesDetected: derivativeMetadata.facesDetected,
        redactedRegions: derivativeMetadata.redactedRegions,
        redactionVersion: derivativeMetadata.redactionVersion,
        detectorVersion: derivativeMetadata.detectorVersion,
        sourceHash: derivativeMetadata.sourceHash,
        derivativeHash: derivativeMetadata.derivativeHash,
    };

    // Replace every entry for this exact index in one atomic update. This
    // prevents duplicate metadata rows when two preview requests race while
    // also replacing stale detector/redaction versions.
    await Report.updateOne(
        { _id: reportId },
        [{
            $set: {
                evidenceMetadata: {
                    $concatArrays: [
                        {
                            $filter: {
                                input: { $ifNull: ['$evidenceMetadata', []] },
                                as: 'entry',
                                cond: { $ne: ['$$entry.index', evidenceIndex] },
                            },
                        },
                        [metadata],
                    ],
                },
            },
        }],
    );
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
            fireInvolved,
            fireType,
            lat,
            lng,
            locationSource,
            locationAccuracy,
            locationCapturedAt,
        } = req.body;

        // Parse casualties and affected area from form data
        const casInput = req.body.casualties || {};
        const casualties = {
            injured: toValidatedCount(casInput.injured ?? req.body['casualties[injured]']),
            fatalities: toValidatedCount(casInput.fatalities ?? req.body['casualties[fatalities]']),
            missing: toValidatedCount(casInput.missing ?? req.body['casualties[missing]']),
        };

        const areaInput = req.body.affectedArea || {};
        const affectedArea = {
            householdsAffected: toValidatedCount(areaInput.householdsAffected ?? req.body['affectedArea[householdsAffected]']),
            evacuees: toValidatedCount(areaInput.evacuees ?? req.body['affectedArea[evacuees]']),
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
            lat: lat !== undefined && lat !== '' ? Number(lat) : undefined,
            lng: lng !== undefined && lng !== '' ? Number(lng) : undefined,
        });

        const capture = parseLocationCapture({ locationSource, locationAccuracy, locationCapturedAt });
        if (!capture.valid) {
            return res.status(400).json({ success: false, message: capture.message });
        }

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

        if (locationResult.municipalityAssignment !== 'matched') {
            return res.status(400).json({
                success: false,
                message: 'The incident location could not be assigned safely to a municipality. Adjust the map pin or contact an administrator.',
                warnings: locationResult.warnings,
            });
        }

        // Get response time estimate
        const responseEstimate = locationResult.municipalityName
            ? getResponseTimeEstimate(
                locationResult.coordinates.lat,
                locationResult.coordinates.lng,
                locationResult.municipality
            )
            : null;



        const reportId = new mongoose.Types.ObjectId();

        let evidenceMetadata = [];
        if (req.files?.length) {
            const storedImages = await uploadFilesToGridFS(req.files, {
                category: 'report_evidence',
                visibility: 'private',
                ownerId: req.user._id,
                resourceId: reportId,
                municipalityName: locationResult.municipalityName,
            });
            uploadedImageUrls = storedImages.map(({ url }) => url);

            // Precompute evidence derivative metadata for accurate public descriptor serialization
            try {
                evidenceMetadata = await Promise.all(
                    req.files.map(async (file, idx) => {
                        try {
                            const derivative = await generateRedactedEvidenceDerivative(file.buffer);
                            return {
                                index: idx,
                                detectionStatus: derivative.metadata.detectionStatus,
                                redactionType: derivative.metadata.redactionType,
                                facesDetected: derivative.metadata.facesDetected,
                                redactedRegions: derivative.metadata.redactedRegions,
                                redactionVersion: derivative.metadata.redactionVersion,
                                detectorVersion: derivative.metadata.detectorVersion,
                                sourceHash: derivative.metadata.sourceHash,
                                derivativeHash: derivative.metadata.derivativeHash,
                            };
                        } catch {
                            return {
                                index: idx,
                                detectionStatus: 'detector_failed',
                                redactionType: 'fallback_blur',
                                facesDetected: 0,
                                redactedRegions: 0,
                                redactionVersion: '3.2',
                                detectorVersion: 'picojs-facefinder-2.3',
                            };
                        }
                    })
                );
            } catch (err) {
                console.warn('Could not precompute evidence metadata:', err.message);
            }
        }

        // Create the report with processed location data
        report = await Report.create({
            _id: reportId,
            reporter: req.user._id,
            incidentCategory: finalCategory,
            incidentType: finalType,
            description,
            address: locationResult.address,
            // A polygon match always wins over a reverse-geocoder or typed suggestion.
            barangay: locationResult.barangay || barangay || null,
            barangayPsgcCode: locationResult.barangayPsgcCode || undefined,
            locationConfidence: locationResult.barangayAssignment === 'matched'
                ? 'boundary_matched'
                : barangay ? 'manual_confirmed' : 'geocoder_suggested',
            coordinates: locationResult.coordinates,
            municipality: locationResult.municipalityId,
            municipalityName: locationResult.municipalityName,
            incidentTime: new Date(finalIncidentTime),
            accidentTime: new Date(finalIncidentTime), // Legacy compatibility
            accidentType: finalType, // Legacy compatibility
            severity: severity || 'moderate',
            fireInvolved: fireInvolved === 'true' || fireInvolved === true,
            fireType: (fireInvolved === 'true' || fireInvolved === true) ? fireType : null,
            casualties,
            affectedArea,
            images: uploadedImageUrls,
            evidenceMetadata,
            status: 'pending',
            // Store location processing metadata
            locationSource: locationResult.source,
            locationCapture: capture.value,
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

            if (locationResult.municipalityName) {
                io.to(`municipality_${locationResult.municipalityName}`).emit('newReport', newReportPayload);
            }

            // Notify municipality-specific responder room using municipality NAME
            // (frontend joins rooms as `municipality_${user.assignedMunicipality}`)
            if (locationResult.municipalityName) {
                const municipalityRoom = `municipality_${locationResult.municipalityName}`;
                const responderRoom = `municipality_${locationResult.municipalityName}_responders`;

                // Alert responders in this municipality about the new report
                io.to(responderRoom).emit('newReportAlert', {
                    id: report._id,
                    title: report.title,
                    description: report.description,
                    category: finalCategory,
                    incidentCategory: finalCategory,
                    incidentType: finalType,
                    address: report.address,
                    barangay: report.barangay,
                    municipalityName: locationResult.municipalityName,
                    severity: report.severity,
                    priority: report.priority,
                    casualties: report.casualties,
                    status: 'pending',
                    coordinates: report.coordinates,
                    incidentTime: report.incidentTime,
                    createdAt: report.createdAt,
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

        // Notify the responsible municipal administrators and emergency responders.
        // MVP: never let fan-out delay or fail the 201. In-app notifies are
        // isolated per recipient; email + push are fire-and-forget background.
        const categoryConfig = INCIDENT_CATEGORIES[finalCategory] || { emoji: '🚨', label: finalCategory };

        const operationalUsersQuery = {
            role: { $in: ['municipal_admin', 'responder'] },
            assignedMunicipality: locationResult.municipalityName,
        };

        const operationalUsers = await User.find(operationalUsersQuery);

        // Create in-app notifications for each municipal administrator and responder.
        for (const opUser of operationalUsers) {
            try {
                await Notification.createAndSend(
                    {
                        recipient: opUser._id,
                        type: 'new_report',
                        title: `${categoryConfig.emoji} New ${categoryConfig.label} Report`,
                        message: `New ${categoryConfig.label.toLowerCase()} reported at ${report.address}${locationResult.municipalityName ? ` (${locationResult.municipalityName})` : ''}`,
                        data: { reportId: report._id, category: finalCategory, municipality: locationResult.municipalityName },
                    },
                    io
                );
            } catch (notifyError) {
                console.error('Background in-app notify failed:', notifyError?.message);
            }

            // Send email notification without blocking the HTTP response.
            if (opUser.role === 'municipal_admin' && opUser.notificationPreferences?.email) {
                sendNewReportAlertEmail(opUser.email, report, req.user)
                    .catch((emailError) => console.error('Background email failed:', emailError?.message));
            }
        }

        // Send push notifications to operational users (admins and responders)
        sendPushToUsers(
            operationalUsers.filter((a) => a.pushSubscription && a.notificationPreferences?.browserPush),
            pushTemplates.newReport(report)
        ).catch((pushError) => console.error('Background push failed:', pushError?.message));

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

        const parsedPage = Number.parseInt(page, 10);
        const parsedLimit = Number.parseInt(limit, 10);
        const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
        const safeLimit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 50;

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
            .select([
                '_id',
                'reporter',
                'incidentCategory',
                'incidentType',
                'title',
                'description',
                'address',
                'barangay',
                'municipality',
                'municipalityName',
                'coordinates',
                'incidentTime',
                'status',
                'severity',
                'fireInvolved',
                'casualties',
                'responders.unitType',
                'responderAgency',
                'images',
                'evidenceMetadata',
                'verifiedAt',
                'respondedAt',
                'resolvedAt',
                'createdAt',
                'updatedAt',
            ].join(' '))
            .populate('municipality', 'name code')
            .sort({ incidentTime: -1 })
            .limit(safeLimit)
            .skip((safePage - 1) * safeLimit)
            .lean();

        const total = await Report.countDocuments(query);

        res.json({
            success: true,
            data: {
                reports: reports.map((report) => toPublicReport(report, { viewerId: req.user?._id })),
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
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
 * @access  Public (published) / Private (owner or in-scope municipal administrator/responder)
 */
export const getReportById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_REPORT_ID',
                message: 'Invalid incident report identifier',
            });
        }

        const report = await Report.findById(req.params.id)
            .populate('reporter', 'name avatar')
            .populate('verifiedBy', 'name')
            .populate('reportUpdates.author', 'name role agency')
            .populate('municipality', 'name code emergencyContacts responseCapabilities');

        if (!report) {
            return res.status(404).json({
                success: false,
                code: 'REPORT_NOT_FOUND',
                message: 'Report not found',
            });
        }

        const reporterId = getEntityId(report.reporter);
        const currentUserId = getEntityId(req.user);
        const isOwner = Boolean(
            currentUserId && reporterId && currentUserId === reporterId
        );
        const isOperational = Boolean(
            req.user && canViewOperationalReport(req.user, report)
        );

        // Match the public list visibility rules for individual report access.
        const publicViewableStatuses = ['verified', 'transferred', 'responding', 'resolved'];
        if (!publicViewableStatuses.includes(report.status)) {
            if (!isOwner && !isOperational) {
                return res.status(403).json({
                    success: false,
                    code: 'REPORT_RESTRICTED',
                    message: 'Not authorized to view this report',
                });
            }
        }

        // Increment view count atomically without triggering full-document validation
        Report.updateOne({ _id: report._id }, { $inc: { viewCount: 1 } }).catch((viewErr) => {
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`[getReportById] Failed to increment viewCount for report ${report._id}:`, viewErr?.message);
            }
        });

        let responseData;
        if (isOwner || isOperational) {
            const reportObj = report.toObject();
            const evidence = buildReportEvidenceObject(reportObj, { isOwner, isOperational });
            responseData = {
                ...reportObj,
                viewCount: (reportObj.viewCount || 0) + 1,
                isOwnedByCurrentUser: isOwner,
                evidence,
                evidenceCount: evidence.count,
                detailAccess: isOperational ? 'operational' : 'owner',
                detailCompleteness: 'full',
            };
        } else {
            const publicReport = toPublicReport(report, { viewerId: req.user?._id });
            responseData = {
                ...publicReport,
                viewCount: (report.viewCount || 0) + 1,
                detailAccess: 'public',
                detailCompleteness: 'full',
            };
        }

        return res.json({
            success: true,
            data: responseData,
        });
    } catch (error) {
        console.error('Get report error:', {
            reportId: String(req.params.id || ''),
            status: error?.status,
            name: error?.name,
            message: error?.message,
        });
        return res.status(500).json({
            success: false,
            code: 'REPORT_DETAILS_UNAVAILABLE',
            message: 'Failed to get report',
        });
    }
};

/**
 * @desc    Get server-generated blurred preview for a specific incident evidence photo
 * @route   GET /api/reports/:id/evidence/:index/preview
 * @access  Public (published reports) / Private (owner or in-scope operational user for unverified)
 */
export const getReportEvidencePreview = async (req, res) => {
    try {
        const { id, index } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const evidenceIndex = Number.parseInt(index, 10);
        if (!Number.isFinite(evidenceIndex) || evidenceIndex < 0) {
            return res.status(400).json({ success: false, message: 'Invalid evidence index' });
        }

        const report = await Report.findById(id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        // Authorization check
        const reporterId = getEntityId(report.reporter);
        const currentUserId = getEntityId(req.user);
        const isOwner = Boolean(
            currentUserId && reporterId && currentUserId === reporterId
        );
        const isOperational = Boolean(
            req.user && canViewOperationalReport(req.user, report)
        );
        const publicViewableStatuses = ['verified', 'transferred', 'responding', 'resolved'];

        if (!publicViewableStatuses.includes(report.status) && !isOwner && !isOperational) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view evidence for this incident',
            });
        }

        const rawImages = Array.isArray(report.images) ? report.images : [];
        if (evidenceIndex >= rawImages.length) {
            return res.status(404).json({ success: false, message: 'Evidence not found' });
        }

        const imageRef = rawImages[evidenceIndex];
        const match = typeof imageRef === 'string' && imageRef.match(/[0-9a-fA-F]{24}/);
        const fileId = match ? match[0] : null;

        if (!fileId) {
            return res.status(404).json({ success: false, message: 'Evidence file not found' });
        }

        const file = await findGridFsFile(fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: 'Evidence file not found' });
        }

        // Verify resource association
        if (file.metadata?.resourceId && file.metadata.resourceId.toString() !== report._id.toString()) {
            return res.status(403).json({ success: false, message: 'Evidence integrity violation' });
        }

        // Stream file from GridFS to buffer
        const downloadStream = getGridFsBucket().openDownloadStream(file._id);
        const chunks = [];
        try {
            for await (const chunk of downloadStream) {
                chunks.push(chunk);
                if (chunks.length > 512) {
                    throw new Error('Evidence file exceeds streaming safety limit');
                }
            }
        } catch (streamError) {
            try {
                downloadStream.destroy(streamError);
            } catch {
                // Stream already closed; fall through to the outer handler.
            }
            throw streamError;
        }
        const fileBuffer = Buffer.concat(chunks);
        const derivative = await generateRedactedEvidenceDerivative(fileBuffer, { publicSoftBlur: true });

        const sourceHash = derivative.metadata.sourceHash || 'unknown-source';
        const derivativeHash = derivative.metadata.derivativeHash || 'unknown-derivative';
        const redactionVersion = derivative.metadata.redactionVersion || '3.4';
        const detectorVersion = derivative.metadata.detectorVersion || 'unknown-detector';
        const detectionStatus = derivative.metadata.detectionStatus || 'processing';
        const redactionType = derivative.metadata.redactionType || 'privacy_preview';
        const cacheHit = Boolean(derivative.metadata.cacheHit);
        const etag = `W/"evidence-preview-${report._id}-${evidenceIndex}-${sourceHash.slice(0, 16)}-${derivativeHash.slice(0, 16)}-${redactionVersion}-${detectorVersion}-${detectionStatus}-${redactionType}"`;
        res.set({
            'Content-Type': derivative.contentType || 'image/jpeg',
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
            'Pragma': 'no-cache',
            'Vary': 'Cookie',
            'X-Content-Type-Options': 'nosniff',
            'X-Evidence-Variant': 'redacted',
            'X-Evidence-Detection-Status': detectionStatus,
            'X-Evidence-Redaction-Type': redactionType,
            'X-Evidence-Redaction-Version': redactionVersion,
            'X-Evidence-Detector-Version': detectorVersion,
            'X-Evidence-Redacted-Regions': String(derivative.metadata.redactedRegions || 0),
            'X-Evidence-Cache': cacheHit ? 'hit' : 'miss',
            ETag: etag,
        });

        if (process.env.NODE_ENV === 'development') {
            console.debug('[EvidencePreviewAudit]', JSON.stringify({
                reportId: String(report._id),
                evidenceIndex,
                sourceHash,
                derivativeHash,
                detectorVersion,
                detectionStatus,
                facesDetected: derivative.metadata.facesDetected || 0,
                redactionRegions: derivative.metadata.redactionDiagnostics || [],
                redactionVersion,
                etag,
                cache: cacheHit ? 'hit' : 'miss',
                finalPreviewEndpoint: req.originalUrl,
            }));
        }

        await persistEvidenceMetadata(report._id, evidenceIndex, derivative.metadata);

        const ifNoneMatch = String(req.headers['if-none-match'] || '')
            .split(',')
            .map((value) => value.trim());
        if (ifNoneMatch.includes('*') || ifNoneMatch.includes(etag)) {
            return res.status(304).end();
        }

        res.send(derivative.buffer);

    } catch (error) {
        console.error('Evidence preview error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to generate evidence preview' });
        }
    }
};

/**
 * @desc    Get my submitted reports
 * @route   GET /api/reports/my-reports
 * @access  Private
 */
export const getMyReports = async (req, res) => {
    try {
        // Hardened query: bounded page size + lean documents so this endpoint
        // stays fast as a citizen's report history grows.
        const safeLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
        const safePage = Math.max(parseInt(req.query.page, 10) || 1, 1);

        const [reports, total] = await Promise.all([
            Report.find({ reporter: req.user._id })
                .populate('municipality', 'name code')
                .populate('respondedBy', 'name agency assignedMunicipality')
                .populate('resolvedBy', 'name agency assignedMunicipality')
                .populate('reportUpdates.author', 'name role agency')
                .sort({ createdAt: -1 })
                .limit(safeLimit)
                .skip((safePage - 1) * safeLimit)
                .lean(),
            Report.countDocuments({ reporter: req.user._id }),
        ]);

        const serialized = reports.map((report) => {
            const reportObj = typeof report.toObject === 'function' ? report.toObject() : report;
            const evidence = buildReportEvidenceObject(reportObj, { isOwner: true });
            return {
                ...reportObj,
                isOwnedByCurrentUser: true,
                evidence,
                evidenceCount: evidence.evidenceCount,
                detailAccess: 'owner',
                detailCompleteness: 'full',
            };
        });

        res.json({
            success: true,
            data: serialized,
            pagination: {
                page: safePage,
                limit: safeLimit,
                total,
                hasMore: safePage * safeLimit < total,
            },
        });
    } catch (error) {
        console.error('Get my reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get your reports',
        });
    }
};


const REPORT_UPDATE_NOTIFICATION_TITLES = {
    general: 'Situation update received',
    transported: 'Patient transport update',
    stabilized: 'Patient condition update',
    need_help: 'Urgent help requested',
    false_alarm: 'Possible false alarm reported',
    other: 'Reporter update received',
};

/**
 * @desc    Add a reporter update to an existing report
 * @route   POST /api/reports/:id/updates
 * @access  Private (report owner)
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
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this report',
            });
        }

        if (['resolved', 'rejected'].includes(report.status)) {
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

            // Municipality responders and administrator viewers.
            if (report.municipalityName) {
                io.to(`municipality_${report.municipalityName}`).emit('reportUpdatedByReporter', payload);
                io.to(`municipality_${report.municipalityName}_responders`).emit('reportUpdatedByReporter', payload);
            }
        }

        // Notify municipality-scoped administrators and responders.
        const recipientsQuery = {
            role: { $in: ['municipal_admin', 'responder'] },
            assignedMunicipality: report.municipalityName,
        };

        const recipients = await User.find(recipientsQuery).select('_id');
        const updatePreview = normalizedMessage.slice(0, 160);
        await Promise.all(recipients
            .filter((recipient) => recipient._id.toString() !== req.user._id.toString())
            .map((recipient) => Notification.createAndSend(
                {
                    recipient: recipient._id,
                    type: 'report_update',
                    title: REPORT_UPDATE_NOTIFICATION_TITLES[normalizedTag] || REPORT_UPDATE_NOTIFICATION_TITLES.other,
                    message: `${req.user.name || 'Reporter'}: ${updatePreview}`,
                    data: {
                        reportId: report._id,
                        updateId: latestUpdate._id,
                        tag: normalizedTag,
                        municipality: report.municipalityName || null,
                        reporterName: req.user.name || 'Reporter',
                        address: report.address || null,
                        updatePreview,
                        reportStatus: report.status,
                        updateCreatedAt: latestUpdate.createdAt,
                    },
                },
                io
            )));

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
 * 2. Determines a safe municipality assignment for response
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
            lat: lat !== undefined && lat !== '' ? Number(lat) : undefined,
            lng: lng !== undefined && lng !== '' ? Number(lng) : undefined,
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
                locationResult.municipality
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
                displayAddress: locationResult.address,
                providerAddress: locationResult.providerAddress,
                addressDetails: locationResult.addressDetails,
                barangay: locationResult.barangay
                    ? { name: locationResult.barangay, psgcCode: locationResult.barangayPsgcCode }
                    : null,
                barangayAssignment: locationResult.barangayAssignment,
                municipality: {
                    id: locationResult.municipalityId,
                    name: locationResult.municipalityName,
                },
                responseEstimate,
                source: locationResult.source,
                municipalityAssignment: locationResult.municipalityAssignment,
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
