const TITLE_CASE_PATTERN = /\b\w/g;

export const formatIncidentLabel = (value, fallback = 'Incident') => {
    if (!value || typeof value !== 'string') return fallback;
    return value
        .replace(/_/g, ' ')
        .trim()
        .replace(TITLE_CASE_PATTERN, (letter) => letter.toUpperCase());
};

const toCount = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

export const getIncidentDetailViewModel = (report = {}) => {
    const typeLabel = formatIncidentLabel(
        report.incidentType || report.accidentType,
        'Incident',
    );
    const municipality = report.municipalityName || report.municipality?.name || '';
    const locationParts = [report.address, report.barangay, municipality]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
    const respondingAgencies = Array.from(new Set([
        ...(Array.isArray(report.respondingAgencies) ? report.respondingAgencies : []),
        report.responderAgency,
    ].filter(Boolean)));
    const injured = toCount(report.casualties?.injured);
    const fatalities = toCount(report.casualties?.fatalities);
    const missing = toCount(report.casualties?.missing);
    const safetyIndicators = [];

    if (injured > 0) safetyIndicators.push(`${injured} injured`);
    if (fatalities > 0) safetyIndicators.push(`${fatalities} fatal${fatalities === 1 ? 'ity' : 'ities'}`);
    if (missing > 0) safetyIndicators.push(`${missing} missing`);
    if (report.fireInvolved) safetyIndicators.push('Fire or explosion involved');

    return {
        id: report._id || report.id || '',
        status: report.status || 'verified',
        severity: report.severity || 'moderate',
        typeLabel,
        title: report.title || `${typeLabel} incident`,
        location: locationParts.join(', ') || 'Verified location unavailable',
        barangay: report.barangay || 'Not specified',
        municipality: municipality || 'Not specified',
        incidentTime: report.incidentTime || report.createdAt || null,
        updatedAt: report.updatedAt || report.verifiedAt || null,
        description: report.description?.trim() || 'No description provided.',
        respondingAgencies,
        safetyIndicators,
        isOwnedByCurrentUser: Boolean(report.isOwnedByCurrentUser),
    };
};

