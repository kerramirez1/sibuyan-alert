/**
 * Shared municipal report scope for queue listings AND analytics.
 *
 * Production rule (single definition): a municipality's operational dataset
 * is every incident that TOUCHED it — currently handled here, originated
 * here, or passed through here — minus copies the local office dismissed
 * from its own queue. Queue listings (`getAllReports`) and every analytics
 * aggregation MUST use this exact scope so dashboard numbers always
 * reconcile with queue totals.
 *
 * Deliberate consequence: one transferred physical report appears in both
 * the origin and the target dashboards (as it does in both queues).
 * Island-wide rollups MUST therefore dedupe by report `_id` instead of
 * summing municipal totals.
 */

export const MUNICIPAL_ORIGIN_CLAUSES = (municipality) => [
    { municipalityName: municipality },
    { originalMunicipalityName: municipality },
    { 'transferHistory.fromMunicipalityName': municipality },
];

/**
 * Mongo match fragment for a municipality's operational incident dataset.
 * Legacy documents without `hiddenFromMunicipalities` still match ($ne).
 */
export const buildMunicipalReportScope = (municipality) => ({
    $and: [
        { $or: MUNICIPAL_ORIGIN_CLAUSES(municipality) },
        { hiddenFromMunicipalities: { $ne: municipality } },
    ],
});

/**
 * The one analytics exclusion for reports closed as false information.
 *
 * A flagged report is still a resolved report operationally — it stays in
 * the queue, on the map, and in workload analytics (the response work
 * really happened). It is excluded only from incident-counting analytics:
 * admin/public counts and breakdowns, public stats, hotspot derivation,
 * and the analytics Excel export. The $ne form is required so legacy
 * documents written before the field existed still count.
 *
 * Apply this at the analytics call sites, NEVER inside
 * buildMunicipalReportScope: that builder is shared with the incident
 * queue and other non-analytics readers, which must keep seeing flagged
 * reports.
 */
export const FALSE_INFORMATION_EXCLUSION = Object.freeze({
    isFalseInformation: { $ne: true },
});

export const MUNICIPAL_REPORT_STATUSES = Object.freeze([
    'pending',
    'verified',
    'transferred',
    'responding',
    'resolved',
    'rejected',
]);

export default {
    FALSE_INFORMATION_EXCLUSION,
    MUNICIPAL_REPORT_STATUSES,
    MUNICIPAL_ORIGIN_CLAUSES,
    buildMunicipalReportScope,
};
