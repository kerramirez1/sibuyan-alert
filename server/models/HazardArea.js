import mongoose from 'mongoose';

/**
 * A hazard susceptibility area for Sibuyan Island.
 *
 * One document per (dataset, hazard class), holding that class as a single
 * MultiPolygon. The NOAH source is already dissolved by class, so keeping it
 * dissolved means a point lookup matches at most one document per dataset
 * instead of sorting through thousands of patches.
 *
 * Deliberately one collection rather than one per hazard. Landslide and storm
 * surge answer the same question — "what is under this point?" — through the
 * same geospatial operator, so a `datasetId` discriminator keeps a single
 * indexed query path instead of a growing set of near-identical collections.
 *
 * This collection is a query index, not the render source. The map layers are
 * served from the dataset files (see `services/hazardAreaService.js`), so the
 * geometry is only ever read here to answer "what is under this point?".
 */
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

const hazardAreaSchema = new mongoose.Schema({
    /** Registry id, e.g. `landslide` or `storm_surge_ssa4`. */
    datasetId: {
        type: String,
        required: true,
        index: true,
    },
    /** Coarse grouping for filtering, e.g. `landslide` or `storm_surge`. */
    hazardType: {
        type: String,
        required: true,
        index: true,
    },
    /**
     * Hazard class within the dataset. The numbers are NOT comparable across
     * datasets — landslide `2` is a susceptibility band, storm surge `2` is a
     * modelled inundation depth — so it is only ever interpreted together with
     * `datasetId`.
     */
    hazardClass: {
        type: Number,
        required: true,
        index: true,
    },
    hazardLabel: {
        type: String,
        required: true,
        trim: true,
    },
    geometry: {
        type: geoJsonGeometrySchema,
        required: true,
    },
    dataset: {
        source: String,
        sourceUrl: String,
        sourceVersion: String,
        licence: String,
        attribution: String,
        derivation: String,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
}, { timestamps: true });

// The point-in-polygon lookup that answers "what hazard is at this coordinate?".
hazardAreaSchema.index({ geometry: '2dsphere' });
// One document per class within a dataset, so a re-import upserts instead of
// duplicating. Scoped by dataset because class numbers repeat across datasets.
hazardAreaSchema.index({ datasetId: 1, hazardClass: 1 }, { unique: true });

const HazardArea = mongoose.model('HazardArea', hazardAreaSchema);

export default HazardArea;
