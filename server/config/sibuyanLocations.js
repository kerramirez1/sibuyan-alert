/**
 * Official Sibuyan Island municipality and barangay names.
 *
 * Source: Philippine Statistics Authority, Philippine Standard Geographic
 * Code (PSGC), barangay listings as of 31 July 2025, checked against the
 * Second Quarter 2026 PSGC change notice (which contains no Romblon changes).
 * The PSA pages are linked beside each municipality for future audits.
 */
export const SIBUYAN_LOCATIONS = Object.freeze({
    Cajidiocan: Object.freeze({
        psgcCode: '1705903000',
        source: 'https://psa.gov.ph/classification/psgc/barangays/1705903000',
        barangays: Object.freeze([
            'Alibagon', 'Cambajao', 'Cambalo', 'Cambijang', 'Cantagda',
            'Danao', 'Gutivan', 'Lico', 'Lumbang Este', 'Lumbang Weste',
            'Marigondon', 'Poblacion', 'Sugod', 'Taguilos',
        ]),
    }),
    Magdiwang: Object.freeze({
        psgcCode: '1705908000',
        source: 'https://psa.gov.ph/classification/psgc/barangays/1705908000',
        barangays: Object.freeze([
            'Agsao', 'Agutay', 'Ambulong', 'Dulangan', 'Ipil', 'Jao-asan',
            'Poblacion', 'Silum', 'Tampayan',
        ]),
    }),
    'San Fernando': Object.freeze({
        psgcCode: '1705913000',
        source: 'https://psa.gov.ph/classification/psgc/barangays/1705913000',
        barangays: Object.freeze([
            'Agtiwa', 'Azarga', 'Campalingo', 'Canjalon', 'Espa', 'Mabini',
            'Mabulo', 'Otod', 'Panangcalan', 'Pili', 'Poblacion', 'Taclobo',
        ]),
    }),
});

export const SIBUYAN_MUNICIPALITY_NAMES = Object.freeze(Object.keys(SIBUYAN_LOCATIONS));

export const isValidSibuyanAddress = (municipality, barangay) => (
    Boolean(municipality)
    && Boolean(barangay)
    && SIBUYAN_LOCATIONS[municipality]?.barangays.includes(barangay)
);

export const getOfficialBarangayRecords = (municipality) => (
    SIBUYAN_LOCATIONS[municipality]?.barangays.map((name) => ({ name })) || []
);
