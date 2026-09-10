import express from 'express';
import HighRiskZone from '../models/HighRiskZone.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { sortHighRiskZonesBySeverity } from '../utils/highRiskZones.js';
import { resolveRiskZoneJurisdiction } from '../services/riskZoneJurisdictionService.js';
import { validateMongoIdParam } from '../middleware/validate.js';
import {
    uploadRiskZonePhotos,
    handleMulterError,
    validateUploadContent,
} from '../middleware/upload.js';
import {
    uploadFilesToGridFS,
    deleteGridFsFilesByUrls,
} from '../services/gridFsService.js';
import { getOrSet, invalidate } from '../utils/apiCache.js';
import { CACHE_TTLS, resolveQueryPolicy } from '../config/queryPolicy.js';
import { sendConditionalJson, buildWeakEtag } from '../utils/httpCache.js';

const router = express.Router();

// Cache key prefix for the island-wide zone list. Every zone mutation below
// invalidates this prefix so the map never shows a stale hazard.
const ZONE_CACHE_KEY = 'zones:island-wide';

// Hard ceiling on the public zone list. Hazard zones are a curated set (an
// admin places each one by hand), so this is far above any realistic count —
// it exists so the endpoint can never return an unbounded collection.
const MAX_ZONE_RESULTS = 500;

const parseCoordinates = (body) => {
    let coordinates = body?.coordinates;
    if (typeof coordinates === 'string') {
        try {
            coordinates = JSON.parse(coordinates);
        } catch {
            coordinates = null;
        }
    }
    if (!coordinates && (body?.['coordinates[lat]'] || body?.['coordinates.lat'] || body?.lat)) {
        coordinates = {
            lat: body['coordinates[lat]'] || body['coordinates.lat'] || body.lat,
            lng: body['coordinates[lng]'] || body['coordinates.lng'] || body.lng,
        };
    }
    return coordinates;
};

/**
 * @route   GET /api/high-risk-zones
 * @desc    Get all active high-risk zones (public)
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        // Public/authenticated visibility is island-wide by design. Municipality
        // restrictions are enforced only by the protected mutation routes below.
        const policy = resolveQueryPolicy();

        // Hazard zones change rarely and are read on every map load, which made
        // them a poor fit for a query-per-request. Cached behind a TTL and
        // deduplicated while cold; every mutation below invalidates it.
        const zones = await getOrSet(ZONE_CACHE_KEY, CACHE_TTLS.hazardZones, async () => {
            const results = await HighRiskZone.find({ isActive: true })
                .populate('createdBy', 'name')
                .sort({ createdAt: -1 })
                .limit(MAX_ZONE_RESULTS)
                .maxTimeMS(policy.maxTimeMs)
                .lean();

            // Sorting happens once, server-side, on the cached array — the
            // client no longer re-sorts the full list on every render.
            return sortHighRiskZonesBySeverity(results);
        });

        sendConditionalJson(req, res, { success: true, data: zones }, {
            etag: buildWeakEtag('zones', zones.length, zones[0]?.updatedAt ?? '', zones[zones.length - 1]?.updatedAt ?? ''),
            maxAgeSeconds: Math.floor(CACHE_TTLS.hazardZones / 1000),
        });
    } catch (error) {
        console.error('Get high-risk zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get high-risk zones',
        });
    }
});

/**
 * @route   POST /api/high-risk-zones
 * @desc    Create a new high-risk zone with optional reference photos
 * @access  Private (municipal_admin only)
 */
router.post(
    '/',
    protect,
    requireRole('municipal_admin'),
    uploadRiskZonePhotos,
    handleMulterError,
    validateUploadContent,
    async (req, res) => {
        let uploadedPhotos = [];

        try {
            const { name, description, type, radius, severity, municipality } = req.body;
            const coordinates = parseCoordinates(req.body);
            const admin = req.user;

            if (!admin.assignedMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'Municipality is not assigned to this administrator',
                });
            }

            if (municipality && municipality !== admin.assignedMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only create zones in your assigned municipality',
                });
            }

            const jurisdiction = await resolveRiskZoneJurisdiction(
                coordinates,
                admin.assignedMunicipality
            );
            if (!jurisdiction.valid) {
                return res.status(jurisdiction.statusCode).json({
                    success: false,
                    message: jurisdiction.message,
                });
            }

            // Upload reference photos to GridFS if provided
            if (req.files && req.files.length > 0) {
                const storedFiles = await uploadFilesToGridFS(req.files, {
                    category: 'risk_zone_reference',
                    visibility: 'public',
                    ownerId: admin._id,
                    municipalityName: jurisdiction.value.municipality,
                });

                uploadedPhotos = storedFiles.map((file, idx) => ({
                    url: file.url,
                    filename: file.filename,
                    originalName: req.files[idx]?.originalname || file.filename,
                    displayOrder: idx,
                    uploadedAt: new Date(),
                    mimeType: file.mimeType || req.files[idx]?.mimetype || null,
                    size: req.files[idx]?.size || null,
                }));
            }

            let zone;
            try {
                zone = await HighRiskZone.create({
                    name,
                    description,
                    type,
                    coordinates: jurisdiction.value.coordinates,
                    radius: radius || 100,
                    severity: severity || 'medium',
                    municipality: jurisdiction.value.municipality,
                    barangay: jurisdiction.value.barangay,
                    photos: uploadedPhotos,
                    createdBy: admin._id,
                });
            } catch (dbError) {
                // Rollback uploaded photos if zone document creation fails
                if (uploadedPhotos.length > 0) {
                    try {
                        await deleteGridFsFilesByUrls(uploadedPhotos.map((p) => p.url));
                    } catch (cleanupErr) {
                        console.error('Failed to rollback GridFS files:', cleanupErr);
                    }
                }
                throw dbError;
            }

            // Emit socket event for real-time update
            const io = req.app.get('io');
            if (io) {
                io.emit('highRiskZoneCreated', zone);
            }

            invalidate(ZONE_CACHE_KEY);

            res.status(201).json({
                success: true,
                message: 'High-risk zone created successfully',
                data: zone,
            });
        } catch (error) {
            console.error('Create high-risk zone error:', error);
            const isValidationError = error?.name === 'ValidationError';
            res.status(isValidationError ? 400 : 500).json({
                success: false,
                message: isValidationError ? error.message : 'Failed to create high-risk zone',
            });
        }
    }
);

/**
 * @route   PUT /api/high-risk-zones/:id
 * @desc    Update a high-risk zone
 * @access  Private (municipal_admin only)
 */
router.put(
    '/:id',
    protect,
    requireRole('municipal_admin'),
    validateMongoIdParam,
    uploadRiskZonePhotos,
    handleMulterError,
    validateUploadContent,
    async (req, res) => {
        let newPhotoUrls = [];
        try {
            const zone = await HighRiskZone.findById(req.params.id);
            const admin = req.user;

            if (!zone) {
                return res.status(404).json({
                    success: false,
                    message: 'High-risk zone not found',
                });
            }

            // Check authorization
            if (!admin.assignedMunicipality || zone.municipality !== admin.assignedMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to update this zone',
                });
            }

            const { name, description, type, radius, severity, isActive } = req.body;
            const coordinates = parseCoordinates(req.body);

            if (name) zone.name = name;
            if (description !== undefined) zone.description = description;
            if (type) zone.type = type;
            if (coordinates) {
                const jurisdiction = await resolveRiskZoneJurisdiction(
                    coordinates,
                    admin.assignedMunicipality
                );
                if (!jurisdiction.valid) {
                    return res.status(jurisdiction.statusCode).json({
                        success: false,
                        message: jurisdiction.message,
                    });
                }
                zone.coordinates = jurisdiction.value.coordinates;
                zone.municipality = jurisdiction.value.municipality;
                zone.barangay = jurisdiction.value.barangay;
            }
            if (radius) zone.radius = radius;
            if (severity) zone.severity = severity;
            if (isActive !== undefined) zone.isActive = isActive;

            // If new photos were uploaded in update
            if (req.files && req.files.length > 0) {
                const storedFiles = await uploadFilesToGridFS(req.files, {
                    category: 'risk_zone_reference',
                    visibility: 'public',
                    ownerId: admin._id,
                    municipalityName: zone.municipality,
                });

                const newPhotos = storedFiles.map((file, idx) => ({
                    url: file.url,
                    filename: file.filename,
                    originalName: req.files[idx]?.originalname || file.filename,
                    displayOrder: (zone.photos?.length || 0) + idx,
                    uploadedAt: new Date(),
                    mimeType: file.mimeType || req.files[idx]?.mimetype || null,
                    size: req.files[idx]?.size || null,
                }));
                newPhotoUrls = newPhotos.map((p) => p.url).filter(Boolean);

                zone.photos = [...(zone.photos || []), ...newPhotos].slice(0, 5);
            }

            await zone.save();

            const io = req.app.get('io');
            if (io) {
                io.emit('highRiskZoneUpdated', zone);
            }

            invalidate(ZONE_CACHE_KEY);

            res.json({
                success: true,
                message: 'High-risk zone updated successfully',
                data: zone,
            });
        } catch (error) {
            if (newPhotoUrls.length > 0) {
                try {
                    await deleteGridFsFilesByUrls(newPhotoUrls);
                } catch (cleanupErr) {
                    console.error('Failed to rollback GridFS files on zone update:', cleanupErr);
                }
            }
            console.error('Update high-risk zone error:', error);
            const isValidationError = error?.name === 'ValidationError';
            res.status(isValidationError ? 400 : 500).json({
                success: false,
                message: isValidationError ? error.message : 'Failed to update high-risk zone',
            });
        }
    }
);

/**
 * @route   DELETE /api/high-risk-zones/:id
 * @desc    Delete a high-risk zone and clean up reference photos
 * @access  Private (municipal_admin only)
 */
router.delete(
    '/:id',
    protect,
    requireRole('municipal_admin'),
    validateMongoIdParam,
    async (req, res) => {
        try {
            const zone = await HighRiskZone.findById(req.params.id);
            const admin = req.user;

            if (!zone) {
                return res.status(404).json({
                    success: false,
                    message: 'High-risk zone not found',
                });
            }

            // Check authorization
            if (!admin.assignedMunicipality || zone.municipality !== admin.assignedMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to delete this zone',
                });
            }

            // Clean up associated reference photo files in GridFS
            if (zone.photos && zone.photos.length > 0) {
                const photoUrls = zone.photos.map((p) => p.url).filter(Boolean);
                if (photoUrls.length > 0) {
                    try {
                        await deleteGridFsFilesByUrls(photoUrls);
                    } catch (err) {
                        console.error('Failed to cleanup GridFS photos on zone delete:', err);
                    }
                }
            }

            await zone.deleteOne();

            const io = req.app.get('io');
            if (io) {
                io.emit('highRiskZoneDeleted', { id: req.params.id });
            }

            invalidate(ZONE_CACHE_KEY);

            res.json({
                success: true,
                message: 'High-risk zone deleted successfully',
            });
        } catch (error) {
            console.error('Delete high-risk zone error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete high-risk zone',
            });
        }
    }
);

export default router;
