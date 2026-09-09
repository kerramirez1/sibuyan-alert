import BarangayBoundary from '../models/BarangayBoundary.js';
import { isCoordinatePair } from '../utils/locationPolicy.js';

const BOUNDARY_COUNT_CACHE_TTL_MS = 60 * 1000;
let boundaryCountCache = { count: null, checkedAt: 0 };

/** Cached active-polygon count so every report does not pay a countDocuments. */
export const getActiveBarangayBoundaryCount = async () => {
    const now = Date.now();
    if (boundaryCountCache.count !== null && (now - boundaryCountCache.checkedAt) < BOUNDARY_COUNT_CACHE_TTL_MS) {
        return boundaryCountCache.count;
    }
    const count = await BarangayBoundary.countDocuments({ isActive: true });
    boundaryCountCache = { count, checkedAt: now };
    return count;
};

export const resetBarangayBoundaryCountCache = () => {
    boundaryCountCache = { count: null, checkedAt: 0 };
};

/** Resolves a coordinate from the imported GeoJSON polygon, not a geocoder label. */
export const resolveBarangayForCoordinates = async (lat, lng) => {
    if (!isCoordinatePair(lat, lng)) {
        return { status: 'invalid_coordinates', barangay: null };
    }

    if ((await getActiveBarangayBoundaryCount()) === 0) {
        return { status: 'dataset_missing', barangay: null };
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

export default { resolveBarangayForCoordinates, getActiveBarangayBoundaryCount, resetBarangayBoundaryCountCache };
