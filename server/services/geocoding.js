/** Nominatim gateway. Keeps the provider key and rate policy on the server. */
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const MIN_REQUEST_INTERVAL = 1000;
const SIBUYAN_VIEWBOX = '122.45,12.55,122.70,12.30';
let requestQueue = Promise.resolve();
let lastRequestTime = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestNominatim = (path, params) => {
    const run = async () => {
        const delay = Math.max(0, MIN_REQUEST_INTERVAL - (Date.now() - lastRequestTime));
        if (delay) await wait(delay);
        lastRequestTime = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`${NOMINATIM_BASE_URL}${path}?${new URLSearchParams(params)}`, {
                headers: {
                    'User-Agent': 'SibuyanAccidentAlert/1.0 (sibuyan.alert@gmail.com)',
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Geocoding provider responded with ${response.status}`);
            return response.json();
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error('Geocoding provider timed out');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const queued = requestQueue.then(run, run);
    requestQueue = queued.catch(() => undefined);
    return queued;
};

const hasValidCoordinates = (result) => Number.isFinite(Number(result?.lat)) && Number.isFinite(Number(result?.lon));
const toSearchRecord = (result) => ({
    placeId: result.place_id,
    lat: Number(result.lat),
    lng: Number(result.lon),
    displayName: result.display_name,
    address: result.address || {},
});

const withSibuyanContext = (address) => address.toLowerCase().includes('sibuyan')
    ? address
    : `${address}, Sibuyan Island, Romblon, Philippines`;

export const searchSibuyanLocations = async (query, limit = 5) => {
    try {
        const data = await requestNominatim('/search', {
            q: withSibuyanContext(query.trim()),
            format: 'jsonv2',
            limit: String(Math.min(Math.max(Number(limit) || 5, 1), 5)),
            addressdetails: '1',
            countrycodes: 'ph',
            viewbox: SIBUYAN_VIEWBOX,
            bounded: '1',
        });
        return data.filter(hasValidCoordinates).filter((result) => isWithinSibuyanBounds(Number(result.lat), Number(result.lon))).map(toSearchRecord);
    } catch (error) {
        console.error('Location search error:', error.message);
        return [];
    }
};

export const geocodeAddress = async (address) => {
    const results = await searchSibuyanLocations(address, 1);
    return results[0] || null;
};

export const reverseGeocode = async (lat, lng) => {
    try {
        if (!isWithinSibuyanBounds(lat, lng)) return null;
        const data = await requestNominatim('/reverse', {
            lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '18',
        });
        if (!data?.display_name) return null;
        return {
            address: data.display_name,
            details: data.address || {},
            featureName: data.name || '',
        };
    } catch (error) {
        console.error('Reverse geocoding error:', error.message);
        return null;
    }
};

export const isWithinSibuyanBounds = (lat, lng) => (
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Number(lat) >= 12.30 && Number(lat) <= 12.55
    && Number(lng) >= 122.45 && Number(lng) <= 122.70
);

export const getSibuyanBounds = () => ({
    center: { lat: 12.4176, lng: 122.5571 },
    bounds: { southwest: { lat: 12.30, lng: 122.45 }, northeast: { lat: 12.55, lng: 122.70 } },
    defaultZoom: 12,
    minZoom: 10,
    // Keep API consumers within the highest imagery level with complete
    // operational coverage across Sibuyan Island.
    maxZoom: 16,
});

export default { geocodeAddress, searchSibuyanLocations, reverseGeocode, isWithinSibuyanBounds, getSibuyanBounds };
