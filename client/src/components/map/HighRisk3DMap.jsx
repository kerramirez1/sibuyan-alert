import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { useMemo } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
    installCompactAttribution,
    installCompassOrientationToggle,
    MAP_INTERACTION_OPTIONS,
    scheduleMapFocus,
} from '../../utils/mapNavigation';
import {
    createOperationalMapStyle,
    OPERATIONAL_MAX_ZOOM,
} from '../../config/mapProvider';
import { getMapPerformanceProfile } from '../../utils/mapPerformance';

// Sibuyan Island bounds and center
const SIBUYAN_CENTER = [122.5571, 12.4176]; // Lon/Lat

const ZONE_COLORS = {
    landslide_prone: '#F59E0B',
    accident_prone: '#EF4444',
    fire_risk: '#EA580C',
    other: '#6B7280',
};

const SEVERITY_HEIGHTS = {
    low: 50,
    medium: 150,
    high: 300,
    critical: 500,
};

const HighRisk3DMap = ({ highRiskZones = [], className = '', focusLocation = null }) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);
    const performanceProfile = useMemo(() => getMapPerformanceProfile(), []);

    // Generate GeoJSON features from zones
    const generateFeatures = useCallback((zones) => {
        return zones.map((zone) => {
            const center = [zone.coordinates.lng, zone.coordinates.lat];
            const radiusInKm = zone.radius / 1000;
            const points = 64;
            const coords = [];

            for (let i = 0; i < points; i++) {
                const angle = (i / points) * (2 * Math.PI);
                const dx = radiusInKm * Math.cos(angle);
                const dy = radiusInKm * Math.sin(angle);
                const dLng = dx / (111.32 * Math.cos(center[1] * Math.PI / 180));
                const dLat = dy / 110.574;
                coords.push([center[0] + dLng, center[1] + dLat]);
            }
            coords.push(coords[0]);

            return {
                type: 'Feature',
                properties: {
                    color: ZONE_COLORS[zone.type] || ZONE_COLORS.other,
                    height: SEVERITY_HEIGHTS[zone.severity] || 100,
                    name: zone.name,
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords],
                },
            };
        });
    }, []);

    // Initialize map
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        const provider = createOperationalMapStyle({
            enableTerrain: performanceProfile.terrainEnabled,
            enableHillshade: false,
            terrainMaxZoom: performanceProfile.terrainMaxZoom,
            includeStreet: false,
        });
        const mapInstance = new maplibregl.Map({
            ...MAP_INTERACTION_OPTIONS,
            container: mapContainerRef.current,
            style: provider.style,
            center: SIBUYAN_CENTER,
            zoom: 11,
            pitch: 55,
            bearing: -15,
            antialias: performanceProfile.antialias,
            pixelRatio: performanceProfile.pixelRatio,
            maxTileCacheSize: performanceProfile.maxTileCacheSize,
            fadeDuration: performanceProfile.fadeDuration,
            renderWorldCopies: false,
            maxZoom: OPERATIONAL_MAX_ZOOM,
            attributionControl: false,
        });

        const navigationControl = new maplibregl.NavigationControl({ visualizePitch: true });
        mapInstance.addControl(navigationControl, 'top-right');
        const removeCompactAttribution = installCompactAttribution(
            mapInstance,
            new maplibregl.AttributionControl({ compact: true }),
        );
        const removeCompassToggle = installCompassOrientationToggle(mapInstance, navigationControl, {
            pitch: 55,
            bearing: -15,
        });

        mapInstance.on('load', () => {
            // Add the zones source
            mapInstance.addSource('risk-zones', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            // Add 3D extrusion layer
            mapInstance.addLayer({
                id: 'risk-zones-3d',
                type: 'fill-extrusion',
                source: 'risk-zones',
                paint: {
                    'fill-extrusion-color': ['get', 'color'],
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.75,
                },
            });

            mapInstanceRef.current = mapInstance;
            setMapReady(true);
        });

        return () => {
            removeCompassToggle();
            removeCompactAttribution();
            mapInstance.remove();
            mapInstanceRef.current = null;
        };
    }, [performanceProfile]);

    // Update zones when data changes or map becomes ready
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const source = mapInstanceRef.current.getSource('risk-zones');
        if (source) {
            const features = generateFeatures(highRiskZones);
            source.setData({ type: 'FeatureCollection', features });
        }
    }, [highRiskZones, mapReady, generateFeatures]);

    // Handle focus location
    useEffect(() => {
        if (!mapInstanceRef.current || !focusLocation || !mapReady) return undefined;

        return scheduleMapFocus(mapInstanceRef.current, focusLocation, {
            zoom: 14,
            pitch: 55,
            bearing: -15,
            duration: performanceProfile.navigationDuration,
        });
    }, [focusLocation, mapReady, performanceProfile.navigationDuration]);

    return (
        <div className={`relative aspect-square w-full sm:aspect-auto sm:min-h-[500px] ${className}`}>
            <div
                ref={mapContainerRef}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg text-xs z-10 pointer-events-none">
                <p className="font-semibold mb-2 text-gray-800">3D Visualization Mode</p>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-red-600 block rounded-sm"></span>
                        <span className="text-gray-700">Critical Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-orange-500 block rounded-sm"></span>
                        <span className="text-gray-700">High Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-yellow-500 block rounded-sm"></span>
                        <span className="text-gray-700">Medium Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 block rounded-sm"></span>
                        <span className="text-gray-700">Low Risk</span>
                    </div>
                </div>
                <p className="mt-2 text-gray-500 italic text-[10px]">Ctrl+Drag to rotate & tilt</p>
            </div>
        </div>
    );
};

export default HighRisk3DMap;
