import { SIBUYAN_LOCATIONS } from '../config/sibuyanLocations.js';

export const LOCATION_SOURCES = Object.freeze(['gps', 'map_pin', 'search', 'address_geocoded', 'legacy']);
export const MAX_GPS_ACCURACY_METERS = 100;

export const normalizeLocationName = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const findOfficialBarangay = (barangay) => {
    const normalizedBarangay = normalizeLocationName(barangay);
    if (!normalizedBarangay) return null;

    for (const [municipality, details] of Object.entries(SIBUYAN_LOCATIONS)) {
        const name = details.barangays.find((candidate) => normalizeLocationName(candidate) === normalizedBarangay);
        if (name) return { municipality, name };
    }

    return null;
};

export const isCoordinatePair = (lat, lng) => (
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
);

export const isWithinBounds = (lat, lng, bounds) => (
    Boolean(bounds)
    && Number(lat) >= bounds.minLat
    && Number(lat) <= bounds.maxLat
    && Number(lng) >= bounds.minLng
    && Number(lng) <= bounds.maxLng
);

/**
 * Bounding boxes are only a conservative dispatch guard, not legal municipal polygons.
 * Ambiguous or unmatched positions stay unassigned rather than being silently routed to
 * the nearest municipality.
 */
export const resolveMunicipalityByBounds = (lat, lng, municipalities = []) => {
    const matches = municipalities.filter((municipality) => isWithinBounds(lat, lng, municipality.bounds));
    if (matches.length === 1) return { status: 'matched', municipality: matches[0] };
    if (matches.length > 1) return { status: 'ambiguous', municipality: null };
    return { status: 'unassigned', municipality: null };
};

export const parseLocationCapture = ({ locationSource, locationAccuracy, locationCapturedAt } = {}) => {
    const source = LOCATION_SOURCES.includes(locationSource) ? locationSource : 'legacy';
    const accuracyMeters = locationAccuracy === undefined || locationAccuracy === ''
        ? null
        : Number(locationAccuracy);
    const capturedAt = locationCapturedAt ? new Date(locationCapturedAt) : null;

    if (accuracyMeters !== null && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000)) {
        return { valid: false, message: 'Location accuracy must be a valid number of meters.' };
    }
    if (capturedAt && Number.isNaN(capturedAt.getTime())) {
        return { valid: false, message: 'Location capture time is invalid.' };
    }
    if (source === 'gps' && (accuracyMeters === null || accuracyMeters > MAX_GPS_ACCURACY_METERS)) {
        return { valid: false, message: `GPS accuracy must be ${MAX_GPS_ACCURACY_METERS} meters or better. Please retry GPS or pin the incident on the map.` };
    }

    return {
        valid: true,
        value: {
            source,
            accuracyMeters,
            capturedAt: capturedAt || new Date(),
        },
    };
};
