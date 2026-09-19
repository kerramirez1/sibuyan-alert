import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { useMemo } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import toast from '../../utils/appToast';
import { HiOutlineLocationMarker, HiOutlineMap } from 'react-icons/hi';
import {
    getMapCoordinates,
    getMapReportBounds,
    getFilteredMapReports,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../../utils/mapReports';
import {
    installCompassOrientationToggle,
    installCompactAttribution,
    isWithinSibuyanInteractionBounds,
    focusExistingMapEntity,
    MAP_CONTENT_FIT_CONFIG,
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
    createOperationalMapStyle,
    prepareOperationalMapStyle,
} from '../../config/mapProvider';
import { getMapMountBlocker, MAP_UNAVAILABLE_REASON } from '../../utils/mapSupport';
import MapIncidentDetails from './MapIncidentDetails';
import HighRiskZoneDetails from './HighRiskZoneDetails';
import MapOverlayPanel from './MapOverlayPanel';
import {
    isRiskZoneLayerVisibleForFilter,
    MAP_ACTIVE_INCIDENT_CONFIG,
    MAP_RISK_ZONE_CONFIG,
    MAP_STATUS_CONFIG,
} from '../../config/mapVisuals';
import {
    createOperationalMarkerElement,
    createRiskZoneMarkerElement,
    getSelectedLocationMarkerSvg,
    SELECTED_MARKER_SIZE,
} from '../../utils/mapMarkerVisuals';

// Sibuyan Island bounds and center
const SIBUYAN_CENTER = [122.5571, 12.4176]; // Lon/Lat
const SIBUYAN_CAMERA_BOUNDS = [[122.35, 12.20], [122.80, 12.65]];
const GENERAL_CAMERA_BOUNDS = [[121.5, 11.5], [123.5, 13.5]];

// Incident category colors
const INCIDENT_COLORS = {
    accident: '#3B82F6',
};

const ZONE_COLORS = {
    landslide_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    accident_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    flood_prone: MAP_RISK_ZONE_CONFIG.markerColor,
    other: MAP_RISK_ZONE_CONFIG.markerColor,
};

// Operational incident and hazard pins remain fully visible over the imagery.
const OPERATIONAL_MARKER_VISIBILITY = Object.freeze({
    opacity: 1,
    opacityWhenCovered: 1,
});

const MAP_TOOL_BUTTON_CLASS = 'relative flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-gray-700 shadow-2xs transition-all duration-150 hover:bg-white hover:text-gray-950 hover:border-gray-300 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-[#07130e] dark:hover:border-white/20 dark:hover:text-white cursor-pointer before:absolute before:-inset-2 before:content-[\'\']';

const MapToolButton = ({ label, icon: Icon, active = false, ...props }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        className={`${MAP_TOOL_BUTTON_CLASS} ${active ? '!border-emerald-400/80 !bg-emerald-50/95 !text-emerald-800 shadow-xs dark:!border-emerald-600/60 dark:!bg-emerald-950/80 dark:!text-emerald-300' : ''}`}
        {...props}
    >
        <Icon className="h-3 w-3" aria-hidden="true" />
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
    focusLocation = null,
    /**
     * Where this map rests when the incidents cannot frame it — the viewer's own
     * municipality, resolved by the caller's RBAC scope (their assignment), or
     * null for a viewer without one.
     *
     * Deliberately separate from `focusLocation`, and not a second copy of it:
     * `focusLocation` is a place a link asked the map to fly to, while this is
     * where the map opens and where Reset returns to. Merging the two made the
     * opening camera depend on whether the reports happened to be cached — a
     * cold load framed the incidents that arrived late, a warm one flew past
     * them to the municipality centre and stayed there — so the same viewer saw
     * two different "defaults" for one screen.
     */
    homeFocus = null,
    enable3D = true,
    gpsAccuracy = null,
    userLocation = null, // New prop for Blue Dot
    canRespond = false,
    onRespondToReport = null,
    canResolve = false,
    canResolveReport = null,
    onResolveReport = null,
    canVerify = false,
    canVerifyReport = null,
    onVerifyToReport = null,
    onRejectToReport = null,
    viewerRole = 'guest',
    viewer = null,
    showDataState = false,
    disableScrollZoom = false,
    mode = 'full',
    pulseReportIds = [],
    /**
     * Whether this map's home camera is the reports rather than the island.
     *
     * Set per role by the caller (`mapExperience.framesReportsOnOpen`): operators
     * open on the incidents, guests open on the whole island. It governs the
     * opening view and the Reset map view control together, because those are the
     * same camera and letting them disagree would make Reset a way to lose your
     * bearings.
     */
    frameReportsOnOpen = false,
    /**
     * Whether the data behind this map is still on its way.
     *
     * The empty state and a slow request look identical from the inside, and
     * telling a viewer "this map has nothing" about data that is still loading is
     * a lie the UI can simply avoid. Defaults to false, because a caller that
     * does not know must not silence the state it asked for.
     */
    dataLoading = false,
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
    const satelliteLayersRef = useRef({ all: [], vectorLabels: [] });
    const streetZoomRangeRef = useRef({ min: 0, max: OPERATIONAL_MAX_ZOOM });
    const streetFallbackActivatedRef = useRef(false);
    const [mapProvider, setMapProvider] = useState(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [mapStyle, setMapStyle] = useState('satellite'); // 'satellite' or 'streets'
    const mapStyleRef = useRef(mapStyle);
    const [showHazardZones, setShowHazardZones] = useState(showRiskZones);
    const [mapModal, setMapModal] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    // Opening framing is a one-time decision: after it is made, data that arrives
    // later (a refresh, a new report, a filter change) must not move the camera
    // out from under whatever the viewer is looking at.
    const framedOnOpenRef = useRef(false);
    // Set the moment a *viewer* moves the camera — see the interaction listeners
    // near the map construction. Programmatic moves are excluded, so this is
    // genuinely "somebody has taken the wheel".
    const viewerMovedCameraRef = useRef(false);
    const onLocationSelectRef = useRef(onLocationSelect);
    const onEntityInspectorOpenRef = useRef(onEntityInspectorOpen);
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
        if (mode === 'incident-preview') {
            return getVisibleMapReports(reports, { includePending: true, includeRejected: true });
        }

        const baseFiltered = getFilteredMapReports(reports, {
            includePending: showPending,
            category: filterCategory,
            statusFilter: filterStatus,
        });

        const locatedEntity = effectiveLocateRequest?.type === 'incident' ? effectiveLocateRequest.entity : null;
        if (locatedEntity && getMapCoordinates(locatedEntity)) {
            const locatedId = String(effectiveLocateRequest.id || locatedEntity._id || locatedEntity.id || '');
            const alreadyIncluded = baseFiltered.some((r) => String(r._id ?? r.id) === locatedId);
            if (!alreadyIncluded) {
                return [...baseFiltered, locatedEntity];
            }
        }

        return baseFiltered;
    }, [effectiveLocateRequest, filterCategory, filterStatus, mode, reports, showPending]);
    // Whether this map's subject is the hazard layer rather than the incident
    // list. The dashboard says so by selecting its Risk Zones tab; the dedicated
    // zones page says so with `mode` and has no tabs at all, which is why the
    // mode has to count as well. Without it the zones page filtered its own zones
    // away and drew an empty map — the one screen that exists to show them.
    const isRiskZoneMap = mode === 'risk-zones' || isRiskZoneLayerVisibleForFilter(filterStatus);

    // Hazard zones render when this map is about them, or when a risk zone is
    // explicitly targeted for location/inspection.
    const isRiskZoneFilterActive = isRiskZoneMap
        || effectiveLocateRequest?.type === 'risk-zone';
    const filteredRiskZones = useMemo(() => {
        if (!showHazardZones || !isRiskZoneFilterActive) return [];
        return highRiskZones;
    }, [highRiskZones, isRiskZoneFilterActive, showHazardZones]);

    // The empty state has to describe the layer this map actually draws. A zones
    // page reporting "no active incidents" is describing something it never
    // shows, which is worse than saying nothing.
    const mapIsEmpty = isRiskZoneMap
        ? filteredRiskZones.length === 0
        : filteredReports.length === 0 && (filterStatus || filteredRiskZones.length === 0);
    const emptyMapMessage = isRiskZoneMap
        ? (isRiskZoneLayerVisibleForFilter(filterStatus)
            ? 'No high-risk zones match the selected filter.'
            : 'No high-risk zones are mapped yet.')
        : filterStatus
            ? 'No incidents match the selected filter.'
            : 'No active incidents are currently visible.';

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

    // One camera for "show me where things are", shared by the map's opening view
    // and the Reset map view control, so the two cannot disagree about what the
    // map's home looks like.
    const fitToReportBounds = useCallback((bounds, { animate = false } = {}) => {
        const map = mapInstanceRef.current;
        if (!map || typeof map.fitBounds !== 'function') return false;

        try {
            map.fitBounds(bounds, {
                padding: performanceProfile.compactViewport
                    ? MAP_CONTENT_FIT_CONFIG.paddingCompact
                    : MAP_CONTENT_FIT_CONFIG.padding,
                // Capped, so a single incident frames its surroundings rather
                // than resolving to street level.
                maxZoom: MAP_CONTENT_FIT_CONFIG.maxZoom,
                pitch: effective3D ? 45 : 0,
                bearing: effective3D ? -17 : 0,
                duration: animate ? performanceProfile.navigationDuration : 0,
                essential: false,
            });
        } catch {
            // A camera move before the style loads throws; the caller keeps the
            // view it had.
            return false;
        }

        return true;
    }, [effective3D, performanceProfile]);

    // Frames the reports this viewer can actually see. It reads `filteredReports`
    // — the same array the markers are built from — so the camera can never be
    // aimed at an incident the viewer has no access to, and returns false when
    // there is nothing to aim at.
    const frameVisibleReports = useCallback(({ animate = false } = {}) => {
        const bounds = getMapReportBounds(filteredReports);
        if (!bounds) return false;
        return fitToReportBounds(bounds, { animate });
    }, [filteredReports, fitToReportBounds]);

    /**
     * The camera this map calls home, decided in ONE place so the opening view
     * and the Reset map view control can never disagree about it: the incidents
     * this viewer is allowed to see, else the assignment's own camera, else the
     * island the style was built around.
     *
     * The middle step is the RBAC one. A signed-in viewer with a municipality
     * opens on that municipality rather than on open water, and a viewer without
     * an assignment (a guest) keeps the island-wide view that the public map has
     * always shown — which is why the caller, not this component, resolves the
     * home camera.
     */
    const applyHomeCamera = useCallback(({ animate = false } = {}) => {
        if (frameReportsOnOpen && frameVisibleReports({ animate })) return 'incidents';

        const map = mapInstanceRef.current;
        const lat = Number(homeFocus?.lat);
        const lng = Number(homeFocus?.lng);
        if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        focusExistingMapEntity(map, {
            type: 'point',
            coordinates: { lat, lng },
        }, {
            // A caller that hands over a home camera without a zoom gets the
            // overview cap, not `pointZoom`: home is a place to hold at arm's
            // length, and street level would hide the municipality it names.
            zoom: Number.isFinite(Number(homeFocus?.zoom))
                ? Number(homeFocus.zoom)
                : MAP_CONTENT_FIT_CONFIG.maxZoom,
            duration: animate ? performanceProfile.navigationDuration : 0,
        });
        return 'home';
    }, [frameReportsOnOpen, frameVisibleReports, homeFocus, performanceProfile.navigationDuration]);

    // The opening camera, decided once. The island view set at construction is
    // the last fallback; when the caller asks for report framing and the viewer's
    // reports are on the map, the map opens on them instead.
    useEffect(() => {
        if (framedOnOpenRef.current || !mapReady) return;
        // Somebody who has already moved the map has chosen a camera, even if
        // that happened before the incidents finished loading.
        if (viewerMovedCameraRef.current) {
            framedOnOpenRef.current = true;
            return;
        }
        // An explicit request — a deep link to one incident, one hazard zone, or
        // one coordinate — owns the camera. The opening view must not fly
        // somewhere else underneath it.
        if (effectiveLocateRequest || focusLocation) {
            framedOnOpenRef.current = true;
            return;
        }
        // The data is still on its way, so there is nothing to frame yet and the
        // decision can wait. Deciding now is what made the opening view depend on
        // the cache: a warm load framed the incidents immediately and was then
        // overridden by the home camera, while a cold load went the other way
        // round. Waiting for the request to settle makes both paths land on the
        // same camera, which is the only way "open here" stays a single answer.
        if (dataLoading) return;
        applyHomeCamera();
        framedOnOpenRef.current = true;
    }, [applyHomeCamera, dataLoading, effectiveLocateRequest, focusLocation, mapReady]);

    // Whether the viewer has taken the wheel. MapLibre fires these same gestures
    // for its own camera moves, so only the ones carrying an originating DOM
    // event count as a person's input — the distinction that lets the opening
    // framing wait for slow data without ever fighting a visitor for the camera.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return undefined;

        const markViewerMove = (event) => {
            if (event?.originalEvent) viewerMovedCameraRef.current = true;
        };
        const gestures = ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'];

        gestures.forEach((gesture) => map.on(gesture, markViewerMove));
        return () => {
            gestures.forEach((gesture) => map.off?.(gesture, markViewerMove));
        };
    }, [mapReady]);

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

    // A live map refresh can remove or replace the report that opened the
    // inspector. Close only after a non-empty dataset is available so a
    // transient loading reset does not interrupt an active detail request.
    useEffect(() => {
        if (!mapModal || !Array.isArray(reports) || reports.length === 0) return;

        const selectedReports = mapModal.type === 'reportGroup'
            ? mapModal.data
            : mapModal.type === 'report'
                ? [mapModal.data]
                : [];
        if (selectedReports.length === 0) return;

        const reportIds = new Set((Array.isArray(reports) ? reports : []).map((report) => String(report?._id || report?.id || '')).filter(Boolean));
        const hasCurrentSelection = selectedReports.some((report) => (
            reportIds.has(String(report?._id || report?.id || ''))
        ));
        if (!hasCurrentSelection) closeMapSelection();
    }, [closeMapSelection, mapModal, reports]);

    useEffect(() => {
        let active = true;

        // Never leave the UI on an infinite skeleton: any validation failure
        // falls back to the self-contained Esri/OSM style so the map still
        // mounts. Only a total style-construction failure surfaces as error.
        prepareOperationalMapStyle()
            .then((provider) => {
                if (!active) return;
                setMapProvider(provider);
                if (provider?.pmtilesError) {
                    toast.error(`Street map archive unavailable: ${provider.pmtilesError}`, {
                        id: 'street-map-validation-fallback',
                    });
                }
            })
            .catch((error) => {
                if (!active) return;
                console.warn('Operational map style failed; using built-in fallback.', error);
                try {
                    setMapProvider(createOperationalMapStyle({
                        pmtilesUrl: '',
                        labels3DPmtilesUrl: '',
                    }));
                } catch (fallbackError) {
                    console.error('Map style fallback failed:', fallbackError);
                    setMapError('map-style');
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
        if (mapError) return;

        // Fail-closed instead of throwing out of the effect: a throw here
        // would be caught only by the root ErrorBoundary ("Reload page").
        const blocker = getMapMountBlocker(mapContainerRef.current);
        if (blocker === MAP_UNAVAILABLE_REASON.WEBGL) {
            setMapError('webgl');
            return undefined;
        }
        if (blocker === MAP_UNAVAILABLE_REASON.SIZE) {
            // Hidden tab / display:none parent: retry when layout settles.
            if (typeof ResizeObserver === 'undefined') return undefined;
            const pendingContainer = mapContainerRef.current;
            const observer = new ResizeObserver(() => {
                if (!mapInstanceRef.current && pendingContainer?.clientWidth > 0 && pendingContainer?.clientHeight > 0) {
                    // Trigger a re-run by bumping provider state through a no-op;
                    // simplest reliable path is to disconnect and let the next
                    // style/effect cycle mount once visible.
                    observer.disconnect();
                    setMapProvider((current) => (current ? { ...current } : current));
                }
            });
            try {
                observer.observe(pendingContainer);
            } catch {
                observer.disconnect();
            }
            return () => observer.disconnect();
        }

        const provider = mapProvider;
        streetLayersRef.current = {
            all: provider.allStreetLayerIds || provider.streetLayerIds || [],
            active: provider.primaryStreetLayerIds || [],
            fallback: provider.fallbackStreetLayerId,
        };
        satelliteLayersRef.current = {
            all: provider.satelliteLayerIds || ['esri-imagery-layer', 'esri-reference-layer'],
            vectorLabels: provider.satelliteVectorLabelLayerIds || [],
        };
        streetZoomRangeRef.current = {
            min: provider.streetMinZoom,
            max: provider.streetMaxZoom,
        };
        streetFallbackActivatedRef.current = false;

        let cancelled = false;
        let mapInstance = null;
        let resizeObserver = null;
        let removeCompactAttribution = () => {};
        let removeCompassToggle = () => {};

        try {
            mapInstance = new maplibregl.Map({
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
            try {
                mapInstance.scrollZoom.disable();
            } catch {
                // Scroll-zoom control may be unavailable on minimal builds.
            }
        }

        try {
            removeCompactAttribution = installCompactAttribution(mapInstance) || (() => {});
        } catch {
            removeCompactAttribution = () => {};
        }

        if (mode === 'incident-preview') {
            try {
                const navigationControl = new maplibregl.NavigationControl({
                    showCompass: false,
                    showZoom: true,
                });
                mapInstance.addControl(navigationControl, 'top-right');
            } catch {
                // Navigation control is progressive enhancement.
            }
        } else {
            try {
                const navigationControl = new maplibregl.NavigationControl({ visualizePitch: true });
                mapInstance.addControl(navigationControl, 'top-right');
                removeCompassToggle = installCompassOrientationToggle(mapInstance, navigationControl, {
                    pitch: effective3D ? 45 : 0,
                    bearing: effective3D ? -17 : 0,
                }) || (() => {});
            } catch {
                removeCompassToggle = () => {};
            }
        }

        // Keep the canvas fitted when side panels collapse, the device rotates,
        // or the responsive container height changes. Visual-only without this.
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
                        // Resize during teardown is harmless.
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
            if (cancelled) return;
            try {
            const ensureSource = (id, definition) => {
                try {
                    if (!mapInstance.getSource(id)) mapInstance.addSource(id, definition);
                } catch {
                    // Double-fired load: source already exists.
                }
            };
            const ensureLayer = (definition) => {
                try {
                    if (!mapInstance.getLayer(definition.id)) mapInstance.addLayer(definition);
                } catch {
                    // Layer raced with a style reload — safe to skip.
                }
            };
            ensureSource(RISK_ZONE_SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            ensureLayer({
                id: RISK_ZONE_FILL_LAYER_ID,
                type: 'fill',
                source: RISK_ZONE_SOURCE_ID,
                minzoom: RISK_ZONE_MIN_ZOOM,
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.22,
                },
            });
            ensureLayer({
                id: RISK_ZONE_OUTLINE_LAYER_ID,
                type: 'line',
                source: RISK_ZONE_SOURCE_ID,
                minzoom: RISK_ZONE_MIN_ZOOM,
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 2.5,
                    'line-opacity': 0.9,
                },
            });

            // Add user location layer (Blue Dot)
            ensureSource('user-location', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            ensureLayer({
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
            ensureSource('gps-accuracy', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            try {
                if (!mapInstance.getLayer('gps-accuracy-layer')) {
                    mapInstance.addLayer({
                        id: 'gps-accuracy-layer',
                        type: 'fill',
                        source: 'gps-accuracy',
                        paint: {
                            'fill-color': '#3B82F6',
                            'fill-opacity': 0.15,
                        },
                        beforeId: mapInstance.getLayer('user-location-inner') ? 'user-location-inner' : undefined, // Draw below the blue dot
                    });
                }
            } catch {
                // Optional overlay — never block readiness.
            }

            try {
                if (!mapInstance.getLayer('gps-accuracy-outline')) {
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
                        beforeId: mapInstance.getLayer('user-location-inner') ? 'user-location-inner' : undefined,
                    });
                }
            } catch {
                // Optional overlay — never block readiness.
            }

            mapInstanceRef.current = mapInstance;
            if (!cancelled) setMapReady(true);
            } catch (error) {
                console.warn('Map load init skipped:', error?.message);
            }
        });

        // Handle map clicks
        mapInstance.on('click', (e) => {
            // Operational markers are accessible HTML controls and stop event
            // propagation themselves. A canvas click therefore always means map
            // selection and no duplicate WebGL hit layer is required.
            try {
                popupRef.current?.remove();
            } catch {
                // Popup already removed during teardown.
            }
            closeMapSelection();
            if (onLocationSelectRef.current) {
                const location = { lat: e?.lngLat?.lat, lng: e?.lngLat?.lng };
                if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;
                if (!isWithinSibuyanInteractionBounds(location)) {
                    toast.error('Choose a point within Sibuyan Island.', { id: 'sibuyan-map-bounds' });
                    return;
                }
                onLocationSelectRef.current(location);
            }
        });

        return () => {
            cancelled = true;
            try {
                resizeObserver?.disconnect();
            } catch {
                // Observer already disconnected.
            }
            try {
                removeCompassToggle();
            } catch {
                // Toggle already removed.
            }
            try {
                removeCompactAttribution();
            } catch {
                // Attribution already removed.
            }
            try {
                markerFocusCleanupRef.current?.();
            } catch {
                // Marker cleanup is best-effort during unmount.
            }
            try {
                popupRef.current?.remove();
            } catch {
                // Already removed — safe to ignore on fast navigation.
            }
            try {
                mapInstance.remove();
            } catch {
                // Already removed — safe to ignore on fast navigation.
            }
            mapInstanceRef.current = null;
        };
        } catch (error) {
            console.error('Map initialization failed:', error);
            try {
                resizeObserver?.disconnect();
            } catch {
                // Ignore teardown errors.
            }
            try {
                mapInstance?.remove();
            } catch {
                // Partially constructed instance — ignore.
            }
            mapInstanceRef.current = null;
            if (!cancelled) setMapError('init');
            return undefined;
        }
    }, [closeMapSelection, disableScrollZoom, effective3D, mapError, mapProvider, mode, performanceProfile]);

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
        (satelliteLayersRef.current.all || []).forEach((layerId) => setVisibility(layerId, false));

        if (mapStyle === 'satellite') {
            map.setMaxZoom(OPERATIONAL_MAX_ZOOM);
            setVisibility('esri-imagery-layer', true);

            const vectorLabels = satelliteLayersRef.current.vectorLabels;
            if (vectorLabels && vectorLabels.length > 0) {
                vectorLabels.forEach((layerId) => setVisibility(layerId, true));
                setVisibility('esri-reference-layer', false);
            } else {
                setVisibility('esri-reference-layer', true);
            }
        } else {
            const streetMaxZoom = streetZoomRangeRef.current.max;
            map.setMaxZoom(streetMaxZoom);
            if (map.getZoom() > streetMaxZoom) {
                map.easeTo({ zoom: streetMaxZoom, duration: 250 });
            }
            setVisibility('esri-imagery-layer', false);
            setVisibility('esri-reference-layer', false);
            (satelliteLayersRef.current.vectorLabels || []).forEach((layerId) => setVisibility(layerId, false));
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

        // One incident, one marker, on every rail: the palette is not a role
        // feature. Verified, transferred and responding share one blue because
        // every rail now folds those three into a single "Active incidents" tab
        // (see mapExperience) — three hues inside one tab would be three answers
        // to a question the tab no longer asks. The responding one is separated
        // by shape and motion instead of colour.
        const getReportMarkerColor = (report) => {
            // `MAP_ACTIVE_INCIDENT_CONFIG` owns "the active blue", and it is the
            // same blue the responding dot wears, which is what makes the dot
            // read as one of the active pins rather than as a fourth status.
            if (['verified', 'transferred', 'responding'].includes(report.status)) {
                return MAP_ACTIVE_INCIDENT_CONFIG.markerColor;
            }
            if (MAP_STATUS_CONFIG[report.status]) return MAP_STATUS_CONFIG[report.status].markerColor;
            return INCIDENT_COLORS[report.incidentCategory] || MAP_STATUS_CONFIG.verified.markerColor;
        };

        // Markers are diffed by group identity instead of being destroyed and
        // recreated on every data change, so real-time presence updates and
        // filter toggles no longer rebuild every DOM pin (flicker + jank).
        const existingMarkers = new Map(
            reportMarkersRef.current.map((entry) => [entry.key, entry])
        );
        const nextMarkers = [];

        // Co-located reports share one marker with a count badge so no incident is
        // silently hidden underneath another marker at the same coordinates.
        groupReportsByMapLocation(filteredReports)
            .forEach(({ coordinates: coords, reports: groupedReports }) => {
                const statusPriority = { responding: 5, transferred: 4, verified: 3, pending: 2, resolved: 1, rejected: 0 };
                const report = [...groupedReports].sort(
                    (left, right) => (statusPriority[right.status] || 0) - (statusPriority[left.status] || 0)
                )[0];
                const canRespondToThisReport = canRespond && ['verified', 'transferred'].includes(report.status);
                const canResolveThisReport = canResolve &&
                    report.status === 'responding' &&
                    (!canResolveReport || canResolveReport(report));
                const canVerifyThisReport = canVerify &&
                    report.status === 'pending' &&
                    (!canVerifyReport || canVerifyReport(report));
                const markerColor = getReportMarkerColor(report);
                const isRespondingDot = report.status === 'responding';
                // Identity: same location + same set of reports = same marker.
                const key = [
                    coords.lat.toFixed(6),
                    coords.lng.toFixed(6),
                    groupedReports.map((item) => String(item._id ?? item.id ?? '')).sort().join('|'),
                ].join('::');
                // Signature covers everything createOperationalMarkerElement renders
                // plus the permission flags closed over by the click handlers, so a
                // changed pin rebuilds while an unchanged pin keeps its DOM node.
                const signature = [
                    report?._id ?? report?.id ?? '',
                    report?.status ?? '',
                    markerColor,
                    report?.title ?? report?.incidentType ?? '',
                    groupedReports.length,
                    // The dot/pin choice changes what is rendered, so it belongs
                    // in the identity. Motion does not: the pulse is CSS, so a
                    // marker never has to be rebuilt to keep animating.
                    isRespondingDot ? 'dot' : 'pin',
                    canRespondToThisReport,
                    canResolveThisReport,
                    canVerifyThisReport,
                ].join('::');

                const existing = existingMarkers.get(key);
                let entry;
                if (existing && existing.signature === signature) {
                    // Unchanged: reuse the live marker element.
                    existingMarkers.delete(key);
                    entry = existing;
                } else {
                    if (existing) {
                        existing.marker.remove();
                        if (selectedOperationalMarkerRef.current === existing.element) {
                            selectedOperationalMarkerRef.current = null;
                        }
                    }
                    const el = createOperationalMarkerElement({
                        report,
                        groupedReports,
                        markerColor,
                        respondingDot: isRespondingDot,
                    });

                    const marker = new maplibregl.Marker({
                        ...OPERATIONAL_MARKER_VISIBILITY,
                        element: el,
                        // A teardrop pin points at its coordinate with its tip, so
                        // it is anchored at its bottom. A dot has no tip: anchored
                        // the same way it would float a whole marker height above
                        // the place it marks, so it is anchored at its centre.
                        anchor: isRespondingDot ? 'center' : 'bottom',
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
                        setMapModal({ type: 'report', data: report, canRespond: canRespondToThisReport, canResolve: canResolveThisReport, canVerify: canVerifyThisReport, canReject: canVerifyThisReport });
                    };
                    el.addEventListener('click', openMarker);
                    el.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openMarker(event);
                        }
                    });

                    entry = {
                        key,
                        signature,
                        ids: groupedReports.map((item) => String(item._id ?? item.id ?? '')).filter(Boolean),
                        marker,
                        element: el,
                    };
                }
                nextMarkers.push(entry);
            });

        // Remove stale markers that no longer exist in the new dataset.
        existingMarkers.forEach((entry) => {
            entry.marker.remove();
            if (selectedOperationalMarkerRef.current === entry.element) {
                selectedOperationalMarkerRef.current = null;
            }
        });
        reportMarkersRef.current = nextMarkers;

    }, [filteredReports, mapReady, performanceProfile, canRespond, canResolve, canResolveReport, canVerify, canVerifyReport, selectOperationalMarker]);

    // Fresh-event pulse: toggle the temporary ring on markers touched by the
    // latest socket events. Runs after the marker sync above (same deps plus
    // pulse ids) so rebuilt elements get the class deterministically.
    useEffect(() => {
        const pulsing = new Set((Array.isArray(pulseReportIds) ? pulseReportIds : []).map(String));
        reportMarkersRef.current.forEach((entry) => {
            const shouldPulse = (entry.ids || []).some((id) => pulsing.has(String(id)));
            entry.element?.classList?.toggle('map-marker--fresh', shouldPulse);
        });
    }, [pulseReportIds, filteredReports, mapReady, canRespond, canResolve, canResolveReport, canVerify, canVerifyReport, selectOperationalMarker]);

    // Risk zones use focused HTML pins so the imagery remains unobstructed.
    // Markers are diffed by zone identity: unchanged zones keep their live DOM
    // element instead of being rebuilt on every map data change.
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        const existingZones = new Map(
            zoneMarkersRef.current.map((entry) => [entry.key, entry])
        );
        const nextZones = [];

        // Create unique HTML markers for high-risk zones (warning triangle style)
        filteredRiskZones.forEach((zone, index) => {
            const coordinates = getMapCoordinates(zone);
            if (!coordinates) return;
            const color = ZONE_COLORS[zone.type] || ZONE_COLORS.other;
            const key = String(zone._id ?? zone.id ?? `zone-${index}`);
            // createRiskZoneMarkerElement renders only the name and the color.
            const signature = `${color}::${zone?.name ?? ''}`;

            const existing = existingZones.get(key);
            let entry;
            if (existing && existing.signature === signature) {
                existingZones.delete(key);
                entry = existing;
            } else {
                if (existing) {
                    existing.marker.remove();
                    if (selectedOperationalMarkerRef.current === existing.element) {
                        selectedOperationalMarkerRef.current = null;
                    }
                }
                const el = createRiskZoneMarkerElement({ zone, color });

                // The radar marker is a symmetric dot rather than a teardrop
                // pin, so it centres on the hazard coordinate — the stationary
                // red core sits exactly where the zone is.
                const marker = new maplibregl.Marker({
                    ...OPERATIONAL_MARKER_VISIBILITY,
                    element: el,
                    anchor: 'center',
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

                entry = {
                    key,
                    signature,
                    id: key,
                    marker,
                    element: el,
                };
            }
            nextZones.push(entry);
        });

        // Remove stale zone markers that no longer exist in the new dataset.
        existingZones.forEach((entry) => {
            entry.marker.remove();
            if (selectedOperationalMarkerRef.current === entry.element) {
                selectedOperationalMarkerRef.current = null;
            }
        });
        zoneMarkersRef.current = nextZones;

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
        const hasValidSelectedLocation = Number.isFinite(selectedLocation?.lng)
            && Number.isFinite(selectedLocation?.lat);
        if (selectedLocation && !hasValidSelectedLocation) {
            console.warn('Ignoring invalid selected location for map marker');
        }
        if (selectedLocation && hasValidSelectedLocation) {
            if (!selectedMarkerRef.current) {
                // Create a custom marker element
                const el = document.createElement('div');
                el.className = 'selected-location-marker';
                el.innerHTML = `
                    <div style="position:relative; width:${SELECTED_MARKER_SIZE.width + 4}px; height:${SELECTED_MARKER_SIZE.height + 4}px; display:flex; align-items:flex-end; justify-content:center;">
                        ${getSelectedLocationMarkerSvg()}
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
                    const marker = selectedMarkerRef.current;
                    if (!marker) return;
                    const lngLat = marker.getLngLat();
                    const location = { lat: lngLat.lat, lng: lngLat.lng };
                    if (!isWithinSibuyanInteractionBounds(location)) {
                        const previous = selectedLocationRef.current;
                        if (previous) marker.setLngLat([previous.lng, previous.lat]);
                        toast.error('Keep the incident pin within Sibuyan Island.', { id: 'sibuyan-map-bounds' });
                        return;
                    }
                    if (onLocationSelectRef.current) {
                        onLocationSelectRef.current(location);
                    }
                });
            } else if (Number.isFinite(selectedLocation?.lng) && Number.isFinite(selectedLocation?.lat)) {
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
        const hasValidUserLocation = Number.isFinite(userLocation?.lng)
            && Number.isFinite(userLocation?.lat);
        const userSource = map.getSource('user-location');
        if (userSource && hasValidUserLocation) {
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
            if (hasValidUserLocation && gpsAccuracy) {
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
        if (!mapReady || !mapInstanceRef.current) return;
        try {
            const map = mapInstanceRef.current;
            if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
            // Reset means "back to the view this map opens with", so it reads the
            // same decision: the incidents for a map that opens on them, the
            // viewer's own municipality for one that opens there, the island for
            // everyone else. A fixed island camera here would undo an operator's
            // default view, and framing here regardless would undo a guest's.
            if (applyHomeCamera({ animate: true })) return;
            map.flyTo({
                center: SIBUYAN_CENTER,
                zoom: performanceProfile.compactViewport ? 10 : 11,
                pitch: effective3D ? 45 : 0,
                bearing: effective3D ? -17 : 0,
                duration: performanceProfile.navigationDuration,
            });
        } catch {
            // Camera move before style load throws — next interaction retries.
        }
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

    const handleVerifyFromModal = async (report) => {
        if (!onVerifyToReport) return;
        setActionLoading(true);
        const result = await onVerifyToReport(report);
        if (result?.ok) {
            toast.success(result.message || 'Opening verification review');
            closeMapSelection();
        } else {
            toast.error(result?.message || 'Failed to open verification');
        }
        setActionLoading(false);
    };

    const handleRejectFromModal = async (report) => {
        if (!onRejectToReport) return;
        setActionLoading(true);
        const result = await onRejectToReport(report);
        if (result?.ok) {
            toast.success(result.message || 'Opening rejection review');
            closeMapSelection();
        } else {
            toast.error(result?.message || 'Failed to open rejection');
        }
        setActionLoading(false);
    };

    return (
        <div className={`relative min-h-0 rounded-lg ${className}`}>
            <div
                ref={mapContainerRef}
                className="absolute inset-0 overflow-hidden rounded-lg"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {mapError && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-gray-100 p-6 text-center dark:bg-gray-900" role="alert">
                    <HiOutlineMap className="h-8 w-8 text-gray-400" aria-hidden="true" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {mapError === 'webgl' ? '3D map is not supported on this device' : 'Map failed to load'}
                    </p>
                    <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">
                        {mapError === 'webgl'
                            ? 'Your browser has WebGL disabled. Incident lists and details below remain fully usable.'
                            : 'The interactive map could not start, but all incident data below remains available.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setMapError(null);
                            setMapReady(false);
                            mapInstanceRef.current = null;
                            setMapProvider((current) => (current ? { ...current } : current));
                        }}
                        className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 cursor-pointer"
                    >
                        Try again
                    </button>
                </div>
            )}

            {!mapReady && !mapError && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-100 text-sm font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300" role="status">
                    Preparing map&hellip;
                </div>
            )}

            {mapReady && showDataState && mapIsEmpty && !dataLoading && (
                    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm sm:text-xs dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-200" role="status">
                        {emptyMapMessage}
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
                    contentKey={`${mapModal.type}:${mapModal.data?._id || mapModal.data?.id || 'list'}`}
                >

                    {mapModal.type === 'report' && (
                        <MapIncidentDetails
                            report={mapModal.data}
                            viewerRole={viewerRole}
                            viewer={viewer}
                            canRespond={mapModal.canRespond}
                            canResolve={mapModal.canResolve}
                            canVerify={mapModal.canVerify}
                            canReject={mapModal.canReject}
                            actionLoading={actionLoading}
                            onRespond={handleRespondFromModal}
                            onResolve={handleResolveFromModal}
                            onVerify={handleVerifyFromModal}
                            onReject={handleRejectFromModal}
                        />
                    )}

                    {mapModal.type === 'reportGroup' && (
                        <div className="divide-y divide-gray-100 px-4 py-2 sm:px-5">
                            {(Array.isArray(mapModal.data) ? mapModal.data : []).map((report) => (
                                <button
                                    key={report._id || report.id}
                                    type="button"
                                    onClick={() => setMapModal({
                                        type: 'report',
                                        data: report,
                                        canRespond: canRespond && ['verified', 'transferred'].includes(report.status),
                                        canResolve: canResolve && report.status === 'responding' && (!canResolveReport || canResolveReport(report)),
                                        canVerify: canVerify && report.status === 'pending' && (!canVerifyReport || canVerifyReport(report)),
                                        canReject: canVerify && report.status === 'pending' && (!canVerifyReport || canVerifyReport(report)),
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
                        <HighRiskZoneDetails zone={mapModal.data} />
                    )}
                </MapOverlayPanel>
            )}

            {/* Controls */}
            {!['incident-preview', 'report-location'].includes(mode) && (
                <div className="mobile-sidebar-hide pointer-events-auto absolute bottom-2 right-2 z-20 flex flex-col gap-1 sm:bottom-4 sm:right-4 sm:gap-2" role="group" aria-label="Map tools">
                    <MapToolButton
                        label={mapStyle === 'satellite' ? 'Switch to street map' : 'Switch to satellite map'}
                        icon={HiOutlineMap}
                        active={mapStyle === 'streets'}
                        onClick={() => setMapStyle(prev => prev === 'satellite' ? 'streets' : 'satellite')}
                        aria-pressed={mapStyle === 'streets'}
                    />

                    <MapToolButton
                        label="Reset map view"
                        icon={HiOutlineLocationMarker}
                        onClick={recenterMap}
                    />
                </div>
            )}
        </div>
    );
};

export default MapView;
