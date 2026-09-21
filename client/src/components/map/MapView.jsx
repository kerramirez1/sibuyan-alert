import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import { useMemo } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import toast from '../../utils/appToast';
import { HiOutlineLocationMarker, HiOutlineMap } from 'react-icons/hi';
import MapToolButton from './MapToolButton';
import MapScopeControl from './MapScopeControl';
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
import {
    HAZARD_FILL_OPACITY,
    HAZARD_MIN_ZOOM,
    HAZARD_OUTLINE_OPACITY,
    buildHazardColorExpression,
    hazardFillLayerId,
    hazardOutlineLayerId,
    hazardSourceId,
} from '../../config/hazardAreas';
import {
    ACCIDENT_HOTSPOT_MIN_ZOOM,
    ACCIDENT_HOTSPOT_SOURCE_ID,
    EMPTY_ACCIDENT_HOTSPOT_CLASSES,
    accidentHotspotCircleLayerId,
    buildAccidentHotspotFilterExpression,
    buildAccidentHotspotRadiusExpression,
    getAccidentHotspotClasses,
    getAccidentHotspotPaint,
    resolveAccidentHotspotRule,
} from '../../config/accidentHotspots';
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

// Stable identity for "no hazard layers", so the default prop value does not
// create a new array on every render and re-run the layer effect forever.
const EMPTY_HAZARD_LAYERS = Object.freeze([]);

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

/**
 * The tone of the details pane a pin opens, read from the record it is showing:
 * a report carries its own lifecycle colour, a hazard area the zone red, and a
 * group of reports sharing one pin the active-incident blue. All three lookups
 * are the same ones the rail, the cards, the badges and the legend read, so a
 * pin and the pane it opens cannot name one state in two colours.
 */
const getInspectorTone = (modal) => {
    if (!modal) return { bar: '', dot: '' };
    // Classes, not hex: the accent rule is a 2px `bg-*` strip and the dot beside
    // the title is the same colour, so one value serves both.
    if (modal.type === 'zone') return { bar: 'bg-red-500', dot: 'bg-red-500' };
    if (modal.type === 'reportGroup') return { bar: MAP_ACTIVE_INCIDENT_CONFIG.dot, dot: MAP_ACTIVE_INCIDENT_CONFIG.dot };
    const status = MAP_STATUS_CONFIG[modal.data?.status];
    return status ? { bar: status.dot, dot: status.dot } : { bar: '', dot: '' };
};

const MapView = ({
    reports = [],
    highRiskZones = [],
    locateRequest = null,
    externalContextPanelOpen = false,
    /**
     * Called with `true` as soon as this map puts details on screen for a clicked
     * pin, and `false` when that pane closes.
     *
     * A pane is not drawn over the canvas any more when the page has a column for
     * it (see `dockTarget`), so the caller has to know when to reserve that
     * column — this is that signal. It is read off the pane's own state rather
     * than off the click, so every way the pane closes (Escape, the close button,
     * a refresh that drops the record) frees the column again.
     */
    onEntityInspectorChange = null,
    /**
     * Where this map's own details pane stands, when the page has a column for
     * it: the same slot a summary card's records open into, so a pin's details
     * land in the column beside the map rather than covering the canvas they were
     * clicked on. A page with no such column passes nothing, and the pane stays
     * the overlay it has always been.
     */
    dockTarget = null,
    showPending = false,
    showRiskZones = true,
    onLocationSelect = null,
    selectedLocation = null,
    className = '',
    filterCategory = null,
    filterStatus = null,
    /**
     * Whether this map's `all` tab is the whole record or only its open part —
     * see `getFilteredMapReports`. False for every live queue, where `all` is the
     * work still in hand; true only for the period-scoped caller, whose `all`
     * covers the closed incidents inside that period too. Without this the map
     * drew a subset while the tab beside it counted the whole set.
     */
    allIncludesResolved = false,
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
    /**
     * Acknowledge a transfer into the viewer's own municipality.
     *
     * Same split as `canVerify` / `canVerifyReport`: the base flag is the role,
     * the predicate decides the record. Acknowledging is admin-only, scoped to
     * the receiving municipality and available exactly once, so the predicate
     * carries all three — the caller passes `getIncidentCapabilities`, which the
     * incident queue already uses, rather than a second rule that could drift.
     */
    canAcknowledgeTransfer = false,
    canAcknowledgeTransferReport = null,
    onAcknowledgeTransferToReport = null,
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
     *
     * Callers may scope it by view rather than by role — the dashboard clears it
     * for the island-wide map scope, whose camera is the whole island rather than
     * the incidents inside it. The flag means "this map's home is the reports",
     * and this map's home is not.
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
    /**
     * The area the map is currently scoped to, as a prepositional phrase: "in
     * Cajidiocan", "across Sibuyan Island".
     *
     * Only the map's empty state speaks it, because that is the one message a
     * scope change can turn into a false statement: "no incidents are visible"
     * means something different on a municipal map and on an island-wide one, and
     * the markers are not there to tell the reader which one they are looking at.
     * Empty for callers with a single scope, which keeps their copy unchanged.
     */
    emptyScopePhrase = '',
    /**
     * A caller-issued request to re-aim the home camera.
     *
     * Opening framing is deliberately a one-time decision — later data must not
     * move the camera out from under a viewer. A scope switch is the exception
     * the caller knows about and the map cannot infer, so the caller names the
     * request and a new value re-applies `applyHomeCamera`. Repeating the same
     * value is a no-op, so this cannot fire on an unrelated re-render.
     *
     * It is applied as one animated move: the viewer asked to be taken somewhere,
     * and a switch that snaps the camera reads as a glitch rather than as a change
     * of scope.
     */
    homeFocusRequestId = null,
    /**
     * Map scope (municipal_admin maps only), as the tool rail's compact button.
     *
     * The value and the handler are two props because they answer two different
     * questions, exactly as `canVerify` and `onVerifyToReport` do: `mapScope` is
     * what the button reports as current, and the presence of
     * `onMapScopeChange` is what asks for the control at all. Roles with one
     * scope to draw pass neither, and get no control — a scope switch with one
     * option is not a switch.
     */
    mapScope = null,
    onMapScopeChange = null,
    mapScopeMunicipality = '',
    /**
     * Metric scale bar.
     *
     * A hazard zone is defined by a radius in metres, and this map had no
     * distance reference at all, so an operator could not judge whether the
     * circle under the cursor was 100 m or 400 m across. On by default: it costs
     * one control and removes a whole class of mis-sized zones.
     */
    showScaleControl = true,
    /**
     * Fullscreen / expand-map button.
     *
     * MapLibre ships this control, so there is no reason to hand-roll one: it
     * fullscreens the map's own container, keeps the canvas sized through the
     * transition (a fullscreen map that did not resize would render at the old
     * viewport), and falls back to a CSS-fullscreen mode where the Fullscreen
     * API is unavailable.
     *
     * Off by default, because fullscreening is a workspace decision: only a map
     * that *is* the page — the Risk Zones canvas, not a card preview or an
     * embedded incident thumbnail — has anything to gain from owning the screen.
     */
    showFullscreenControl = false,
    /**
     * The element the fullscreen button expands, when it is not the map alone.
     *
     * Fullscreen expands one element, and everything outside that element is left
     * behind on the page underneath it. That is invisible for a bare map, and very
     * visible for a map that has a toolbar: a caller whose header holds controls
     * for the canvas — a layer menu, a placement readout — passes that wrapper in,
     * so the header travels with the map instead of disappearing exactly when the
     * map has the most room to use it.
     *
     * A ref rather than an element: the wrapper does not exist yet when this
     * component first renders, and the map is built on the committed DOM.
     * `null` (the default) expands the map container, which is MapLibre's own
     * behaviour.
     */
    fullscreenContainerRef = null,
    /**
     * Live cursor readout in the corner of the canvas.
     *
     * A click commits a coordinate, so the value has to be readable *before*
     * committing. Only the placement surfaces turn this on — a read-only map
     * does not need to narrate the pointer.
     */
    showCursorCoordinates = false,
    /**
     * NOAH hazard reference layers, as the array returned by
     * `GET /api/high-risk-zones/hazards`.
     *
     * An empty array (or the default) means "not loaded"; no hazard layers are
     * added, so a slow or failed fetch degrades to the map without the overlay
     * instead of blocking it. Each entry carries its own `datasetId`, so the
     * layer ids are generated rather than declared.
     */
    hazardLayers = EMPTY_HAZARD_LAYERS,
    /**
     * Which hazard classes each loaded dataset draws, keyed by dataset id.
     *
     * Three states, and the difference between the last two matters:
     *
     * - `null` (the default) — the caller has no per-class control, so every
     *   class in every layer is drawn. This is what a map that is handed hazard
     *   layers and nothing else expects, and it keeps this prop optional.
     * - an object — the caller owns the choice, and the object is authoritative:
     *   a dataset with no key draws **none** of its classes. So `{}` is a clean
     *   map, and a dataset that appears in a later refetch cannot quietly start
     *   drawing itself because the caller had not heard of it yet.
     * - `{ landslide: [2] }` — only class 2 of that dataset, drawn from the same
     *   source, the same geometry and the same colours as before.
     *
     * Classes are selected with a layer filter rather than by removing layers or
     * fading them to zero: the filter is the map's own record of what the viewer
     * asked for, it drops the polygons out of the render pass instead of
     * compositing them invisibly, and switching a class on or off never rebuilds
     * the map.
     */
    hazardClassVisibility = null,
    /**
     * Accident-prone areas, as the payload returned by
     * `GET /api/high-risk-zones/accident-hotspots`.
     *
     * Not part of `hazardLayers`, although it looks similar, and the difference
     * is not cosmetic. A hazard layer is a polygon surface drawn from government
     * GIS data; this one is a set of computed points derived from the system's
     * own reports, and it is drawn with different layer types (circles, not
     * fills), different metadata, and a different cache lifetime. Folding it into
     * the hazard array would mean one effect arguing about two geometries for no
     * gain.
     *
     * `null` (the default) means "this map has no such layer" and stays true for
     * every caller except the admin Risk Zones workspace, so the public and
     * responder maps are untouched by this feature.
     */
    accidentHotspots = null,
    /**
     * Which accident-prone classes are drawn, as class values (`[2]`, `[2, 3]`).
     *
     * An array rather than an object keyed by class, because unlike the hazard
     * layers there is exactly one dataset here — and empty means off, which is
     * the state this layer starts in.
     */
    accidentHotspotClasses = EMPTY_ACCIDENT_HOTSPOT_CLASSES,
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
    // The hotspot radius last painted, in metres. Only a changed rule warrants
    // new paint — re-applying it on every run would restart MapLibre's paint
    // transition each time the layer's data was refreshed.
    const accidentHotspotRadiusRef = useRef(null);
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
    const [cursorCoordinate, setCursorCoordinate] = useState(null);
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
    const onEntityInspectorChangeRef = useRef(onEntityInspectorChange);
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
    const inspectorTone = useMemo(() => getInspectorTone(mapModal), [mapModal]);
    const effective3D = enable3D && performanceProfile.cameraPitchEnabled;
    const filteredReports = useMemo(() => {
        if (mode === 'incident-preview') {
            return getVisibleMapReports(reports, { includePending: true, includeRejected: true });
        }

        const baseFiltered = getFilteredMapReports(reports, {
            includePending: showPending,
            category: filterCategory,
            statusFilter: filterStatus,
            includeResolved: allIncludesResolved,
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
    }, [allIncludesResolved, effectiveLocateRequest, filterCategory, filterStatus, mode, reports, showPending]);
    // Whether this map's subject is the hazard layer rather than the incident
    // list. The dashboard says so by selecting its Risk Zones tab; the dedicated
    // zones page says so with `mode` and has no tabs at all, which is why the
    // mode has to count as well. Without it the zones page filtered its own zones
    // away and drew an empty map — the one screen that exists to show them.
    const isRiskZoneMap = mode === 'risk-zones' || isRiskZoneLayerVisibleForFilter(filterStatus);

    /**
     * Attribution for the hazard layers, shown only while they are drawn.
     *
     * The datasets are ODC-ODbL, which requires attribution wherever they are
     * rendered — so it cannot live only in the zones workspace's legend, because
     * this map draws them too. Rendered here rather than in a legend component
     * so every surface that draws the layer carries the credit, including ones
     * with no legend of their own.
     *
     * Sources are deduplicated and joined: landslide is PHIVOLCS, storm surge is
     * PAGASA, and showing one of them would misattribute the other.
     */
    const hazardAttribution = useMemo(() => {
        if (!isRiskZoneMap || hazardLayers.length === 0) return null;

        const sources = [...new Set(hazardLayers.map((layer) => layer?.attribution).filter(Boolean))];
        if (sources.length === 0) return null;

        const licences = [...new Set(hazardLayers.map((layer) => layer?.licence).filter(Boolean))];
        return licences.length > 0
            ? `${sources.join(' · ')} (${licences.join(', ')})`
            : sources.join(' · ');
    }, [hazardLayers, isRiskZoneMap]);

    // Hazard zones render when this map is about them, or when a risk zone is
    // explicitly targeted for location/inspection.
    //
    // The two cases are not the same set, and drawing them as one was a bug with
    // a long reach. A tab that owns the hazard layer draws EVERY zone — that is
    // what choosing it means. A targeted zone is one record a link (or a Locate)
    // asked to see, and it is reached from a tab that is about incidents; handing
    // the layer a target used to turn all of it on at once, so selecting one
    // hazard area from the search box drew every hazard area on the island under
    // a tab whose label said "All open", and a zone nobody had looked at any
    // more kept that layer alive after the viewer moved to a tab that does not
    // draw it (the workspace now drops the target on a scope change; this is the
    // half that decides what a surviving target may draw).
    const targetedRiskZone = effectiveLocateRequest?.type === 'risk-zone'
        ? effectiveLocateRequest.entity || null
        : null;
    const filteredRiskZones = useMemo(() => {
        if (!showHazardZones) return [];
        if (isRiskZoneMap) return highRiskZones;
        return targetedRiskZone ? [targetedRiskZone] : [];
    }, [highRiskZones, isRiskZoneMap, showHazardZones, targetedRiskZone]);

    // The empty state has to describe the layer this map actually draws. A zones
    // page reporting "no active incidents" is describing something it never
    // shows, which is worse than saying nothing.
    const mapIsEmpty = isRiskZoneMap
        ? filteredRiskZones.length === 0
        : filteredReports.length === 0 && (filterStatus || filteredRiskZones.length === 0);
    const scopedEmptySuffix = emptyScopePhrase ? ` ${emptyScopePhrase}` : '';
    const emptyMapMessage = isRiskZoneMap
        ? (isRiskZoneLayerVisibleForFilter(filterStatus)
            ? 'No high-risk zones match the selected filter.'
            : 'No high-risk zones are mapped yet.')
        : filterStatus
            ? `No incidents match the selected filter${scopedEmptySuffix}.`
            : `No active incidents are currently visible${scopedEmptySuffix}.`;

    useEffect(() => {
        onLocationSelectRef.current = onLocationSelect;
    }, [onLocationSelect]);

    useEffect(() => {
        onEntityInspectorChangeRef.current = onEntityInspectorChange;
    }, [onEntityInspectorChange]);

    // Laid out rather than painted: the caller reserves the pane's box in
    // response, and a passive effect would leave that box closed — and the pane
    // invisible, since it is portalled into a box that is out of the way while
    // nothing is open — for the frame between the pin click and the report.
    useLayoutEffect(() => {
        onEntityInspectorChangeRef.current?.(Boolean(mapModal));
    }, [mapModal]);

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

    /**
     * The home-camera request the map has already answered.
     *
     * Seeded with the request the map is born with, so the switch effect below
     * fires on a CHANGE and never on mount: an arrival's camera is the opening
     * effect's decision, and a deep link that owns it must not be flown away from
     * a moment later. The opening effect reads it too, to stand aside for a
     * request that is newer than the view it was about to settle on.
     */
    const appliedHomeFocusRequestRef = useRef(homeFocusRequestId);

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
        // A scope switch the map has not answered yet is the newer instruction,
        // and it already knows where the camera is going. Settling on the opening
        // camera first would put the map somewhere the switch then leaves — and it
        // would do it instantly, because an opening camera is not a move, which is
        // the jump a scope change must not look like.
        if (homeFocusRequestId && appliedHomeFocusRequestRef.current !== homeFocusRequestId) {
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
    }, [applyHomeCamera, dataLoading, effectiveLocateRequest, focusLocation, homeFocusRequestId, mapReady]);

    /**
     * A caller's home-camera request — the map scope switch.
     *
     * The request is answered by one camera move, animated, because a scope change
     * is the viewer asking to be taken somewhere rather than a place the map
     * happens to open on.
     *
     * It waits for the incoming scope's data, and is only recorded once it has
     * actually been applied — the wait resolves because the effect re-runs when
     * `dataLoading` lands, and `applyHomeCamera` then closes over the new reports.
     * Two things hang on that wait. A framing camera would otherwise settle on the
     * set the viewer just left and stay there. And a move spent while the scope is
     * still loading is spent under the map's loading veil, so the viewer would
     * never see the transition they asked for — only the view it arrived at.
     */
    useEffect(() => {
        if (!homeFocusRequestId) return;
        if (appliedHomeFocusRequestRef.current === homeFocusRequestId) return;
        if (!mapReady || dataLoading) return;
        appliedHomeFocusRequestRef.current = homeFocusRequestId;
        applyHomeCamera({ animate: true });
    }, [applyHomeCamera, dataLoading, homeFocusRequestId, mapReady]);

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

    // Laid out rather than painted, because the two panes share one box: a
    // caller that opens its own records takes that box from this map, and this
    // map's pane has to be gone in the same commit rather than one frame later,
    // where the reader would see the two of them stacked in it.
    useLayoutEffect(() => {
        if (externalContextPanelOpen) closeMapSelection();
    }, [closeMapSelection, externalContextPanelOpen]);

    // The hazard layer's own version of the same rule: a zone's details belong to
    // the layer being drawn. When the layer stops being drawn — the viewer left
    // the hazards tab, the workspace dropped a stale target, the zones failed to
    // load — the marker that opened this pane is gone from the canvas, and a pane
    // describing a marker that is no longer there is a pane about nothing. The
    // report path below cannot cover this case: it stands down for a selection
    // that is not a report, and a zone has no dataset entry to check.
    useEffect(() => {
        if (mapModal?.type !== 'zone') return;
        if (filteredRiskZones.length > 0) return;
        closeMapSelection();
    }, [closeMapSelection, filteredRiskZones, mapModal]);

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

        // Stacked below the navigation control, in the same corner it already
        // uses: expanding the map is the same kind of action as zooming it.
        if (showFullscreenControl) {
            try {
                // The wrapper when the caller has one, so the map's own header —
                // and the layer menu inside it — is part of what goes fullscreen.
                // Expanding the canvas alone would leave those controls on the
                // page, which is where they are least useful.
                const fullscreenContainer = fullscreenContainerRef?.current;
                mapInstance.addControl(
                    new maplibregl.FullscreenControl(
                        fullscreenContainer ? { container: fullscreenContainer } : undefined
                    ),
                    'top-right'
                );
            } catch {
                // Fullscreen is progressive enhancement, and the API is absent
                // on some embedded browsers.
            }
        }

        // Metric scale bar. Placed bottom-left because MapLibre's default
        // attribution sits bottom-right, and the compact attribution installed
        // below already occupies that corner.
        if (showScaleControl) {
            try {
                mapInstance.addControl(
                    new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }),
                    'bottom-left'
                );
            } catch {
                // Scale control is progressive enhancement.
            }
        }

        // Live cursor coordinate. Updates are coalesced to one per frame: a
        // mousemove fires far faster than React can usefully re-render, and this
        // runs on the same thread that is painting the map.
        if (showCursorCoordinates) {
            let cursorFrame = 0;
            const handleCursorMove = (event) => {
                if (cursorFrame) return;
                cursorFrame = requestAnimationFrame(() => {
                    cursorFrame = 0;
                    if (cancelled) return;
                    setCursorCoordinate({
                        lat: event.lngLat.lat,
                        lng: event.lngLat.lng,
                    });
                });
            };
            const clearCursor = () => setCursorCoordinate(null);

            mapInstance.on('mousemove', handleCursorMove);
            mapInstance.on('mouseout', clearCursor);
            // Teardown for both listeners; a stale handler would keep setting
            // state on an unmounted component.
            const removeCursorListeners = () => {
                if (cursorFrame) cancelAnimationFrame(cursorFrame);
                mapInstance.off('mousemove', handleCursorMove);
                mapInstance.off('mouseout', clearCursor);
            };
            const previousRemoveCompassToggle = removeCompassToggle;
            removeCompassToggle = () => {
                removeCursorListeners();
                previousRemoveCompassToggle?.();
            };
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

            // Hazard layers are NOT registered here. The set is dynamic (the
            // server decides which datasets exist), and the payload arrives
            // asynchronously, so they are created by the data effect below —
            // which also has to be able to add a layer after mount.

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

    // Create and populate one source + fill + outline per hazard layer, and show
    // them only when the viewer has asked for mapped hazards.
    //
    // Done here rather than in the load handler because both the set of layers
    // and their data arrive asynchronously: the map mounts before the catalog is
    // fetched, so a layer may need to be added long after mount. Layers are
    // inserted *before* the risk-zone layers, which is what keeps operator-drawn
    // zones on top of the terrain context they were placed against.
    //
    // Visibility follows the risk-zone layer rather than getting a control of its
    // own: `isRiskZoneMap` is already "this viewer asked to see mapped hazards",
    // and a second toggle would be a second vocabulary for the same intent.
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;
        const map = mapInstanceRef.current;

        // Undefined when the risk-zone layer is absent, which makes addLayer
        // append — still correct, just not ordered.
        const beforeId = map.getLayer(RISK_ZONE_FILL_LAYER_ID) ? RISK_ZONE_FILL_LAYER_ID : undefined;
        const visibility = isRiskZoneMap ? 'visible' : 'none';

        for (const layer of hazardLayers) {
            const datasetId = layer?.datasetId;
            if (!datasetId) continue;

            const sourceId = hazardSourceId(datasetId);
            const fillId = hazardFillLayerId(datasetId);
            const outlineId = hazardOutlineLayerId(datasetId);
            const features = Array.isArray(layer.features) ? layer.features : [];
            const classes = Array.isArray(layer.classes) ? layer.classes : [];

            try {
                const existing = map.getSource(sourceId);
                if (existing) {
                    existing.setData({ type: 'FeatureCollection', features });
                } else {
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features },
                    });
                }

                const colorExpression = buildHazardColorExpression(layer.hazardType, classes);

                if (!map.getLayer(fillId)) {
                    map.addLayer({
                        id: fillId,
                        type: 'fill',
                        source: sourceId,
                        minzoom: HAZARD_MIN_ZOOM,
                        layout: { visibility },
                        paint: {
                            'fill-color': colorExpression,
                            // Lighter than the incident fills: this is a
                            // background surface, and at full strength it would
                            // swamp the pins drawn over it. It also fades with
                            // zoom, so the imagery underneath stays readable
                            // where zone placement actually happens.
                            'fill-opacity': HAZARD_FILL_OPACITY,
                        },
                    }, beforeId);
                }
                if (!map.getLayer(outlineId)) {
                    map.addLayer({
                        id: outlineId,
                        type: 'line',
                        source: sourceId,
                        minzoom: HAZARD_MIN_ZOOM,
                        layout: { visibility },
                        paint: {
                            'line-color': colorExpression,
                            'line-width': 0.8,
                            // Fades with the fill: an outline left at full
                            // strength around a faded fill is the harshest
                            // version of this layer.
                            'line-opacity': HAZARD_OUTLINE_OPACITY,
                        },
                    }, beforeId);
                }

                // `null` means "no per-class control" — draw the layer whole, which
                // is what this map did before the control existed. Anything else is
                // an explicit selection, and an empty one hides the dataset.
                const selectedClasses = Array.isArray(hazardClassVisibility?.[datasetId])
                    ? hazardClassVisibility[datasetId]
                    : [];
                const classFilter = hazardClassVisibility
                    ? ['in', ['get', 'haz'], ['literal', [...selectedClasses]]]
                    : null;

                for (const layerId of [fillId, outlineId]) {
                    if (!map.getLayer(layerId)) continue;
                    map.setLayoutProperty(layerId, 'visibility', visibility);
                    // Applied on every run rather than only when it changes: a style
                    // reload recreates the layers with no filter at all, and this
                    // effect re-runs on that path — a value comparison would skip
                    // the fresh layer and it would come back fully drawn.
                    map.setFilter(layerId, classFilter);
                }
            } catch (error) {
                // A style reload can remove layers between the check and the
                // add. Skipping is correct — the next data change re-adds them.
                console.warn(`Hazard layer ${datasetId} could not be added:`, error?.message);
            }
        }
    }, [hazardLayers, hazardClassVisibility, mapReady, isRiskZoneMap]);

    /**
     * Accident-prone circles: one GeoJSON source, one circle layer per class.
     *
     * Separate from the hazard effect because the geometry is different — those
     * are polygon surfaces, these are computed points — and because the two
     * layers answer to different owners: the hazard classes come from a registry
     * the server publishes, while these come from the system's own reports over a
     * window, and they change at different rates.
     *
     * Two layers rather than one layer with a class filter, because the classes
     * are switched independently: a per-class layer means a toggle is a
     * `visibility` flip, which is the map's cheapest operation and cannot disturb
     * the other class, the shared source, or the map itself. Nothing here ever
     * calls `setStyle` or re-creates the map, so toggling never reloads a tile or
     * loses the camera.
     *
     * Inserted below the risk-zone fill, like the hazard layers: operator-drawn
     * zones are the subject of this workspace and the derived context must never
     * cover them.
     */
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || !accidentHotspots) return;
        const map = mapInstanceRef.current;

        const features = Array.isArray(accidentHotspots.features) ? accidentHotspots.features : [];
        const selectedClasses = Array.isArray(accidentHotspotClasses) ? accidentHotspotClasses : [];
        const beforeId = map.getLayer(RISK_ZONE_FILL_LAYER_ID) ? RISK_ZONE_FILL_LAYER_ID : undefined;
        // The radius is the server's analysis parameter drawn to scale, so it is
        // read from the payload rather than fixed here: retuning the rule widens
        // the circles without a change in this file.
        const rule = resolveAccidentHotspotRule(accidentHotspots);
        const radiusExpression = buildAccidentHotspotRadiusExpression(rule.radiusMeters);

        try {
            const collection = { type: 'FeatureCollection', features };
            const source = map.getSource(ACCIDENT_HOTSPOT_SOURCE_ID);
            if (source) {
                source.setData(collection);
            } else {
                map.addSource(ACCIDENT_HOTSPOT_SOURCE_ID, { type: 'geojson', data: collection });
            }
        } catch (error) {
            // A style reload can drop the source between the check and the call.
            // The next data change re-adds it, so skipping is correct.
            console.warn('Accident-prone source could not be added:', error?.message);
            return;
        }

        for (const classValue of getAccidentHotspotClasses(accidentHotspots)) {
            const paint = getAccidentHotspotPaint(classValue);
            if (!paint) continue;

            const layerId = accidentHotspotCircleLayerId(classValue);
            const visible = isRiskZoneMap
                && features.length > 0
                && selectedClasses.includes(classValue);

            if (!map.getLayer(layerId)) {
                try {
                    map.addLayer({
                        id: layerId,
                        type: 'circle',
                        source: ACCIDENT_HOTSPOT_SOURCE_ID,
                        minzoom: ACCIDENT_HOTSPOT_MIN_ZOOM,
                        // Class selection is this layer's own filter, so the two
                        // classes share one source without duplicating a point.
                        filter: buildAccidentHotspotFilterExpression(classValue),
                        layout: { visibility: visible ? 'visible' : 'none' },
                        paint: {
                            'circle-color': paint.color,
                            // No zoom fade here, unlike the susceptibility surface:
                            // a fill fades so the imagery underneath stays readable,
                            // but a circle is a marker for one spot — fading it out
                            // at street level would hide the hotspot exactly where
                            // an operator is placing a zone.
                            'circle-opacity': paint.fillOpacity,
                            // Both classes draw the same 100 m area — what
                            // separates them is intensity, so the radius is the
                            // rule's, not the class's.
                            'circle-radius': radiusExpression,
                            'circle-stroke-color': paint.color,
                            'circle-stroke-opacity': paint.strokeOpacity,
                            'circle-stroke-width': paint.strokeWidth,
                        },
                    }, beforeId);
                } catch (error) {
                    console.warn(`${layerId} could not be added:`, error?.message);
                }
                continue;
            }

            // Existing layer: switching a class is a visibility flip and nothing
            // else — the source is untouched, so the map never re-parses the data.
            map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }

        // A retuned rule is the one case that has to touch paint after the layer
        // was added, because the alternative is a circle that keeps claiming the
        // old radius until the operator reloads the page. `null` is the first run,
        // where the layers were just created with this radius — repainting them
        // here would be a needless write, and would restart a transition.
        const radiusChanged = accidentHotspotRadiusRef.current !== null
            && accidentHotspotRadiusRef.current !== rule.radiusMeters;

        if (radiusChanged) {
            for (const classValue of getAccidentHotspotClasses(accidentHotspots)) {
                const layerId = accidentHotspotCircleLayerId(classValue);
                if (!map.getLayer(layerId) || typeof map.setPaintProperty !== 'function') continue;
                try {
                    map.setPaintProperty(layerId, 'circle-radius', radiusExpression);
                } catch (error) {
                    console.warn(`${layerId} radius could not be updated:`, error?.message);
                }
            }
        }

        // Recorded either way, so the next run can tell "already painted" from
        // "the server retuned the rule".
        accidentHotspotRadiusRef.current = rule.radiusMeters;
    }, [accidentHotspotClasses, accidentHotspots, isRiskZoneMap, mapReady]);

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
                const canAcknowledgeThisReport = canAcknowledgeTransfer
                    && (!canAcknowledgeTransferReport || canAcknowledgeTransferReport(report));
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
                    // Acknowledging does not move the status, so an acknowledged
                    // transfer would otherwise keep the pin it was built with and
                    // go on offering the button it has already used.
                    canAcknowledgeThisReport,
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

                    // Opens this map's details pane for the pin — in the
                    // caller's column when one was handed over, otherwise over
                    // the map — and flies the camera to it.
                    const openMarker = (e) => {
                        e.stopPropagation();
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
                        setMapModal({ type: 'report', data: report, canRespond: canRespondToThisReport, canResolve: canResolveThisReport, canVerify: canVerifyThisReport, canReject: canVerifyThisReport, canAcknowledgeTransfer: canAcknowledgeThisReport });
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

    }, [filteredReports, mapReady, performanceProfile, canRespond, canResolve, canResolveReport, canVerify, canVerifyReport, canAcknowledgeTransfer, canAcknowledgeTransferReport, selectOperationalMarker]);

    // Fresh-event pulse: toggle the temporary ring on markers touched by the
    // latest socket events. Runs after the marker sync above (same deps plus
    // pulse ids) so rebuilt elements get the class deterministically.
    useEffect(() => {
        const pulsing = new Set((Array.isArray(pulseReportIds) ? pulseReportIds : []).map(String));
        reportMarkersRef.current.forEach((entry) => {
            const shouldPulse = (entry.ids || []).some((id) => pulsing.has(String(id)));
            entry.element?.classList?.toggle('map-marker--fresh', shouldPulse);
        });
    }, [pulseReportIds, filteredReports, mapReady, canRespond, canResolve, canResolveReport, canVerify, canVerifyReport, canAcknowledgeTransfer, canAcknowledgeTransferReport, selectOperationalMarker]);

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

                // Same pane, same column, one pin at a time — see the incident
                // marker above.
                const openMarker = (e) => {
                    e.stopPropagation();
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

    // Closes like its siblings, and for a reason beyond symmetry: this panel holds
    // a snapshot of the report, so leaving it open after acknowledging would show
    // the button again for an act that is already done. The refreshed list behind
    // it is what a reader should be looking at.
    const handleAcknowledgeTransferFromModal = async (report) => {
        if (!onAcknowledgeTransferToReport) return;
        setActionLoading(true);
        const result = await onAcknowledgeTransferToReport(report);
        if (result?.ok) {
            toast.success(result.message || 'Transfer acknowledged');
            closeMapSelection();
        } else {
            toast.error(result?.message || 'Failed to acknowledge transfer');
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

            {/* Live pointer position. Rendered above the canvas but below the
                error and loading states, so a broken map never shows a readout
                for a surface that is not there.

                Six decimals is deliberate: four is roughly 11 m, which is the
                same order as the placement error we are trying to remove. */}
            {showCursorCoordinates && cursorCoordinate && (
                <div
                    className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg border border-gray-200/80 bg-white/95 px-2.5 py-1.5 font-mono text-[11px] leading-tight text-gray-800 shadow-2xs backdrop-blur-xs dark:border-white/10 dark:bg-[#0c1813]/95 dark:text-gray-100"
                    aria-hidden="true"
                >
                    {cursorCoordinate.lat.toFixed(6)}, {cursorCoordinate.lng.toFixed(6)}
                </div>
            )}

            {/* ODC-ODbL requires attribution wherever the hazard polygons are
                drawn. Kept muted and out of the way, but always present while
                the layer is on screen. */}
            {hazardAttribution && (
                <div
                    className="pointer-events-none absolute bottom-2 right-2 z-20 max-w-[60%] text-right text-[10px] leading-tight text-gray-700/90 dark:text-gray-200/80"
                    aria-label="Hazard data attribution"
                >
                    Hazard data: {hazardAttribution}
                </div>
            )}

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
                    // The caller's column when it has one: a pin's details belong
                    // beside the map, not over the part of it the reader just
                    // pointed at.
                    dockTarget={dockTarget}
                    accentClassName={inspectorTone.bar}
                    accentDotClassName={inspectorTone.dot}
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
                            canAcknowledgeTransfer={mapModal.canAcknowledgeTransfer}
                            actionLoading={actionLoading}
                            onRespond={handleRespondFromModal}
                            onResolve={handleResolveFromModal}
                            onVerify={handleVerifyFromModal}
                            onReject={handleRejectFromModal}
                            onAcknowledgeTransfer={handleAcknowledgeTransferFromModal}
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
                                        canAcknowledgeTransfer: canAcknowledgeTransfer && (!canAcknowledgeTransferReport || canAcknowledgeTransferReport(report)),
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
                    {/* Scope sits above the layer and location tools, which is the
                        order the rail reads in: what area this map is showing, how
                        it is drawn, and where to put it back. */}
                    {typeof onMapScopeChange === 'function' && (
                        <MapScopeControl
                            scope={mapScope}
                            onScopeChange={onMapScopeChange}
                            municipality={mapScopeMunicipality}
                        />
                    )}

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

/**
 * Memoized because this component is expensive to render and its output is a
 * pure function of its props — every map mutation already lives in an effect
 * keyed on a prop. Without the memo, any unrelated state change in the parent
 * (an upload progress tick, a keystroke in the report form) re-rendered the
 * whole map: ~30 effects re-evaluated and marker layers rebuilt for a canvas
 * that had not changed.
 *
 * Callers must pass stable values for the props they own; a `reports` array
 * that is mutated in place rather than replaced would defeat this and, worse,
 * hide the change. The app replaces state immutably throughout.
 */
export default memo(MapView);
