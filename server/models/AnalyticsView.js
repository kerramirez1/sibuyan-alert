import mongoose from 'mongoose';

/**
 * D7 Analytics / Historical Data — read-only Mongoose handle over the
 * `analytics_view` MongoDB view (viewOn: `reports`, see
 * services/analyticsViewService.js).
 *
 * Writes always go to Report (D2); this model exists so P6 dashboard code and
 * the defense panel have a physical D7 handle to point at. `autoIndex: false`
 * because views inherit indexes from their source collection.
 */
const analyticsViewSchema = new mongoose.Schema(
    {
        title: String,
        description: String,
        incidentCategory: String,
        incidentType: String,
        fireInvolved: Boolean,
        fireType: String,
        status: String,
        severity: String,
        priority: String,
        address: String,
        barangay: String,
        barangayPsgcCode: String,
        municipalityName: String,
        originalMunicipalityName: String,
        locationConfidence: String,
        coordinates: {
            lat: Number,
            lng: Number,
        },
        incidentDate: Date,
        incidentTime: Date,
        reportedAt: Date,
        verifiedAt: Date,
        respondedAt: Date,
        resolvedAt: Date,
        casualties: {
            injured: Number,
            fatalities: Number,
            missing: Number,
        },
        casualtyTotal: Number,
        affectedArea: mongoose.Schema.Types.Mixed,
        viewCount: Number,
        respondersCount: Number,
        reportUpdatesCount: Number,
        evidenceCount: Number,
        responders: [{
            _id: false,
            unitType: String,
            respondedAt: Date,
        }],
        transferHistory: [{
            _id: false,
            fromMunicipalityName: String,
            toMunicipalityName: String,
            reason: String,
            transferredAt: Date,
            acknowledgedAt: Date,
        }],
        reporter: mongoose.Schema.Types.ObjectId,
        municipality: mongoose.Schema.Types.ObjectId,
    },
    {
        collection: 'analytics_view',
        autoIndex: false,
        versionKey: false,
        strict: true,
        timestamps: true,
    }
);

// Guardrail: D7 is derived — block accidental writes through this handle so all
// mutations keep flowing through Report (D2) and its lifecycle hooks.
analyticsViewSchema.pre('save', function blockViewWrite(next) {
    next(new Error('analytics_view is read-only; write to Report instead'));
});

const AnalyticsView = mongoose.models.AnalyticsView
    || mongoose.model('AnalyticsView', analyticsViewSchema);

export default AnalyticsView;
