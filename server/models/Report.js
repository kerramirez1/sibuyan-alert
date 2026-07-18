import mongoose from 'mongoose';

/**
 * Incident Report Model
 * Supports: Vehicle Accidents, Minor Fire Accidents
 * Features: Municipality assignment, responder tracking, priority system
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

        // Sub-type based on category
        incidentType: {
            type: String,
            required: [true, 'Incident type is required'],
            // For accidents: vehicular, pedestrian, motorcycle, bicycle, maritime, self_accident, mechanical, other
        },

        // Fire involvement toggle (for road accidents with fire/explosion)
        fireInvolved: {
            type: Boolean,
            default: false,
        },

        // Type of fire if fireInvolved is true
        fireType: {
            type: String,
            enum: ['gas_leak', 'vehicular_fire', null],
            default: null,
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
            type: String, // File paths for uploaded images
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

        // Casualties (for accidents and disasters)
        casualties: {
            injured: { type: Number, default: 0 },
            fatalities: { type: Number, default: 0 },
            missing: { type: Number, default: 0 },
        },

        // Affected scope (for disasters/fires)
        affectedArea: {
            radius: { type: Number }, // in meters
            householdsAffected: { type: Number, default: 0 },
            evacuees: { type: Number, default: 0 },
        },

        // Status & Workflow
        status: {
            type: String,
            enum: ['pending', 'verified', 'transferred', 'responding', 'resolved', 'rejected'],
            default: 'pending',
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
                enum: ['MDRRMO', 'PNP', 'BFP', 'SDH', 'RESCUE', 'MEDICAL', 'BARANGAY'],
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
            enum: ['PNP', 'MDRRMO', 'SDH', 'BFP', null],
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
                enum: ['reporter', 'admin', 'municipal_admin'],
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

    // Auto-generate title if not provided
    if (!this.title) {
        const categoryLabels = {
            accident: 'Accident',
            natural_disaster: 'Natural Disaster',
            fire: 'Fire Incident',
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

    const { lat, lng } = this.coordinates;
    if (
        lat < sibuyanBounds.minLat ||
        lat > sibuyanBounds.maxLat ||
        lng < sibuyanBounds.minLng ||
        lng > sibuyanBounds.maxLng
    ) {
        console.warn(`⚠️ Report coordinates (${lat}, ${lng}) are outside Sibuyan Island bounds`);
    }

    // Auto-assign municipality if not set
    if (!this.municipality && this.coordinates) {
        try {
            const Municipality = mongoose.model('Municipality');
            const nearestMuni = await Municipality.findNearest(this.coordinates.lat, this.coordinates.lng);
            if (nearestMuni) {
                this.municipality = nearestMuni._id;
                this.municipalityName = nearestMuni.name;
            }
        } catch (error) {
            console.warn('Could not auto-assign municipality:', error.message);
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
