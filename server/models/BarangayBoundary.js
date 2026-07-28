import mongoose from 'mongoose';

const geoJsonGeometrySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['Polygon', 'MultiPolygon'],
        required: true,
    },
    coordinates: {
        type: Array,
        required: true,
    },
}, { _id: false });

const barangayBoundarySchema = new mongoose.Schema({
    psgcCode: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    municipalityName: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    geometry: {
        type: geoJsonGeometrySchema,
        required: true,
    },
    dataset: {
        source: String,
        sourceVersion: String,
        psgcSnapshot: String,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
}, { timestamps: true });

barangayBoundarySchema.index({ geometry: '2dsphere' });
barangayBoundarySchema.index({ municipalityName: 1, name: 1 }, { unique: true });

const BarangayBoundary = mongoose.model('BarangayBoundary', barangayBoundarySchema);

export default BarangayBoundary;
