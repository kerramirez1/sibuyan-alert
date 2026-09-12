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
    prepareOperationalMapStyle,
} from '../../config/mapProvider';
import { getMapPerformanceProfile } from '../../utils/mapPerformance';
import {
    buildRiskZoneFeatureCollection,
    RISK_ZONE_EXTRUSION_LAYER_ID,
    RISK_ZONE_MIN_ZOOM,
    RISK_ZONE_SOURCE_ID,
} from '../../utils/riskZoneVisualization';
import { getMapMountBlocker, MAP_UNAVAILABLE_REASON } from '../../utils/mapSupport';
import { toSafeArray } from '../../utils/safeCollection';

const SIBUYAN_CENTER = [122.5571, 12.4176];

const HighRisk3DMap = ({ highRiskZones = [], className = '', focusLocation = null }) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [mapStyleProvider, setMapStyleProvider] = useState(null);
    const performanceProfile = useMemo(() => getMapPerformanceProfile(), []);
    const safeZones = useMemo(() => toSafeArray(highRiskZones), [highRiskZones]);

    // Resolve the style asynchronously (with PMTiles validation + fallback),
    // matching MapView. Never throw out of render/effect.
    useEffect(() => {
        let active = true;
        prepareOperationalMapStyle({ includeStreet: false })
            .then((provider) => {
                if (active) setMapStyleProvider(provider);
            })
            .catch(() => {
                if (!active) return;
                try {
                    setMapStyleProvider(createOperationalMapStyle({
                        includeStreet: false,
                        pmtilesUrl: '',
                        labels3DPmtilesUrl: '',
                    }));
                } catch {
                    if (active) setMapError('style');
                }
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current || !mapStyleProvider) return undefined;
        if (mapError) return undefined;

        const blocker = getMapMountBlocker(mapContainerRef.current);
        if (blocker === MAP_UNAVAILABLE_REASON.WEBGL) {
            setMapError('webgl');
            return undefined;
        }
        if (blocker === MAP_UNAVAILABLE_REASON.SIZE) {
            if (typeof ResizeObserver === 'undefined') return undefined;
            const pendingContainer = mapContainerRef.current;
            const observer = new ResizeObserver(() => {
                if (!mapInstanceRef.current && pendingContainer?.clientWidth > 0 && pendingContainer?.clientHeight > 0) {
                    observer.disconnect();
                    setMapStyleProvider((current) => (current ? { ...current } : current));
                }
            });
            try {
                observer.observe(pendingContainer);
            } catch {
                observer.disconnect();
            }
            return () => observer.disconnect();
        }

        let cancelled = false;
        let mapInstance = null;
        let resizeObserver = null;
        let removeCompactAttribution = () => {};
        let removeCompassToggle = () => {};

        try {
            mapInstance = new maplibregl.Map({
                ...MAP_INTERACTION_OPTIONS,
                container: mapContainerRef.current,
                style: mapStyleProvider.style,
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
        } catch {
            setMapError('init');
            return undefined;
        }

        try {
            const navigationControl = new maplibregl.NavigationControl({ visualizePitch: true });
            mapInstance.addControl(navigationControl, 'top-right');
            removeCompactAttribution = installCompactAttribution(mapInstance) || (() => {});
            removeCompassToggle = installCompassOrientationToggle(mapInstance, navigationControl, {
                pitch: 55,
                bearing: -15,
            }) || (() => {});
        } catch {
            removeCompactAttribution = () => {};
            removeCompassToggle = () => {};
        }

        if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
            const container = mapContainerRef.current;
            let resizeRaf = 0;
            resizeObserver = new ResizeObserver(() => {
                cancelAnimationFrame(resizeRaf);
                resizeRaf = requestAnimationFrame(() => {
                    if (cancelled || !mapInstanceRef.current) return;
                    try {
                        mapInstanceRef.current.resize();
                    } catch {
                        // Ignore resize during teardown.
                    }
                });
            });
            try {
                resizeObserver.observe(container);
            } catch {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
        }

        let errorHandler = null;
        try {
            errorHandler = () => {
                // Vector-label source failures degrade to Esri reference labels
                // already in the style — never crash the 3D view.
            };
            mapInstance.on('error', errorHandler);
        } catch {
            // Error listener is optional.
        }

        mapInstance.on('load', () => {
            if (cancelled) return;
            try {
                if (!mapInstance.getSource(RISK_ZONE_SOURCE_ID)) {
                    mapInstance.addSource(RISK_ZONE_SOURCE_ID, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] },
                    });
                }

                if (!mapInstance.getLayer(RISK_ZONE_EXTRUSION_LAYER_ID)) {
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
                }
            } catch {
                // Source/layer raced with a double load — readiness still valid.
            }

            if (cancelled) return;
            mapInstanceRef.current = mapInstance;
            setMapReady(true);
        });

        mapInstance.on('error', () => {
            // Swallow tile/source errors: the base satellite imagery remains.
        });

        return () => {
            cancelled = true;
            try {
                resizeObserver?.disconnect();
            } catch {
                // Already disconnected.
            }
            try {
                removeCompassToggle();
            } catch {
                // Already removed.
            }
            try {
                removeCompactAttribution();
            } catch {
                // Already removed.
            }
            try {
                mapInstance.remove();
            } catch {
                // map may already be removed when unmounting before load
            }
            mapInstanceRef.current = null;
        };
    }, [mapStyleProvider, mapError, performanceProfile]);

    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        try {
            const source = mapInstanceRef.current.getSource(RISK_ZONE_SOURCE_ID);
            if (source) {
                source.setData(buildRiskZoneFeatureCollection(safeZones, {
                    points: performanceProfile.riskZonePolygonPoints,
                }));
            }
        } catch {
            // setData on a removed source during unmount is harmless.
        }
    }, [safeZones, mapReady, performanceProfile.riskZonePolygonPoints]);

    useEffect(() => {
        if (!mapInstanceRef.current || !focusLocation || !mapReady) return undefined;

        try {
            return scheduleMapFocus(mapInstanceRef.current, focusLocation, {
                zoom: 14,
                pitch: 55,
                bearing: -15,
                duration: performanceProfile.navigationDuration,
            });
        } catch {
            return undefined;
        }
    }, [focusLocation, mapReady, performanceProfile.navigationDuration]);

    return (
        <div className={`relative aspect-square w-full sm:aspect-auto sm:min-h-[500px] ${className}`}>
            <div
                ref={mapContainerRef}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {mapError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-gray-100 p-6 text-center dark:bg-gray-900" role="alert">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {mapError === 'webgl' ? '3D view is not supported on this device' : '3D map failed to load'}
                    </p>
                    <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
                        The zone list below remains fully usable.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setMapError(null);
                            setMapReady(false);
                            mapInstanceRef.current = null;
                            setMapStyleProvider((current) => (current ? { ...current } : current));
                        }}
                        className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 cursor-pointer"
                    >
                        Try again
                    </button>
                </div>
            )}
            {!mapReady && !mapError && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 text-sm font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300" role="status">
                    Preparing 3D map&hellip;
                </div>
            )}
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
