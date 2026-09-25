import express from 'express';
import HighRiskZone from '../models/HighRiskZone.js';
import { deleteViewEventsForTarget } from '../services/viewEventService.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { sortHighRiskZonesBySeverity } from '../utils/highRiskZones.js';
import { resolveRiskZoneJurisdiction } from '../services/riskZoneJurisdictionService.js';
import {
    describeHazardsAt,
    getHazardLayer,
    getHazardLayerCatalog,
} from '../services/hazardAreaService.js';
import Report from '../models/Report.js';
import { accidentHotspotValidator } from '../utils/accidentHotspots.js';
import { HAZARD_DATASET_IDS, isKnownHazardDataset } from '../config/hazardDatasets.js';
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
// invalidates this prefix so the map never shows a stale hazard. That covers
// this process; the response headers below are what cover the browser, which is
// a cache this server cannot invalidate.
const ZONE_CACHE_KEY = 'zones:island-wide';

// Hard ceiling on the public zone list. Hazard zones are a curated set (an
// admin places each one by hand), so this is far above any realistic count —
// it exists so the endpoint can never return an unbounded collection.
const MAX_ZONE_RESULTS = 500;

/**
 * Zone types and severities the API still accepts for a new or changed value.
 *
 * The admin form no longer offers flood-prone zones or the low and critical
 * severities, but a form is not an API boundary: a cached client bundle, a
 * script or a stale tab would still be able to write them. Narrowing the list
 * here keeps the two in step.
 *
 * The model enum deliberately keeps the whole vocabulary. Zones saved before the
 * options were withdrawn still hold these values, and tightening the schema
 * would make every one of them fail validation the next time an administrator
 * edited something unrelated — turning a form change into silent data damage.
 * So a retired value may stay on a zone, but it may not be chosen.
 */
const SELECTABLE_ZONE_TYPES = Object.freeze(['landslide_prone', 'accident_prone', 'other']);
const SELECTABLE_ZONE_SEVERITIES = Object.freeze(['medium', 'high']);

const retiredValueMessage = (field, allowed) => (
    `${field} must be one of: ${allowed.join(', ')}`
);

/**
 * The newest edit in the list, as a number, for the ETag.
 *
 * The validator has to notice every create, edit and delete. It used to
 * fingerprint `zones[0]` and `zones[zones.length - 1]` — the ends of a list
 * sorted by *severity*, not by time — so editing a zone that happened to sort in
 * the middle left the validator untouched and the next conditional GET answered
 * `304 Not Modified` about a list that had just changed. Paired with the count,
 * this stamp covers all three: a create moves the newest stamp, an edit moves
 * its own document's `updatedAt`, a delete changes the count.
 */
const getNewestZoneUpdate = (zones) => zones.reduce((newest, zone) => {
    const stamp = new Date(zone?.updatedAt ?? 0).getTime();
    return Number.isFinite(stamp) && stamp > newest ? stamp : newest;
}, 0);

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
            etag: buildWeakEtag('zones', zones.length, getNewestZoneUpdate(zones)),
            // Revalidate on every read — do not hand the browser a freshness
            // window. `max-age=120` here meant that for two minutes a GET never
            // reached this route at all, and a browser's own HTTP cache is not
            // something a delete can reach into: right after an administrator
            // removed a hazard, the refetch the page fired was answered from that
            // cache and the zone came straight back onto the map and the list, no
            // matter how many times they deleted it.
            //
            // The ETag is what keeps this cheap: an unchanged list is a ~200 byte
            // 304 with no body. It just cannot skip the server, which is the only
            // place that knows the collection changed. The public reports feed on
            // the same helper already reasons this way (`maxAgeSeconds: 0`).
            maxAgeSeconds: 0,
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
 * @route   GET /api/high-risk-zones/hazards
 * @desc    Every NOAH hazard layer for Sibuyan, in one payload
 * @access  Private (municipal_admin only)
 *
 * Declared before the `/:id` routes so the literal path is never parsed as an
 * object id.
 *
 * This is reference geography, not user data: the geometry is fixed at import
 * time and changes only when a dataset is regenerated. It is therefore served
 * from the memoised dataset files rather than the collection, and the ETag folds
 * in every layer's own validator — a redeploy with new polygons invalidates
 * every cached copy without any manual cache busting.
 *
 * Admin-only: these reference layers exist to help an administrator place a
 * high-risk zone, and they are drawn on the admin Risk Zones workspace alone.
 * The public dashboard map no longer requests them, so there is no reader left
 * to serve anonymously.
 *
 * One request for all layers rather than one per layer: the client needs the
 * whole set to build its legend and toggles, and five round-trips on a weak link
 * to render one screen is the cost this shape avoids.
 */
router.get('/hazards', protect, requireRole('municipal_admin'), async (req, res) => {
    try {
        const catalog = getHazardLayerCatalog();

        sendConditionalJson(req, res, {
            success: true,
            data: {
                layers: catalog.payloads,
                // Named so an operator can see which layers are simply absent on
                // this environment, rather than assuming they cover nothing.
                unavailable: catalog.missing,
            },
        }, {
            etag: catalog.etag,
            // Immutable between deploys, so a day of client caching is safe.
            // `must-revalidate` (set by the helper) still forces a conditional
            // request once it lapses, so a stale layer cannot outlive a deploy
            // by more than that window.
            maxAgeSeconds: 86_400,
        });
    } catch (error) {
        console.error('Get hazard layers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get hazard layers',
        });
    }
});

/**
 * @route   GET /api/high-risk-zones/hazards/at
 * @desc    Resolve every hazard class containing a coordinate
 * @access  Private (municipal_admin only)
 *
 * Declared before `/hazards/:datasetId` so `at` is never read as a dataset id.
 *
 * Exposed separately from the geocode response so any surface — including the
 * map's own click handler — can ask the question without running a full location
 * verification. The geocode path uses the same service, so the two can never
 * disagree.
 */
router.get('/hazards/at', protect, requireRole('municipal_admin'), async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                success: false,
                message: 'Valid lat and lng query parameters are required',
            });
        }

        const rawDatasetIds = req.query.datasets;
        const datasetIds = typeof rawDatasetIds === 'string' && rawDatasetIds.trim()
            ? rawDatasetIds.split(',').map((id) => id.trim()).filter(Boolean)
            : undefined;

        if (datasetIds) {
            const unknown = datasetIds.filter((id) => !isKnownHazardDataset(id));
            if (unknown.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Unknown hazard dataset(s): ${unknown.join(', ')}. Known: ${HAZARD_DATASET_IDS.join(', ')}`,
                });
            }
        }

        const hazards = await describeHazardsAt(lat, lng, { datasetIds });
        return res.json({ success: true, data: hazards });
    } catch (error) {
        console.error('Resolve hazard error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to resolve hazard at this location',
        });
    }
});

/**
 * @route   GET /api/high-risk-zones/hazards/:datasetId
 * @desc    One NOAH hazard layer
 * @access  Private (municipal_admin only)
 *
 * Kept alongside the combined catalog so a caller that needs a single layer —
 * the public map showing only landslides, for instance — does not pay for the
 * other four.
 */
router.get('/hazards/:datasetId', protect, requireRole('municipal_admin'), async (req, res) => {
    const { datasetId } = req.params;

    if (!isKnownHazardDataset(datasetId)) {
        return res.status(404).json({
            success: false,
            message: `Unknown hazard dataset: ${datasetId}. Known: ${HAZARD_DATASET_IDS.join(', ')}`,
        });
    }

    try {
        const layer = getHazardLayer(datasetId);
        sendConditionalJson(req, res, { success: true, data: layer.payload }, {
            etag: layer.etag,
            maxAgeSeconds: 86_400,
        });
    } catch (error) {
        // A missing dataset file is an operational state, not a bug: the import
        // has not been run on this environment. Say so, with the fix, rather
        // than returning a generic 500 the operator cannot act on.
        if (error?.code === 'ENOENT') {
            console.warn(`Hazard dataset file is missing for ${datasetId}:`, error.path);
            return res.status(503).json({
                success: false,
                message: `Hazard dataset "${datasetId}" is not installed. Run npm run import:hazards --prefix server, then retry.`,
            });
        }
        console.error(`Get hazard layer error (${datasetId}):`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to get hazard layer',
        });
    }
});

/**
 * @route   GET /api/high-risk-zones/accident-hotspots
 * @desc    Accident-prone areas derived from the system's own accident reports
 * @access  Private (municipal_admin only)
 *
 * The one map layer on this workspace that is not external data. Landslide
 * susceptibility arrives as PHIVOLCS polygons; accident-prone areas are computed
 * from the reports this system already holds, so the layer changes when the
 * accidents do rather than when a dataset is redeployed.
 *
 * Lives on this router rather than next to the legacy
 * `GET /api/reports/high-risk-zones` aggregation because it answers a different
 * question and is scoped differently: that one is public and only counts
 * `verified`/`responding`/`resolved`, while a zone-placement layer is an
 * administrative aid (admin-only, like the hazard layers) and counts every
 * validated state, `transferred` included.
 *
 * Declared before `/:id` so the literal path is never parsed as an object id.
 *
 * Aggregated cell data only — a coordinate, a report count and a class. There is
 * no shape of this payload that carries a reporter, an address or a report id.
 */
router.get('/accident-hotspots', protect, requireRole('municipal_admin'), async (req, res) => {
    try {
        const policy = resolveQueryPolicy();
        const maxTimeMs = Math.max(policy.maxTimeMs || 5000, 15000);
        const layer = await Report.getAccidentHotspots({ maxTimeMS: maxTimeMs });

        sendConditionalJson(req, res, { success: true, data: layer }, {
            // Fingerprinted from the cells themselves: the payload is small, and a
            // report re-pinned to a different corner of the same cell changes no
            // count and no timestamp — only a validator built from the positions
            // notices that.
            etag: buildWeakEtag(
                'accident-hotspots:all-time',
                layer.rule?.timeScope || 'all_time',
                accidentHotspotValidator(layer)
            ),
            // Deliberately no server-side TTL, unlike the zone list: this answer
            // moves as reports are verified, and a cached hotspot map would
            // disagree with the pins drawn beside it. The ETag still turns an
            // unchanged repeat into a ~200 byte 304 instead of a second body.
            maxAgeSeconds: 0,
        });
    } catch (error) {
        console.error('Get accident hotspots error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get accident-prone areas',
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

            // Checked before the jurisdiction lookup and the photo upload, so a
            // rejected zone never leaves GridFS files behind to roll back. Only
            // the *retired* vocabulary is policed here — a missing or unknown
            // type stays the schema's business, which owns "required" and the
            // stored enum, so this list cannot silently become a second
            // definition of what a zone is.
            if (type && !SELECTABLE_ZONE_TYPES.includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: retiredValueMessage('Zone type', SELECTABLE_ZONE_TYPES),
                });
            }
            if (severity && !SELECTABLE_ZONE_SEVERITIES.includes(severity)) {
                return res.status(400).json({
                    success: false,
                    message: retiredValueMessage('Severity', SELECTABLE_ZONE_SEVERITIES),
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

            // Rejected only when the value actually *changes*. A zone that still
            // carries a withdrawn type or severity — saved before the form
            // stopped offering it — must stay editable, or renaming it would be
            // impossible without also reclassifying it. Submitting the value it
            // already has is not a choice, it is the absence of one.
            if (type && type !== zone.type && !SELECTABLE_ZONE_TYPES.includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: retiredValueMessage('Zone type', SELECTABLE_ZONE_TYPES),
                });
            }
            if (severity && severity !== zone.severity && !SELECTABLE_ZONE_SEVERITIES.includes(severity)) {
                return res.status(400).json({
                    success: false,
                    message: retiredValueMessage('Severity', SELECTABLE_ZONE_SEVERITIES),
                });
            }

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

            // Reach rows for a record that no longer exists can never be read
            // back — both leaderboards join the aggregate to the record — so they
            // are removed with it instead of lingering until the TTL sweep.
            // Best-effort, like the photo cleanup above it: the TTL is the backstop.
            await deleteViewEventsForTarget({ targetType: 'zone', targetId: zone._id });

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
