import { getEntityId } from './reportAccess.js';

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
    fireInvolved: Boolean(source.fireInvolved),
    fireType: source.fireType || null,
    casualties: {
        injured: Number(source.casualties?.injured) || 0,
        fatalities: Number(source.casualties?.fatalities) || 0,
        missing: Number(source.casualties?.missing) || 0,
    },
    affectedArea: {
        radius: Number(source.affectedArea?.radius) || 0,
        householdsAffected: Number(source.affectedArea?.householdsAffected) || 0,
        evacuees: Number(source.affectedArea?.evacuees) || 0,
    },
    verifiedAt: source.verifiedAt,
    respondedAt: source.respondedAt,
    resolvedAt: source.resolvedAt,
});

export const toOperationalReportSummary = (report) => {
    const source = toPlainObject(report);
    return {
        ...buildCore(source),
        reporter: pickPerson(source.reporter),
        respondedBy: pickPerson(source.respondedBy),
        resolvedBy: pickPerson(source.resolvedBy),
        responderAgency: source.responderAgency || null,
        responders: (source.responders || []).map(pickResponder),
        evidenceCount: Array.isArray(source.images) ? source.images.length : 0,
        updateCount: Array.isArray(source.reportUpdates) ? source.reportUpdates.length : 0,
        transferCount: Array.isArray(source.transferHistory) ? source.transferHistory.length : 0,
        detailAccess: 'operational',
        detailCompleteness: 'summary',
    };
};

export const toOperationalReport = (
    report,
    { includeReporterContact = false, includeAdministrative = false } = {},
) => {
    const source = toPlainObject(report);
    return {
        ...buildCore(source),
        reporter: pickPerson(source.reporter, { includeEmail: includeReporterContact }),
        images: Array.isArray(source.images) ? source.images : [],
        evidenceCount: Array.isArray(source.images) ? source.images.length : 0,
        verifiedBy: pickPerson(source.verifiedBy),
        respondedBy: pickPerson(source.respondedBy),
        resolvedBy: pickPerson(source.resolvedBy),
        responderAgency: source.responderAgency || null,
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
