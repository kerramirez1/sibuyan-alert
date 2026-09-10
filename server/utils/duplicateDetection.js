/**
 * Duplicate-incident detection.
 *
 * Two verified reporters can witness the same crash and both file a report,
 * which produces two dispatches for one event. This module answers one
 * question — "does this new report describe an incident we already know
 * about?" — and hands the decision back to a human.
 *
 * It is deliberately pure: the caller fetches candidate reports, this module
 * only does the arithmetic. No database, no I/O, no clock of its own.
 */

// A crash reported twice is almost always reported within the hour.
export const DUPLICATE_WINDOW_MINUTES = 60;
// Same crash site, allowing for GPS drift and pin placement.
export const DUPLICATE_RADIUS_METERS = 250;
// Enough context for the reporter to recognise the other report, not a feed.
export const MAX_DUPLICATE_CANDIDATES = 5;

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres between two WGS84 points.
 * Kept local so this module stays free of service/model imports.
 */
export const distanceMeters = (lat1, lng1, lat2, lng2) => {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const readCoordinates = (value) => {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const readTime = (value) => {
    if (value === undefined || value === null) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Finds existing reports that plausibly describe the same incident.
 *
 * A candidate must be:
 *   - not already rejected (a rejected report is not a live dispatch),
 *   - within `radiusMeters` of the new pin,
 *   - whose incident time is within `windowMinutes` of the new incident time.
 *
 * Incident type is reported back as a signal but is deliberately NOT a gate:
 * a bystander describing a motorcycle crash as "vehicular" is still the same
 * crash. A false prompt costs the reporter one click; a missed duplicate
 * costs a wasted dispatch. Municipal scope is enforced by the caller's query,
 * never here, so this function cannot leak across jurisdictions.
 *
 * @returns {Array<object>} matching candidates, nearest first
 */
export const findDuplicateCandidates = ({
    candidates = [],
    coordinates,
    incidentTime,
    incidentType = null,
    windowMinutes = DUPLICATE_WINDOW_MINUTES,
    radiusMeters = DUPLICATE_RADIUS_METERS,
    limit = MAX_DUPLICATE_CANDIDATES,
} = {}) => {
    const origin = readCoordinates(coordinates);
    const referenceTime = readTime(incidentTime);
    if (!origin || !referenceTime || !Array.isArray(candidates)) return [];

    return candidates
        .filter((candidate) => candidate && candidate.status !== 'rejected')
        .map((candidate) => {
            const point = readCoordinates(candidate.coordinates);
            if (!point) return null;

            const candidateTime = readTime(candidate.incidentTime) ?? readTime(candidate.createdAt);
            if (!candidateTime) return null;

            const metres = distanceMeters(origin.lat, origin.lng, point.lat, point.lng);
            if (metres > radiusMeters) return null;

            const minutesAgo = Math.abs(referenceTime.getTime() - candidateTime.getTime()) / 60000;
            if (minutesAgo > windowMinutes) return null;

            return {
                reportId: candidate._id ?? candidate.id ?? null,
                status: candidate.status ?? null,
                incidentType: candidate.incidentType ?? null,
                address: candidate.address ?? null,
                barangay: candidate.barangay ?? null,
                reportedAt: candidate.createdAt ?? null,
                distanceMeters: Math.round(metres),
                minutesAgo: Math.round(minutesAgo),
                typeMatch: incidentType !== null && candidate.incidentType === incidentType,
            };
        })
        .filter(Boolean)
        .sort((a, b) => (a.distanceMeters - b.distanceMeters) || (a.minutesAgo - b.minutesAgo))
        .slice(0, limit);
};

export default { findDuplicateCandidates, distanceMeters };
