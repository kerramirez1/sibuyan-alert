import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
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
import {
    buildRiskZoneFeatureCollection,
    RISK_ZONE_EXTRUSION_LAYER_ID,
    RISK_ZONE_MIN_ZOOM,
    RISK_ZONE_SOURCE_ID,
} from '../../utils/riskZoneVisualization';

const SIBUYAN_CENTER = [122.5571, 12.4176];

const HighRisk3DMap = ({ highRiskZones = [], className = '', focusLocation = null }) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);
    const performanceProfile = useMemo(() => getMapPerformanceProfile(), []);

    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        const provider = createOperationalMapStyle({ includeStreet: false });
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
            mapInstance.addSource(RISK_ZONE_SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            mapInstance.addLayer({
                id: RISK_ZONE_EXTRUSION_LAYER_ID,
                type: 'fill-extrusion',
                source: RISK_ZONE_SOURCE_ID,
                minzoom: RISK_ZONE_MIN_ZOOM,
                paint: {
                    'fill-extrusion-color': ['get', 'color'],
                    'fill-extrusion-height': ['get', 'extrusionHeight'],
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.58,
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

    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const source = mapInstanceRef.current.getSource(RISK_ZONE_SOURCE_ID);
        if (source) {
            source.setData(buildRiskZoneFeatureCollection(highRiskZones, {
                points: performanceProfile.riskZonePolygonPoints,
            }));
        }
    }, [highRiskZones, mapReady, performanceProfile.riskZonePolygonPoints]);

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
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-600 block rounded-sm" /><span className="text-gray-700">Critical Risk</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-orange-500 block rounded-sm" /><span className="text-gray-700">High Risk</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-500 block rounded-sm" /><span className="text-gray-700">Medium Risk</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 block rounded-sm" /><span className="text-gray-700">Low Risk</span></div>
                </div>
                <p className="mt-2 text-gray-500 italic text-[10px]">Ctrl+Drag to rotate &amp; tilt</p>
            </div>
        </div>
    );
};

export default HighRisk3DMap;
