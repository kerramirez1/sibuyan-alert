import Report from '../models/Report.js';
import HighRiskZone from '../models/HighRiskZone.js';
import mongoose from 'mongoose';
import { toPublicReport, buildReportEvidenceObject } from '../utils/publicReport.js';
import { canViewOperationalReport, getEntityId } from '../utils/reportAccess.js';
import User from '../models/User.js';
import Municipality from '../models/Municipality.js';
import Notification from '../models/Notification.js';
import { isWithinSibuyanBounds } from '../services/geocoding.js';
import { processLocation, getResponseTimeEstimate } from '../services/locationService.js';
import { describeHazardsAt } from '../services/hazardAreaService.js';
import { parseLocationCapture } from '../utils/locationPolicy.js';
import { sendNewReportAlertEmail } from '../services/emailService.js';
import { sendPushToUsers, pushTemplates } from '../services/pushService.js';
import { deleteGridFsFilesByUrls, uploadFilesToGridFS, findGridFsFile, getGridFsBucket } from '../services/gridFsService.js';
import { generateRedactedEvidenceDerivative } from '../services/evidenceDerivativeService.js';
import { evidenceProcessingQueue } from '../services/evidenceProcessingQueue.js';
import { INCIDENT_CATEGORIES } from '../config/incidentCategories.js';
import { toOptionalCount } from '../utils/casualtyCounts.js';
import {
    findDuplicateCandidates,
    DUPLICATE_RADIUS_METERS,
    DUPLICATE_WINDOW_MINUTES,
} from '../utils/duplicateDetection.js';
import { resolveQueryPolicy } from '../config/queryPolicy.js';
import { sendConditionalJson, buildWeakEtag } from '../utils/httpCache.js';
import { getOrSet } from '../utils/apiCache.js';
import { CACHE_TTLS } from '../config/queryPolicy.js';

const METERS_PER_LATITUDE_DEGREE = 111320;

/**
 * Cheap bounding-box pre-filter in front of the pure matcher. Narrowing on the
 * coordinates index first keeps the duplicate check from turning every report
 * submission into a full collection scan.
 */
const findRecentDuplicateCandidates = async ({ coordinates, municipalityId, incidentTime, incidentType }) => {
    if (!municipalityId || !coordinates) return [];

    const referenceTime = new Date(incidentTime);
    if (Number.isNaN(referenceTime.getTime())) return [];

    const windowMs = DUPLICATE_WINDOW_MINUTES * 60 * 1000;
    const latDelta = DUPLICATE_RADIUS_METERS / METERS_PER_LATITUDE_DEGREE;
    const lngScale = Math.max(
        Math.abs(Math.cos((coordinates.lat * Math.PI) / 180)),
        1e-6
    );
    const lngDelta = DUPLICATE_RADIUS_METERS / (METERS_PER_LATITUDE_DEGREE * lngScale);

    let candidates;
    try {
        candidates = await Report.find({
            municipality: municipalityId,
            status: { $ne: 'rejected' },
            incidentTime: {
                $gte: new Date(referenceTime.getTime() - windowMs),
                $lte: new Date(referenceTime.getTime() + windowMs),
            },
            'coordinates.lat': { $gte: coordinates.lat - latDelta, $lte: coordinates.lat + latDelta },
            'coordinates.lng': { $gte: coordinates.lng - lngDelta, $lte: coordinates.lng + lngDelta },
        })
            .select('_id status incidentType address barangay coordinates incidentTime createdAt')
            .limit(25)
            .lean();
    } catch (error) {
        // Duplicate detection is an assist, never a gate on the emergency path.
        console.warn('Duplicate pre-filter failed, continuing without it:', error?.message);
        return [];
    }

    return findDuplicateCandidates({
        candidates,
        coordinates,
        incidentTime: referenceTime,
        incidentType,
    });
};

/**
 * Shapes one stored evidence entry.
 *
 * Every writer — the submit-time analysis and the evidence preview endpoint —
 * persists through this, so the two cannot drift into disagreeing about the
 * field set they store for the same index.
 */
const buildEvidenceMetadataEntry = (evidenceIndex, derivativeMetadata) => ({
    index: evidenceIndex,
    detectionStatus: derivativeMetadata.detectionStatus,
    redactionType: derivativeMetadata.redactionType,
    facesDetected: derivativeMetadata.facesDetected,
    redactedRegions: derivativeMetadata.redactedRegions,
    redactionVersion: derivativeMetadata.redactionVersion,
    detectorVersion: derivativeMetadata.detectorVersion,
    sourceHash: derivativeMetadata.sourceHash,
    derivativeHash: derivativeMetadata.derivativeHash,
});

/**
 * Recorded when the analysis itself failed.
 *
 * The version is deliberately behind `DERIVATIVE_VERSION` on purpose:
 * `publicReport` only treats an entry as current when its version matches, so
 * an analysis that never completed reads as "processing" instead of claiming a
 * redaction that did not run.
 */
const buildFailedEvidenceMetadataEntry = (evidenceIndex) => ({
    index: evidenceIndex,
    detectionStatus: 'detector_failed',
    redactionType: 'fallback_blur',
    facesDetected: 0,
    redactedRegions: 0,
    redactionVersion: '3.2',
    detectorVersion: 'picojs-facefinder-2.3',
});

/**
 * Analysis options for the submit-time evidence job.
 *
 * `fastMode` is the same single-pass <=800px gate the registration selfie uses.
 * It is the right trade here because the stored entry is only a coarse label on
 * the public projection (`publicReport`) and the image actually served is a
 * whole-frame soft blur — while the full sweep measured ~10s for a plain photo
 * and ~18-24s for a phone photo carrying EXIF rotation.
 *
 * `skipCache` keeps this job out of the derivative cache: its option set is not
 * the one the preview endpoint later asks for, so caching here would occupy a
 * slot nothing reads and evict entries that do get read.
 */
const EVIDENCE_ANALYSIS_OPTIONS = { fastMode: true, skipCache: true };

/**
 * Queues evidence analysis for uploaded photos and persists each result.
 *
 * Runs off the request path by design. Failures stay isolated per photo: one
 * photo that cannot be analysed gets a fallback entry while the rest complete,
 * and a failure never reaches the HTTP response.
 *
 * @returns {number} how many photos were queued
 */
const scheduleEvidenceMetadataProcessing = (reportId, files, { startIndex = 0 } = {}) => {
    if (!reportId || !Array.isArray(files) || files.length === 0) return 0;

    files.forEach((file, offset) => {
        const evidenceIndex = startIndex + offset;

        evidenceProcessingQueue.enqueue(async () => {
            let entry;

            try {
                const derivative = await generateRedactedEvidenceDerivative(
                    file.buffer,
                    EVIDENCE_ANALYSIS_OPTIONS,
                );
                entry = buildEvidenceMetadataEntry(evidenceIndex, derivative.metadata);
            } catch (error) {
                console.warn(`Evidence analysis failed for index ${evidenceIndex}:`, error?.message || error);
                entry = buildFailedEvidenceMetadataEntry(evidenceIndex);
            }

            await persistEvidenceMetadata(reportId, evidenceIndex, entry);
        });
    });

    return files.length;
};

/**
 * Defers `task` until the response has been flushed.
 *
 * The detector blocks the event loop for the length of a scan, so starting the
 * analysis any earlier can hold the 201 on the socket — the exact latency this
 * deferral exists to remove. `finish` means the bytes are written; `close`
 * covers a client that vanished, where the work is still worth doing because
 * the report itself is already persisted.
 */
const runAfterResponse = (res, task) => {
    let started = false;
    const run = () => {
        if (started) return;
        started = true;
        task();
    };

    if (typeof res?.once !== 'function') {
        // No wire to wait for (internal reuse, tests): run at the call site.
        run();
        return;
    }

    res.once('finish', run);
    res.once('close', run);
};

const persistEvidenceMetadata = async (reportId, evidenceIndex, metadata) => {
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
        // Idempotency first, before any geocoding or upload work. A report
        // queued offline and retried after a flaky reconnect must not be filed
        // twice, so a replayed key returns the original report unchanged.
        const clientReportId = typeof req.body.clientReportId === 'string' && req.body.clientReportId.trim()
            ? req.body.clientReportId.trim().slice(0, 100)
            : null;

        if (clientReportId) {
            const replayed = await Report.findOne({ clientReportId })
                .populate('reporter', 'name email avatar')
                .populate('municipality', 'name code');

            if (replayed) {
                return res.status(200).json({
                    success: true,
                    replayed: true,
                    message: 'This report was already submitted.',
                    data: replayed,
                });
            }
        }

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
            locationSource,
            locationAccuracy,
            locationCapturedAt,
        } = req.body;

        // Parse casualties from form data. Omitted fields stay null rather than
        // becoming 0, so "not recorded" is never displayed as "none".
        const casInput = req.body.casualties || {};
        const casualties = {
            injured: toOptionalCount(casInput.injured ?? req.body['casualties[injured]']),
            fatalities: toOptionalCount(casInput.fatalities ?? req.body['casualties[fatalities]']),
            missing: toOptionalCount(casInput.missing ?? req.body['casualties[missing]']),
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
                code: 'MUNICIPALITY_UNASSIGNED',
                message: 'The incident location could not be assigned safely to a municipality. Adjust the map pin or contact an administrator.',
                warnings: locationResult.warnings,
                hint: 'Border/overlapping coverage needs administrator review. Ops: check GET /api/health boundaries.ready and run npm run import:barangay-boundaries --prefix server on a fresh database.',
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



        // ===== DUPLICATE INCIDENT DETECTION =====
        // Runs before any evidence is written to GridFS so a rejected duplicate
        // never costs an upload. The check warns; it never blocks outright —
        // the reporter is the only one who can tell two crashes apart.
        const duplicateCandidates = await findRecentDuplicateCandidates({
            coordinates: locationResult.coordinates,
            municipalityId: locationResult.municipalityId,
            incidentTime: finalIncidentTime,
            incidentType: finalType,
        });
        const confirmDistinct = String(req.body.confirmDistinct ?? '') === 'true';

        if (duplicateCandidates.length > 0 && !confirmDistinct) {
            return res.status(409).json({
                success: false,
                code: 'POSSIBLE_DUPLICATE',
                message: 'A similar incident was already reported nearby. Confirm this is a different incident to submit it.',
                duplicates: duplicateCandidates,
            });
        }

        const reportId = new mongoose.Types.ObjectId();

        if (req.files?.length) {
            const storedImages = await uploadFilesToGridFS(req.files, {
                category: 'report_evidence',
                visibility: 'private',
                ownerId: req.user._id,
                resourceId: reportId,
                municipalityName: locationResult.municipalityName,
            });
            uploadedImageUrls = storedImages.map(({ url }) => url);
            // Only the uploads happen here. Evidence analysis is queued after
            // this response is on the wire — see
            // `scheduleEvidenceMetadataProcessing`.
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
            casualties,
            images: uploadedImageUrls,
            status: 'pending',
            // Store location processing metadata
            locationSource: locationResult.source,
            locationCapture: capture.value,
            responseEstimate: responseEstimate || undefined,
            // Only recorded when the reporter actively overrode a warning.
            possibleDuplicateOf: confirmDistinct && duplicateCandidates.length > 0
                ? duplicateCandidates[0].reportId
                : undefined,
            clientReportId: clientReportId || undefined,
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

            // Reporters never join municipality rooms, so live pending pins
            // would only appear on refetch. Emit a redacted subset to the
            // reporters room mirroring the public projection (no reporter
            // identity, priority, casualties, or response estimate).
            io.to('reporters').emit('newReport', {
                id: report._id,
                title: report.title,
                incidentCategory: finalCategory,
                incidentType: finalType,
                address: report.address,
                barangay: report.barangay,
                municipalityName: locationResult.municipalityName,
                coordinates: report.coordinates,
                status: report.status,
                incidentTime: report.incidentTime,
                severity: report.severity,
                createdAt: report.createdAt,
            });

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
        // MVP: Non-blocking notifications. Never let fan-out delay or fail the 201 response.
        // In-app notifications are dispatched concurrently via Promise.allSettled;
        // email and push notifications are fire-and-forget background tasks.
        const categoryConfig = INCIDENT_CATEGORIES[finalCategory] || { emoji: '🚨', label: finalCategory };

        const operationalUsersQuery = {
            role: { $in: ['municipal_admin', 'responder'] },
            assignedMunicipality: locationResult.municipalityName,
        };

        const dispatchNotifications = async () => {
            try {
                const operationalUsers = await User.find(operationalUsersQuery);
                if (!Array.isArray(operationalUsers) || operationalUsers.length === 0) return;

                await Promise.allSettled(
                    operationalUsers.map(async (opUser) => {
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

                        // Send email notification without blocking
                        if (opUser.role === 'municipal_admin' && opUser.notificationPreferences?.email) {
                            sendNewReportAlertEmail(opUser.email, report, req.user)
                                .catch((emailError) => console.error('Background email failed:', emailError?.message));
                        }
                    })
                );

                // Send push notifications to operational users (admins and responders)
                sendPushToUsers(
                    operationalUsers.filter((a) => a.pushSubscription && a.notificationPreferences?.browserPush),
                    pushTemplates.newReport(report)
                ).catch((pushError) => console.error('Background push failed:', pushError?.message));
            } catch (err) {
                console.error('Background notification dispatch failed:', err?.message);
            }
        };

        dispatchNotifications();

        // Registered before the response is sent so the hook cannot be missed;
        // the task itself runs only once the 201 has been flushed.
        runAfterResponse(res, () => scheduleEvidenceMetadataProcessing(reportId, req.files));

        res.status(201).json({
            success: true,
            message: 'Incident report submitted successfully. It will be visible after verification.',
            data: report,
        });
    } catch (error) {
        if (!report && uploadedImageUrls.length) {
            await deleteGridFsFilesByUrls(uploadedImageUrls);
        }
        // Two retries of the same queued report can race past the pre-check.
        // The unique index is the real guard, so resolve to the winner instead
        // of surfacing a 500 for what is a successful, already-filed report.
        if (error?.code === 11000 && error?.keyPattern?.clientReportId) {
            try {
                const winner = await Report.findOne({ clientReportId: req.body.clientReportId?.trim() })
                    .populate('reporter', 'name email avatar')
                    .populate('municipality', 'name code');

                if (winner) {
                    return res.status(200).json({
                        success: true,
                        replayed: true,
                        message: 'This report was already submitted.',
                        data: winner,
                    });
                }
            } catch (lookupError) {
                console.error('Idempotent replay lookup failed:', lookupError?.message);
            }
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
            since,
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
        // Authenticated members (reporter/responder/municipal_admin) additionally
        // see pending reports with the same redacted public projection, so
        // community members can spot unverified activity on the shared map.
        // Guests and ordinary users keep the publishable-only boundary.
        const publishableStatuses = ['verified', 'transferred', 'responding', 'resolved'];
        const isMemberViewer = Boolean(
            req.user && ['reporter', 'responder', 'municipal_admin'].includes(req.user.role)
        );
        if (status === 'all') {
            query.status = isMemberViewer
                ? { $in: [...publishableStatuses, 'pending'] }
                : { $in: publishableStatuses };
        } else if (status === 'pending') {
            if (!isMemberViewer) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid public report status',
                });
            }
            query.status = 'pending';
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

        // Delta sync. A client that already holds the island's incidents asks
        // only for what changed since its last successful sync, which turns a
        // full re-download into a near-empty response on a quiet night — the
        // single biggest byte saving available to a weak-signal client.
        if (since) {
            const sinceDate = new Date(since);
            if (Number.isNaN(sinceDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid since cursor: expected an ISO 8601 timestamp',
                });
            }
            query.updatedAt = { $gt: sinceDate };
        }

        // Filter by type
        if (type) {
            query.incidentType = type;
        }

        // Filter by municipality
        if (municipality) {
            if (!mongoose.isValidObjectId(municipality)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid municipality id',
                });
            }
            query.municipality = municipality;
        }

        const policy = resolveQueryPolicy();

        // The explicit projection is both the payload-size control and the
        // privacy boundary: it is what keeps internal fields out of a public
        // feed, and what keeps the response small enough to survive a weak link.
        const [reports, total] = await Promise.all([
            Report.find(query)
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
                    'originalMunicipalityName',
                    'coordinates',
                    'incidentTime',
                    'status',
                    'severity',
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
                .maxTimeMS(policy.maxTimeMs)
                .lean(),
            Report.countDocuments(query).maxTimeMS(policy.maxTimeMs),
        ]);

        const payload = {
            success: true,
            data: {
                reports: reports.map((report) => toPublicReport(report, { viewerId: req.user?._id })),
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
                },
                // Delta sync cursor. The client echoes this back as `?since=`
                // to fetch only what changed, instead of re-downloading the
                // whole island every refresh.
                syncCursor: new Date().toISOString(),
                delta: Boolean(since),
            },
        };

        // Public and viewer-scoped (viewerId affects isOwned flags), so the
        // validator must vary per viewer. Private because the body can embed
        // owner-only fields for an authenticated caller.
        sendConditionalJson(req, res, payload, {
            etag: buildWeakEtag('public-reports', JSON.stringify(query), safePage, safeLimit, total, req.user?._id ?? 'anon'),
            maxAgeSeconds: 0,
            private: Boolean(req.user),
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
 * @desc    RBAC-filtered typeahead search over incident reports + high-risk zones (MVP)
 * @route   GET /api/reports/search?q=&limit=
 * @access  Public (published) / Private (owner or in-scope operational user)
 *
 * Facebook-style box, RBAC-enforced at the query — never UI-only:
 * - guests/reporters: publishable statuses + own reports (any status)
 * - municipal_admin/responder with a municipality: + in-scope reports at
 *   operational statuses (covers pending review in their jurisdiction,
 *   including transferred-in/out via originalMunicipalityName)
 * - zones are public island-wide active-only (mirrors GET /api/high-risk-zones),
 *   identical rows for every role
 * - payload is redacted (no reporter identity, contacts, images): the detail
 *   endpoint re-checks RBAC on open.
 */
const SEARCH_PUBLISHABLE_STATUSES = ['verified', 'transferred', 'responding', 'resolved'];
const SEARCH_OPERATIONAL_STATUSES = ['pending', 'verified', 'transferred', 'responding', 'resolved'];
const SEARCH_TEXT_FIELDS = ['title', 'address', 'barangay', 'municipalityName', 'incidentType', 'description'];
// Zones are public, island-wide, and active-only by design (mirrors
// GET /api/high-risk-zones) — no per-role filter needed, same rows for all.
const SEARCH_ZONE_TEXT_FIELDS = ['name', 'description', 'barangay', 'municipality', 'type'];
const SEARCH_ZONE_LIMIT = 8;

const escapeSearchRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchReports = async (req, res) => {
    try {
        const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (rawQuery.length < 2) {
            return res.json({ success: true, data: { results: [], zones: [] } });
        }
        const queryText = rawQuery.slice(0, 100);

        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const safeLimit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 20)
            : 8;

        const pattern = new RegExp(escapeSearchRegex(queryText), 'i');
        const textClause = {
            $or: SEARCH_TEXT_FIELDS.map((field) => ({ [field]: pattern })),
        };

        // Visibility mirrors getReportById: publishable for everyone, plus
        // owner access and in-scope operational access. Members additionally
        // match pending island-wide so the shared map and search agree.
        // Built into the Mongo query so unauthorized rows never leave the server.
        const user = req.user || null;
        const visibilityOr = [{ status: { $in: SEARCH_PUBLISHABLE_STATUSES } }];

        if (user?._id) {
            visibilityOr.push({ reporter: user._id });
        }

        if (user && ['reporter', 'responder', 'municipal_admin'].includes(user.role)) {
            visibilityOr.push({ status: 'pending' });
        }

        const assignedMunicipality = typeof user?.assignedMunicipality === 'string'
            ? user.assignedMunicipality.trim()
            : '';
        if (
            assignedMunicipality
            && ['municipal_admin', 'responder'].includes(user?.role)
        ) {
            visibilityOr.push({
                status: { $in: SEARCH_OPERATIONAL_STATUSES },
                $or: [
                    { municipalityName: assignedMunicipality },
                    { originalMunicipalityName: assignedMunicipality },
                    { 'transferHistory.fromMunicipalityName': assignedMunicipality },
                ],
            });
        }

        const policy = resolveQueryPolicy();

        const [docs, zoneDocs] = await Promise.all([
            Report.find({ $and: [{ $or: visibilityOr }, textClause] })
                .select([
                    '_id',
                    'reporter',
                    'incidentCategory',
                    'incidentType',
                    'title',
                    'address',
                    'barangay',
                    'municipalityName',
                    'status',
                    'severity',
                    'incidentTime',
                    'createdAt',
                ].join(' '))
                .sort({ incidentTime: -1 })
                .limit(safeLimit)
                .maxTimeMS(policy.maxTimeMs)
                .lean(),
            HighRiskZone.find({
                isActive: true,
                $or: SEARCH_ZONE_TEXT_FIELDS.map((field) => ({ [field]: pattern })),
            })
                .select('_id name description type severity municipality barangay coordinates radius createdAt')
                .sort({ createdAt: -1 })
                .limit(SEARCH_ZONE_LIMIT)
                .maxTimeMS(policy.maxTimeMs)
                .lean(),
        ]);

        const viewerId = getEntityId(user);
        const results = docs.map((doc) => ({
            kind: 'report',
            _id: String(doc._id),
            title: doc.title || 'Untitled report',
            incidentType: doc.incidentType || null,
            incidentCategory: doc.incidentCategory || null,
            status: doc.status || null,
            severity: doc.severity || null,
            address: doc.address || null,
            barangay: doc.barangay || null,
            municipalityName: doc.municipalityName || null,
            incidentTime: doc.incidentTime || null,
            createdAt: doc.createdAt || null,
            isOwnedByCurrentUser: Boolean(viewerId && getEntityId(doc.reporter) === viewerId),
        }));
        // Coordinates are public map pins (same as the island-wide zone list),
        // so the client can focus the map without a second round-trip.
        const zones = zoneDocs.map((zone) => ({
            kind: 'zone',
            _id: String(zone._id),
            title: zone.name || 'Unnamed zone',
            type: zone.type || null,
            severity: zone.severity || null,
            description: zone.description || null,
            barangay: zone.barangay || null,
            municipalityName: zone.municipality || null,
            coordinates: zone.coordinates && Number.isFinite(Number(zone.coordinates.lat))
                && Number.isFinite(Number(zone.coordinates.lng))
                ? { lat: Number(zone.coordinates.lat), lng: Number(zone.coordinates.lng) }
                : null,
            radius: Number.isFinite(Number(zone.radius)) ? Number(zone.radius) : null,
            createdAt: zone.createdAt || null,
        }));

        return res.json({ success: true, data: { results, zones } });
    } catch (error) {
        console.error('Search reports error:', error?.message);
        return res.status(500).json({
            success: false,
            message: 'Search is temporarily unavailable',
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
            .populate('reporter', 'name avatar isVerified')
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
        // Pending reports are additionally viewable (public projection) by
        // authenticated members so shared-map pins always open. Rejected
        // reports stay owner-or-operational only.
        const publicViewableStatuses = ['verified', 'transferred', 'responding', 'resolved'];
        const isMemberViewer = Boolean(
            req.user && ['reporter', 'responder', 'municipal_admin'].includes(req.user.role)
        );
        if (!publicViewableStatuses.includes(report.status)) {
            const memberPendingVisible = report.status === 'pending' && isMemberViewer;
            if (!isOwner && !isOperational && !memberPendingVisible) {
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

        // Pending previews open to members with the same gate as the detail
        // endpoint; everyone else still receives the blurred derivative only
        // for publishable reports. The bytes are always the blurred derivative.
        const isMemberViewer = Boolean(
            req.user && ['reporter', 'responder', 'municipal_admin'].includes(req.user.role)
        );
        if (!publicViewableStatuses.includes(report.status) && !isOwner && !isOperational) {
            if (!(report.status === 'pending' && isMemberViewer)) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view evidence for this incident',
                });
            }
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
        if (file.length != null && file.length > 15 * 1024 * 1024) {
            return res.status(413).json({ success: false, message: 'Evidence file too large to preview' });
        }
        const downloadStream = getGridFsBucket().openDownloadStream(file._id);
        const chunks = [];
        let bufferedBytes = 0;
        const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;
        try {
            for await (const chunk of downloadStream) {
                bufferedBytes += chunk?.length || 0;
                if (bufferedBytes > MAX_PREVIEW_BYTES) {
                    throw new Error('Evidence file exceeds streaming safety limit');
                }
                chunks.push(chunk);
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

        await persistEvidenceMetadata(
            report._id,
            evidenceIndex,
            buildEvidenceMetadataEntry(evidenceIndex, derivative.metadata),
        );

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

        const isOwner = report.reporter?._id?.toString() === req.user?._id?.toString();
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
        if (municipality) {
            if (!mongoose.isValidObjectId(municipality)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid municipality id',
                });
            }
            matchQuery.municipality = municipality;
        }
        if (municipalityName) matchQuery.municipalityName = municipalityName;

        // This endpoint is public and unauthenticated, and it runs five passes
        // over the reports collection (two aggregations, two counts, one find).
        // Anyone can trigger it repeatedly, so the result is cached behind a
        // short TTL and deduplicated while cold. Socket events invalidate it
        // eagerly on every report mutation, so the TTL is only a backstop.
        const cacheKey = `stats:${matchQuery.incidentCategory || '*'}:${matchQuery.municipality || '*'}:${matchQuery.municipalityName || '*'}`;
        const policy = resolveQueryPolicy();

        const stats = await getOrSet(cacheKey, CACHE_TTLS.publicStats, async () => {
            const [
                totalReports,
                recentCount,
                recentReports,
                byType,
                byMunicipality,
            ] = await Promise.all([
                Report.countDocuments(matchQuery).maxTimeMS(policy.maxTimeMs),
                Report.countDocuments({ ...matchQuery, createdAt: { $gte: thirtyDaysAgo } }).maxTimeMS(policy.maxTimeMs),
                Report.find(matchQuery)
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .maxTimeMS(policy.maxTimeMs)
                    .populate('reporter', 'name')
                    .populate('municipality', 'name'),
                Report.aggregate([
                    { $match: matchQuery },
                    { $group: { _id: '$incidentType', count: { $sum: 1 } } },
                ]).option({ maxTimeMS: policy.maxTimeMs }),
                Report.aggregate([
                    { $match: matchQuery },
                    // Event-based: group where the incident happened (origin),
                    // not which office currently handles it after a transfer.
                    { $group: { _id: { $ifNull: ['$originalMunicipalityName', '$municipalityName'] }, count: { $sum: 1 } } },
                ]).option({ maxTimeMS: policy.maxTimeMs }),
            ]);

            return {
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
            };
        });

        sendConditionalJson(req, res, { success: true, data: stats }, {
            etag: buildWeakEtag('stats', cacheKey, stats.totalReports, stats.reportsLast30Days),
            maxAgeSeconds: Math.floor(CACHE_TTLS.publicStats / 1000),
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

        // Hazard susceptibility for the resolved point, from every imported
        // NOAH dataset. Folded into this response on purpose: whoever is placing
        // a pin already has to wait for this call, so the hazards come back in
        // the same round-trip instead of costing a second one. Never rejects — a
        // lookup failure reports `available: false` rather than being flattened
        // into "no hazard here", which would be a dangerous thing to imply.
        const hazards = isWithinBounds
            ? await describeHazardsAt(
                locationResult.coordinates.lat,
                locationResult.coordinates.lng
            )
            : { available: false, reason: 'outside_sibuyan_bounds', results: [] };

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
                hazards,
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

/**
 * @desc    Record a lightweight report view (archive dossier expands)
 * @route   POST /api/reports/:id/views
 * @access  Public (optional auth — owner self-views are excluded)
 */
export const recordReportView = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_REPORT_ID',
                message: 'Invalid incident report identifier',
            });
        }

        const report = await Report.findById(req.params.id).select('reporter viewCount');
        if (!report) {
            return res.status(404).json({
                success: false,
                code: 'REPORT_NOT_FOUND',
                message: 'Report not found',
            });
        }

        // Owner self-views don't measure reach — skip silently but honestly.
        const reporterId = getEntityId(report.reporter);
        const currentUserId = getEntityId(req.user);
        if (currentUserId && reporterId && currentUserId === reporterId) {
            return res.json({ success: true, data: { viewCount: report.viewCount || 0, counted: false } });
        }

        await Report.updateOne({ _id: report._id }, { $inc: { viewCount: 1 } });
        return res.json({ success: true, data: { viewCount: (report.viewCount || 0) + 1, counted: true } });
    } catch (error) {
        console.error('Record report view error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record report view',
        });
    }
};

/**
 * @desc    Attach evidence photos to an existing incident report
 * @route   POST /api/reports/:id/evidence
 * @access  Private (report owner, responders, or municipal admins)
 */
export const attachReportEvidence = async (req, res) => {
    let uploadedImageUrls = [];
    let isSaved = false;
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_REPORT_ID',
                message: 'Invalid incident report identifier',
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                code: 'NO_FILES_PROVIDED',
                message: 'No evidence photos provided',
            });
        }

        const report = await Report.findById(id);
        if (!report) {
            return res.status(404).json({
                success: false,
                code: 'REPORT_NOT_FOUND',
                message: 'Incident report not found',
            });
        }

        // Authorization check: owner, system admin, or in-scope operational user (jurisdiction checked)
        const reporterId = getEntityId(report.reporter);
        const currentUserId = getEntityId(req.user);
        const isOwner = Boolean(currentUserId && reporterId && currentUserId === reporterId);
        const isOperational = Boolean(
            req.user && (req.user.role === 'admin' || canViewOperationalReport(req.user, report))
        );

        if (!isOwner && !isOperational) {
            return res.status(403).json({
                success: false,
                code: 'FORBIDDEN',
                message: 'Not authorized to attach evidence to this incident report',
            });
        }

        if (['resolved', 'rejected'].includes(report.status)) {
            return res.status(400).json({
                success: false,
                code: 'REPORT_CLOSED',
                message: 'Cannot attach evidence to a closed or rejected report',
            });
        }

        const existingCount = Array.isArray(report.images) ? report.images.length : 0;
        const newCount = req.files.length;
        if (existingCount + newCount > 5) {
            return res.status(400).json({
                success: false,
                code: 'EXCEEDS_IMAGE_LIMIT',
                message: `Exceeds maximum limit of 5 evidence photos per report. This report currently has ${existingCount} photo(s).`,
            });
        }

        // Store new evidence photos in GridFS
        const storedImages = await uploadFilesToGridFS(req.files, {
            category: 'report_evidence',
            visibility: 'private',
            ownerId: req.user._id,
            resourceId: report._id,
            municipalityName: report.municipalityName,
        });
        uploadedImageUrls = storedImages.map(({ url }) => url);

        report.images = [...(report.images || []), ...uploadedImageUrls];

        await report.save();
        isSaved = true;

        // Deferred for the same reason as report creation: attaching a photo
        // should not wait on image processing. Photos already on the report keep
        // their own indices, so the new entries start where they left off.
        runAfterResponse(res, () => scheduleEvidenceMetadataProcessing(report._id, req.files, {
            startIndex: existingCount,
        }));

        try {
            await report.populate('reporter', 'name email avatar');
            await report.populate('municipality', 'name code');
        } catch (popErr) {
            console.warn('Report populate warning after evidence attach:', popErr?.message);
        }

        try {
            const io = req.app.get('io');
            if (io) {
                const evidencePayload = {
                    reportId: report._id,
                    evidenceCount: report.images.length,
                    municipality: report.municipalityName,
                };
                if (report.municipalityName) {
                    io.to(`municipality_${report.municipalityName}`).emit('reportEvidenceUpdated', evidencePayload);
                }
                io.to('reporters').emit('reportEvidenceUpdated', evidencePayload);
            }
        } catch (socketErr) {
            console.warn('Socket emit warning after evidence attach:', socketErr?.message);
        }

        res.status(200).json({
            success: true,
            message: 'Evidence photos attached successfully.',
            data: report,
        });
    } catch (error) {
        if (!isSaved && uploadedImageUrls.length) {
            await deleteGridFsFilesByUrls(uploadedImageUrls).catch((delErr) => {
                console.error('GridFS cleanup error after evidence attach failure:', delErr);
            });
        }
        console.error('Attach report evidence error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to attach evidence photos to incident report',
        });
    }
};

export default {
    createReport,
    attachReportEvidence,
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
    getReportEvidencePreview,
    recordReportView,
    searchReports,
};
