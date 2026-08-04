const toNonNegativeInteger = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const getDocumentValue = (document, key) => document?.[key];

const getEntityId = (entity) => {
    if (!entity) return '';
    const id = entity._id ?? entity.id ?? entity;
    return id?.toString?.() || String(id);
};

const getPublicMunicipality = (municipality) => {
    if (!municipality || typeof municipality !== 'object') return undefined;
    const value = {};
    if (municipality.name) value.name = municipality.name;
    if (municipality.code) value.code = municipality.code;
    return Object.keys(value).length ? value : undefined;
};

const getRespondingAgencies = (report) => {
    const agencies = new Set();
    if (report?.responderAgency) agencies.add(report.responderAgency);
    for (const responder of report?.responders || []) {
        if (responder?.unitType) agencies.add(responder.unitType);
    }
    return [...agencies];
};

/**
 * Build the only report representation allowed on public feeds.
 * The allowlist is intentional: new private model fields do not become public
 * automatically when the Report schema evolves.
 */
export const toPublicReport = (report, { viewerId } = {}) => {
    const reporterId = getEntityId(getDocumentValue(report, 'reporter'));
    const currentViewerId = getEntityId(viewerId);
    const municipality = getPublicMunicipality(getDocumentValue(report, 'municipality'));
    const casualties = getDocumentValue(report, 'casualties') || {};
    const publicReport = {
        _id: getEntityId(getDocumentValue(report, '_id')),
        incidentCategory: getDocumentValue(report, 'incidentCategory'),
        incidentType: getDocumentValue(report, 'incidentType'),
        title: getDocumentValue(report, 'title'),
        description: getDocumentValue(report, 'description') || '',
        address: getDocumentValue(report, 'address'),
        barangay: getDocumentValue(report, 'barangay'),
        municipalityName: getDocumentValue(report, 'municipalityName'),
        coordinates: getDocumentValue(report, 'coordinates'),
        incidentTime: getDocumentValue(report, 'incidentTime'),
        status: getDocumentValue(report, 'status'),
        severity: getDocumentValue(report, 'severity'),
        fireInvolved: Boolean(getDocumentValue(report, 'fireInvolved')),
        casualties: {
            injured: toNonNegativeInteger(casualties.injured),
            fatalities: toNonNegativeInteger(casualties.fatalities),
            missing: toNonNegativeInteger(casualties.missing),
        },
        respondingAgencies: getRespondingAgencies(report),
        verifiedAt: getDocumentValue(report, 'verifiedAt'),
        respondedAt: getDocumentValue(report, 'respondedAt'),
        resolvedAt: getDocumentValue(report, 'resolvedAt'),
        createdAt: getDocumentValue(report, 'createdAt'),
        updatedAt: getDocumentValue(report, 'updatedAt'),
        isOwnedByCurrentUser: Boolean(currentViewerId && reporterId && currentViewerId === reporterId),
    };

    if (municipality) publicReport.municipality = municipality;
    return publicReport;
};

export default toPublicReport;
