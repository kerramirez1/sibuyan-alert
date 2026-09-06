import mongoose from 'mongoose';

/**
 * Incident Report Model
 * Road-accident-only scope: vehicular, motorcycle, pedestrian, bicycle,
 * self-accident, mechanical, other. Casualties = injured/fatalities/missing.
 */
const reportSchema = new mongoose.Schema(
    {
        // Reporter Information
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Reporter is required'],
        },

        // Incident Category - Main classification
        incidentCategory: {
            type: String,
            enum: ['accident'],
            required: [true, 'Incident category is required'],
            default: 'accident',
        },

        // Sub-type based on category (road accidents only)
        incidentType: {
            type: String,
            required: [true, 'Incident type is required'],
            // Road accidents: vehicular, motorcycle, pedestrian, bicycle, self_accident, mechanical, other
        },

        // Basic Information
        title: {
            type: String,
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
        },
        images: [{
            type: String, // Public GridFS delivery URLs for uploaded images
        }],
        evidenceMetadata: [{
            index: Number,
            detectionStatus: {
                type: String,
                enum: ['faces_detected', 'no_faces_detected', 'processing', 'detector_failed', 'invalid_image', 'derivative_failed'],
            },
            redactionType: {
                type: String,
                enum: ['face_blur', 'none', 'privacy_preview', 'fallback_blur', 'svg_fallback'],
            },
            facesDetected: Number,
            redactedRegions: Number,
            redactionVersion: String,
            detectorVersion: String,
            sourceHash: String,
            derivativeHash: String,
        }],

        // Location Information
        address: {
            type: String,
            required: [true, 'Address is required'],
            trim: true,
        },

        barangay: {
            type: String,
            trim: true,
        },
        barangayPsgcCode: {
            type: String,
            trim: true,
            index: true,
        },
        locationConfidence: {
            type: String,
            enum: ['boundary_matched', 'manual_confirmed', 'geocoder_suggested', 'legacy'],
            default: 'legacy',
        },
        coordinates: {
            lat: {
                type: Number,
                required: [true, 'Latitude is required'],
                min: [-90, 'Latitude must be between -90 and 90'],
                max: [90, 'Latitude must be between -90 and 90'],
            },
            lng: {
                type: Number,
                required: [true, 'Longitude is required'],
                min: [-180, 'Longitude must be between -180 and 180'],
                max: [180, 'Longitude must be between -180 and 180'],
            },
        },
        // Evidence describing how the reporter selected the incident point.
        // It supports auditability without treating a client-side selection as verification.
        locationCapture: {
            source: {
                type: String,
                enum: ['gps', 'map_pin', 'search', 'address_geocoded', 'legacy'],
                default: 'legacy',
            },
            accuracyMeters: {
                type: Number,
                min: [0, 'Location accuracy cannot be negative'],
            },
            capturedAt: {
                type: Date,
                default: Date.now,
            },
        },
        // Legacy-readable source retained while new records use locationCapture.
        locationSource: {
            type: String,
            enum: ['provided', 'geocoded', 'legacy'],
            default: 'legacy',
        },

        // Municipality Assignment (auto-detected based on coordinates)
        municipality: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Municipality',
        },
        municipalityName: {
            type: String, // Denormalized for quick access
        },
        originalMunicipality: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Municipality',
        },
        originalMunicipalityName: {
            type: String,
        },
        transferHistory: [{
            fromMunicipality: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Municipality',
            },
            fromMunicipalityName: String,
            toMunicipality: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Municipality',
            },
            toMunicipalityName: String,
            reason: {
                type: String,
                required: true,
            },
            transferredBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            transferredAt: {
                type: Date,
                default: Date.now,
            },
            acknowledgedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
            },
            acknowledgedAt: {
                type: Date,
                default: null,
            },
        }],

        // Timing
        incidentTime: {
            type: Date,
            required: [true, 'Incident time is required'],
        },
        reportedAt: {
            type: Date,
            default: Date.now,
        },

        // Severity & Priority
        severity: {
            type: String,
            enum: ['minor', 'moderate', 'severe', 'critical'],
            default: 'moderate',
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
        },

        // Casualties (road-accident victims)
        casualties: {
            injured: { type: Number, default: 0 },
            fatalities: { type: Number, default: 0 },
            missing: { type: Number, default: 0 },
        },

        // Status & Workflow
        status: {
            type: String,
            enum: ['pending', 'verified', 'transferred', 'responding', 'resolved', 'rejected'],
            default: 'pending',
        },

        // Municipalities that dismissed their read-only transferred copy.
        // The record itself is untouched — only its visibility in the
        // dismissing municipality's queue is removed.
        hiddenFromMunicipalities: {
            type: [String],
            default: [],
        },

        // Verification
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        verifiedAt: {
            type: Date,
            default: null,
        },
        rejectionReason: {
            type: String,
            default: null,
        },

        // Multi-Responder Tracking (new non-exclusive model)
        responders: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
            unitName: {
                type: String,
                required: true,
            },
            unitType: {
                type: String,
                enum: ['MDRRMO', 'PNP', 'BFP', 'Medical Team', 'RESCUE', 'MEDICAL', 'BARANGAY'],
                required: true,
            },
            respondedAt: {
                type: Date,
                default: Date.now,
            },
            notes: {
                type: String,
                default: null,
            },
        }],

        // Legacy fields for backward compatibility (deprecated)
        respondedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        respondedAt: {
            type: Date,
            default: null,
        },
        responderAgency: {
            type: String,
            enum: ['PNP', 'MDRRMO', 'Medical Team', 'BFP', null],
            default: null,
        },

        // Resolution Tracking
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        resolutionNotes: {
            type: String,
            default: null,
        },

        // Reporter-side progress updates (e.g., victim already transported)
        reportUpdates: [{
            author: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
            authorRole: {
                type: String,
                enum: ['reporter', 'municipal_admin'],
                default: 'reporter',
            },
            message: {
                type: String,
                required: true,
                trim: true,
                maxlength: [500, 'Update message cannot exceed 500 characters'],
            },
            tag: {
                type: String,
                enum: ['general', 'transported', 'stabilized', 'need_help', 'false_alarm', 'other'],
                default: 'general',
            },
            createdAt: {
                type: Date,
                default: Date.now,
            },
        }],


        // Analytics
        viewCount: {
            type: Number,
            default: 0,
        },

        // Legacy field mapping (for backward compatibility)
        accidentTime: {
            type: Date,
        },
        accidentType: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for efficient queries
reportSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ status: 1, verifiedAt: -1 });
reportSchema.index({ incidentCategory: 1, status: 1 });
reportSchema.index({ municipality: 1, status: 1 });
reportSchema.index({ priority: 1, createdAt: -1 });
reportSchema.index({ 'responders.user': 1 }); // For multi-responder queries

// Virtual for time since incident
reportSchema.virtual('timeSinceIncident').get(function () {
    const incidentDate = this.incidentTime || this.accidentTime;
    if (!incidentDate) return 'Unknown';

    const now = new Date();
    const diff = now - incidentDate;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
});


// Pre-save hook for data normalization and validation
reportSchema.pre('save', async function (next) {
    // Map legacy fields
    if (this.accidentTime && !this.incidentTime) {
        this.incidentTime = this.accidentTime;
    }
    if (this.accidentType && !this.incidentType) {
        this.incidentType = this.accidentType;
        this.incidentCategory = 'accident';
    }

    // Auto-generate title if not provided (road accidents only)
    if (!this.title) {
        const categoryLabels = {
            accident: 'Road Accident',
        };
        this.title = `${categoryLabels[this.incidentCategory] || 'Incident'} at ${this.address?.split(',')[0] || 'Unknown Location'}`;
    }

    // Auto-calculate priority based on severity and casualties
    if (this.isNew || this.isModified('severity') || this.isModified('casualties')) {
        const totalCasualties = (this.casualties?.injured || 0) +
            (this.casualties?.fatalities || 0) * 3 +
            (this.casualties?.missing || 0) * 2;

        if (this.severity === 'critical' || this.casualties?.fatalities > 0) {
            this.priority = 'urgent';
        } else if (this.severity === 'severe' || totalCasualties >= 5) {
            this.priority = 'high';
        } else if (this.severity === 'moderate' || totalCasualties >= 1) {
            this.priority = 'normal';
        } else {
            this.priority = 'low';
        }
    }

    // Sibuyan Island bounds validation (warning only)
    const sibuyanBounds = {
        minLat: 12.30,
        maxLat: 12.55,
        minLng: 122.45,
        maxLng: 122.70,
    };

    if (!this.coordinates || typeof this.coordinates.lat === 'undefined' || typeof this.coordinates.lng === 'undefined') {
        return next();
    }

    const { lat, lng } = this.coordinates;
    if (
        lat < sibuyanBounds.minLat ||
        lat > sibuyanBounds.maxLat ||
        lng < sibuyanBounds.minLng ||
        lng > sibuyanBounds.maxLng
    ) {
        console.warn(`⚠️ Report coordinates (${lat}, ${lng}) are outside Sibuyan Island bounds`);
    }

    // Only assign when exactly one configured operational coverage box matches.
    // Never silently route an ambiguous point to the nearest municipal center.
    if (!this.municipality && this.coordinates) {
        try {
            const Municipality = mongoose.model('Municipality');
            const matches = await Municipality.find({
                isActive: true,
                'bounds.minLat': { $lte: this.coordinates.lat },
                'bounds.maxLat': { $gte: this.coordinates.lat },
                'bounds.minLng': { $lte: this.coordinates.lng },
                'bounds.maxLng': { $gte: this.coordinates.lng },
            }).select('_id name');
            if (matches.length === 1) {
                this.municipality = matches[0]._id;
                this.municipalityName = matches[0].name;
            } else if (matches.length > 1) {
                console.warn(`Report coordinates (${lat}, ${lng}) match multiple municipality coverage boxes; left unassigned.`);
            }
        } catch (error) {
            console.warn('Could not safely auto-assign municipality:', error.message);
        }
    }

    // Auto-initialize original municipality fields
    if (this.municipality && !this.originalMunicipality) {
        this.originalMunicipality = this.municipality;
        this.originalMunicipalityName = this.municipalityName;
    }

    next();
});

// Static method to get reports within Sibuyan bounds
reportSchema.statics.getReportsInSibuyan = function (filters = {}) {
    const query = {
        'coordinates.lat': { $gte: 12.30, $lte: 12.55 },
        'coordinates.lng': { $gte: 122.45, $lte: 122.70 },
        status: { $in: ['verified', 'responding'] },
        ...filters,
    };

    return this.find(query)
        .populate('reporter', 'name avatar')
        .populate('municipality', 'name code')
        .sort({ createdAt: -1 });
};

// Static method to get incidents by municipality
reportSchema.statics.getByMunicipality = function (municipalityId, status = null) {
    const query = { municipality: municipalityId };
    if (status) query.status = status;

    return this.find(query)
        .populate('reporter', 'name avatar')
        .sort({ priority: -1, createdAt: -1 });
};

// Static method to get high-risk zones
reportSchema.statics.getHighRiskZones = async function () {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const zones = await this.aggregate([
        {
            $match: {
                status: { $in: ['verified', 'responding', 'resolved'] },
                incidentTime: { $gte: thirtyDaysAgo },
            },
        },
        {
            $group: {
                _id: {
                    lat: { $round: ['$coordinates.lat', 2] },
                    lng: { $round: ['$coordinates.lng', 2] },
                },
                count: { $sum: 1 },
                avgSeverity: { $avg: { $indexOfArray: [['minor', 'moderate', 'severe', 'critical'], '$severity'] } },
                categories: { $addToSet: '$incidentCategory' },
            },
        },
        {
            $match: {
                count: { $gte: 2 }, // At least 2 incidents to be notable
            },
        },
        {
            $sort: { count: -1 },
        },
    ]);

    return zones;
};

// Static method to get statistics
reportSchema.statics.getStatistics = async function (filters = {}) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await this.aggregate([
        { $match: filters },
        {
            $facet: {
                total: [{ $count: 'count' }],
                byCategory: [
                    { $group: { _id: '$incidentCategory', count: { $sum: 1 } } },
                ],
                bySeverity: [
                    { $group: { _id: '$severity', count: { $sum: 1 } } },
                ],
                byStatus: [
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ],
                recentCount: [
                    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
                    { $count: 'count' },
                ],
                casualties: [
                    {
                        $group: {
                            _id: null,
                            totalInjured: { $sum: '$casualties.injured' },
                            totalFatalities: { $sum: '$casualties.fatalities' },
                            totalMissing: { $sum: '$casualties.missing' },
                        },
                    },
                ],
            },
        },
    ]);

    return stats[0];
};

reportSchema.set('toJSON', { virtuals: true });
reportSchema.set('toObject', { virtuals: true });

const Report = mongoose.model('Report', reportSchema);

export default Report;
