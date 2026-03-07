import mongoose from 'mongoose';

/**
 * Municipality Model
 * Stores the 3 municipalities of Sibuyan Island:
 * - Cajidiocan
 * - Magdiwang
 * - San Fernando
 */
const municipalitySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Municipality name is required'],
            unique: true,
            trim: true,
        },
        code: {
            type: String,
            required: [true, 'Municipality code is required'],
            unique: true,
            uppercase: true,
            trim: true,
        },
        // Center coordinates for the municipality
        center: {
            lat: {
                type: Number,
                required: true,
            },
            lng: {
                type: Number,
                required: true,
            },
        },
        // Bounding box for rough area coverage
        bounds: {
            minLat: { type: Number, required: true },
            maxLat: { type: Number, required: true },
            minLng: { type: Number, required: true },
            maxLng: { type: Number, required: true },
        },
        // Contact information for emergency coordination
        emergencyContacts: [{
            department: {
                type: String,
                enum: ['police', 'fire', 'medical', 'rescue', 'barangay', 'municipal'],
                required: true,
            },
            name: String,
            phone: String,
            email: String,
            isActive: { type: Boolean, default: true },
        }],
        // Barangays under this municipality
        barangays: [{
            name: { type: String, required: true },
            center: {
                lat: Number,
                lng: Number,
            },
        }],
        // Response capabilities
        responseCapabilities: {
            hasFireStation: { type: Boolean, default: false },
            hasPoliceStation: { type: Boolean, default: true },
            hasHealthCenter: { type: Boolean, default: true },
            hasRescueUnit: { type: Boolean, default: false },
            ambulanceCount: { type: Number, default: 0 },
            firetruckCount: { type: Number, default: 0 },
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Static method to find nearest municipality based on coordinates
municipalitySchema.statics.findNearest = async function (lat, lng) {
    const municipalities = await this.find({ isActive: true });

    if (municipalities.length === 0) return null;

    let nearest = null;
    let shortestDistance = Infinity;

    municipalities.forEach((muni) => {
        // Calculate distance using Haversine formula
        const distance = calculateDistance(lat, lng, muni.center.lat, muni.center.lng);

        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearest = muni;
        }
    });

    return nearest;
};

// Haversine formula for calculating distance between two coordinates
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

// Index for faster queries
municipalitySchema.index({ 'center.lat': 1, 'center.lng': 1 });

const Municipality = mongoose.model('Municipality', municipalitySchema);

export default Municipality;
