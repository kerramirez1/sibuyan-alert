import maplibregl from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { bytesToHeader, PMTiles, Protocol, TileType } from 'pmtiles';

export const PMTILES_SOURCE_ID = 'sibuyan-pmtiles';
export const LABELS_3D_SOURCE_ID = 'sibuyan-3d-labels';
export const STREET_FALLBACK_SOURCE_ID = 'osm-street-fallback';
export const STREET_FALLBACK_LAYER_ID = 'osm-street-fallback-layer';
// Level 17 is intentionally excluded because the production imagery coverage
// is incomplete there for parts of Sibuyan Island.
export const OPERATIONAL_MAX_ZOOM = 16;

const ESRI_IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_REFERENCE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OSM_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// OpenStreetMap publishes real detail well past the satellite ceiling. The
// fallback street layer used to inherit OPERATIONAL_MAX_ZOOM (16), which capped
// a source that declares `maxzoom: 19` at 16 — throwing away the one basemap an
// operator can actually use to place a precise pin. Street mode is where
// precision comes from, so it is capped by its own source instead.
const OSM_FALLBACK_MAX_ZOOM = 19;
const PROTOMAPS_GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const PROTOMAPS_SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light';

export const getConfiguredPmtilesUrl = () => String(import.meta.env.VITE_PMTILES_URL || '').trim();
export const getConfigured3DLabelsPmtilesUrl = () => String(import.meta.env.VITE_3D_LABELS_PMTILES_URL || '').trim();
const PMTILES_HEADER_RANGE = 'bytes=0-16383';
const MIN_PMTILES_HEADER_BYTES = 127;
const SIBUYAN_BOUNDS = {
    minLon: 122.45,
    minLat: 12.30,
    maxLon: 122.70,
    maxLat: 12.55,
};

let pmtilesProtocol = null;
const pmtilesArchives = new Map();
const pmtilesInspectionPromises = new Map();

const asHttpUrl = (value) => {
    const url = new URL(value, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported map asset protocol: ${url.protocol}`);
    }
    return url.href;
};

export const toPmtilesHttpUrl = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    return asHttpUrl(candidate.startsWith('pmtiles://') ? candidate.slice('pmtiles://'.length) : candidate);
};

export const toPmtilesProtocolUrl = (value) => {
    const httpUrl = toPmtilesHttpUrl(value);
    return httpUrl ? `pmtiles://${httpUrl}` : '';
};

export const ensurePmtilesProtocol = () => {
    if (pmtilesProtocol) return pmtilesProtocol;
    pmtilesProtocol = new Protocol();
    try {
        maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
    } catch (error) {
        // Vite HMR (or a double-mount race) re-evaluates this module while the
        // previous protocol registration is still live: "already added" means
        // the existing registration is usable, so keep going instead of
        // crashing the mount effect.
        if (!String(error?.message || '').toLowerCase().includes('already')) throw error;
    }
    return pmtilesProtocol;
};

const getPmtilesArchive = (httpUrl) => {
    const existing = pmtilesArchives.get(httpUrl);
    if (existing) return existing;

    const archive = new PMTiles(httpUrl);
    ensurePmtilesProtocol().add(archive);
    pmtilesArchives.set(httpUrl, archive);
    return archive;
};

const intersectsSibuyan = (header) => (
    header.minLon <= SIBUYAN_BOUNDS.maxLon
    && header.maxLon >= SIBUYAN_BOUNDS.minLon
    && header.minLat <= SIBUYAN_BOUNDS.maxLat
    && header.maxLat >= SIBUYAN_BOUNDS.minLat
);

const inspectPmtilesArchiveRequest = async (httpUrl, fetchImpl) => {
    const response = await fetchImpl(httpUrl, {
        method: 'GET',
        headers: { Range: PMTILES_HEADER_RANGE },
        credentials: 'same-origin',
    });

    if (response.status !== 206) {
        throw new Error(`PMTiles host must return 206 Partial Content; received ${response.status}.`);
    }

    const contentRange = response.headers.get('content-range');
    if (!contentRange || !/^bytes\s+0-\d+\/\d+$/i.test(contentRange)) {
        throw new Error('PMTiles host returned an invalid or hidden Content-Range header.');
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < MIN_PMTILES_HEADER_BYTES) {
        throw new Error('PMTiles response is too small to contain a valid archive header.');
    }

    const view = new DataView(bytes);
    if (view.getUint16(0, true) !== 0x4d50) {
        throw new Error('Configured map archive is not a valid PMTiles file.');
    }

    const header = bytesToHeader(bytes.slice(0, MIN_PMTILES_HEADER_BYTES));
    if (header.tileType !== TileType.Mvt) {
        throw new Error('Configured PMTiles archive must contain vector MVT tiles.');
    }
    if (
        !Number.isInteger(header.minZoom)
        || !Number.isInteger(header.maxZoom)
        || header.minZoom < 0
        || header.maxZoom > 22
        || header.minZoom > header.maxZoom
    ) {
        throw new Error('Configured PMTiles archive has an invalid zoom range.');
    }
    if (!intersectsSibuyan(header)) {
        throw new Error('Configured PMTiles archive does not cover Sibuyan Island.');
    }

    getPmtilesArchive(httpUrl);

    return {
        minZoom: header.minZoom,
        maxZoom: header.maxZoom,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        rangeSupported: true,
        cacheControl: response.headers.get('cache-control') || '',
        etag: response.headers.get('etag') || '',
    };
};

export const inspectPmtilesArchive = (value, { fetchImpl = globalThis.fetch } = {}) => {
    const httpUrl = toPmtilesHttpUrl(value);
    if (!httpUrl) return Promise.resolve(null);
    if (typeof fetchImpl !== 'function') {
        return Promise.reject(new Error('Fetch is unavailable for PMTiles validation.'));
    }

    if (!pmtilesInspectionPromises.has(httpUrl)) {
        const inspection = inspectPmtilesArchiveRequest(httpUrl, fetchImpl)
            .catch((error) => {
                pmtilesInspectionPromises.delete(httpUrl);
                throw error;
            });
        pmtilesInspectionPromises.set(httpUrl, inspection);
    }
    return pmtilesInspectionPromises.get(httpUrl);
};

const hiddenLayer = (layer, prefix = 'street') => ({
    ...layer,
    id: `${prefix}-${layer.id}`,
    layout: {
        ...layer.layout,
        visibility: 'none',
    },
});

const createPmtilesStreetLayers = (sourceId, dark) => (
    layers(sourceId, namedFlavor(dark ? 'dark' : 'light'), { lang: 'en' })
        .map((layer) => hiddenLayer(layer))
);

export const SATELLITE_VECTOR_LABEL_SOURCE_LAYER_IDS = [
    'water_label_ocean',
    'water_label_lakes',
    'water_waterway_label',
    'earth_label_islands',
    'roads_labels_minor',
    'roads_labels_major',
    'pois',
    'places_subplace',
    'places_locality',
    'places_region',
    'places_country',
];

export const createPmtiles3DLabelLayers = (sourceId = LABELS_3D_SOURCE_ID) => {
    const rawLayers = layers(sourceId, namedFlavor('light'), { lang: 'en' });
    const labelSourceIds = new Set(SATELLITE_VECTOR_LABEL_SOURCE_LAYER_IDS);

    return rawLayers
        .filter((l) => labelSourceIds.has(l.id) && l.type === 'symbol')
        .map((layer) => ({
            ...layer,
            id: `3d-label-${layer.id}`,
            source: sourceId,
            layout: {
                ...layer.layout,
                visibility: 'none',
                'text-pitch-alignment': 'viewport',
                'text-rotation-alignment': 'viewport',
                'text-allow-overlap': false,
                'text-ignore-placement': false,
            },
            paint: {
                ...layer.paint,
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(12, 24, 19, 0.90)',
                'text-halo-width': 1.75,
                'text-halo-blur': 0.5,
            },
        }));
};

export const createOperationalMapStyle = ({
    includeStreet = true,
    include3DLabels = true,
    dark = false,
    pmtilesUrl = getConfiguredPmtilesUrl(),
    labels3DPmtilesUrl = getConfigured3DLabelsPmtilesUrl(),
    pmtilesInspection = null,
    labels3DInspection = null,
} = {}) => {
    const resolvedInclude3DLabels = include3DLabels !== false;

    let normalizedStreetPmtilesUrl = '';
    if (includeStreet && pmtilesUrl) {
        try {
            normalizedStreetPmtilesUrl = toPmtilesProtocolUrl(pmtilesUrl);
        } catch (error) {
            console.warn('Ignoring invalid VITE_PMTILES_URL.', error);
        }
    }

    let normalized3DLabelsUrl = '';
    if (resolvedInclude3DLabels && labels3DPmtilesUrl) {
        try {
            normalized3DLabelsUrl = toPmtilesProtocolUrl(labels3DPmtilesUrl);
        } catch (error) {
            console.warn('Ignoring invalid VITE_3D_LABELS_PMTILES_URL.', error);
        }
    }

    // Archive registration touches the shared PMTiles protocol registry and
    // re-parses the URL: both can throw on malformed env values. The style
    // itself is still valid without the vector source (callers fall back to
    // OSM/Esri), so never let registration crash the mount effect.
    try {
        if (normalizedStreetPmtilesUrl) getPmtilesArchive(toPmtilesHttpUrl(pmtilesUrl));
    } catch (error) {
        console.warn('Ignoring unreachable street PMTiles archive.', error);
        normalizedStreetPmtilesUrl = '';
    }
    try {
        if (normalized3DLabelsUrl) getPmtilesArchive(toPmtilesHttpUrl(labels3DPmtilesUrl));
    } catch (error) {
        console.warn('Ignoring unreachable 3D-label PMTiles archive.', error);
        normalized3DLabelsUrl = '';
    }

    const sources = {
        'esri-imagery': {
            type: 'raster',
            tiles: [ESRI_IMAGERY_URL],
            tileSize: 256,
            attribution: 'Tiles &copy; Esri and its data providers',
        },
        'esri-reference': {
            type: 'raster',
            tiles: [ESRI_REFERENCE_URL],
            tileSize: 256,
        },
    };

    const mapLayers = [
        {
            id: 'esri-imagery-layer',
            type: 'raster',
            source: 'esri-imagery',
            layout: { visibility: 'visible' },
        },
    ];

    const primaryStreetLayerIds = [];
    const allStreetLayerIds = [];
    const satelliteVectorLabelLayerIds = [];

    if (includeStreet) {
        sources[STREET_FALLBACK_SOURCE_ID] = {
            type: 'raster',
            tiles: [OSM_FALLBACK_URL],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
        };

        if (normalizedStreetPmtilesUrl) {
            sources[PMTILES_SOURCE_ID] = {
                type: 'vector',
                url: normalizedStreetPmtilesUrl,
                attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
                ...(pmtilesInspection
                    ? {
                        minzoom: pmtilesInspection.minZoom,
                        maxzoom: pmtilesInspection.maxZoom,
                    }
                    : {}),
            };

            const vectorLayers = createPmtilesStreetLayers(PMTILES_SOURCE_ID, dark);
            vectorLayers.forEach((layer) => {
                mapLayers.push(layer);
                primaryStreetLayerIds.push(layer.id);
                allStreetLayerIds.push(layer.id);
            });
        }

        mapLayers.push({
            id: STREET_FALLBACK_LAYER_ID,
            type: 'raster',
            source: STREET_FALLBACK_SOURCE_ID,
            layout: { visibility: 'none' },
        });
        allStreetLayerIds.push(STREET_FALLBACK_LAYER_ID);
        if (primaryStreetLayerIds.length === 0) primaryStreetLayerIds.push(STREET_FALLBACK_LAYER_ID);
    }

    if (resolvedInclude3DLabels && normalized3DLabelsUrl) {
        sources[LABELS_3D_SOURCE_ID] = {
            type: 'vector',
            url: normalized3DLabelsUrl,
            attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
            ...(labels3DInspection
                ? {
                    minzoom: labels3DInspection.minZoom,
                    maxzoom: labels3DInspection.maxZoom,
                }
                : {}),
        };

        const label3DLayers = createPmtiles3DLabelLayers(LABELS_3D_SOURCE_ID);
        label3DLayers.forEach((layer) => {
            mapLayers.push({
                ...layer,
                layout: {
                    ...layer.layout,
                    visibility: includeStreet ? 'none' : 'visible',
                },
            });
            satelliteVectorLabelLayerIds.push(layer.id);
        });
    }

    const hasVectorLabels = Boolean(resolvedInclude3DLabels && satelliteVectorLabelLayerIds.length > 0);

    mapLayers.push({
        id: 'esri-reference-layer',
        type: 'raster',
        source: 'esri-reference',
        layout: { visibility: hasVectorLabels ? 'none' : 'visible' },
    });

    const streetLayerIds = includeStreet ? [...allStreetLayerIds] : [];
    const satelliteLayerIds = [
        'esri-imagery-layer',
        'esri-reference-layer',
        ...satelliteVectorLabelLayerIds,
    ];

    return {
        style: {
            version: 8,
            ...(normalizedStreetPmtilesUrl || normalized3DLabelsUrl
                ? {
                    glyphs: PROTOMAPS_GLYPHS_URL,
                    sprite: PROTOMAPS_SPRITE_URL,
                }
                : {}),
            sources,
            layers: mapLayers,
        },
        hasSelfHostedStreetMap: Boolean(normalizedStreetPmtilesUrl),
        hasVectorLabels,
        streetLayerIds,
        satelliteLayerIds,
        satelliteVectorLabelLayerIds,
        primaryStreetLayerIds,
        allStreetLayerIds,
        fallbackStreetLayerId: includeStreet ? STREET_FALLBACK_LAYER_ID : null,
        streetMinZoom: pmtilesInspection?.minZoom ?? 0,
        streetMaxZoom: normalizedStreetPmtilesUrl
            ? Math.min(pmtilesInspection?.maxZoom ?? OPERATIONAL_MAX_ZOOM, OPERATIONAL_MAX_ZOOM)
            // No street archive configured, so the OSM raster fallback is the
            // street basemap. It is its own source with its own ceiling — the
            // satellite clamp does not apply to it.
            : OSM_FALLBACK_MAX_ZOOM,
        pmtilesInspection,
        labels3DInspection,
        pmtilesError: null,
        labels3DError: null,
    };
};

export const prepareOperationalMapStyle = async (options = {}) => {
    const includeStreet = options.includeStreet !== false;
    const include3DLabels = options.include3DLabels !== false;
    const pmtilesUrl = options.pmtilesUrl ?? getConfiguredPmtilesUrl();
    const labels3DPmtilesUrl = options.labels3DPmtilesUrl ?? getConfigured3DLabelsPmtilesUrl();

    let pmtilesInspection = null;
    let pmtilesError = null;
    if (includeStreet && Boolean(String(pmtilesUrl || '').trim())) {
        try {
            pmtilesInspection = await inspectPmtilesArchive(pmtilesUrl, options);
        } catch (error) {
            console.warn('Street PMTiles validation failed; using the fallback street map.', error);
            pmtilesError = error instanceof Error ? error.message : 'Street PMTiles validation failed.';
        }
    }

    let labels3DInspection = null;
    let labels3DError = null;
    if (include3DLabels && Boolean(String(labels3DPmtilesUrl || '').trim())) {
        try {
            labels3DInspection = await inspectPmtilesArchive(labels3DPmtilesUrl, options);
        } catch (error) {
            console.warn('3D Labels PMTiles validation failed; falling back to Esri reference labels.', error);
            labels3DError = error instanceof Error ? error.message : '3D Labels PMTiles validation failed.';
        }
    }

    const effectivePmtilesUrl = pmtilesError ? '' : pmtilesUrl;
    const effectiveLabels3DUrl = labels3DError ? '' : labels3DPmtilesUrl;

    const result = createOperationalMapStyle({
        ...options,
        pmtilesUrl: effectivePmtilesUrl,
        labels3DPmtilesUrl: effectiveLabels3DUrl,
        pmtilesInspection,
        labels3DInspection,
    });

    return {
        ...result,
        pmtilesError,
        labels3DError,
    };
};

export const getMapProviderStatus = () => ({
    pmtilesConfigured: Boolean(getConfiguredPmtilesUrl()),
    pmtilesUrl: getConfiguredPmtilesUrl(),
    labels3DConfigured: Boolean(getConfigured3DLabelsPmtilesUrl()),
    labels3DPmtilesUrl: getConfigured3DLabelsPmtilesUrl(),
});

export default createOperationalMapStyle;
