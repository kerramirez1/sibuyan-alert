/**
 * Geocoding service using OpenStreetMap Nominatim API (free)
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// Rate limiting - Nominatim requires max 1 request per second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Convert address to coordinates
 * @param {string} address - The address to geocode
 * @returns {Promise<{lat: number, lng: number, displayName: string} | null>}
 */
export const geocodeAddress = async (address) => {
    try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            await wait(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
        }
        lastRequestTime = Date.now();

        // Add Sibuyan Island context to improve results
        const searchQuery = address.toLowerCase().includes('sibuyan')
            ? address
            : `${address}, Sibuyan Island, Romblon, Philippines`;

        const params = new URLSearchParams({
            q: searchQuery,
            format: 'json',
            limit: '1',
            addressdetails: '1',
            countrycodes: 'ph', // Limit to Philippines
        });

        const response = await fetch(
            `${NOMINATIM_BASE_URL}/search?${params}`,
            {
                headers: {
                    'User-Agent': 'SibuyanAccidentAlert/1.0 (sibuyan.alert@gmail.com)',
                    Accept: 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Geocoding API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.length === 0) {
            return null;
        }

        const result = data[0];
        return {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            displayName: result.display_name,
            address: result.address,
        };
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
};

/**
 * Convert coordinates to address (reverse geocoding)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{address: string, details: object} | null>}
 */
export const reverseGeocode = async (lat, lng) => {
    try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            await wait(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
        }
        lastRequestTime = Date.now();

        const params = new URLSearchParams({
            lat: lat.toString(),
            lon: lng.toString(),
            format: 'json',
            addressdetails: '1',
            zoom: '18', // High detail level
        });

        const response = await fetch(
            `${NOMINATIM_BASE_URL}/reverse?${params}`,
            {
                headers: {
                    'User-Agent': 'SibuyanAccidentAlert/1.0 (sibuyan.alert@gmail.com)',
                    Accept: 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Reverse geocoding API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.display_name) {
            return null;
        }

        return {
            address: data.display_name,
            details: data.address,
        };
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return null;
    }
};

/**
 * Check if coordinates are within Sibuyan Island bounds
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean}
 */
export const isWithinSibuyanBounds = (lat, lng) => {
    const sibuyanBounds = {
        minLat: 12.30,
        maxLat: 12.55,
        minLng: 122.45,
        maxLng: 122.70,
    };

    return (
        lat >= sibuyanBounds.minLat &&
        lat <= sibuyanBounds.maxLat &&
        lng >= sibuyanBounds.minLng &&
        lng <= sibuyanBounds.maxLng
    );
};

/**
 * Get Sibuyan Island bounds for map configuration
 */
export const getSibuyanBounds = () => ({
    center: { lat: 12.4176, lng: 122.5571 },
    bounds: {
        southwest: { lat: 12.30, lng: 122.45 },
        northeast: { lat: 12.55, lng: 122.70 },
    },
    defaultZoom: 12,
    minZoom: 10,
    maxZoom: 18,
});

export default {
    geocodeAddress,
    reverseGeocode,
    isWithinSibuyanBounds,
    getSibuyanBounds,
};
