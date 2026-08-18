import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { useMemo } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion } from 'framer-motion';
import toast from '../../utils/appToast';
import { HiOutlineLocationMarker, HiOutlineMap, HiOutlineOfficeBuilding, HiOutlineShieldExclamation } from 'react-icons/hi';
import {
    getMapCoordinates,
    getFilteredMapReports,
    groupReportsByMapLocation,
} from '../../utils/mapReports';
import {
    installCompassOrientationToggle,
    installCompactAttribution,
    isWithinSibuyanInteractionBounds,
    focusExistingMapEntity,
    MAP_FOCUS_CONFIG,
    MAP_INTERACTION_OPTIONS,
    scheduleMapFocus,
} from '../../utils/mapNavigation';
import { getMapPerformanceProfile } from '../../utils/mapPerformance';
import {
    buildRiskZoneFeatureCollection,
    getRiskZoneBounds,
    RISK_ZONE_FILL_LAYER_ID,
    RISK_ZONE_MIN_ZOOM,
    RISK_ZONE_OUTLINE_LAYER_ID,
    RISK_ZONE_SOURCE_ID,
} from '../../utils/riskZoneVisualization';
import {
    OPERATIONAL_MAX_ZOOM,
    PMTILES_SOURCE_ID,
    prepareOperationalMapStyle,
} from '../../config/mapProvider';
import MapIncidentDetails from './MapIncidentDetails';
import MapOverlayPanel from './MapOverlayPanel';
import MapLegend from './MapLegend';
import { getMapRiskTypeConfig, MAP_RISK_ZONE_CONFIG, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import {
    createOperationalMarkerElement,
    createRiskZoneMarkerElement,
    getSelectedLocationMarkerSvg,
} from '../../utils/mapMarkerVisuals';

// Sibuyan Island bounds and center
const SIBUYAN_CENTER = [122.5571, 12.4176]; // Lon/Lat
const SIBUYAN_CAMERA_BOUNDS = [[122.35, 12.20], [122.80, 12.65]];
const GENERAL_CAMERA_BOUNDS = [[121.5, 11.5], [123.5, 13.5]];

// Municipality centers for quick navigation
const MUNICIPALITIES = {
    cajidiocan: { name: 'Cajidiocan', center: [122.6897, 12.4044] },
    magdiwang: { name: 'Magdiwang', center: [122.5097, 12.4778] },
    sanfernando: { name: 'San Fernando', center: [122.5469, 12.3536] },
};

// Incident category colors
const INCIDENT_COLORS = {
    accident: '#3B82F6',
};

const ZONE_COLORS = {
    landslide_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    accident_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    fire_risk: MAP_RISK_ZONE_CONFIG.markerColor,
    other: MAP_RISK_ZONE_CONFIG.markerColor,
};

const SEVERITY_CONFIG = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-emerald-100 text-emerald-700',
};

// Operational incident and hazard pins remain fully visible over the imagery.
const OPERATIONAL_MARKER_VISIBILITY = Object.freeze({
    opacity: 1,
    opacityWhenCovered: 1,
});

const MAP_TOOL_BUTTON_CLASS = 'flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-gray-200/90 bg-white/90 text-gray-700 backdrop-blur-md shadow-2xs transition-colors duration-150 hover:bg-white hover:text-gray-950 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-[#07130e] dark:hover:border-white/20 dark:hover:text-white';

const MapToolButton = ({ label, icon: Icon, active = false, ...props }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        className={`${MAP_TOOL_BUTTON_CLASS} ${active ? 'text-brand-700 dark:text-emerald-400' : ''}`}
        {...props}
    >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
    </button>
);

const MapView = ({
    reports = [],
    highRiskZones = [],
    locateRequest = null,
    externalContextPanelOpen = false,
    onEntityInspectorOpen = null,
    showPending = false,
    showRiskZones = true,
    onLocationSelect = null,
    selectedLocation = null,
    className = '',
    filterCategory = null,
    filterStatus = null,
    filterMode = 'public',
    focusLocation = null,
    enable3D = true,
    gpsAccuracy = null,
    userLocation = null, // New prop for Blue Dot
    canRespond = false,
    onRespondToReport = null,
    canResolve = false,
    canResolveReport = null,
    onResolveReport = null,
    viewerRole = 'guest',
    showDataState = false,
    disableScrollZoom = false,
    mode = 'full',
    showLegend = true,
    showIncidentStatusLegend = true,
}) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const selectedMarkerRef = useRef(null);
    const selectedLocationRef = useRef(selectedLocation);
    const reportMarkersRef = useRef([]);
    const zoneMarkersRef = useRef([]);
    const selectedOperationalMarkerRef = useRef(null);
    const popupRef = useRef(null);
    const markerFocusCleanupRef = useRef(null);
    const streetLayersRef = useRef({ all: [], active: [], fallback: null });
    const streetZoomRangeRef = useRef({ min: 0, max: OPERATIONAL_MAX_ZOOM });
    const streetFallbackActivatedRef = useRef(false);
    const [mapProvider, setMapProvider] = useState(null);
    const [mapReady, setMapReady] = useState(false);
    const [showMuniMenu, setShowMuniMenu] = useState(false);
    const [mapStyle, setMapStyle] = useState('satellite'); // 'satellite' or 'streets'
    const mapStyleRef = useRef(mapStyle);
    const [showHazardZones, setShowHazardZones] = useState(showRiskZones);
    const [mapModal, setMapModal] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const onLocationSelectRef = useRef(onLocationSelect);
    const onEntityInspectorOpenRef = useRef(onEntityInspectorOpen);
    const municipalityMenuRef = useRef(null);
    const performanceProfile = useMemo(() => getMapPerformanceProfile(), []);
    const effectiveLocateRequest = useMemo(() => {
        if (locateRequest?.entity) return locateRequest;
        const entity = focusLocation?.entity || focusLocation?.zone;
        if (!entity) return null;

        return {
            type: focusLocation.type || 'risk-zone',
            id: String(focusLocation.entityId || entity._id || entity.id || ''),
            entity,
            requestId: focusLocation.requestId,
        };
    }, [focusLocation, locateRequest]);
    const effective3D = enable3D && performanceProfile.cameraPitchEnabled;
    const filteredReports = useMemo(() => {
        return getFilteredMapReports(reports, {
            includePending: showPending,
            category: filterCategory,
            statusFilter: filterStatus,
            filterMode,
        });
    }, [filterCategory, filterMode, filterStatus, reports, showPending]);
    const isRiskZoneFilterActive = filterStatus === 'risk-zones' || filterStatus === 'all' || !filterStatus;
    const filteredRiskZones = useMemo(() => {
        if (!showHazardZones || !isRiskZoneFilterActive) return [];
        return highRiskZones;
    }, [highRiskZones, isRiskZoneFilterActive, showHazardZones]);
    const hasGroupedReports = useMemo(
        () => groupReportsByMapLocation(filteredReports).some((group) => group.reports.length > 1),
        [filteredReports],
    );

    useEffect(() => {
        onLocationSelectRef.current = onLocationSelect;
    }, [onLocationSelect]);

    useEffect(() => {
        onEntityInspectorOpenRef.current = onEntityInspectorOpen;
    }, [onEntityInspectorOpen]);

    useEffect(() => {
        selectedLocationRef.current = selectedLocation;
    }, [selectedLocation]);

    useEffect(() => {
        mapStyleRef.current = mapStyle;
    }, [mapStyle]);

    useEffect(() => {
        if (!showMuniMenu) return undefined;

        const handlePointerDown = (event) => {
            if (!municipalityMenuRef.current?.contains(event.target)) setShowMuniMenu(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setShowMuniMenu(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [showMuniMenu]);

    const selectOperationalMarker = useCallback((element) => {
        selectedOperationalMarkerRef.current?.classList.remove('map-marker--selected');
        selectedOperationalMarkerRef.current = element || null;
        element?.classList.add('map-marker--selected');
    }, []);

    const closeMapSelection = useCallback(() => {
        selectOperationalMarker(null);
        setMapModal(null);
    }, [selectOperationalMarker]);

    useEffect(() => {
        if (externalContextPanelOpen) closeMapSelection();
    }, [closeMapSelection, externalContextPanelOpen]);

    useEffect(() => {
        let active = true;

        prepareOperationalMapStyle().then((provider) => {
            if (!active) return;
            setMapProvider(provider);
            if (provider.pmtilesError) {
                toast.error(`Street map archive unavailable: ${provider.pmtilesError}`, {
                    id: 'street-map-validation-fallback',
                });
            }
        });

        return () => {
            active = false;
        };
    }, []);

    // Generate circle polygon for zones
    const generateCirclePolygon = useCallback((center, radiusKm, points = 64) => {
        const coords = [];
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * (2 * Math.PI);
            const dx = radiusKm * Math.cos(angle);
            const dy = radiusKm * Math.sin(angle);
            const dLng = dx / (111.32 * Math.cos(center[1] * Math.PI / 180));
            const dLat = dy / 110.574;
            coords.push([center[0] + dLng, center[1] + dLat]);
        }
        coords.push(coords[0]);
        return coords;
    }, []);

    // Initialize map
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current || !mapProvider) return;

        const provider = mapProvider;
        streetLayersRef.current = {
            all: provider.allStreetLayerIds,
            active: provider.primaryStreetLayerIds,
            fallback: provider.fallbackStreetLayerId,
        };
        streetZoomRangeRef.current = {
            min: provider.streetMinZoom,
            max: provider.streetMaxZoom,
        };
        streetFallbackActivatedRef.current = false;

        const mapInstance = new maplibregl.Map({
            ...MAP_INTERACTION_OPTIONS,
            container: mapContainerRef.current,
            style: provider.style,
            center: SIBUYAN_CENTER,
            zoom: performanceProfile.compactViewport ? 10 : 11,
            pitch: effective3D ? 45 : 0,
            bearing: effective3D ? -17 : 0,
            antialias: performanceProfile.antialias,
            pixelRatio: performanceProfile.pixelRatio,
            maxTileCacheSize: performanceProfile.maxTileCacheSize,
            fadeDuration: performanceProfile.fadeDuration,
            renderWorldCopies: false,
            attributionControl: false,
            // Camera padding lets a square mobile viewport show the whole island.
            // Pin selection remains independently constrained below.
            maxBounds: onLocationSelect ? SIBUYAN_CAMERA_BOUNDS : GENERAL_CAMERA_BOUNDS,
            maxZoom: OPERATIONAL_MAX_ZOOM,
        });

        if (disableScrollZoom) {
            mapInstance.scrollZoom.disable();
        }

        const removeCompactAttribution = installCompactAttribution(
            mapInstance,
            new maplibregl.AttributionControl({ compact: true }),
        );
        
        let removeCompassToggle = () => {};
        if (mode === 'incident-preview') {
            const navigationControl = new maplibregl.NavigationControl({
                showCompass: false,
                showZoom: true,
            });
            mapInstance.addControl(navigationControl, 'top-right');
        } else {
            const navigationControl = new maplibregl.NavigationControl({ visualizePitch: true });
            mapInstance.addControl(navigationControl, 'top-right');
            removeCompassToggle = installCompassOrientationToggle(mapInstance, navigationControl, {
                pitch: effective3D ? 45 : 0,
                bearing: effective3D ? -17 : 0,
            });
        }

        mapInstance.on('error', (event) => {
            const sourceId = event?.sourceId || event?.source?.id;
            if (sourceId !== PMTILES_SOURCE_ID || streetFallbackActivatedRef.current) return;

            streetFallbackActivatedRef.current = true;
            streetLayersRef.current.active = streetLayersRef.current.fallback
                ? [streetLayersRef.current.fallback]
                : [];
            streetZoomRangeRef.current = { min: 0, max: OPERATIONAL_MAX_ZOOM };

            if (mapStyleRef.current === 'streets') {
                mapInstance.setMaxZoom(OPERATIONAL_MAX_ZOOM);
                streetLayersRef.current.all.forEach((layerId) => {
                    if (mapInstance.getLayer(layerId)) {
                        mapInstance.setLayoutProperty(layerId, 'visibility', 'none');
                    }
                });
                streetLayersRef.current.active.forEach((layerId) => {
                    if (mapInstance.getLayer(layerId)) {
                        mapInstance.setLayoutProperty(layerId, 'visibility', 'visible');
                    }
                });
            }

            toast.error('Self-hosted street map is unavailable. Using the public fallback map.', {
                id: 'street-map-fallback',
            });
        });

        // Create popup
        popupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: false,
            maxWidth: '320px',
        });

        mapInstance.on('load', () => {
            mapInstance.addSource(RISK_ZONE_SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            mapInstance.addLayer({
                id: RISK_ZONE_FILL_LAYER_ID,
                type: 'fill',
                source: RISK_ZONE_SOURCE_ID,
                minzoom: RISK_ZONE_MIN_ZOOM,
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.16,
                },
            });
            mapInstance.addLayer({
                id: RISK_ZONE_OUTLINE_LAYER_ID,
                type: 'line',
                source: RISK_ZONE_SOURCE_ID,
                minzoom: RISK_ZONE_MIN_ZOOM,
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 2,
                    'line-opacity': 0.8,
                },
            });

            // Add user location layer (Blue Dot)
            mapInstance.addSource('user-location', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            mapInstance.addLayer({
                id: 'user-location-inner',
                type: 'circle',
                source: 'user-location',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#3B82F6',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                },
            });

            // Pulsing effect for user location? Or just inner dot.
            // Let's keep it simple for now: Blue Dot + Accuracy Circle

            // Add GPS accuracy circle source and layer
            mapInstance.addSource('gps-accuracy', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            mapInstance.addLayer({
                id: 'gps-accuracy-layer',
                type: 'fill',
                source: 'gps-accuracy',
                paint: {
                    'fill-color': '#3B82F6',
                    'fill-opacity': 0.15,
                },
                beforeId: 'user-location-inner' // Draw below the blue dot
            });

            mapInstance.addLayer({
                id: 'gps-accuracy-outline',
                type: 'line',
                source: 'gps-accuracy',
                paint: {
                    'line-color': '#3B82F6',
                    'line-width': 1,
                    'line-opacity': 0.4,
                    'line-dasharray': [2, 2],
                },
                beforeId: 'user-location-inner'
            });

            mapInstanceRef.current = mapInstance;
            setMapReady(true);
        });

        // Handle map clicks
        mapInstance.on('click', (e) => {
            // Operational markers are accessible HTML controls and stop event
            // propagation themselves. A canvas click therefore always means map
            // selection and no duplicate WebGL hit layer is required.
            popupRef.current.remove();
            closeMapSelection();
            if (onLocationSelectRef.current) {
                const location = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                if (!isWithinSibuyanInteractionBounds(location)) {
                    toast.error('Choose a point within Sibuyan Island.', { id: 'sibuyan-map-bounds' });
                    return;
                }
                onLocationSelectRef.current(location);
            }
        });

        return () => {
            removeCompassToggle();
            removeCompactAttribution();
            markerFocusCleanupRef.current?.();
            popupRef.current?.remove();
            mapInstance.remove();
            mapInstanceRef.current = null;
        };
    }, [closeMapSelection, effective3D, mapProvider, performanceProfile]);

    // Handle map style switching
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;
        const map = mapInstanceRef.current;

        const setVisibility = (layerId, visible) => {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            }
        };

        streetLayersRef.current.all.forEach((layerId) => setVisibility(layerId, false));

        if (mapStyle === 'satellite') {
            map.setMaxZoom(OPERATIONAL_MAX_ZOOM);
            setVisibility('esri-imagery-layer', true);
            setVisibility('esri-reference-layer', true);
        } else {
            const streetMaxZoom = streetZoomRangeRef.current.max;
            map.setMaxZoom(streetMaxZoom);
            if (map.getZoom() > streetMaxZoom) {
                map.easeTo({ zoom: streetMaxZoom, duration: 250 });
            }
            setVisibility('esri-imagery-layer', false);
            setVisibility('esri-reference-layer', false);
            streetLayersRef.current.active.forEach((layerId) => setVisibility(layerId, true));
        }
    }, [mapStyle, mapReady]);

    useEffect(() => {
        setShowHazardZones(showRiskZones);
    }, [showRiskZones]);

    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || mode === 'incident-preview') return;
        const map = mapInstanceRef.current;
        const setVisibility = (layerId, visible) => {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            }
        };

        if (filteredRiskZones.length === 0) {
            setVisibility(RISK_ZONE_FILL_LAYER_ID, false);
            setVisibility(RISK_ZONE_OUTLINE_LAYER_ID, false);
            const source = map.getSource(RISK_ZONE_SOURCE_ID);
            source?.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        setVisibility(RISK_ZONE_FILL_LAYER_ID, true);
        setVisibility(RISK_ZONE_OUTLINE_LAYER_ID, true);

        const zonesWithRealCoverage = filteredRiskZones.filter((zone) => (
            Number.isFinite(Number(zone?.radius)) && Number(zone.radius) > 0
        ));
        const source = map.getSource(RISK_ZONE_SOURCE_ID);
        source?.setData(buildRiskZoneFeatureCollection(zonesWithRealCoverage, {
            points: performanceProfile.riskZonePolygonPoints,
        }));
    }, [filteredRiskZones, mapReady, performanceProfile.riskZonePolygonPoints, mode]);

    // Update data layers
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        const getReportMarkerColor = (report) => {
            if (MAP_STATUS_CONFIG[report.status]) return MAP_STATUS_CONFIG[report.status].markerColor;
            return INCIDENT_COLORS[report.incidentCategory] || MAP_STATUS_CONFIG.verified.markerColor;
        };

        // Clear existing report markers
        reportMarkersRef.current.forEach(({ marker }) => marker.remove());
        reportMarkersRef.current = [];
        if (selectedOperationalMarkerRef.current?.classList.contains('report-marker')) {
            selectedOperationalMarkerRef.current = null;
        }

        // Co-located reports share one marker with a count badge so no incident is
        // silently hidden underneath another marker at the same coordinates.
        groupReportsByMapLocation(filteredReports)
            .forEach(({ coordinates: coords, reports: groupedReports }) => {
                const statusPriority = { responding: 4, transferred: 3, verified: 2, pending: 1 };
                const report = [...groupedReports].sort(
                    (left, right) => (statusPriority[right.status] || 0) - (statusPriority[left.status] || 0)
                )[0];
                const canRespondToThisReport = canRespond && ['verified', 'transferred'].includes(report.status);
                const canResolveThisReport = canResolve &&
                    report.status === 'responding' &&
                    (!canResolveReport || canResolveReport(report));
                const markerColor = getReportMarkerColor(report);
                const el = createOperationalMarkerElement({
                    report,
                    groupedReports,
                    markerColor,
                });

                const marker = new maplibregl.Marker({
                    ...OPERATIONAL_MARKER_VISIBILITY,
                    element: el,
                    anchor: 'bottom',
                })
                    .setLngLat([coords.lng, coords.lat])
                    .addTo(map);

                // Open fixed modal instead of inline map popup
                const openMarker = (e) => {
                    e.stopPropagation();
                    onEntityInspectorOpenRef.current?.();
                    selectOperationalMarker(el);
                    markerFocusCleanupRef.current?.();
                    markerFocusCleanupRef.current = focusExistingMapEntity(map, {
                        type: 'incident',
                        coordinates: coords,
                    }, {
                        duration: performanceProfile.navigationDuration === 0
                            ? 0
                            : MAP_FOCUS_CONFIG.duration,
                    });
                    if (groupedReports.length > 1) {
                        setMapModal({ type: 'reportGroup', data: groupedReports });
                        return;
                    }
                    setMapModal({ type: 'report', data: report, canRespond: canRespondToThisReport, canResolve: canResolveThisReport });
                };
                el.addEventListener('click', openMarker);
                el.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openMarker(event);
                    }
                });


                reportMarkersRef.current.push({
                    ids: groupedReports.map((item) => String(item._id ?? item.id ?? '')).filter(Boolean),
                    marker,
                    element: el,
                });
            });

    }, [filteredReports, mapReady, canRespond, canResolve, canResolveReport, selectOperationalMarker]);

    // Risk zones use focused HTML pins so the imagery remains unobstructed.
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // Clear existing zone markers
        zoneMarkersRef.current.forEach(({ marker }) => marker.remove());
        zoneMarkersRef.current = [];
        if (selectedOperationalMarkerRef.current?.classList.contains('zone-marker')) {
            selectedOperationalMarkerRef.current = null;
        }

        if (filteredRiskZones.length === 0) return;

        // Create unique HTML markers for high-risk zones (warning triangle style)
        filteredRiskZones.forEach(zone => {
            const coordinates = getMapCoordinates(zone);
            if (!coordinates) return;
            const color = ZONE_COLORS[zone.type] || ZONE_COLORS.other;
            const el = createRiskZoneMarkerElement({ zone, color });

            const marker = new maplibregl.Marker({
                ...OPERATIONAL_MARKER_VISIBILITY,
                element: el,
                anchor: 'bottom',
            })
                    .setLngLat([coordinates.lng, coordinates.lat])
                    .addTo(map);

            // Open fixed modal instead of inline map popup
            const openMarker = (e) => {
                e.stopPropagation();
                onEntityInspectorOpenRef.current?.();
                selectOperationalMarker(el);
                markerFocusCleanupRef.current?.();
                markerFocusCleanupRef.current = focusExistingMapEntity(map, {
                    type: 'risk-zone',
                    coordinates,
                    bounds: getRiskZoneBounds(zone, {
                        points: performanceProfile.riskZonePolygonPoints,
                    }),
                }, {
                    duration: performanceProfile.navigationDuration === 0
                        ? 0
                        : MAP_FOCUS_CONFIG.duration,
                    padding: performanceProfile.compactViewport
                        ? MAP_FOCUS_CONFIG.riskZonePadding.compact
                        : MAP_FOCUS_CONFIG.riskZonePadding.default,
                });
                setMapModal({
                    type: 'zone',
                    data: zone,
                });
            };
            el.addEventListener('click', openMarker);
            el.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMarker(event);
                }
            });


            zoneMarkersRef.current.push({
                id: String(zone._id ?? zone.id ?? ''),
                marker,
                element: el,
            });
        });

    }, [filteredRiskZones, mapReady, performanceProfile, selectOperationalMarker]);

    // Entity-based in-page and deep-link requests share one MapLibre camera path.
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || !effectiveLocateRequest?.entity) return undefined;

        const map = mapInstanceRef.current;
        const coordinates = getMapCoordinates(effectiveLocateRequest.entity);
        if (!coordinates) return undefined;

        const entityId = String(effectiveLocateRequest.id || '');
        const revealLocatedEntity = () => {
            const markerEntry = effectiveLocateRequest.type === 'risk-zone'
                ? zoneMarkersRef.current.find(({ id }) => id === entityId)
                : reportMarkersRef.current.find(({ ids }) => ids.includes(entityId));
            if (markerEntry) selectOperationalMarker(markerEntry.element);
        };

        selectOperationalMarker(null);
        const bounds = effectiveLocateRequest.type === 'risk-zone'
            ? getRiskZoneBounds(effectiveLocateRequest.entity, {
                points: performanceProfile.riskZonePolygonPoints,
            })
            : null;

        return focusExistingMapEntity(map, {
            type: effectiveLocateRequest.type,
            coordinates,
            bounds,
        }, {
            duration: performanceProfile.navigationDuration === 0 ? 0 : MAP_FOCUS_CONFIG.duration,
            padding: performanceProfile.compactViewport
                ? MAP_FOCUS_CONFIG.riskZonePadding.compact
                : MAP_FOCUS_CONFIG.riskZonePadding.default,
            zoom: MAP_FOCUS_CONFIG.pointZoom,
            onComplete: revealLocatedEntity,
        });
    }, [effectiveLocateRequest, mapReady, performanceProfile, selectOperationalMarker]);

    // The draggable selected pin has its own update path. Moving it must not
    // recreate operational incident or high-risk-zone markers.
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // Handle HTML Marker for selected location (always visible on top)
        if (selectedLocation) {
            if (!selectedMarkerRef.current) {
                // Create a custom marker element
                const el = document.createElement('div');
                el.className = 'selected-location-marker';
                el.innerHTML = `
                    <div style="position:relative; width:34px; height:38px; display:flex; align-items:flex-end; justify-content:center;">
                        ${getSelectedLocationMarkerSvg({ width: 30, height: 34 })}
                    </div>
                `;
                el.style.cursor = 'pointer';
                el.style.zIndex = '3';

                selectedMarkerRef.current = new maplibregl.Marker({
                    ...OPERATIONAL_MARKER_VISIBILITY,
                    element: el,
                    anchor: 'bottom',
                    draggable: true,
                })
                    .setLngLat([selectedLocation.lng, selectedLocation.lat])
                    .addTo(map);

                selectedMarkerRef.current.on('dragend', () => {
                    const lngLat = selectedMarkerRef.current.getLngLat();
                    const location = { lat: lngLat.lat, lng: lngLat.lng };
                    if (!isWithinSibuyanInteractionBounds(location)) {
                        const previous = selectedLocationRef.current;
                        if (previous) selectedMarkerRef.current.setLngLat([previous.lng, previous.lat]);
                        toast.error('Keep the incident pin within Sibuyan Island.', { id: 'sibuyan-map-bounds' });
                        return;
                    }
                    if (onLocationSelectRef.current) {
                        onLocationSelectRef.current(location);
                    }
                });
            } else {
                selectedMarkerRef.current.setLngLat([selectedLocation.lng, selectedLocation.lat]);
            }
        } else {
            if (selectedMarkerRef.current) {
                selectedMarkerRef.current.remove();
                selectedMarkerRef.current = null;
            }
        }

    }, [selectedLocation, mapReady]);

    // GPS can update frequently. Only touch the blue-dot and accuracy sources so
    // continuous watches remain smooth on mobile devices.
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // Update User Location Logic (Blue Dot)
        const userSource = map.getSource('user-location');
        if (userSource && userLocation) {
            userSource.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] }
                }]
            });
        } else if (userSource) {
            userSource.setData({ type: 'FeatureCollection', features: [] });
        }

        // Update GPS Accuracy Circle (based on userLocation, NOT selectedLocation)
        const accuracySource = map.getSource('gps-accuracy');
        if (accuracySource) {
            if (userLocation && gpsAccuracy) {
                const center = [userLocation.lng, userLocation.lat];
                // Minimum visible radius to avoid tiny dots
                const radiusKm = Math.max(gpsAccuracy, 10) / 1000;
                const coords = generateCirclePolygon(center, radiusKm);

                accuracySource.setData({
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'Polygon', coordinates: [coords] }
                    }],
                });
            } else {
                accuracySource.setData({ type: 'FeatureCollection', features: [] });
            }
        }
    }, [userLocation, gpsAccuracy, mapReady, generateCirclePolygon]);

    // Handle focus location updates (for dynamic changes)
    useEffect(() => {
        if (!mapInstanceRef.current || !focusLocation || !mapReady || effectiveLocateRequest) return undefined;

        return scheduleMapFocus(mapInstanceRef.current, focusLocation, {
            zoom: MAP_FOCUS_CONFIG.pointZoom,
            duration: (mode === 'incident-preview' || performanceProfile.navigationDuration === 0)
                ? 0
                : MAP_FOCUS_CONFIG.duration,
        });
    }, [effectiveLocateRequest, focusLocation, mapReady, performanceProfile.navigationDuration, mode]);

    // Navigation handlers
    const recenterMap = () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo({
                center: SIBUYAN_CENTER,
                zoom: performanceProfile.compactViewport ? 10 : 11,
                pitch: effective3D ? 45 : 0,
                bearing: effective3D ? -17 : 0,
                duration: performanceProfile.navigationDuration,
            });
        }
    };

    const goToMunicipality = (center) => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo({
                center: center,
                zoom: 13,
                pitch: effective3D ? 45 : 0,
                bearing: effective3D ? -17 : 0,
                duration: performanceProfile.navigationDuration,
            });
        }
        setShowMuniMenu(false);
    };

    const getStatusBadgeClass = (status) => {
        return MAP_STATUS_CONFIG[status]?.badge || 'border-gray-200 bg-gray-50 text-gray-700';
    };

    const handleRespondFromModal = async (report) => {
        if (!onRespondToReport) return;
        setActionLoading(true);
        const result = await onRespondToReport(report);
        if (result?.ok) {
            toast.success(result.message || 'Responder assigned');
            closeMapSelection();
        } else {
            toast.error(result?.message || 'Failed to respond');
        }
        setActionLoading(false);
    };

    const handleResolveFromModal = async (report) => {
        if (!onResolveReport) return;
        setActionLoading(true);
        const result = await onResolveReport(report);
        if (result?.ok) {
            toast.success(result.message || 'Incident resolved');
            closeMapSelection();
        } else {
            toast.error(result?.message || 'Failed to resolve');
        }
        setActionLoading(false);
    };

    const selectedZoneCoordinates = mapModal?.type === 'zone'
        ? getMapCoordinates(mapModal.data)
        : null;

    return (
        <div className={`relative isolate min-h-0 overflow-hidden rounded-lg ${className}`}>
            <div
                ref={mapContainerRef}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {!mapReady && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-100 text-sm font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300" role="status">
                    Preparing map&hellip;
                </div>
            )}

            {mapReady && showDataState && (
                filterStatus === 'risk-zones'
                    ? filteredRiskZones.length === 0
                    : filteredReports.length === 0 && (filterStatus || filteredRiskZones.length === 0)
            ) && (
                <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[calc(100%-5rem)] rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-xs font-medium text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-200" role="status">
                    {filterStatus === 'risk-zones'
                        ? 'No high-risk zones match the selected filter.'
                        : filterStatus
                            ? 'No incidents match the selected filter.'
                            : 'No active incidents are currently visible.'}
                </div>
            )}

            {mapModal && (
                <MapOverlayPanel
                    title={mapModal.type === 'zone'
                        ? 'High-risk zone details'
                        : mapModal.type === 'reportGroup'
                            ? 'Incidents at this location'
                            : 'Incident details'}
                    onClose={closeMapSelection}
                    closeLabel={mapModal.type === 'zone' ? 'Close risk zone details' : 'Close incident details'}
                    size={mapModal.type === 'zone' ? 'md' : 'lg'}
                    presentation="contextual"
                >

                        {mapModal.type === 'report' && (
                            <MapIncidentDetails
                                report={mapModal.data}
                                viewerRole={viewerRole}
                                canRespond={mapModal.canRespond}
                                canResolve={mapModal.canResolve}
                                actionLoading={actionLoading}
                                onRespond={handleRespondFromModal}
                                onResolve={handleResolveFromModal}
                            />
                        )}

                        {mapModal.type === 'reportGroup' && (
                            <div className="divide-y divide-gray-100 px-4 py-2 sm:px-5">
                                {mapModal.data.map((report) => (
                                    <button
                                        key={report._id || report.id}
                                        type="button"
                                        onClick={() => setMapModal({
                                            type: 'report',
                                            data: report,
                                            canRespond: canRespond && ['verified', 'transferred'].includes(report.status),
                                            canResolve: canResolve && report.status === 'responding' && (!canResolveReport || canResolveReport(report)),
                                        })}
                                        className="flex w-full items-start justify-between gap-4 py-4 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-[13px] font-bold uppercase tracking-wider text-gray-900">
                                                {report.title || report.incidentType || 'Incident report'}
                                            </span>
                                            <span className="mt-1 block truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                                                {report.address || 'Location unavailable'}
                                            </span>
                                        </span>
                                        <span className={`shrink-0 rounded-sm border px-2.5 py-1 text-[10px] font-bold uppercase ${getStatusBadgeClass(report.status)}`}>
                                            {report.status}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {mapModal.type === 'zone' && (
                            <div className="px-4 py-4 sm:px-5">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_CONFIG[mapModal.data.severity] || SEVERITY_CONFIG.low}`}>
                                        {mapModal.data.severity || 'Low'}
                                    </span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{mapModal.data.municipality || mapModal.data.municipalityName || 'Sibuyan Island'}</span>
                                </div>
                                <h4 className="text-[15px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">{mapModal.data.name || 'High-risk zone'}</h4>
                                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{mapModal.data.description || 'No description provided.'}</p>
                                <dl className="mt-4 divide-y divide-gray-300 border-y border-gray-300 dark:divide-gray-700 dark:border-gray-700">
                                    <div className="flex items-center justify-between gap-4 py-3">
                                        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Hazard type</dt>
                                        <dd className="text-right text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white">{getMapRiskTypeConfig(mapModal.data.type).label}</dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 py-3">
                                        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Coverage</dt>
                                        <dd className="text-right text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white">{Number.isFinite(Number(mapModal.data.radius)) ? `${Number(mapModal.data.radius)} m radius` : 'Not specified'}</dd>
                                    </div>
                                </dl>
                                {selectedZoneCoordinates && (
                                    <a
                                        href={`https://www.google.com/maps?q=${selectedZoneCoordinates.lat},${selectedZoneCoordinates.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center rounded-sm border border-gray-300 bg-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Open in Google Maps
                                    </a>
                                )}
                            </div>
                        )}
                </MapOverlayPanel>
            )}

            {/* Controls */}
            {!['incident-preview', 'report-location'].includes(mode) && (
                <div className="mobile-sidebar-hide pointer-events-auto absolute bottom-3 right-3 z-20 flex flex-col gap-2 sm:bottom-4 sm:right-4" role="group" aria-label="Map tools">
                    <MapToolButton
                        label={mapStyle === 'satellite' ? 'Switch to street map' : 'Switch to satellite map'}
                        icon={HiOutlineMap}
                        active={mapStyle === 'streets'}
                        onClick={() => setMapStyle(prev => prev === 'satellite' ? 'streets' : 'satellite')}
                        aria-pressed={mapStyle === 'streets'}
                    />

                    <MapToolButton
                        label={showHazardZones ? 'Hide high-risk hazard zones' : 'Show high-risk hazard zones'}
                        icon={HiOutlineShieldExclamation}
                        active={showHazardZones}
                        onClick={() => setShowHazardZones((prev) => !prev)}
                        aria-pressed={showHazardZones}
                    />

                    <div ref={municipalityMenuRef} className="relative">
                        <MapToolButton
                            label="Choose municipality"
                            icon={HiOutlineOfficeBuilding}
                            onClick={() => setShowMuniMenu(!showMuniMenu)}
                            aria-expanded={showMuniMenu}
                            aria-controls="municipality-map-menu"
                        />
                        {showMuniMenu && (
                            <motion.div
                                id="municipality-map-menu"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute bottom-10 sm:bottom-12 right-0 min-w-[170px] rounded-xl border border-gray-200/90 bg-white/95 p-1.5 backdrop-blur-md shadow-lg dark:border-white/10 dark:bg-[#0c1813]/95"
                            >
                                {Object.entries(MUNICIPALITIES).map(([key, muni]) => (
                                    <button
                                        key={key}
                                        onClick={() => goToMunicipality(muni.center)}
                                        className="min-h-9 w-full rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-200 dark:hover:bg-white/5 dark:hover:text-white"
                                    >
                                        {muni.name}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </div>
                    <MapToolButton
                        label="Reset map view"
                        icon={HiOutlineLocationMarker}
                        onClick={recenterMap}
                    />
                </div>
            )}

            {showLegend && !['incident-preview', 'report-location', 'risk-zones'].includes(mode) && (
                <MapLegend
                    showPending={showPending}
                    filterStatus={filterStatus}
                    filterMode={filterMode}
                    hasGroupedReports={hasGroupedReports}
                    showIncidentStatus={showIncidentStatusLegend}
                    showRiskZone={showHazardZones}
                />
            )}
        </div>
    );
};

export default MapView;
