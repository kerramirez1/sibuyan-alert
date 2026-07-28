import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { HiOutlineLocationMarker, HiOutlineMap, HiOutlineX, HiOutlineOfficeBuilding } from 'react-icons/hi';
import {
    getMapCoordinates,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../../utils/mapReports';
import { installCompassOrientationToggle } from '../../utils/mapNavigation';
import {
    createOperationalMapStyle,
    PMTILES_SOURCE_ID,
} from '../../config/mapProvider';

// Sibuyan Island bounds and center
const SIBUYAN_CENTER = [122.5571, 12.4176]; // Lon/Lat
const SIBUYAN_INTERACTION_BOUNDS = [[122.45, 12.30], [122.70, 12.55]];

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

const STATUS_MARKER_COLORS = {
    pending: '#F97316',
    verified: '#2563EB',
    transferred: '#7C3AED',
    responding: '#EF4444',
};

// Zone colors
const ZONE_COLORS = {
    landslide_prone: '#EF4444',
    accident_prone: '#EF4444',
    other: '#EF4444',
};

const SEVERITY_CONFIG = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-emerald-100 text-emerald-700',
};

const MapView = ({
    reports = [],
    highRiskZones = [],
    showPending = false,
    onLocationSelect = null,
    selectedLocation = null,
    className = '',
    filterCategory = null,
    filterStatus = null,
    focusLocation = null,
    enable3D = true,
    gpsAccuracy = null,
    userLocation = null, // New prop for Blue Dot
    canRespond = false,
    onRespondToReport = null,
    canResolve = false,
    canResolveReport = null,
    onResolveReport = null,
}) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const selectedMarkerRef = useRef(null);
    const reportMarkersRef = useRef([]);
    const zoneMarkersRef = useRef([]);
    const popupRef = useRef(null);
    const streetLayersRef = useRef({ all: [], active: [], fallback: null });
    const streetFallbackActivatedRef = useRef(false);
    const [mapReady, setMapReady] = useState(false);
    const [showMuniMenu, setShowMuniMenu] = useState(false);
    const [mapStyle, setMapStyle] = useState('satellite'); // 'satellite' or 'streets'
    const mapStyleRef = useRef(mapStyle);
    const [mapModal, setMapModal] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const onLocationSelectRef = useRef(onLocationSelect);

    useEffect(() => {
        onLocationSelectRef.current = onLocationSelect;
    }, [onLocationSelect]);

    useEffect(() => {
        mapStyleRef.current = mapStyle;
    }, [mapStyle]);

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
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        const provider = createOperationalMapStyle({ enableTerrain: enable3D });
        streetLayersRef.current = {
            all: provider.allStreetLayerIds,
            active: provider.primaryStreetLayerIds,
            fallback: provider.fallbackStreetLayerId,
        };
        streetFallbackActivatedRef.current = false;

        const mapInstance = new maplibregl.Map({
            container: mapContainerRef.current,
            style: provider.style,
            center: SIBUYAN_CENTER,
            zoom: 11,
            pitch: enable3D ? 45 : 0,
            bearing: enable3D ? -17 : 0,
            antialias: true,
            attributionControl: false,
            // A report pin must stay within the same server-enforced Sibuyan envelope.
            maxBounds: onLocationSelect ? SIBUYAN_INTERACTION_BOUNDS : [[121.5, 11.5], [123.5, 13.5]],
            maxZoom: 17,
        });

        const navigationControl = new maplibregl.NavigationControl({ visualizePitch: true });
        mapInstance.addControl(navigationControl, 'top-right');
        mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
        const removeCompassToggle = installCompassOrientationToggle(mapInstance, navigationControl, {
            pitch: enable3D ? 45 : 0,
            bearing: enable3D ? -17 : 0,
        });

        mapInstance.on('error', (event) => {
            const sourceId = event?.sourceId || event?.source?.id;
            if (sourceId !== PMTILES_SOURCE_ID || streetFallbackActivatedRef.current) return;

            streetFallbackActivatedRef.current = true;
            streetLayersRef.current.active = streetLayersRef.current.fallback
                ? [streetLayersRef.current.fallback]
                : [];

            if (mapStyleRef.current === 'streets') {
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
            // Add sources
            mapInstance.addSource('reports', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            mapInstance.addSource('zones', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            mapInstance.addSource('selected-location', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            // Add zone fill layer
            mapInstance.addLayer({
                id: 'zones-fill',
                type: 'fill',
                source: 'zones',
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.25,
                },
            });

            // Add zone outline layer
            mapInstance.addLayer({
                id: 'zones-outline',
                type: 'line',
                source: 'zones',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 2,
                },
            });

            // Add 3D extrusion for zones if enabled
            if (enable3D) {
                mapInstance.addLayer({
                    id: 'zones-3d',
                    type: 'fill-extrusion',
                    source: 'zones',
                    paint: {
                        'fill-extrusion-color': ['get', 'color'],
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': 0,
                        'fill-extrusion-opacity': 0.5,
                    },
                });
            }

            // Add reports layer
            mapInstance.addLayer({
                id: 'reports-layer',
                type: 'circle',
                source: 'reports',
                paint: {
                    'circle-radius': 10,
                    'circle-color': ['get', 'color'],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff',
                },
            });

            // Add selected location layer
            mapInstance.addLayer({
                id: 'selected-location-layer',
                type: 'circle',
                source: 'selected-location',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#EF4444',
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.9,
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
            // Check if clicked on a report
            const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['reports-layer'] });

            if (features.length > 0) {
                // HTML markers handle click UI; avoid old inline popups.
                return;
            } else {
                popupRef.current.remove();
                // Trigger location select if callback provided
                if (onLocationSelectRef.current) {
                    onLocationSelectRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                }
            }
        });

        // Change cursor on hover
        mapInstance.on('mouseenter', 'reports-layer', () => {
            mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'reports-layer', () => {
            mapInstance.getCanvas().style.cursor = '';
        });

        return () => {
            removeCompassToggle();
            popupRef.current?.remove();
            mapInstance.remove();
            mapInstanceRef.current = null;
        };
    }, [enable3D]);

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
            setVisibility('esri-imagery-layer', true);
            setVisibility('esri-reference-layer', true);
        } else {
            setVisibility('esri-imagery-layer', false);
            setVisibility('esri-reference-layer', false);
            streetLayersRef.current.active.forEach((layerId) => setVisibility(layerId, true));
        }
    }, [mapStyle, mapReady]);

    // Update data layers
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        const isReportAssigned = (report) => {
            if (!report) return false;
            const hasResponders = Array.isArray(report.responders) && report.responders.length > 0;
            return hasResponders || !!report.respondedBy;
        };

        // Filter reports
        const displayReports = getVisibleMapReports(reports, { includePending: showPending });

        const categoryFilteredReports = filterCategory
            ? displayReports.filter(r => r.incidentCategory === filterCategory)
            : displayReports;

        const filteredReports = filterStatus === 'pending'
            ? categoryFilteredReports.filter((r) =>
                r.status === 'transferred' ||
                (['pending', 'verified'].includes(r.status) && !isReportAssigned(r))
            )
            : filterStatus === 'responding'
                ? categoryFilteredReports.filter((r) => r.status === 'responding' || (r.status === 'pending' && isReportAssigned(r)))
                : categoryFilteredReports;

        const getReportMarkerColor = (report) => {
            if (report.status === 'pending') return STATUS_MARKER_COLORS.pending;
            if (report.status === 'transferred') return STATUS_MARKER_COLORS.transferred;
            if (report.status === 'responding') return STATUS_MARKER_COLORS.responding;
            if (report.status === 'verified') return STATUS_MARKER_COLORS.verified;
            return INCIDENT_COLORS[report.incidentCategory] || STATUS_MARKER_COLORS.verified;
        };

        // Generate report features
        const reportFeatures = filteredReports
            .map(report => {
                const coords = getMapCoordinates(report);
                if (!coords) return null;
                return {
                    type: 'Feature',
                    properties: {
                        id: report._id,
                        title: report.title,
                        address: report.address,
                        description: report.description,
                        incidentCategory: report.incidentCategory,
                        incidentTime: report.incidentTime,
                        color: getReportMarkerColor(report),
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [coords.lng, coords.lat],
                    },
                };
            })
            .filter(Boolean);

        // Generate zone features
        const zoneFeatures = highRiskZones.map(zone => {
            const center = [zone.coordinates.lng, zone.coordinates.lat];
            const radiusKm = zone.radius / 1000;
            const coords = generateCirclePolygon(center, radiusKm);

            return {
                type: 'Feature',
                properties: {
                    color: ZONE_COLORS[zone.type] || ZONE_COLORS.other,
                    height: zone.severity === 'critical' ? 500 : zone.severity === 'high' ? 300 : zone.severity === 'medium' ? 150 : 50,
                    name: zone.name,
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords],
                },
            };
        });

        // Update sources
        const reportsSource = map.getSource('reports');
        if (reportsSource) {
            reportsSource.setData({ type: 'FeatureCollection', features: reportFeatures });
        }

        // Clear existing report markers
        reportMarkersRef.current.forEach(marker => marker.remove());
        reportMarkersRef.current = [];

        // Co-located reports share one marker with a count badge so no incident is
        // silently hidden underneath another marker at the same coordinates.
        groupReportsByMapLocation(filteredReports)
            .forEach(({ coordinates: coords, reports: groupedReports }) => {
                const statusPriority = { responding: 4, transferred: 3, verified: 2, pending: 1 };
                const report = [...groupedReports].sort(
                    (left, right) => (statusPriority[right.status] || 0) - (statusPriority[left.status] || 0)
                )[0];
                const isResponding = groupedReports.some((item) => item.status === 'responding');
                const isPending = groupedReports.every((item) => item.status === 'pending');
                const canRespondToThisReport = canRespond && ['verified', 'transferred'].includes(report.status);
                const canResolveThisReport = canResolve &&
                    report.status === 'responding' &&
                    (!canResolveReport || canResolveReport(report));
                const markerColor = getReportMarkerColor(report);
                const markerWidth = isPending ? 30 : 24;
                const markerHeight = isPending ? 40 : 32;

                const el = document.createElement('div');
                el.className = 'report-marker';
                el.innerHTML = `
                    <div style="position:relative; width:40px; height:40px; display:flex; align-items:flex-end; justify-content:center;">
                        ${isResponding ? `
                            <div style="
                                position:absolute;
                                width:30px;
                                height:30px;
                                border-radius:9999px;
                                background:rgba(239,68,68,0.34);
                                animation: responderPulse 1.8s ease-out infinite;
                            "></div>
                            <div style="
                                position:absolute;
                                width:30px;
                                height:30px;
                                border-radius:9999px;
                                background:rgba(239,68,68,0.20);
                                animation: responderPulse 1.8s ease-out infinite 0.9s;
                            "></div>
                        ` : ''}
                         <svg width="${markerWidth}" height="${markerHeight}" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="${isResponding ? 'filter: drop-shadow(0 0 12px rgba(239,68,68,0.95));' : isPending ? 'filter: drop-shadow(0 0 14px rgba(249,115,22,0.95));' : ''}">
                            <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="${markerColor}"/>
                            ${isPending ? `
                                <circle cx="12" cy="11.5" r="4.5" fill="none" stroke="white" stroke-width="1.5"/>
                                <path d="M12 9.5V11.5L13.5 13" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            ` : `
                                <circle cx="12" cy="12" r="5" fill="white"/>
                            `}
                         </svg>
                         ${groupedReports.length > 1 ? `
                            <span style="
                                position:absolute;
                                right:-5px;
                                top:-6px;
                                min-width:20px;
                                height:20px;
                                padding:0 5px;
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                border-radius:9999px;
                                border:2px solid white;
                                background:#111827;
                                color:white;
                                font:700 11px/1 Inter,system-ui,sans-serif;
                                box-shadow:0 2px 6px rgba(15,23,42,.35);
                            ">${groupedReports.length}</span>
                         ` : ''}
                     </div>
                 `;
                el.style.cursor = 'pointer';
                el.style.zIndex = isPending ? '40' : '30';
                el.setAttribute('role', 'button');
                el.setAttribute('tabindex', '0');
                el.setAttribute(
                    'aria-label',
                    groupedReports.length > 1
                        ? `${groupedReports.length} incidents at this location`
                        : `${report.title || report.incidentType || 'Incident'} map marker`
                );

                const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([coords.lng, coords.lat])
                    .addTo(map);

                // Open fixed modal instead of inline map popup
                const openMarker = (e) => {
                    e.stopPropagation();
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


                reportMarkersRef.current.push(marker);
            });

        const zonesSource = map.getSource('zones');
        if (zonesSource) {
            zonesSource.setData({ type: 'FeatureCollection', features: zoneFeatures });
        }

        // Clear existing zone markers
        zoneMarkersRef.current.forEach(marker => marker.remove());
        zoneMarkersRef.current = [];

        // Create unique HTML markers for high-risk zones (warning triangle style)
        highRiskZones.forEach(zone => {
            const color = ZONE_COLORS[zone.type] || ZONE_COLORS.other;

            const el = document.createElement('div');
            el.className = 'zone-marker';
            el.style.zIndex = '10';
            el.innerHTML = `
                <div style="position:relative; width:48px; height:48px; display:flex; align-items:center; justify-content:center;">
                    <div style="
                        position:absolute;
                        width:100%; height:100%;
                        background:rgba(239, 68, 68, 0.3);
                        border-radius:50%;
                        animation: dangerPulse 1.5s ease-out infinite;
                    "></div>
                    <div style="
                        position:absolute;
                        width:70%; height:70%;
                        background:rgba(239, 68, 68, 0.5);
                        border-radius:50%;
                        animation: dangerPulse 1.5s ease-out infinite 0.5s;
                    "></div>
                    <div style="
                        width:24px; height:24px;
                        background:${color};
                        border:2px solid white;
                        border-radius:50%;
                        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.6);
                        position:relative;
                        z-index:2;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                    ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M14 2L7 12h4l-1 10 7-10h-4l1-10z" fill="white"/>
                        </svg>
                    </div>
                </div>
            `;
            el.style.cursor = 'pointer';
            el.title = zone.name;

            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([zone.coordinates.lng, zone.coordinates.lat])
                .addTo(map);

            // Open fixed modal instead of inline map popup
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                setMapModal({
                    type: 'zone',
                    data: zone,
                });
            });


            zoneMarkersRef.current.push(marker);
        });

        // Update selected location
        const selectedSource = map.getSource('selected-location');
        if (selectedSource && selectedLocation) {
            selectedSource.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'Point',
                        coordinates: [selectedLocation.lng, selectedLocation.lat],
                    },
                }],
            });
        } else if (selectedSource) {
            selectedSource.setData({ type: 'FeatureCollection', features: [] });
        }

        // Handle HTML Marker for selected location (always visible on top)
        if (selectedLocation) {
            if (!selectedMarkerRef.current) {
                // Create a custom marker element
                const el = document.createElement('div');
                el.className = 'selected-location-marker';
                el.innerHTML = `
                    <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 0C6.72 0 0 6.72 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.72 23.28 0 15 0Z" fill="#EF4444"/>
                        <circle cx="15" cy="15" r="6" fill="white"/>
                    </svg>
                `;
                el.style.cursor = 'pointer';

                selectedMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true })
                    .setLngLat([selectedLocation.lng, selectedLocation.lat])
                    .addTo(map);

                selectedMarkerRef.current.on('dragend', () => {
                    const lngLat = selectedMarkerRef.current.getLngLat();
                    if (onLocationSelectRef.current) {
                        onLocationSelectRef.current({ lat: lngLat.lat, lng: lngLat.lng });
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
    }, [reports, highRiskZones, selectedLocation, userLocation, showPending, filterCategory, filterStatus, mapReady, generateCirclePolygon, gpsAccuracy, canRespond, canResolve, canResolveReport, onRespondToReport, onResolveReport]);

    // Handle focus location updates (for dynamic changes)
    useEffect(() => {
        if (!mapInstanceRef.current || !focusLocation || !mapReady) return;

        const map = mapInstanceRef.current;
        map.flyTo({
            center: [focusLocation.lng, focusLocation.lat],
            zoom: focusLocation.zoom || 16,
            pitch: enable3D ? 45 : 0,
            bearing: enable3D ? -17 : 0,
            essential: true,
            duration: 4000 // Cinematic slow-mo transition
        });
    }, [focusLocation, enable3D, mapReady]);

    // Navigation handlers
    const recenterMap = () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo({
                center: SIBUYAN_CENTER,
                zoom: 11,
                pitch: enable3D ? 45 : 0,
                bearing: enable3D ? -17 : 0,
            });
        }
    };

    const goToMunicipality = (center) => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo({
                center: center,
                zoom: 13,
                pitch: enable3D ? 45 : 0,
                bearing: enable3D ? -17 : 0,
            });
        }
        setShowMuniMenu(false);
    };

    const getStatusBadgeClass = (status) => {
        if (status === 'responding') return 'bg-red-100 text-red-700';
        if (status === 'verified') return 'bg-blue-100 text-blue-700';
        if (status === 'transferred') return 'bg-purple-100 text-purple-700';
        if (status === 'pending') return 'bg-amber-100 text-amber-700';
        if (status === 'resolved') return 'bg-gray-100 text-gray-700';
        return 'bg-gray-100 text-gray-700';
    };

    const handleLocateModalItem = (item) => {
        const coords = item?.coordinates;
        if (!coords || !mapInstanceRef.current) return;
        const lat = Number(coords.lat);
        const lng = Number(coords.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        setMapModal(null);
        mapInstanceRef.current.flyTo({
            center: [lng, lat],
            zoom: 17,
            pitch: enable3D ? 45 : 0,
            bearing: enable3D ? -17 : 0,
            essential: true,
            duration: 1200,
        });
    };

    const handleRespondFromModal = async (report) => {
        if (!onRespondToReport) return;
        setActionLoading(true);
        const result = await onRespondToReport(report);
        if (result?.ok) {
            toast.success(result.message || 'Responder assigned');
            setMapModal(null);
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
            setMapModal(null);
        } else {
            toast.error(result?.message || 'Failed to resolve');
        }
        setActionLoading(false);
    };

    return (
        <div className={`relative rounded-2xl overflow-hidden ${className}`} style={{ minHeight: '400px' }}>
            <div
                ref={mapContainerRef}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {mapModal && (
                <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className={`w-full ${mapModal.type === 'zone' ? 'max-w-md' : 'max-w-lg'} bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden`}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <h3 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
                                {mapModal.type === 'zone'
                                    ? 'High Risk Zone Details'
                                    : mapModal.type === 'reportGroup'
                                        ? 'Incidents at this location'
                                        : 'Incident Details'}
                            </h3>
                            <button
                                onClick={() => setMapModal(null)}
                                className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                            >
                                <HiOutlineX className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {mapModal.type === 'report' && (
                            <div className="px-5 py-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${getStatusBadgeClass(mapModal.data.status)}`}>
                                        {mapModal.data.status}
                                    </span>
                                </div>
                                <h4 className="text-xl font-display font-bold text-gray-900">
                                    {mapModal.data.title || mapModal.data.incidentType || 'Incident Report'}
                                </h4>
                                <p className="text-gray-600 mt-2 text-sm leading-relaxed line-clamp-2">{mapModal.data.address || 'Unknown location'}</p>
                                <p className="text-gray-500 mt-1 text-sm">{mapModal.data.incidentTime ? formatDistanceToNow(new Date(mapModal.data.incidentTime), { addSuffix: true }) : 'Recently'}</p>
                                <p className="text-gray-700 mt-3 text-sm leading-relaxed line-clamp-3">{mapModal.data.description || 'No description provided.'}</p>

                                <div className="flex items-center gap-3 mt-5">
                                    <button
                                        onClick={() => handleLocateModalItem(mapModal.data)}
                                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                                    >
                                        Locate
                                    </button>
                                    {mapModal.canRespond && (
                                        <button
                                            onClick={() => handleRespondFromModal(mapModal.data)}
                                            disabled={actionLoading}
                                            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold hover:from-emerald-700 hover:to-emerald-600 transition-colors disabled:opacity-60"
                                        >
                                            {actionLoading ? 'Please wait...' : 'Respond'}
                                        </button>
                                    )}
                                    {mapModal.canResolve && (
                                        <button
                                            onClick={() => handleResolveFromModal(mapModal.data)}
                                            disabled={actionLoading}
                                            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold hover:from-blue-700 hover:to-blue-600 transition-colors disabled:opacity-60"
                                        >
                                            {actionLoading ? 'Please wait...' : 'Resolve'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {mapModal.type === 'reportGroup' && (
                            <div className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto px-5 py-2">
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
                                            <span className="block truncate text-sm font-semibold text-gray-900">
                                                {report.title || report.incidentType || 'Incident report'}
                                            </span>
                                            <span className="mt-1 block truncate text-xs text-gray-500">
                                                {report.address || 'Location unavailable'}
                                            </span>
                                        </span>
                                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${getStatusBadgeClass(report.status)}`}>
                                            {report.status}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {mapModal.type === 'zone' && (
                            <div className="px-5 py-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${SEVERITY_CONFIG[mapModal.data.severity] || SEVERITY_CONFIG.low}`}>
                                        {mapModal.data.severity}
                                    </span>
                                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{mapModal.data.municipality}</span>
                                </div>
                                <h4 className="text-xl font-display font-bold text-gray-900">{mapModal.data.name}</h4>
                                <p className="text-gray-700 mt-3 text-sm leading-relaxed line-clamp-3">{mapModal.data.description || 'No description provided.'}</p>
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</p>
                                        <p className="text-sm font-semibold text-gray-900 mt-1">{mapModal.data.type?.replace(/_/g, ' ') || 'N/A'}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Radius</p>
                                        <p className="text-sm font-semibold text-gray-900 mt-1">{mapModal.data.radius}m</p>
                                    </div>
                                </div>
                                {mapModal.data.coordinates?.lat && mapModal.data.coordinates?.lng && (
                                    <div className="mt-4 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100">
                                        <iframe
                                            title={`Zone preview map - ${mapModal.data.name || 'High Risk Zone'}`}
                                            src={`https://maps.google.com/maps?q=${mapModal.data.coordinates.lat},${mapModal.data.coordinates.lng}&z=15&output=embed`}
                                            className="w-full h-32"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                )}
                                <a
                                    href={`https://www.google.com/maps?q=${mapModal.data.coordinates?.lat},${mapModal.data.coordinates?.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full mt-5 px-4 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 text-white font-bold hover:from-red-700 hover:to-rose-600 transition-colors block text-center"
                                >
                                    Locate on Map
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="mobile-sidebar-hide absolute bottom-6 right-3 sm:bottom-4 sm:right-4 z-20 flex flex-col gap-2 pointer-events-auto">
                {/* Map Style Toggle Button */}
                <button
                    onClick={() => setMapStyle(prev => prev === 'satellite' ? 'streets' : 'satellite')}
                    className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-xl shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-100"
                    title={mapStyle === 'satellite' ? "Switch to Street Map" : "Switch to Satellite"}
                >
                    <HiOutlineMap className={`w-4 h-4 sm:w-5 sm:h-5 ${mapStyle === 'streets' ? 'text-blue-600' : 'text-gray-600'}`} />
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowMuniMenu(!showMuniMenu)}
                        className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-xl shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-100"
                        title="Go to Municipality"
                    >
                        <HiOutlineOfficeBuilding className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>
                    {showMuniMenu && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute bottom-12 right-0 bg-white rounded-xl shadow-lg p-2 min-w-[150px] border border-gray-100"
                        >
                            {Object.entries(MUNICIPALITIES).map(([key, muni]) => (
                                <button
                                    key={key}
                                    onClick={() => goToMunicipality(muni.center)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    {muni.name}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </div>
                <button
                    onClick={recenterMap}
                    className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-xl shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-100"
                    title="Center on Sibuyan"
                >
                    <HiOutlineLocationMarker className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </button>
            </div>

            {/* Legend - Horizontal Top Bar */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm rounded-lg sm:rounded-xl px-2 py-1.5 sm:px-4 sm:py-2.5 shadow-lg border border-gray-100 pointer-events-auto whitespace-nowrap">
                <div className="flex items-center gap-2 sm:gap-5">
                    <div className="flex items-center gap-1">
                        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-red-500 sm:border-l-[5px] sm:border-r-[5px] sm:border-b-[9px]" />
                        <span className="text-[9px] sm:text-[11px] font-semibold text-gray-600"><span className="hidden sm:inline">High Risk </span>Zone</span>
                    </div>
                    <div className="w-px h-3 bg-gray-200" />
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500" />
                        <span className="text-[9px] sm:text-[11px] font-semibold text-gray-600">Pending</span>
                    </div>
                    <div className="w-px h-3 bg-gray-200" />
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-blue-500" />
                        <span className="text-[9px] sm:text-[11px] font-semibold text-gray-600">Verified</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapView;

