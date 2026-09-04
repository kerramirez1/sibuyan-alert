const TITLE_CASE_PATTERN = /\b\w/g;

export const formatIncidentLabel = (value, fallback = 'Incident') => {
    if (!value || typeof value !== 'string') return fallback;
    return value
        .replace(/_/g, ' ')
        .trim()
        .replace(TITLE_CASE_PATTERN, (letter) => letter.toUpperCase());
};

/**
 * Normalizes a single casualty metric value.
 * - Non-negative finite number (or string representation of integer): returns integer >= 0.
 * - Explicit 0 is preserved as 0.
 * - null, undefined, '', NaN, negative, or invalid non-numeric string: returns 'Not recorded'.
 */
export const formatCasualtyMetric = (value) => {
    if (value === null || value === undefined || value === '') {
        return 'Not recorded';
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return 'Not recorded';
    }
    return Math.floor(num);
};

/**
 * Normalizes a complete casualties object into individual metric values and aggregates.
 * Used across MapIncidentDetails, IncidentDetailsCasualtiesSection, and IncidentDetailsCoreSection.
 */
export const normalizeCasualties = (casualties) => {
    const raw = casualties && typeof casualties === 'object' ? casualties : {};
    const injured = formatCasualtyMetric(raw.injured);
    const fatalities = formatCasualtyMetric(raw.fatalities);
    const missing = formatCasualtyMetric(raw.missing);

    const injuredNum = typeof injured === 'number' ? injured : 0;
    const fatalitiesNum = typeof fatalities === 'number' ? fatalities : 0;
    const missingNum = typeof missing === 'number' ? missing : 0;
    const totalPeopleAffected = injuredNum + fatalitiesNum + missingNum;

    const hasRecordedValue = typeof injured === 'number' || typeof fatalities === 'number' || typeof missing === 'number';
    const hasAnyNonZero = injuredNum > 0 || fatalitiesNum > 0 || missingNum > 0;
    const isAllZeroOrUnrecorded = !hasAnyNonZero;

    return {
        injured,
        fatalities,
        missing,
        injuredNum,
        fatalitiesNum,
        missingNum,
        totalPeopleAffected,
        hasRecordedValue,
        hasAnyNonZero,
        isAllZeroOrUnrecorded,
    };
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
    const safetyIndicators = [];

    if (report.fireInvolved) safetyIndicators.push('Fire or explosion involved');
    if (report.hazardousCondition || report.hazardInvolved) safetyIndicators.push('Hazardous condition');
    if (report.roadBlocked) safetyIndicators.push('Road blocked');
    if (report.warningIssued || report.publicWarning) safetyIndicators.push('Immediate public-safety warning');

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

/**
 * Origin municipality for transferred incidents (display helper).
 *
 * Transfer rewrites the handling municipality so the receiving office owns
 * the queue, RBAC scope, and alerts — but the physical incident location
 * never moves. Returns the origin name only when the report actually went
 * through a transfer and the origin differs from current handling;
 * otherwise null (nothing to disambiguate).
 */
export const getTransferOrigin = (report = {}) => {
    if (!report || !Array.isArray(report.transferHistory) || report.transferHistory.length === 0) {
        return null;
    }
    const current = report.municipalityName || report.municipality?.name || '';
    const origin = report.originalMunicipalityName
        || report.transferHistory[0]?.fromMunicipalityName
        || '';
    if (!origin) return null;
    if (current && origin.toLowerCase() === current.toLowerCase()) return null;
    return origin;
};

