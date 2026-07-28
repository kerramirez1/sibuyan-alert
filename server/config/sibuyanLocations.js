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

/** Official PSGC codes used to join a boundary polygon to its canonical barangay. */
export const SIBUYAN_BARANGAY_PSGC_CODES = Object.freeze({
    Cajidiocan: Object.freeze({
        Alibagon: '1705903001', Cambajao: '1705903002', Cambalo: '1705903003', Cambijang: '1705903004',
        Cantagda: '1705903005', Danao: '1705903006', Gutivan: '1705903007', Lico: '1705903008',
        'Lumbang Este': '1705903009', 'Lumbang Weste': '1705903010', Marigondon: '1705903011',
        Poblacion: '1705903012', Sugod: '1705903013', Taguilos: '1705903014',
    }),
    Magdiwang: Object.freeze({
        Agsao: '1705908001', Agutay: '1705908002', Ambulong: '1705908003', Dulangan: '1705908004',
        Ipil: '1705908005', 'Jao-asan': '1705908006', Poblacion: '1705908007', Silum: '1705908008', Tampayan: '1705908009',
    }),
    'San Fernando': Object.freeze({
        Agtiwa: '1705913001', Azarga: '1705913002', Campalingo: '1705913003', Canjalon: '1705913004',
        Espa: '1705913005', Mabini: '1705913006', Mabulo: '1705913007', Otod: '1705913008',
        Panangcalan: '1705913009', Pili: '1705913010', Poblacion: '1705913011', Taclobo: '1705913012',
    }),
});

export const getSibuyanBarangayByPsgcCode = (psgcCode) => {
    const code = String(psgcCode || '');
    for (const [municipality, barangays] of Object.entries(SIBUYAN_BARANGAY_PSGC_CODES)) {
        const entry = Object.entries(barangays).find(([, candidateCode]) => candidateCode === code);
        if (entry) return { municipality, name: entry[0], psgcCode: code };
    }
    return null;
};

export const isValidSibuyanAddress = (municipality, barangay) => (
    Boolean(municipality)
    && Boolean(barangay)
    && SIBUYAN_LOCATIONS[municipality]?.barangays.includes(barangay)
);

export const getOfficialBarangayRecords = (municipality) => (
    SIBUYAN_LOCATIONS[municipality]?.barangays.map((name) => ({ name })) || []
);
