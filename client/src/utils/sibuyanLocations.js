/**
 * Official Sibuyan Island municipality and barangay records.
 *
 * Source: Philippine Statistics Authority (PSA), Philippine Standard Geographic Code (PSGC).
 * 3 Municipalities, 35 Barangays total (Cajidiocan: 14, Magdiwang: 9, San Fernando: 12).
 */
export const SIBUYAN_LOCATIONS = Object.freeze({
    Cajidiocan: Object.freeze({
        psgcCode: '1705903000',
        barangays: Object.freeze([
            'Alibagon', 'Cambajao', 'Cambalo', 'Cambijang', 'Cantagda',
            'Danao', 'Gutivan', 'Lico', 'Lumbang Este', 'Lumbang Weste',
            'Marigondon', 'Poblacion', 'Sugod', 'Taguilos',
        ]),
    }),
    Magdiwang: Object.freeze({
        psgcCode: '1705908000',
        barangays: Object.freeze([
            'Agsao', 'Agutay', 'Ambulong', 'Dulangan', 'Ipil', 'Jao-asan',
            'Poblacion', 'Silum', 'Tampayan',
        ]),
    }),
    'San Fernando': Object.freeze({
        psgcCode: '1705913000',
        barangays: Object.freeze([
            'Agtiwa', 'Azarga', 'Campalingo', 'Canjalon', 'Espa', 'Mabini',
            'Mabulo', 'Otod', 'Panangcalan', 'Pili', 'Poblacion', 'Taclobo',
        ]),
    }),
});

export const SIBUYAN_MUNICIPALITY_NAMES = Object.freeze(Object.keys(SIBUYAN_LOCATIONS));

/**
 * Default map camera targets per municipality (lon/lat mirrored from
 * server/seeds/municipalitySeed.js centers). Used to open the reporter map
 * near the reporter's home municipality instead of the whole-island view.
 */
export const MUNICIPALITY_MAP_FOCUS = Object.freeze({
    Cajidiocan: Object.freeze({ lat: 12.4044, lng: 122.6897, zoom: 12 }),
    Magdiwang: Object.freeze({ lat: 12.4778, lng: 122.5097, zoom: 12 }),
    'San Fernando': Object.freeze({ lat: 12.3536, lng: 122.5469, zoom: 12 }),
});

/**
 * Returns a MapView-compatible focus target for a municipality, or null when
 * unknown so callers fall back to the island-wide camera.
 */
export const getMunicipalityMapFocus = (municipality) => {
    if (!municipality || typeof municipality !== 'string') return null;
    const focus = MUNICIPALITY_MAP_FOCUS[municipality.trim()];
    return focus ? { ...focus } : null;
};

/**
 * Returns sorted official barangays for a municipality or all distinct barangays across Sibuyan Island.
 * @param {string} municipality - Municipality name or 'all'
 * @returns {string[]} Alphabetically sorted array of barangay names
 */
export const getSibuyanBarangays = (municipality = 'all') => {
    if (municipality && municipality !== 'all' && SIBUYAN_LOCATIONS[municipality]) {
        return [...SIBUYAN_LOCATIONS[municipality].barangays].sort((a, b) => a.localeCompare(b));
    }
    const all = new Set();
    Object.values(SIBUYAN_LOCATIONS).forEach((loc) => {
        loc.barangays.forEach((b) => all.add(b));
    });
    return [...all].sort((a, b) => a.localeCompare(b));
};

/**
 * Merges official barangays with any dynamic municipality records or loaded report data.
 * @param {string} municipality - Municipality name or 'all'
 * @param {Array} dynamicLocations - Optional records from reportsAPI.getMunicipalities()
 * @param {Array} reports - Optional loaded report objects
 * @returns {string[]} Unique, alphabetically sorted barangay names
 */
export const getAvailableBarangays = (municipality = 'all', dynamicLocations = [], reports = []) => {
    const set = new Set(getSibuyanBarangays(municipality));

    if (Array.isArray(dynamicLocations) && dynamicLocations.length > 0) {
        dynamicLocations.forEach((loc) => {
            if (municipality === 'all' || loc.name === municipality) {
                (loc.barangays || []).forEach((b) => {
                    const name = typeof b === 'string' ? b : b?.name;
                    if (name) set.add(name.trim());
                });
            }
        });
    }

    if (Array.isArray(reports)) {
        reports.forEach((r) => {
            const b = r?.barangay?.trim();
            if (b && (municipality === 'all' || r?.municipalityName === municipality)) {
                set.add(b);
            }
        });
    }

    return [...set].sort((a, b) => a.localeCompare(b));
};

/**
 * Validates whether a barangay belongs to a specific municipality.
 * @param {string} barangay - Barangay name
 * @param {string} municipality - Municipality name
 * @param {Array} dynamicLocations - Optional API location records
 * @param {Array} reports - Optional loaded reports
 * @returns {boolean}
 */
export const isBarangayInMunicipality = (barangay, municipality, dynamicLocations = [], reports = []) => {
    if (!barangay || barangay === 'all') return true;
    if (!municipality || municipality === 'all') return true;
    const available = getAvailableBarangays(municipality, dynamicLocations, reports);
    return available.includes(barangay);
};
