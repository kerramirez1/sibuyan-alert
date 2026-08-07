import maplibregl from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { bytesToHeader, PMTiles, Protocol, TileType } from 'pmtiles';

export const PMTILES_SOURCE_ID = 'sibuyan-pmtiles';
export const STREET_FALLBACK_SOURCE_ID = 'osm-street-fallback';
export const STREET_FALLBACK_LAYER_ID = 'osm-street-fallback-layer';
// Level 17 is intentionally excluded because the production imagery coverage
// is incomplete there for parts of Sibuyan Island.
export const OPERATIONAL_MAX_ZOOM = 16;

const ESRI_IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_REFERENCE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OSM_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const PROTOMAPS_GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const PROTOMAPS_SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light';

const configuredPmtilesUrl = String(import.meta.env.VITE_PMTILES_URL || '').trim();
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
    maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
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

export const createOperationalMapStyle = ({
    includeStreet = true,
    dark = false,
    pmtilesUrl = configuredPmtilesUrl,
    pmtilesInspection = null,
} = {}) => {
    let normalizedPmtilesUrl = '';
    try {
        normalizedPmtilesUrl = includeStreet ? toPmtilesProtocolUrl(pmtilesUrl) : '';
    } catch (error) {
        console.warn('Ignoring invalid VITE_PMTILES_URL.', error);
    }

    if (normalizedPmtilesUrl) getPmtilesArchive(toPmtilesHttpUrl(pmtilesUrl));

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

    if (includeStreet) {
        sources[STREET_FALLBACK_SOURCE_ID] = {
            type: 'raster',
            tiles: [OSM_FALLBACK_URL],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
        };

        if (normalizedPmtilesUrl) {
            sources[PMTILES_SOURCE_ID] = {
                type: 'vector',
                url: normalizedPmtilesUrl,
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

    mapLayers.push({
        id: 'esri-reference-layer',
        type: 'raster',
        source: 'esri-reference',
        layout: { visibility: 'visible' },
    });

    return {
        style: {
            version: 8,
            ...(normalizedPmtilesUrl
                ? {
                    glyphs: PROTOMAPS_GLYPHS_URL,
                    sprite: PROTOMAPS_SPRITE_URL,
                }
                : {}),
            sources,
            layers: mapLayers,
        },
        hasSelfHostedStreetMap: Boolean(normalizedPmtilesUrl),
        primaryStreetLayerIds,
        allStreetLayerIds,
        fallbackStreetLayerId: includeStreet ? STREET_FALLBACK_LAYER_ID : null,
        streetMinZoom: pmtilesInspection?.minZoom ?? 0,
        streetMaxZoom: normalizedPmtilesUrl
            ? Math.min(pmtilesInspection?.maxZoom ?? OPERATIONAL_MAX_ZOOM, OPERATIONAL_MAX_ZOOM)
            : OPERATIONAL_MAX_ZOOM,
        pmtilesInspection,
        pmtilesError: null,
    };
};

export const prepareOperationalMapStyle = async (options = {}) => {
    const includeStreet = options.includeStreet !== false;
    const pmtilesUrl = options.pmtilesUrl ?? configuredPmtilesUrl;
    if (!includeStreet || !String(pmtilesUrl || '').trim()) {
        return createOperationalMapStyle(options);
    }

    try {
        const pmtilesInspection = await inspectPmtilesArchive(pmtilesUrl);
        return createOperationalMapStyle({
            ...options,
            pmtilesUrl,
            pmtilesInspection,
        });
    } catch (error) {
        console.warn('PMTiles validation failed; using the fallback street map.', error);
        return {
            ...createOperationalMapStyle({ ...options, pmtilesUrl: '' }),
            pmtilesError: error instanceof Error ? error.message : 'PMTiles validation failed.',
        };
    }
};

export const getMapProviderStatus = () => ({
    pmtilesConfigured: Boolean(configuredPmtilesUrl),
    pmtilesUrl: configuredPmtilesUrl,
});

export default createOperationalMapStyle;
