import mongoose from 'mongoose';

/**
 * High Risk Zone Schema
 * Allows municipal admins to mark danger zones on the map and attach reference photos
 */
const highRiskZoneSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Zone name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        type: {
            type: String,
            enum: ['landslide_prone', 'accident_prone', 'flood_prone', 'fire_risk', 'other'],
            required: true,
        },
        coordinates: {
            lat: {
                type: Number,
                required: [true, 'Latitude is required'],
            },
            lng: {
                type: Number,
                required: [true, 'Longitude is required'],
            },
        },
        radius: {
            type: Number, // in meters
            default: 100,
            min: [10, 'Radius must be at least 10 meters'],
            max: [5000, 'Radius cannot exceed 5000 meters'],
        },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium',
        },
        municipality: {
            type: String,
            enum: ['Cajidiocan', 'Magdiwang', 'San Fernando'],
            required: [true, 'Municipality is required'],
        },
        barangay: {
            type: String,
            trim: true,
            maxlength: [100, 'Barangay cannot exceed 100 characters'],
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        photos: [
            {
                url: {
                    type: String,
                    required: true,
                },
                filename: {
                    type: String,
                    required: true,
                },
                originalName: {
                    type: String,
                    default: null,
                },
                displayOrder: {
                    type: Number,
                    default: 0,
                },
                uploadedAt: {
                    type: Date,
                    default: Date.now,
                },
                mimeType: {
                    type: String,
                    default: null,
                },
                size: {
                    type: Number,
                    default: null,
                },
            },
        ],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Index for geospatial queries
highRiskZoneSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
highRiskZoneSchema.index({ municipality: 1 });
highRiskZoneSchema.index({ municipality: 1, barangay: 1 });
highRiskZoneSchema.index({ isActive: 1 });

const HighRiskZone = mongoose.model('HighRiskZone', highRiskZoneSchema);

export default HighRiskZone;
