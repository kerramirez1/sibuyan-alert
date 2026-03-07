/**
 * Location Service
 * 
 * Automated process for:
 * 1. Converting incident addresses to geographic coordinates (geocoding)
 * 2. Determining the nearest municipality for response coordination
 * 
 * This service integrates geocoding, reverse geocoding, and municipality detection
 * into a unified location processing pipeline.
 */

import Municipality from '../models/Municipality.js';
import { geocodeAddress, reverseGeocode, isWithinSibuyanBounds } from './geocoding.js';

/**
 * Sibuyan Island Municipality Boundaries (approximate polygons)
 * Used for determining which municipality a coordinate falls within
 */
const MUNICIPALITY_BOUNDARIES = {
    cajidiocan: {
        name: 'Cajidiocan',
        code: 'CAJ',
        // Eastern part of Sibuyan Island
        bounds: {
            minLat: 12.35,
            maxLat: 12.52,
            minLng: 122.58,
            maxLng: 122.75,
        },
        center: { lat: 12.4044, lng: 122.6897 },
    },
    magdiwang: {
        name: 'Magdiwang',
        code: 'MAG',
        // Northwestern part of Sibuyan Island
        bounds: {
            minLat: 12.42,
            maxLat: 12.55,
            minLng: 122.45,
            maxLng: 122.58,
        },
        center: { lat: 12.4778, lng: 122.5097 },
    },
    san_fernando: {
        name: 'San Fernando',
        code: 'SFD',
        // Southwestern part of Sibuyan Island
        bounds: {
            minLat: 12.28,
            maxLat: 12.42,
            minLng: 122.45,
            maxLng: 122.62,
        },
        center: { lat: 12.3536, lng: 122.5469 },
    },
};

/**
 * Known location aliases in Sibuyan Island
 * Maps common place names to their municipality and approximate coordinates
 */
const SIBUYAN_LOCATION_ALIASES = {
    // Cajidiocan barangays and landmarks
    'poblacion cajidiocan': { municipality: 'cajidiocan', lat: 12.4044, lng: 122.6897 },
    'danao cajidiocan': { municipality: 'cajidiocan', lat: 12.4100, lng: 122.7000 },
    'lumbang este': { municipality: 'cajidiocan', lat: 12.3950, lng: 122.6800 },
    'lumbang weste': { municipality: 'cajidiocan', lat: 12.3900, lng: 122.6750 },
    'cambajao': { municipality: 'cajidiocan', lat: 12.4200, lng: 122.6950 },
    'cambalo': { municipality: 'cajidiocan', lat: 12.4150, lng: 122.7050 },
    'cantagda': { municipality: 'cajidiocan', lat: 12.4250, lng: 122.6850 },
    'dionela': { municipality: 'cajidiocan', lat: 12.3850, lng: 122.6900 },
    'esperanza': { municipality: 'cajidiocan', lat: 12.4300, lng: 122.6800 },
    'gui-ob': { municipality: 'cajidiocan', lat: 12.4000, lng: 122.6600 },
    'lapangan': { municipality: 'cajidiocan', lat: 12.3800, lng: 122.7100 },
    'mabini': { municipality: 'cajidiocan', lat: 12.4350, lng: 122.6750 },
    'taclobo': { municipality: 'cajidiocan', lat: 12.3750, lng: 122.6950 },
    'togbongan': { municipality: 'cajidiocan', lat: 12.4400, lng: 122.6900 },
    'toctoc': { municipality: 'cajidiocan', lat: 12.3900, lng: 122.7150 },

    // Magdiwang barangays and landmarks
    'poblacion magdiwang': { municipality: 'magdiwang', lat: 12.4778, lng: 122.5097 },
    'agsao': { municipality: 'magdiwang', lat: 12.4850, lng: 122.5200 },
    'agutay': { municipality: 'magdiwang', lat: 12.4900, lng: 122.5000 },
    'dulangan': { municipality: 'magdiwang', lat: 12.4700, lng: 122.5300 },
    'ipil': { municipality: 'magdiwang', lat: 12.4950, lng: 122.4900 },
    'jao-asan': { municipality: 'magdiwang', lat: 12.4600, lng: 122.5150 },
    'monbon': { municipality: 'magdiwang', lat: 12.5000, lng: 122.5050 },
    'silum': { municipality: 'magdiwang', lat: 12.4650, lng: 122.4950 },
    'tampayan': { municipality: 'magdiwang', lat: 12.4750, lng: 122.5250 },

    // San Fernando barangays and landmarks
    'poblacion san fernando': { municipality: 'san_fernando', lat: 12.3536, lng: 122.5469 },
    'azagra': { municipality: 'san_fernando', lat: 12.3650, lng: 122.5550 },
    'butong': { municipality: 'san_fernando', lat: 12.3400, lng: 122.5600 },
    'canjalon': { municipality: 'san_fernando', lat: 12.3700, lng: 122.5350 },
    'capingahan': { municipality: 'san_fernando', lat: 12.3300, lng: 122.5500 },
    'danao san fernando': { municipality: 'san_fernando', lat: 12.3600, lng: 122.5700 },
    'españa': { municipality: 'san_fernando', lat: 12.3800, lng: 122.5400 },
    'mabini san fernando': { municipality: 'san_fernando', lat: 12.3450, lng: 122.5300 },
    'otod': { municipality: 'san_fernando', lat: 12.3350, lng: 122.5650 },
    'pili': { municipality: 'san_fernando', lat: 12.3550, lng: 122.5200 },
    'tacloban': { municipality: 'san_fernando', lat: 12.3250, lng: 122.5400 },
    'tuburan': { municipality: 'san_fernando', lat: 12.3750, lng: 122.5600 },

    // Common landmarks
    'cresta de gallo': { municipality: 'san_fernando', lat: 12.2900, lng: 122.5200 },
    'mt. guiting-guiting': { municipality: 'magdiwang', lat: 12.4300, lng: 122.5500 },
    'guiting guiting': { municipality: 'magdiwang', lat: 12.4300, lng: 122.5500 },
    'cantingas river': { municipality: 'san_fernando', lat: 12.3450, lng: 122.5350 },
    'lambingan falls': { municipality: 'san_fernando', lat: 12.3550, lng: 122.5450 },
    'cataja falls': { municipality: 'cajidiocan', lat: 12.4100, lng: 122.6800 },
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const toRad = (deg) => deg * (Math.PI / 180);

/**
 * Check if coordinates fall within a municipality's bounding box
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} bounds - Municipality bounds
 * @returns {boolean}
 */
const isWithinBounds = (lat, lng, bounds) => {
    return (
        lat >= bounds.minLat &&
        lat <= bounds.maxLat &&
        lng >= bounds.minLng &&
        lng <= bounds.maxLng
    );
};

/**
 * Determine municipality from coordinates using bounding boxes
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string | null} Municipality key (cajidiocan, magdiwang, san_fernando) or null
 */
export const getMunicipalityFromCoordinates = (lat, lng) => {
    // Check each municipality's bounds
    for (const [key, muni] of Object.entries(MUNICIPALITY_BOUNDARIES)) {
        if (isWithinBounds(lat, lng, muni.bounds)) {
            return key;
        }
    }

    // If not within any bounds, find the nearest by distance
    let nearestMuni = null;
    let shortestDistance = Infinity;

    for (const [key, muni] of Object.entries(MUNICIPALITY_BOUNDARIES)) {
        const distance = calculateDistance(lat, lng, muni.center.lat, muni.center.lng);
        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestMuni = key;
        }
    }

    return nearestMuni;
};

/**
 * Parse address to find local location matches
 * @param {string} address - The address to parse
 * @returns {object | null} Matched location with coordinates or null
 */
export const parseLocalAddress = (address) => {
    if (!address) return null;

    const normalizedAddress = address.toLowerCase().trim();

    // Direct match
    if (SIBUYAN_LOCATION_ALIASES[normalizedAddress]) {
        return SIBUYAN_LOCATION_ALIASES[normalizedAddress];
    }

    // Partial match - find location keywords in the address
    for (const [locationName, locationData] of Object.entries(SIBUYAN_LOCATION_ALIASES)) {
        if (normalizedAddress.includes(locationName) || locationName.includes(normalizedAddress)) {
            return locationData;
        }
    }

    // Check for municipality names to at least identify the area
    if (normalizedAddress.includes('cajidiocan')) {
        return { municipality: 'cajidiocan', ...MUNICIPALITY_BOUNDARIES.cajidiocan.center };
    }
    if (normalizedAddress.includes('magdiwang')) {
        return { municipality: 'magdiwang', ...MUNICIPALITY_BOUNDARIES.magdiwang.center };
    }
    if (normalizedAddress.includes('san fernando') || normalizedAddress.includes('sanfernando')) {
        return { municipality: 'san_fernando', ...MUNICIPALITY_BOUNDARIES.san_fernando.center };
    }

    return null;
};

/**
 * Main location processing function
 * Converts address to coordinates and determines nearest municipality
 * 
 * @param {object} options - Processing options
 * @param {string} options.address - Address to geocode (optional if lat/lng provided)
 * @param {string} options.barangay - Barangay name (optional, helps with local matching)
 * @param {number} options.lat - Latitude (optional if address provided)
 * @param {number} options.lng - Longitude (optional if address provided)
 * @returns {Promise<object>} Processed location result
 */
export const processLocation = async ({ address, barangay, lat, lng }) => {
    const result = {
        success: false,
        coordinates: null,
        address: null,
        municipality: null,
        municipalityId: null,
        municipalityName: null,
        source: null, // 'provided', 'local', 'geocoded', 'reverse_geocoded'
        warnings: [],
    };

    try {
        // STEP 1: If coordinates are provided, use them
        if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
            result.coordinates = { lat: parseFloat(lat), lng: parseFloat(lng) };
            result.source = 'provided';

            // Validate Sibuyan bounds
            if (!isWithinSibuyanBounds(result.coordinates.lat, result.coordinates.lng)) {
                result.warnings.push('Coordinates are outside Sibuyan Island bounds');
            }

            // Get address if not provided
            if (!address) {
                const reverseResult = await reverseGeocode(result.coordinates.lat, result.coordinates.lng);
                if (reverseResult) {
                    result.address = reverseResult.address;
                } else {
                    result.address = `${result.coordinates.lat.toFixed(6)}, ${result.coordinates.lng.toFixed(6)}`;
                }
            } else {
                result.address = address;
            }
        }
        // STEP 2: Try local address parsing first (faster, no API call)
        else if (address || barangay) {
            const searchAddress = barangay ? `${barangay} ${address || ''}` : address;
            const localMatch = parseLocalAddress(searchAddress);

            if (localMatch) {
                result.coordinates = { lat: localMatch.lat, lng: localMatch.lng };
                result.address = address || barangay;
                result.source = 'local';
            }
            // STEP 3: Fall back to external geocoding API
            else {
                const geocodeResult = await geocodeAddress(searchAddress);

                if (geocodeResult) {
                    result.coordinates = { lat: geocodeResult.lat, lng: geocodeResult.lng };
                    result.address = geocodeResult.displayName || address;
                    result.source = 'geocoded';

                    // Validate Sibuyan bounds
                    if (!isWithinSibuyanBounds(result.coordinates.lat, result.coordinates.lng)) {
                        result.warnings.push('Geocoded location is outside Sibuyan Island bounds');
                    }
                } else {
                    result.warnings.push('Could not geocode address');
                    return result;
                }
            }
        } else {
            result.warnings.push('No address or coordinates provided');
            return result;
        }

        // STEP 4: Determine municipality from coordinates
        if (result.coordinates) {
            // First try the database
            try {
                const nearestMuni = await Municipality.findNearest(
                    result.coordinates.lat,
                    result.coordinates.lng
                );

                if (nearestMuni) {
                    result.municipality = nearestMuni;
                    result.municipalityId = nearestMuni._id;
                    result.municipalityName = nearestMuni.name;
                }
            } catch (dbError) {
                console.warn('Database municipality lookup failed:', dbError.message);
            }

            // Fallback to local boundary check if database lookup failed
            if (!result.municipalityName) {
                const muniKey = getMunicipalityFromCoordinates(
                    result.coordinates.lat,
                    result.coordinates.lng
                );

                if (muniKey && MUNICIPALITY_BOUNDARIES[muniKey]) {
                    result.municipalityName = MUNICIPALITY_BOUNDARIES[muniKey].name;
                    // Try to get the ID from database
                    try {
                        const muni = await Municipality.findOne({
                            name: { $regex: new RegExp(result.municipalityName, 'i') }
                        });
                        if (muni) {
                            result.municipality = muni;
                            result.municipalityId = muni._id;
                        }
                    } catch (e) {
                        // Ignore, we at least have the name
                    }
                }
            }

            result.success = true;
        }

        return result;

    } catch (error) {
        console.error('Location processing error:', error);
        result.warnings.push(`Processing error: ${error.message}`);
        return result;
    }
};

/**
 * Get estimated response time based on distance from municipal center
 * @param {number} lat - Incident latitude
 * @param {number} lng - Incident longitude
 * @param {string} municipalityName - Municipality name
 * @returns {object} Response time estimate
 */
export const getResponseTimeEstimate = (lat, lng, municipalityName) => {
    const normalizedName = municipalityName?.toLowerCase().replace(/\s+/g, '_');
    const muniData = MUNICIPALITY_BOUNDARIES[normalizedName];

    if (!muniData) {
        return { minutes: null, distance: null, category: 'unknown' };
    }

    const distance = calculateDistance(lat, lng, muniData.center.lat, muniData.center.lng);

    // Estimate based on Sibuyan Island road conditions
    // Average speed: ~30 km/h due to terrain
    const estimatedMinutes = Math.ceil((distance / 30) * 60);

    let category;
    if (estimatedMinutes <= 10) {
        category = 'immediate';
    } else if (estimatedMinutes <= 20) {
        category = 'quick';
    } else if (estimatedMinutes <= 40) {
        category = 'moderate';
    } else {
        category = 'extended';
    }

    return {
        minutes: estimatedMinutes,
        distance: Math.round(distance * 10) / 10, // Round to 1 decimal
        category,
    };
};

/**
 * Get all municipalities with their emergency contacts
 * @returns {Promise<Array>} Array of municipality data
 */
export const getMunicipalitiesWithContacts = async () => {
    try {
        const municipalities = await Municipality.find({ isActive: true })
            .select('name code center emergencyContacts responseCapabilities barangays');
        return municipalities;
    } catch (error) {
        console.error('Failed to get municipalities:', error);
        // Return static data as fallback
        return Object.values(MUNICIPALITY_BOUNDARIES).map(m => ({
            name: m.name,
            code: m.code,
            center: m.center,
        }));
    }
};

/**
 * Validate and normalize barangay name
 * @param {string} barangayName - Barangay name to validate
 * @returns {object} Validation result with normalized name and municipality
 */
export const validateBarangay = (barangayName) => {
    if (!barangayName) {
        return { valid: false, normalized: null, municipality: null };
    }

    const normalized = barangayName.toLowerCase().trim();

    // Check against known barangays
    for (const [locationName, locationData] of Object.entries(SIBUYAN_LOCATION_ALIASES)) {
        if (locationName.includes(normalized) || normalized.includes(locationName.split(' ')[0])) {
            const muniData = MUNICIPALITY_BOUNDARIES[locationData.municipality];
            return {
                valid: true,
                normalized: locationName,
                municipality: muniData?.name || locationData.municipality,
            };
        }
    }

    return { valid: false, normalized: barangayName, municipality: null };
};

export default {
    processLocation,
    calculateDistance,
    getMunicipalityFromCoordinates,
    parseLocalAddress,
    getResponseTimeEstimate,
    getMunicipalitiesWithContacts,
    validateBarangay,
    MUNICIPALITY_BOUNDARIES,
    SIBUYAN_LOCATION_ALIASES,
};
