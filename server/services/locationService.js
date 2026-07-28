/**
 * Location processing for incident reports.
 *
 * Coordinates are the source of truth. Municipality assignment is intentionally
 * conservative: an incident is never silently routed to the nearest municipality.
 */
import Municipality from '../models/Municipality.js';
import { geocodeAddress, reverseGeocode, isWithinSibuyanBounds } from './geocoding.js';
import { resolveBarangayForCoordinates } from './barangayBoundaryService.js';
import {
    findOfficialBarangay,
    isCoordinatePair,
    resolveMunicipalityByBounds,
} from '../utils/locationPolicy.js';

export const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const radiusKm = 6371;
    const toRadians = (value) => value * (Math.PI / 180);
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getActiveMunicipalities = () => Municipality.find({ isActive: true })
    .select('name code center bounds barangays');

/**
 * Returns a municipality only when one configured coverage box matches. The
 * boxes are an operational guard, not cadastral boundaries; overlapping boxes
 * remain ambiguous for administrator review instead of using a distance guess.
 */
export const resolveMunicipalityForCoordinates = async (lat, lng) => {
    const municipalities = await getActiveMunicipalities();
    return resolveMunicipalityByBounds(lat, lng, municipalities);
};

export const getMunicipalityFromCoordinates = async (lat, lng) => {
    const result = await resolveMunicipalityForCoordinates(lat, lng);
    return result.municipality?.name || null;
};

export const validateBarangay = (barangayName) => {
    const match = findOfficialBarangay(barangayName);
    return match
        ? { valid: true, normalized: match.name, municipality: match.municipality }
        : { valid: false, normalized: barangayName || null, municipality: null };
};

const buildFallbackAddress = (coordinates) => `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`;

export const processLocation = async ({ address, barangay, lat, lng }) => {
    const result = {
        success: false,
        coordinates: null,
        address: null,
        municipality: null,
        municipalityId: null,
        municipalityName: null,
        municipalityAssignment: 'unassigned',
        barangay: null,
        barangayPsgcCode: null,
        barangayAssignment: 'unmatched',
        source: null,
        addressDetails: null,
        warnings: [],
    };

    try {
        if ((lat !== undefined || lng !== undefined) && !isCoordinatePair(lat, lng)) {
            result.warnings.push('Latitude and longitude must be provided together as valid numbers.');
            return result;
        }

        if (isCoordinatePair(lat, lng)) {
            result.coordinates = { lat: Number(lat), lng: Number(lng) };
            result.source = 'provided';
            if (!isWithinSibuyanBounds(result.coordinates.lat, result.coordinates.lng)) {
                result.warnings.push('Coordinates are outside Sibuyan Island bounds.');
                return result;
            }

            result.address = address?.trim() || null;
            if (!result.address) {
                const reverseResult = await reverseGeocode(result.coordinates.lat, result.coordinates.lng);
                result.address = reverseResult?.address || buildFallbackAddress(result.coordinates);
                result.addressDetails = reverseResult?.details || null;
            }
        } else if (address?.trim() || barangay?.trim()) {
            const barangayMatch = findOfficialBarangay(barangay);
            const query = [address?.trim(), barangayMatch?.name || barangay?.trim(), 'Sibuyan Island, Romblon, Philippines']
                .filter(Boolean)
                .join(', ');
            const geocoded = await geocodeAddress(query);
            if (!geocoded || !isWithinSibuyanBounds(geocoded.lat, geocoded.lng)) {
                result.warnings.push('Could not find this address within Sibuyan Island. Select the incident position on the map instead.');
                return result;
            }
            result.coordinates = { lat: geocoded.lat, lng: geocoded.lng };
            result.address = address?.trim() || geocoded.displayName;
            result.source = 'geocoded';
        } else {
            result.warnings.push('No address or coordinates provided.');
            return result;
        }

        const barangayResolution = await resolveBarangayForCoordinates(result.coordinates.lat, result.coordinates.lng);
        result.barangayAssignment = barangayResolution.status;

        if (barangayResolution.status === 'matched') {
            const boundaryBarangay = barangayResolution.barangay;
            const municipality = await Municipality.findOne({ name: boundaryBarangay.municipalityName, isActive: true })
                .select('name code center bounds barangays');
            if (!municipality) {
                result.warnings.push(`Boundary matched ${boundaryBarangay.name}, but its municipality configuration is unavailable.`);
                return result;
            }

            result.barangay = boundaryBarangay.name;
            result.barangayPsgcCode = boundaryBarangay.psgcCode;
            result.municipality = municipality;
            result.municipalityId = municipality._id;
            result.municipalityName = municipality.name;
            result.municipalityAssignment = 'matched';
        } else {
            // Boundary data may not yet be imported in a newly deployed environment.
            // Municipal box assignment remains a safe fallback, but never invents a barangay.
            const assignment = await resolveMunicipalityForCoordinates(result.coordinates.lat, result.coordinates.lng);
            result.municipalityAssignment = assignment.status;
            if (assignment.municipality) {
                result.municipality = assignment.municipality;
                result.municipalityId = assignment.municipality._id;
                result.municipalityName = assignment.municipality.name;
            } else if (assignment.status === 'ambiguous') {
                result.warnings.push('Location is on an overlapping municipal coverage boundary and requires administrator assignment.');
            } else {
                result.warnings.push('Location is not inside a configured municipal coverage area and requires administrator assignment.');
            }
        }

        result.success = true;
        return result;
    } catch (error) {
        console.error('Location processing error:', error);
        result.warnings.push('Location processing is temporarily unavailable. Please retry.');
        return result;
    }
};

export const getResponseTimeEstimate = (lat, lng, municipality) => {
    const center = municipality?.center;
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
        return { minutes: null, distance: null, category: 'unknown' };
    }
    const distance = calculateDistance(lat, lng, center.lat, center.lng);
    const minutes = Math.ceil((distance / 30) * 60);
    return {
        minutes,
        distance: Math.round(distance * 10) / 10,
        category: minutes <= 10 ? 'immediate' : minutes <= 20 ? 'quick' : minutes <= 40 ? 'moderate' : 'extended',
    };
};

export const getMunicipalitiesWithContacts = async () => getActiveMunicipalities()
    .select('name code center emergencyContacts responseCapabilities barangays');

export default {
    processLocation,
    calculateDistance,
    getMunicipalityFromCoordinates,
    resolveMunicipalityForCoordinates,
    getResponseTimeEstimate,
    getMunicipalitiesWithContacts,
    validateBarangay,
};
