import maplibregl from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { Protocol } from 'pmtiles';

export const PMTILES_SOURCE_ID = 'sibuyan-pmtiles';
export const STREET_FALLBACK_SOURCE_ID = 'osm-street-fallback';
export const STREET_FALLBACK_LAYER_ID = 'osm-street-fallback-layer';
export const TERRAIN_SOURCE_ID = 'sibuyan-terrain';

const ESRI_IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_REFERENCE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OSM_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const PROTOMAPS_GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const PROTOMAPS_SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light';

const configuredPmtilesUrl = String(import.meta.env.VITE_PMTILES_URL || '').trim();
const configuredTerrainUrl = String(import.meta.env.VITE_TERRAIN_TILES_URL || DEFAULT_TERRAIN_URL).trim();

let pmtilesProtocolRegistered = false;

const asHttpUrl = (value) => {
    const url = new URL(value, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported map asset protocol: ${url.protocol}`);
    }
    return url.href;
};

export const toPmtilesProtocolUrl = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    if (candidate.startsWith('pmtiles://')) return candidate;
    return `pmtiles://${asHttpUrl(candidate)}`;
};

export const ensurePmtilesProtocol = () => {
    if (pmtilesProtocolRegistered) return;
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    pmtilesProtocolRegistered = true;
};

const hiddenLayer = (layer, prefix = 'street') => ({
    ...layer,
    id: `${prefix}-${layer.id}`,
    layout: {
        ...(layer.layout || {}),
        visibility: 'none',
    },
});

const createPmtilesStreetLayers = (sourceId, dark) => (
    layers(sourceId, namedFlavor(dark ? 'dark' : 'light'), { lang: 'en' })
        .map((layer) => hiddenLayer(layer))
);

export const createOperationalMapStyle = ({
    enableTerrain = true,
    includeStreet = true,
    dark = false,
    pmtilesUrl = configuredPmtilesUrl,
    terrainTilesUrl = configuredTerrainUrl,
} = {}) => {
    let normalizedPmtilesUrl = '';
    try {
        normalizedPmtilesUrl = toPmtilesProtocolUrl(pmtilesUrl);
    } catch (error) {
        console.warn('Ignoring invalid VITE_PMTILES_URL.', error);
    }

    if (normalizedPmtilesUrl) ensurePmtilesProtocol();

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

    if (enableTerrain && terrainTilesUrl) {
        sources[TERRAIN_SOURCE_ID] = {
            type: 'raster-dem',
            tiles: [terrainTilesUrl],
            tileSize: 256,
            maxzoom: 15,
            encoding: 'terrarium',
            attribution: 'Elevation data &copy; Mapzen contributors',
        };
        mapLayers.push({
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: TERRAIN_SOURCE_ID,
            paint: {
                'hillshade-exaggeration': 0.28,
                'hillshade-shadow-color': '#334155',
            },
        });
    }

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
            ...(enableTerrain && sources[TERRAIN_SOURCE_ID]
                ? { terrain: { source: TERRAIN_SOURCE_ID, exaggeration: 1 } }
                : {}),
        },
        hasSelfHostedStreetMap: Boolean(normalizedPmtilesUrl),
        primaryStreetLayerIds,
        allStreetLayerIds,
        fallbackStreetLayerId: includeStreet ? STREET_FALLBACK_LAYER_ID : null,
    };
};

export const getMapProviderStatus = () => ({
    pmtilesConfigured: Boolean(configuredPmtilesUrl),
    pmtilesUrl: configuredPmtilesUrl,
    terrainConfigured: Boolean(configuredTerrainUrl),
});

export default createOperationalMapStyle;
