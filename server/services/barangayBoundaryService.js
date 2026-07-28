import BarangayBoundary from '../models/BarangayBoundary.js';
import { isCoordinatePair } from '../utils/locationPolicy.js';

/** Resolves a coordinate from the imported GeoJSON polygon, not a geocoder label. */
export const resolveBarangayForCoordinates = async (lat, lng) => {
    if (!isCoordinatePair(lat, lng)) {
        return { status: 'invalid_coordinates', barangay: null };
    }

    const boundaries = await BarangayBoundary.find({
        isActive: true,
        geometry: {
            $geoIntersects: {
                $geometry: {
                    type: 'Point',
                    coordinates: [Number(lng), Number(lat)],
                },
            },
        },
    }).select('psgcCode name municipalityName dataset').lean();

    if (boundaries.length === 1) return { status: 'matched', barangay: boundaries[0] };
    if (boundaries.length > 1) return { status: 'ambiguous', barangay: null };
    return { status: 'unmatched', barangay: null };
};

export default { resolveBarangayForCoordinates };
