import { SIBUYAN_LOCATIONS, SIBUYAN_MUNICIPALITY_NAMES } from '../config/sibuyanLocations.js';

const OFFICIAL_BARANGAY_NAMES = new Set(
    Object.values(SIBUYAN_LOCATIONS)
        .flatMap(({ barangays }) => barangays)
        .map((name) => name.toLocaleLowerCase('en-PH'))
);

const MUNICIPALITY_NAMES = new Set(
    SIBUYAN_MUNICIPALITY_NAMES.map((name) => name.toLocaleLowerCase('en-PH'))
);

const GENERIC_VALUES = new Set(['yes', 'no', 'building', 'road', 'unnamed road']);
const POI_KEYS = ['amenity', 'tourism', 'shop', 'office', 'leisure', 'historic', 'man_made', 'building'];
const ROAD_KEYS = ['road', 'pedestrian', 'residential', 'footway', 'path'];
const LOCALITY_KEYS = ['neighbourhood', 'quarter', 'suburb', 'hamlet', 'locality'];

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalized = (value) => clean(value).toLocaleLowerCase('en-PH');

const isAdministrativeName = (value) => {
    const key = normalized(value);
    return OFFICIAL_BARANGAY_NAMES.has(key) || MUNICIPALITY_NAMES.has(key);
};

const isUsableDescriptor = (value) => {
    const key = normalized(value);
    return Boolean(key)
        && !GENERIC_VALUES.has(key)
        && !isAdministrativeName(value);
};

const firstUsable = (values) => values.map(clean).find(isUsableDescriptor) || '';

const appendUnique = (target, value) => {
    const candidate = clean(value);
    if (!candidate) return;
    if (target.some((entry) => normalized(entry) === normalized(candidate))) return;
    target.push(candidate);
};

/**
 * Builds a reporter-facing location label from structured geocoder fields.
 * Administrative assignment always comes from the verified boundary polygon;
 * a provider display_name is retained separately for audit and is never treated
 * as an authoritative address hierarchy.
 */
export const buildIncidentAddressLabel = ({
    addressDetails = {},
    featureName = '',
    authoritativeBarangay = '',
    coordinates = null,
} = {}) => {
    const components = [];
    const poi = firstUsable([featureName, ...POI_KEYS.map((key) => addressDetails[key])]);
    const road = firstUsable(ROAD_KEYS.map((key) => addressDetails[key]));
    const locality = firstUsable(LOCALITY_KEYS.map((key) => addressDetails[key]));

    appendUnique(components, poi);
    appendUnique(components, road || locality);

    if (authoritativeBarangay) {
        if (components.length === 0) return `Near ${clean(authoritativeBarangay)}`;
        appendUnique(components, authoritativeBarangay);
        return components.join(', ');
    }

    if (components.length > 0) return components.join(', ');
    if (Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lng))) {
        return `${Number(coordinates.lat).toFixed(6)}, ${Number(coordinates.lng).toFixed(6)}`;
    }
    return '';
};

export default { buildIncidentAddressLabel };
