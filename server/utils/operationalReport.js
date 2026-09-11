import { getEntityId } from './reportAccess.js';
import { buildReportEvidenceObject } from './publicReport.js';
import { toSerializableCount } from './casualtyCounts.js';
import { getRespondingAgencies } from './reportAgencies.js';

const toPlainObject = (value) => (
    typeof value?.toObject === 'function' ? value.toObject({ virtuals: false }) : value || {}
);

const pickPerson = (person, { includeEmail = false } = {}) => {
    const value = toPlainObject(person);
    if (!value || (!value.name && !value._id)) return null;

    return {
        id: getEntityId(value),
        name: value.name || 'Unknown user',
        ...(includeEmail && value.email ? { email: value.email } : {}),
        ...(value.agency ? { agency: value.agency } : {}),
        ...(value.assignedMunicipality ? { assignedMunicipality: value.assignedMunicipality } : {}),
        ...(typeof value.isVerified === 'boolean' ? { isVerified: value.isVerified } : {}),
    };
};

const pickResponder = (entry) => {
    const value = toPlainObject(entry);
    return {
        id: getEntityId(value),
        user: pickPerson(value.user),
        unitName: value.unitName || '',
        unitType: value.unitType || '',
        respondedAt: value.respondedAt || null,
        notes: value.notes || '',
    };
};

const pickTransfer = (entry, includeAdministrative) => {
    const value = toPlainObject(entry);
    return {
        id: getEntityId(value),
        fromMunicipalityName: value.fromMunicipalityName || '',
        toMunicipalityName: value.toMunicipalityName || '',
        transferredAt: value.transferredAt || null,
        acknowledgedAt: value.acknowledgedAt || null,
        transferredBy: pickPerson(value.transferredBy),
        acknowledgedBy: pickPerson(value.acknowledgedBy),
        ...(includeAdministrative ? { reason: value.reason || '' } : {}),
    };
};

const pickUpdate = (entry) => {
    const value = toPlainObject(entry);
    return {
        id: getEntityId(value),
        author: pickPerson(value.author),
        authorRole: value.authorRole || '',
        message: value.message || '',
        tag: value.tag || 'general',
        createdAt: value.createdAt || null,
    };
};

/**
 * Dispatch acknowledgement state.
 *
 * Surfaced so an administrator can see that a verified incident has gone
 * unacknowledged, instead of having to infer it from an empty responder list.
 * `unacknowledged` is the single flag the UI needs to raise the alarm.
 */
const pickDispatch = (source) => {
    const value = toPlainObject(source?.dispatch);
    return {
        alertedAt: value.alertedAt || null,
        ackDeadlineAt: value.ackDeadlineAt || null,
        acknowledgedAt: value.acknowledgedAt || null,
        acknowledgedBy: pickPerson(value.acknowledgedBy),
        escalationCount: Number(value.escalationCount) || 0,
        lastEscalatedAt: value.lastEscalatedAt || null,
        unacknowledged: !value.acknowledgedAt
            && Boolean(value.alertedAt)
            && source?.status === 'verified',
    };
};

const buildCore = (source) => ({
    _id: getEntityId(source),
    incidentCategory: source.incidentCategory,
    incidentType: source.incidentType || source.accidentType,
    title: source.title,
    description: source.description || '',
    address: source.address,
    barangay: source.barangay,
    barangayPsgcCode: source.barangayPsgcCode,
    locationConfidence: source.locationConfidence,
    coordinates: source.coordinates,
    locationCapture: source.locationCapture,
    municipality: source.municipality && typeof source.municipality === 'object'
        ? { id: getEntityId(source.municipality), name: source.municipality.name, code: source.municipality.code }
        : undefined,
    municipalityName: source.municipalityName,
    originalMunicipalityName: source.originalMunicipalityName,
    incidentTime: source.incidentTime || source.accidentTime,
    reportedAt: source.reportedAt,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    status: source.status,
    severity: source.severity,
    priority: source.priority,
    viewCount: Number(source.viewCount) || 0,
    // null means "not recorded" and must stay distinct from 0 ("none").
    // Shared with the public serializer so both feeds agree.
    casualties: {
        injured: toSerializableCount(source.casualties?.injured),
        fatalities: toSerializableCount(source.casualties?.fatalities),
        missing: toSerializableCount(source.casualties?.missing),
    },
    verifiedAt: source.verifiedAt,
    respondedAt: source.respondedAt,
    resolvedAt: source.resolvedAt,
    dispatch: pickDispatch(source),
});

export const toOperationalReportSummary = (report) => {
    const source = toPlainObject(report);
    const evidence = buildReportEvidenceObject(source, { isOperational: true });
    return {
        ...buildCore(source),
        reporter: pickPerson(source.reporter),
        respondedBy: pickPerson(source.respondedBy),
        resolvedBy: pickPerson(source.resolvedBy),
        responderAgency: source.responderAgency || null,
        // Full multi-unit set. Without this the operational feed fell back to
        // `responderAgency`, which describes only the first unit.
        respondingAgencies: getRespondingAgencies(source),
        responders: (source.responders || []).map(pickResponder),
        evidence,
        evidenceCount: evidence.evidenceCount,
        updateCount: Array.isArray(source.reportUpdates) ? source.reportUpdates.length : 0,
        transferCount: Array.isArray(source.transferHistory) ? source.transferHistory.length : 0,
        // Names-only transfer trail (no reasons, actors, or timestamps) so
        // queue rows can show provenance and gate origin-only actions.
        transferTrail: (source.transferHistory || []).map((entry) => {
            const value = toPlainObject(entry);
            return {
                fromMunicipalityName: value.fromMunicipalityName || '',
                toMunicipalityName: value.toMunicipalityName || '',
            };
        }),
        detailAccess: 'operational',
        detailCompleteness: 'summary',
    };
};

export const toOperationalReport = (
    report,
    { includeReporterContact = false, includeAdministrative = false } = {},
) => {
    const source = toPlainObject(report);
    const evidence = buildReportEvidenceObject(source, { isOperational: true });
    return {
        ...buildCore(source),
        reporter: pickPerson(source.reporter, { includeEmail: includeReporterContact }),
        images: Array.isArray(source.images) ? source.images : [],
        evidence,
        evidenceCount: evidence.evidenceCount,
        verifiedBy: pickPerson(source.verifiedBy),
        respondedBy: pickPerson(source.respondedBy),
        resolvedBy: pickPerson(source.resolvedBy),
        responderAgency: source.responderAgency || null,
        // Full multi-unit set. Without this the operational feed fell back to
        // `responderAgency`, which describes only the first unit.
        respondingAgencies: getRespondingAgencies(source),
        responders: (source.responders || []).map(pickResponder),
        reportUpdates: (source.reportUpdates || []).map(pickUpdate),
        transferHistory: (source.transferHistory || [])
            .map((entry) => pickTransfer(entry, includeAdministrative)),
        resolutionNotes: source.resolutionNotes || '',
        ...(includeAdministrative ? { rejectionReason: source.rejectionReason || '' } : {}),
        detailAccess: 'operational',
        detailCompleteness: 'full',
    };
};

export default { toOperationalReport, toOperationalReportSummary };

