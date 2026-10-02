import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { highRiskZonesAPI, reportsAPI } from '../services/api';
import MapView from '../components/map/MapView';
import MapLayerControl from '../components/map/MapLayerControl';
import CustomSelect from '../components/ui/CustomSelect';
import toast from '../utils/appToast';
import useGlobalHighRiskZones from '../hooks/useGlobalHighRiskZones';
import useHazardAreas from '../hooks/useHazardAreas';
import useAccidentHotspots from '../hooks/useAccidentHotspots';
import { MAP_FOCUS_PRESETS, scheduleElementScroll } from '../utils/mapNavigation';
import {
    applyRiskZoneLocationAutofill,
    buildRiskZoneLocationAutofill,
} from '../utils/riskZoneLocation';
import { getHazardColor } from '../config/hazardAreas';
import {
    ACCIDENT_HOTSPOT_DISCLAIMER,
    describeEmptyHotspotClass,
    getAccidentHotspotClasses,
    getAccidentHotspotColor,
    getAccidentHotspotLegendLabel,
    resolveAccidentHotspotRule,
} from '../config/accidentHotspots';
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineLocationMarker,
    HiOutlineCheck,
    HiOutlinePhotograph,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';
import { PANEL_SHEET_MEDIA_QUERY } from '../components/map/MapOverlayPanel';

const isPhoneViewportCheck = () => {
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia === 'function') return window.matchMedia(PANEL_SHEET_MEDIA_QUERY).matches;
    return window.innerWidth < 640;
};

/**
 * Every zone type this client can *render*, which is no longer the same list as
 * the one it can *offer*.
 *
 * Flood-prone zones are withdrawn from the form and filter chips, but the entry stays: this table
 * is how an existing zone is labelled in the list and on the map. A zone saved as `flood_prone` before the option was
 * retired must keep reading "Flood Prone" — data the workspace cannot name is
 * data an administrator cannot manage, reclassify or trust.
 *
 * No color coding on zone types: classification is by plain label text only,
 * so the form and list stay legible on monochrome prints and
 * for color-blind operators.
 */
const ZONE_TYPES = [
    { value: 'landslide_prone', label: 'Landslide Prone' },
    { value: 'accident_prone', label: 'Accident Prone' },
    { value: 'flood_prone', label: 'Flood Prone' },
    { value: 'other', label: 'Other Hazard' },
];

/** Same split as `ZONE_TYPES`: `low` and `critical` are displayable, not selectable. */
const SEVERITY_LEVELS = [
    { value: 'low', label: 'Low', color: 'bg-emerald-500' },
    { value: 'medium', label: 'Medium', color: 'bg-amber-500' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'critical', label: 'Critical', color: 'bg-red-600' },
];

const RETIRED_ZONE_TYPES = new Set(['flood_prone']);
const RETIRED_SEVERITIES = new Set(['low', 'critical']);

/** What the create/edit form offers, derived from the tables above so the two cannot drift. */
const SELECTABLE_ZONE_TYPES = ZONE_TYPES.filter((type) => !RETIRED_ZONE_TYPES.has(type.value));
const SELECTABLE_SEVERITY_LEVELS = SEVERITY_LEVELS.filter((level) => !RETIRED_SEVERITIES.has(level.value));

/**
 * Labels of the withdrawn values a zone still carries, if any.
 *
 * Editing loads the stored type and severity verbatim rather than coercing them,
 * because coercing would quietly re-classify someone else's zone the moment an
 * administrator opened it to fix a typo. The withdrawn value is therefore kept
 * as loaded, named here, and refused at submit until it is deliberately replaced.
 */
const findRetiredSelections = ({ type, severity }) => {
    const retired = [];
    if (RETIRED_ZONE_TYPES.has(type)) {
        retired.push(ZONE_TYPES.find((entry) => entry.value === type)?.label || type);
    }
    if (RETIRED_SEVERITIES.has(severity)) {
        retired.push(SEVERITY_LEVELS.find((entry) => entry.value === severity)?.label || severity);
    }
    return retired;
};

const MUNICIPALITIES = ['Cajidiocan', 'Magdiwang', 'San Fernando'];

/**
 * The radius range the form offers, and the step between one value and the next.
 *
 * The ceiling is the model's own (5000 m), so the form can express every radius
 * the database accepts. It stops short at the bottom (50 m rather than the
 * schema's 10 m) for the same reason the zone types are a subset of what the
 * schema stores: a radius is read against the scale bar, and below 50 m the
 * circle is smaller than the pin that places it.
 *
 * `step` is what makes the control usable rather than merely present — a slider
 * over 495 values would be untruthful about how precisely anyone can place one,
 * and 10 m is finer than the pin itself. The arrows step by exactly that, which
 * is what makes the small end reachable on a track this long.
 */
const RADIUS_LIMITS = Object.freeze({ min: 50, max: 5000, step: 10, defaultValue: 100 });

/**
 * Where a stored radius lands on the slider.
 *
 * A zone saved below the floor opens with the handle at the bottom of the range
 * instead of being silently rewritten upward: the form may offer a narrower band
 * than the model allows, but it does not get to change someone's zone just by
 * being opened. The stored value is shown as it is, and the moment the operator
 * moves the handle the form owns the new one.
 */
const clampToRadiusRange = (value) => {
    const radius = Number(value);
    if (!Number.isFinite(radius)) return RADIUS_LIMITS.defaultValue;
    return Math.min(RADIUS_LIMITS.max, Math.max(RADIUS_LIMITS.min, radius));
};

/**
 * Tone → class map for the hazard readout shown under the selected pin.
 *
 * `unknown` is styled as deliberately neutral rather than as a success: "we
 * could not check" must not read as "you are safe".
 */
const HAZARD_TONE_CLASSES = {
    high: 'text-red-700 dark:text-red-300',
    medium: 'text-amber-700 dark:text-amber-300',
    clear: 'text-emerald-700 dark:text-emerald-300',
    unknown: 'text-gray-500 dark:text-gray-400',
};

const AdminHighRiskZonesPage = () => {
    const { user } = useAuth();
    const { zones, loading, refresh: refreshZones, removeZone } = useGlobalHighRiskZones();
    // NOAH hazard reference layers (landslide, storm surge). Non-blocking by
    // design: the workspace works exactly as before when these are still loading
    // or absent.
    const { layers: hazardLayers } = useHazardAreas();
    /**
     * Accident-prone areas, derived from this system's own accident reports.
     *
     * A different kind of layer from the ones above, and treated differently:
     * the susceptibility polygons are fixed reference geography, while these
     * circles are a live read of the reports collection over a rolling window —
     * so they arrive with their own window and derivation, and the hook behind
     * them revalidates far more often.
     */
    const { layer: accidentHotspotLayer } = useAccidentHotspots();
    /**
     * Which hazard classes the operator has switched on, per dataset.
     *
     * Starts empty, and empty means the map opens clean: susceptibility polygons
     * are context for placing a zone, not the subject of the page, and a map that
     * opens under a red overlay makes an operator turn it off before they can see
     * the road they are placing a pin on. The layers themselves are untouched —
     * this only decides which classes of them are drawn.
     */
    const [visibleHazardClasses, setVisibleHazardClasses] = useState({});
    /**
     * Which accident-prone classes are drawn.
     *
     * Off by default, exactly like the susceptibility classes, and for the same
     * reason: the map is a placement surface first. Empty means off — there is no
     * second flag to fall out of step with the list of classes.
     */
    const [visibleHotspotClasses, setVisibleHotspotClasses] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
    /**
     * Hazard readings for the currently selected pin, across every imported
     * NOAH layer.
     *
     * Held in state rather than only announced in a toast, because the toast is
     * gone by the time the administrator has finished filling in the rest of the
     * form — and the hazard is a fact about the zone they are about to save.
     */
    const [selectedHazards, setSelectedHazards] = useState(null);
    const [focusLocation, setFocusLocation] = useState(null);
    const [editingZone, setEditingZone] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: 'accident_prone',
        severity: 'medium',
        radius: 100,
        municipality: user?.assignedMunicipality || MUNICIPALITIES[0],
    });
    const [photos, setPhotos] = useState([]);
    const [photoPreviews, setPhotoPreviews] = useState([]);
    const photoInputRef = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResolvingLocation, setIsResolvingLocation] = useState(false);
    const [zoneSearch, setZoneSearch] = useState('');
    const [zoneTypeFilter, setZoneTypeFilter] = useState('all');
    const [mobileTab, setMobileTab] = useState('map');
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const [isMapExpanded, setIsMapExpanded] = useState(false);

    const enterExpandedMap = useCallback(() => {
        if (isPhoneViewportCheck()) return;
        setIsMapExpanded(true);
        const target = mapSectionRef.current;
        if (target && typeof target.requestFullscreen === 'function') {
            target.requestFullscreen().catch(() => {});
        }
    }, []);

    const exitExpandedMap = useCallback(() => {
        setIsMapExpanded(false);
        if (typeof document !== 'undefined' && document.fullscreenElement) {
            if (typeof document.exitFullscreen === 'function') {
                document.exitFullscreen().catch(() => {});
            }
        }
    }, []);

    const toggleExpandedMap = useCallback(() => {
        if (isMapExpanded) {
            exitExpandedMap();
        } else {
            enterExpandedMap();
        }
    }, [isMapExpanded, enterExpandedMap, exitExpandedMap]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const handleViewportChange = () => {
            const isPhone = isPhoneViewportCheck();
            if (isPhone && isMapExpanded) {
                exitExpandedMap();
            }
        };

        if (window.matchMedia) {
            const mediaQueryList = window.matchMedia(PANEL_SHEET_MEDIA_QUERY);
            if (typeof mediaQueryList.addEventListener === 'function') {
                mediaQueryList.addEventListener('change', handleViewportChange);
                window.addEventListener('resize', handleViewportChange);
                return () => {
                    mediaQueryList.removeEventListener('change', handleViewportChange);
                    window.removeEventListener('resize', handleViewportChange);
                };
            }
            if (typeof mediaQueryList.addListener === 'function') {
                mediaQueryList.addListener(handleViewportChange);
                window.addEventListener('resize', handleViewportChange);
                return () => {
                    mediaQueryList.removeListener(handleViewportChange);
                    window.removeEventListener('resize', handleViewportChange);
                };
            }
        }

        window.addEventListener('resize', handleViewportChange);
        return () => window.removeEventListener('resize', handleViewportChange);
    }, [isMapExpanded, exitExpandedMap]);

    useEffect(() => {
        if (!isMapExpanded) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                exitExpandedMap();
            }
        };

        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = Boolean(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement
            );
            if (!isCurrentlyFullscreen && isMapExpanded) {
                setIsMapExpanded(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, [isMapExpanded, exitExpandedMap]);

    const focusRequestSequenceRef = useRef(0);
    const locationRequestRef = useRef(0);
    const locationAbortRef = useRef(null);

    const canManageZone = (zone) => (
        !user?.assignedMunicipality || zone?.municipality === user?.assignedMunicipality
    );

    // Empty for every zone the form can produce today; non-empty only while a
    // legacy zone is open for editing with its withdrawn values intact.
    const retiredSelections = useMemo(() => findRetiredSelections(formData), [formData]);

    // The radius the handle can sit at, and whether the stored one is outside the
    // band the form offers. These are two different numbers exactly once: while a
    // legacy zone wider than the band is open. `formData.radius` stays the single
    // source of truth either way — the slider writes to it, the preview circle and
    // the payload read from it — so nothing downstream has to know the band exists.
    const sliderRadius = clampToRadiusRange(formData.radius);
    const isRadiusOutOfRange = Number.isFinite(Number(formData.radius))
        && Number(formData.radius) !== sliderRadius;
    // How much of the bar reads as filled. The bar is the input's own background,
    // so this is the one number the control needs to draw its own state: a
    // pseudo-element cannot be styled from inline CSS, and a separate element for
    // the fill could drift away from the thumb sitting on top of it.
    const radiusFillPercent = ((sliderRadius - RADIUS_LIMITS.min)
        / (RADIUS_LIMITS.max - RADIUS_LIMITS.min)) * 100;

    /**
     * Switches one hazard class on or off.
     *
     * The classes an operator turns on are exactly the ones handed to the map
     * below, so the control and the canvas cannot disagree — there is no second
     * copy of this state inside the map to drift out of step.
     */
    const toggleHazardClass = useCallback((datasetId, classValue) => {
        if (!datasetId) return;
        setVisibleHazardClasses((previous) => {
            const current = Array.isArray(previous[datasetId]) ? previous[datasetId] : [];
            const next = current.includes(classValue)
                ? current.filter((value) => value !== classValue)
                : [...current, classValue];
            return { ...previous, [datasetId]: next };
        });
    }, []);

    /**
     * Switches one accident-prone class on or off.
     *
     * The classes switched on here are exactly the ones handed to the map, so the
     * control and the canvas cannot disagree. `High` is independent of `Medium`:
     * the high cells are a subset of the data, not a level of detail of the
     * medium ones, so showing only the concentrations is a legitimate view.
     */
    const toggleHotspotClass = useCallback((classValue) => {
        setVisibleHotspotClasses((previous) => (
            previous.includes(classValue)
                ? previous.filter((value) => value !== classValue)
                : [...previous, classValue]
        ));
    }, []);

    // The classes the layer actually has hotspots in. A class with nothing to draw
    // is offered disabled rather than missing, so the control still explains what
    // this layer can show instead of changing shape as the data moves.
    const hotspotClassesWithData = useMemo(() => {
        const features = Array.isArray(accidentHotspotLayer?.features) ? accidentHotspotLayer.features : [];
        return new Set(features.map((feature) => Number(feature?.properties?.class)));
    }, [accidentHotspotLayer]);

    /**
     * The rule in force, resolved once for every piece of copy that describes it.
     *
     * Which matters more here than for the susceptibility layers: a disabled
     * control has to say what would make it light up, and "no data" is not an
     * answer an operator can act on — "no area with 3+ validated reports within
     * 100 m in the last 30 days" is.
     */
    const accidentHotspotRule = useMemo(
        () => resolveAccidentHotspotRule(accidentHotspotLayer),
        [accidentHotspotLayer]
    );

    /**
     * The layer control's contents, assembled from the layers this page actually
     * has.
     *
     * Two groups because they are two different claims: the susceptibility layers
     * publish a government rating, the accident layer is the system's own reading
     * of its own reports. Keeping them apart in the control is the same
     * distinction the map draws, and it is why the disclaimer belongs to one group
     * and not the other.
     *
     * The control is handed data, never state: it renders what it is given and
     * reports a toggle, so a switch and the canvas cannot hold two opinions about
     * whether a layer is on.
     */
    const layerControlGroups = useMemo(() => {
        const groups = [];

        if (hazardLayers.length > 0) {
            groups.push({
                id: 'landslide',
                label: 'Landslide',
                items: hazardLayers.flatMap((layer) => (
                    (Array.isArray(layer.classes) ? layer.classes : []).map((hazardClass) => ({
                        id: `${layer.datasetId}:${hazardClass.value}`,
                        label: `${hazardClass.label} ${layer.label} Susceptibility`,
                        color: getHazardColor(layer.hazardType, hazardClass.value),
                        active: Array.isArray(visibleHazardClasses[layer.datasetId])
                            && visibleHazardClasses[layer.datasetId].includes(hazardClass.value),
                        title: `ODC-ODbL · ${layer.attribution || 'DOST Project NOAH'}`,
                        onToggle: () => toggleHazardClass(layer.datasetId, hazardClass.value),
                    }))
                )),
            });
        }

        if (accidentHotspotLayer) {
            groups.push({
                id: 'accidents',
                label: 'Accidents',
                items: getAccidentHotspotClasses(accidentHotspotLayer).map((classValue) => {
                    const hasHotspots = hotspotClassesWithData.has(Number(classValue));
                    return {
                        id: `accident:${classValue}`,
                        label: getAccidentHotspotLegendLabel(classValue),
                        color: getAccidentHotspotColor(classValue),
                        active: visibleHotspotClasses.includes(classValue),
                        disabled: !hasHotspots,
                        // The radius is the analysis parameter, so it is stated where
                        // the layer is switched on — the map draws a 100 m circle,
                        // and the control says so rather than leaving it to be
                        // inferred.
                        title: hasHotspots
                            ? (accidentHotspotRule.windowDays && accidentHotspotRule.timeScope !== 'all_time'
                                ? `Clusters of ${accidentHotspotRule.mediumMinReports}+ validated reports within ${accidentHotspotRule.radiusMeters} m (last ${accidentHotspotRule.windowDays} days). ${ACCIDENT_HOTSPOT_DISCLAIMER}`
                                : `Clusters of ${accidentHotspotRule.mediumMinReports}+ validated accident reports within ${accidentHotspotRule.radiusMeters} m across all historical records. ${ACCIDENT_HOTSPOT_DISCLAIMER}`)
                            : describeEmptyHotspotClass(accidentHotspotRule, classValue),
                        onToggle: () => toggleHotspotClass(classValue),
                    };
                }),
            });
        }

        return groups;
    }, [
        accidentHotspotLayer,
        accidentHotspotRule,
        hazardLayers,
        hotspotClassesWithData,
        toggleHazardClass,
        toggleHotspotClass,
        visibleHazardClasses,
        visibleHotspotClasses,
    ]);

    const handleLocationSelect = async (location) => {
        const lat = Number(location?.lat);
        const lng = Number(location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            toast.error('Choose a valid point inside Sibuyan Island.');
            return false;
        }

        locationAbortRef.current?.abort();
        const requestId = locationRequestRef.current + 1;
        locationRequestRef.current = requestId;
        const controller = new AbortController();
        locationAbortRef.current = controller;
        setIsResolvingLocation(true);
        setSelectedLocation(null);
        setSelectedHazards(null);

        try {
            toast.loading('Verifying barangay boundary...', { id: 'geocoding' });
            const response = await reportsAPI.geocodeLocation(
                { lat, lng },
                { signal: controller.signal }
            );
            if (locationRequestRef.current !== requestId) return false;

            const resolved = buildRiskZoneLocationAutofill(response.data?.data);
            if (!resolved.valid) {
                toast.error(resolved.message, { id: 'geocoding' });
                return false;
            }

            const detected = resolved.value;
            if (
                user?.assignedMunicipality
                && detected.municipality !== user.assignedMunicipality
            ) {
                toast.error(
                    `This point is in ${detected.municipality}. Choose a location inside ${user.assignedMunicipality}.`,
                    { id: 'geocoding' }
                );
                return false;
            }

            setSelectedLocation(detected.coordinates);
            setSelectedHazards(detected.hazards);
            setFormData((previous) => applyRiskZoneLocationAutofill(previous, detected));

            // Report the hazards together with the barangay. This is the moment
            // the layers earn their place: the administrator has just dropped a
            // pin, and the answer tells them what is known about that spot.
            // When a reading justifies a zone type, the type has already been
            // suggested, so the message says so rather than leaving them to
            // notice the change on their own.
            const { hazards } = detected;
            if (hazards?.known && hazards.results.length > 0) {
                const reading = hazards.results
                    .map((result) => `${result.label} ${result.hazardType.replace(/_/g, ' ')}`)
                    .join(', ');
                const suggestion = detected.suggestedZoneType
                    ? ` Zone type set to ${detected.suggestedZoneType.replace(/_/g, ' ')}.`
                    : '';
                toast.success(
                    `Location verified in ${detected.barangay} — ${reading}.${suggestion}`,
                    { id: 'geocoding', duration: 6000 }
                );
            } else {
                toast.success(`Location verified in ${detected.barangay}`, { id: 'geocoding' });
            }
            return true;
        } catch (error) {
            const isCanceled = error?.code === 'ERR_CANCELED'
                || error?.name === 'CanceledError'
                || error?.name === 'AbortError';
            if (!isCanceled) {
                console.error('Geocoding error:', error);
                toast.error(
                    error.response?.data?.message || 'Could not verify the selected location',
                    { id: 'geocoding' }
                );
            }
            return false;
        } finally {
            if (locationRequestRef.current === requestId) {
                locationAbortRef.current = null;
                setIsResolvingLocation(false);
            }
        }
    };

    useEffect(() => () => {
        locationAbortRef.current?.abort();
        mapScrollCleanupRef.current?.();
    }, []);

    const focusMapLocation = (location, entity = null) => {
        const lat = Number(location?.lat);
        const lng = Number(location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        focusRequestSequenceRef.current += 1;
        setFocusLocation({
            lat,
            lng,
            ...MAP_FOCUS_PRESETS.list,
            requestId: `${Date.now()}-${focusRequestSequenceRef.current}`,
            ...(entity ? {
                type: 'risk-zone',
                entityId: String(entity?._id || entity?.id || ''),
                entity,
            } : {}),
        });
        mapScrollCleanupRef.current?.();
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current);
        }
    };

    const handlePhotoChange = (e) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (!selectedFiles.length) return;

        const remainingSlots = 5 - photos.length;
        if (remainingSlots <= 0) {
            toast.error('Maximum 5 reference photos allowed');
            e.target.value = '';
            return;
        }

        const validNewFiles = [];
        const newPreviews = [];

        for (const file of selectedFiles) {
            if (validNewFiles.length >= remainingSlots) {
                toast.error('Only up to 5 reference photos can be attached');
                break;
            }

            if (!file.type || !file.type.startsWith('image/')) {
                toast.error(`${file.name} is not an image`);
                continue;
            }

            if (file.size > 5 * 1024 * 1024) {
                toast.error(`${file.name} is too large (max 5MB)`);
                continue;
            }

            validNewFiles.push(file);
            newPreviews.push({
                url: URL.createObjectURL(file),
                isNew: true,
                file,
            });
        }

        if (validNewFiles.length > 0) {
            setPhotos((prev) => [...prev, ...validNewFiles]);
            setPhotoPreviews((prev) => [...prev, ...newPreviews]);
        }

        e.target.value = '';
    };

    const removePhoto = (index) => {
        const target = photoPreviews[index];
        if (target?.isNew && target?.url?.startsWith('blob:')) {
            URL.revokeObjectURL(target.url);
        }
        setPhotos((prev) => prev.filter((_, i) => i !== index));
        setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
    };

    const movePhoto = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= photoPreviews.length) return;

        setPhotos((prev) => {
            const next = [...prev];
            const [moved] = next.splice(index, 1);
            next.splice(newIndex, 0, moved);
            return next;
        });

        setPhotoPreviews((prev) => {
            const next = [...prev];
            const [moved] = next.splice(index, 1);
            next.splice(newIndex, 0, moved);
            return next;
        });
    };

    const handleZoneClick = (zone) => {
        focusMapLocation(zone?.coordinates, zone);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isResolvingLocation) {
            toast.error('Please wait while the barangay boundary is being verified.');
            return;
        }

        if (!selectedLocation && !editingZone) {
            toast.error('Please select a location on the map');
            return;
        }

        // The pickers no longer contain these values, so `formData` can only
        // still hold one when it came from a stored zone. Refusing here is what
        // keeps them out of new writes without rewriting the stored record.
        const retired = findRetiredSelections(formData);
        if (retired.length > 0) {
            toast.error(
                `${retired.join(' and ')} ${retired.length > 1 ? 'are' : 'is'} no longer offered. `
                + 'Choose a current zone type and severity to save your changes.'
            );
            return;
        }

        setIsSubmitting(true);
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('name', formData.name);
            formDataToSend.append('description', formData.description || '');
            formDataToSend.append('type', formData.type);
            formDataToSend.append('severity', formData.severity);
            formDataToSend.append('radius', String(formData.radius));
            formDataToSend.append('municipality', formData.municipality);
            const coordinatesToSend = selectedLocation || editingZone?.coordinates;
            const coordsLat = Number(coordinatesToSend?.lat);
            const coordsLng = Number(coordinatesToSend?.lng);
            if (coordinatesToSend && Number.isFinite(coordsLat) && Number.isFinite(coordsLng)) {
                formDataToSend.append(
                    'coordinates',
                    JSON.stringify({ lat: coordsLat, lng: coordsLng })
                );
            }

            // Append reference photos
            photos.forEach((file) => {
                if (file instanceof File) {
                    formDataToSend.append('photos', file);
                }
            });

            if (editingZone) {
                await highRiskZonesAPI.update(editingZone._id, formDataToSend);
                toast.success('High-risk zone updated');
            } else {
                await highRiskZonesAPI.create(formDataToSend);
                toast.success('High-risk zone created');
            }

            resetForm();
            refreshZones();
        } catch (error) {
            console.error('Save zone error:', error);
            toast.error(error.response?.data?.message || 'Failed to save zone');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (zone) => {
        if (!zone) return;
        if (!canManageZone(zone)) {
            toast.error('You can view this zone but only its assigned municipality may manage it.');
            return;
        }
        setEditingZone(zone);
        setFormData({
            name: zone?.name || '',
            description: zone?.description || '',
            type: zone?.type || 'accident_prone',
            severity: zone?.severity || 'medium',
            radius: zone?.radius || 100,
            municipality: zone?.municipality || user?.assignedMunicipality || MUNICIPALITIES[0],
        });
        if (Array.isArray(zone?.photos) && zone.photos.length > 0) {
            const safePhotos = zone.photos.filter(Boolean);
            setPhotoPreviews(
                safePhotos.map((p) => ({ url: p?.url, isNew: false, filename: p?.filename }))
            );
            setPhotos(safePhotos);
        } else {
            setPhotos([]);
            setPhotoPreviews([]);
        }
        const editLat = Number(zone?.coordinates?.lat);
        const editLng = Number(zone?.coordinates?.lng);
        setSelectedLocation(Number.isFinite(editLat) && Number.isFinite(editLng) ? { lat: editLat, lng: editLng } : null);
        setShowForm(true);
        setMobileTab('panel');
        handleZoneClick(zone);
    };

    const handleDelete = async (zone) => {
        if (!zone) return;
        if (!canManageZone(zone)) {
            toast.error('You can view this zone but only its assigned municipality may manage it.');
            return;
        }
        if (!zone?._id) return;
        if (!window.confirm('Are you sure you want to delete this zone?')) return;

        try {
            await highRiskZonesAPI.delete(zone?._id);
            toast.success('Zone deleted');
            // Drop it locally the moment the server confirms, then reconcile with
            // a refetch. The `highRiskZoneDeleted` socket event normally does this
            // on its own, but the admin who just clicked Delete should not have to
            // depend on it. The refetch alone was also not enough: this list used
            // to be served with `max-age=120`, so the refetch was answered from
            // the browser's HTTP cache and put the deleted zone straight back onto
            // the map and the list, however many times it was deleted.
            removeZone(zone?._id);
            refreshZones();
        } catch (error) {
            console.error('Delete zone error:', error);
            toast.error(error.response?.data?.message || 'Failed to delete zone');
        }
    };

    const resetForm = () => {
        locationAbortRef.current?.abort();
        locationRequestRef.current += 1;
        toast.dismiss('geocoding');
        setIsResolvingLocation(false);
        setShowForm(false);
        setEditingZone(null);
        setSelectedLocation(null);
        photoPreviews.forEach((p) => {
            if (p?.isNew && p?.url?.startsWith('blob:')) URL.revokeObjectURL(p.url);
        });
        setPhotos([]);
        setPhotoPreviews([]);
        if (photoInputRef.current) photoInputRef.current.value = '';
        setFormData({
            name: '',
            description: '',
            type: 'accident_prone',
            severity: 'medium',
            radius: 100,
            municipality: user?.assignedMunicipality || MUNICIPALITIES[0],
        });
    };

    const filteredZones = (Array.isArray(zones) ? zones.filter(Boolean) : []).filter((zone) => {
        const query = zoneSearch.trim().toLowerCase();
        const matchesSearch = !query
            || String(zone?.name || '').toLowerCase().includes(query)
            || String(zone?.municipality || '').toLowerCase().includes(query)
            || String(zone?.description || '').toLowerCase().includes(query);
        const matchesType = zoneTypeFilter === 'all'
            || zone?.type === zoneTypeFilter;
        return matchesSearch && matchesType;
    });

    // Live draft preview: while placing a zone, draw its coverage circle on
    // the map from the pinned location + the current radius input, using the
    // same layer + colors as saved zones. Invalid input hides the preview.
    const draftZonePreview = useMemo(() => {
        if (!showForm || !selectedLocation) return null;
        const lat = Number(selectedLocation.lat);
        const lng = Number(selectedLocation.lng);
        const radius = Number(formData.radius);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (!Number.isFinite(radius) || radius <= 0) return null;
        return {
            _id: 'draft-risk-zone-preview',
            name: formData.name?.trim() || 'Draft zone',
            coordinates: { lat, lng },
            radius,
            type: formData.type,
            severity: formData.severity,
        };
    }, [showForm, selectedLocation, formData.radius, formData.type, formData.severity, formData.name]);

    const mapZones = useMemo(
        () => (draftZonePreview ? [...(Array.isArray(zones) ? zones.filter(Boolean) : []), draftZonePreview] : (Array.isArray(zones) ? zones.filter(Boolean) : [])),
        [zones, draftZonePreview]
    );

    return (
        /* The workspace fits the window at lg: nothing on this page scrolls as a
           whole, because both halves — the map and the zone list — scroll inside
           themselves.

           `lg:h-full` is that whole guarantee, and it is deliberately not a
           number. The route mounts MainLayout with `fitWindow`, so the element
           wrapping this one has a height of its own, and 100% of it is exactly
           main's content box — no arithmetic about the app header, main's own
           padding, or `dvh` in the expression at all. The previous
           `calc(100dvh - 7.25rem)` plus a 480px floor wrote those three numbers
           out by hand: it fitted only while all three happened to stay true, and
           on any window shorter than 596px the floor won and the whole page
           scrolled — the exact thing this must not do. Derived, the page cannot
           be taller than the space it was given, at any window size.

           No min-height is needed here either: the header is `shrink-0`, the
           stage takes the remainder, and `min-h-0` down the chain lets the canvas
           give ground instead of pushing the page taller. */
        <div className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-col gap-2.5 sm:gap-3 lg:h-full">
            {/* Page Header */}
            <header className="flex shrink-0 flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-start sm:justify-between dark:border-white/10">
                <div className="min-w-0">
                    {/* This band is a toolbar, not a hero. The stage below is
                        `flex-1`, so every line the header spends is a line the map
                        and the zone list lose — which is why the live system
                        status shares the title's row instead of claiming a third
                        line of its own. It keeps its dot and its wording; it only
                        wraps onto its own line when a narrow viewport leaves it no
                        room. */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h1 className="page-title page-title--compact">High-risk zone management</h1>
                        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                            <span>Sibuyan Island · Alert System Active</span>
                        </p>
                    </div>
                    <p className="page-description">
                        View mapped hazards and manage zones for {user?.assignedMunicipality || 'all municipalities'}.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            if (showForm && !editingZone) {
                                resetForm();
                            } else {
                                setEditingZone(null);
                                setFormData({
                                    name: '',
                                    description: '',
                                    type: 'accident_prone',
                                    severity: 'medium',
                                    radius: 100,
                                    municipality: user?.assignedMunicipality || MUNICIPALITIES[0],
                                });
                                setSelectedLocation(null);
                                setShowForm(true);
                                setMobileTab('panel');
                            }
                        }}
                        className="btn-primary"
                    >
                        <HiOutlinePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Add zone</span>
                    </button>
                </div>
            </header>

            {/* Mobile / Tablet View Switcher */}
            <div className="filter-tabs shrink-0 lg:hidden" role="tablist" aria-label="Mobile workspace view">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mobileTab === 'map'}
                    onClick={() => setMobileTab('map')}
                    className="filter-tab"
                >
                    Map View
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mobileTab === 'panel'}
                    onClick={() => setMobileTab('panel')}
                    className="filter-tab"
                >
                    {showForm ? (editingZone ? 'Edit Zone' : 'New Zone Form') : `Marked Zones (${Array.isArray(zones) ? zones.length : 0})`}
                </button>
            </div>

            {/* Main Workspace: Full-Height Synchronized Stage.

                `lg:flex-1 lg:min-h-0` rather than a height of its own: the stage
                is whatever is left of the window after the header, so the map and
                the list always end together at the fold instead of at a number
                that only matches one header height. `min-h-0` is what lets the
                two columns shrink, and is why their lists scroll internally. */}
            <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-stretch">
                {/* Map Workspace */}
                <section
                    ref={mapSectionRef}
                    className={isMapExpanded
                        ? 'surface-panel fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[var(--surface)] p-2 sm:p-3 overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]'
                        : `surface-panel scroll-mt-20 flex-col overflow-hidden lg:col-span-7 xl:col-span-8 h-full lg:min-h-0 ${mobileTab === 'panel' ? 'hidden lg:flex' : 'flex'}`
                    }
                    aria-label="High-risk zones map workspace"
                >
                    {/* Map Section Header */}
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 px-4 py-3 shrink-0 dark:border-white/10">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {showForm ? 'Select zone location' : 'High-risk zones map'}
                        </h2>

                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                            {/* Layer control, and the legend with it.

                                One collapsed control: it carries a swatch and a
                                name per class, so it is the legend as well as the
                                switch — there is no second copy of the same facts
                                free to disagree with it.

                                It used to be a row of chips sitting here, one per
                                class, which wrapped to two or four lines in this
                                header and pushed the canvas down — on the one
                                surface whose whole job is the map. The chips are
                                now inside the popover, where the same colours and
                                the same names are still the legend.

                                The ODC-ODbL attribution stays in the document
                                even while the popover is closed: the licence
                                travels with the layer, not with the menu. */}
                            {/* The two layer groups used to be rendered here as
                                rows of chips. They are now inside the collapsed
                                `MapLayerControl` below, which carries the same
                                colours and the same names — it is still the legend,
                                it just no longer holds the map's height hostage.

                                What stays behind is the part that is not a
                                control: the attributions and the analysis rule.
                                Both belong to the layer, not to the menu that
                                switches it on, so both stay in the document and
                                remain readable while the popover is shut. */}
                            {hazardLayers.length > 0 && (
                                <span className="sr-only">
                                    Hazard source: {hazardLayers[0]?.attribution || 'DOST Project NOAH'}.
                                    Licence {hazardLayers[0]?.licence || 'ODC-ODbL'}.
                                </span>
                            )}
                            {accidentHotspotLayer && (
                                <span className="sr-only">
                                    {accidentHotspotRule.windowDays && accidentHotspotRule.timeScope !== 'all_time'
                                        ? `Clusters of ${accidentHotspotRule.mediumMinReports}+ validated accident reports within ${accidentHotspotRule.radiusMeters} m of each other (${accidentHotspotRule.highMinReports}+ for High), over the last ${accidentHotspotRule.windowDays} days. `
                                        : `Clusters of ${accidentHotspotRule.mediumMinReports}+ validated accident reports within ${accidentHotspotRule.radiusMeters} m of each other (${accidentHotspotRule.highMinReports}+ for High) across all historical records. `}
                                    {ACCIDENT_HOTSPOT_DISCLAIMER}
                                </span>
                            )}
                            {showForm && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                    {draftZonePreview
                                        ? `${Math.round(Number(formData.radius))} m coverage`
                                        : 'Click map to place epicenter'}
                                </span>
                            )}
                            {/* Rightmost, where a GIS layer control belongs, and
                                the only always-present item in this header row:
                                the placement readout comes and goes with the form,
                                so anchoring the button here keeps it from moving.
                                The map's fullscreen button expands this whole card,
                                header included, so this control is on screen in
                                both modes without being moved or duplicated. */}
                            {layerControlGroups.length > 0 && (
                                <MapLayerControl groups={layerControlGroups} panelLabel="Map layers" />
                            )}
                            {isMapExpanded && (
                                <button
                                    type="button"
                                    onClick={exitExpandedMap}
                                    className="inline-flex min-h-[44px] sm:min-h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                    aria-label="Exit expanded map"
                                    title="Exit expanded map (Esc)"
                                >
                                    <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                                    <span className="hidden sm:inline">Exit expanded map</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Map View Frame */}
                    <div className="relative flex-1 min-h-[380px] sm:min-h-[480px] lg:min-h-0 w-full">
                        <MapView
                            highRiskZones={mapZones}
                            onLocationSelect={showForm ? handleLocationSelect : null}
                            selectedLocation={selectedLocation}
                            focusLocation={focusLocation}
                            enable3D
                            mode="risk-zones"
                            // This page's whole subject is the hazard layer, so an
                            // empty map is a fact the admin needs stated: with no
                            // zones mapped, a blank satellite view looks identical
                            // to a map that failed to load them. The loading flag
                            // keeps that statement from being made while the zones
                            // are still arriving.
                            showDataState
                            dataLoading={loading}
                            // Placement accuracy aids. The epicenter of a zone is
                            // the one thing this page exists to get right, and it
                            // was previously placed blind: no distance reference
                            // and no coordinate until after the click committed.
                            showCursorCoordinates={Boolean(showForm)}
                            // Standardized canonical expand toggle in the MapView tool rail.
                            isExpanded={isMapExpanded}
                            onToggleExpand={toggleExpandedMap}
                            hazardLayers={hazardLayers}
                            hazardClassVisibility={visibleHazardClasses}
                            // Derived from the system's own reports, and switched
                            // independently of the susceptibility classes above.
                            accidentHotspots={accidentHotspotLayer}
                            accidentHotspotClasses={visibleHotspotClasses}
                            className="h-full w-full"
                        />
                    </div>
                </section>

                {/* Right Column: Zone Editor / List */}
                <div className={`lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-0 ${mobileTab === 'map' ? 'hidden lg:flex' : 'flex'}`}>
                    <AnimatePresence mode="wait">
                        {showForm ? (
                            <motion.section
                                key="form"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="surface-panel flex h-full min-h-0 flex-col overflow-hidden"
                                aria-label={editingZone ? 'Edit high-risk zone' : 'Add high-risk zone'}
                            >
                                {/* Editor Header */}
                                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0 dark:border-white/10">
                                    <div>
                                        <h2 className="section-title">
                                            {editingZone ? 'Edit high-risk zone' : 'Add high-risk zone'}
                                        </h2>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {editingZone ? 'Update monitored hazard boundaries and photos' : 'Define an active monitored hazard perimeter'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        aria-label="Close zone editor"
                                        className="min-h-[44px] px-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                                    >
                                        Close
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3.5 pb-5 sm:p-4 sm:pb-5 space-y-3 sm:space-y-3.5">
                                        {/* Zone Name */}
                                        <div>
                                            <label htmlFor="risk-zone-name" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                                Zone name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="risk-zone-name"
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="e.g. Blind curve on the Cajidiocan road"
                                                required
                                                className="field-control"
                                            />
                                        </div>

                                        {/* Location Status Box (Location-First Workflow) */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                                Coordinates & location <span className="text-red-500">*</span>
                                            </label>
                                            {isResolvingLocation ? (
                                                <div className="flex items-center gap-2 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <div className="h-3.5 w-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                                                    <span>Verifying barangay boundary...</span>
                                                </div>
                                            ) : selectedLocation && Number.isFinite(Number(selectedLocation?.lat)) && Number.isFinite(Number(selectedLocation?.lng)) ? (
                                                <div className="flex items-start justify-between gap-2 py-2 text-xs text-gray-700 dark:text-gray-300">
                                                    <div className="flex items-start gap-2 min-w-0">
                                                        <HiOutlineCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                        <span className="min-w-0">
                                                            {/* Six decimals is about 0.1 m; the previous four
                                                                was about 11 m, the same order as the placement
                                                                error this readout exists to let you avoid. */}
                                                            <span className="block truncate font-mono tabular-nums">
                                                                Location selected: {Number(selectedLocation.lat).toFixed(6)}, {Number(selectedLocation.lng).toFixed(6)}
                                                            </span>
                                                            {/* One chip per hazard layer, not a single
                                                                collapsed word: a point can be high landslide
                                                                and clear storm surge, and merging those into
                                                                one phrase would lose the distinction that
                                                                makes the layers worth having. */}
                                                            {selectedHazards && (
                                                                <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                                                    {!selectedHazards.known && (
                                                                        <span className={`text-[11px] font-medium ${HAZARD_TONE_CLASSES.unknown}`}>
                                                                            Hazard: could not be checked
                                                                        </span>
                                                                    )}
                                                                    {selectedHazards.known && selectedHazards.results.length === 0 && (
                                                                        <span className={`text-[11px] font-medium ${HAZARD_TONE_CLASSES.clear}`}>
                                                                            Hazard: none mapped here
                                                                        </span>
                                                                    )}
                                                                    {selectedHazards.results.map((result) => (
                                                                        <span
                                                                            key={result.datasetId}
                                                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 dark:text-gray-200"
                                                                        >
                                                                            <span
                                                                                className="h-1.5 w-1.5 rounded-full"
                                                                                style={{ backgroundColor: result.color }}
                                                                                aria-hidden="true"
                                                                            />
                                                                            {result.label} {result.hazardType.replace(/_/g, ' ')}
                                                                        </span>
                                                                    ))}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMobileTab('map')}
                                                        className="lg:hidden text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400 shrink-0"
                                                    >
                                                        View on map
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-2 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <HiOutlineLocationMarker className="h-4 w-4 shrink-0" aria-hidden="true" />
                                                        <span>Click a point on the map to set coordinates.</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMobileTab('map')}
                                                        className="lg:hidden text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400 shrink-0"
                                                    >
                                                        Tap map
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                    {/* Zone Type */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                            Zone type
                                        </label>
                                        {/* A dropdown, not three buttons in a row.

                                            The row was a squeezed thing: the form is a
                                            four-of-twelve rail, three options had to share
                                            it, and the only way to keep "Landslide Prone"
                                            on one line was to shrink the type until it was
                                            the smallest text in the form — fitted by
                                            measurement, but still type nobody wants to read.
                                            A closed dropdown spends one line of a row
                                            whatever the panel width, and the options get to
                                            be normal-sized text inside a menu that is wide
                                            enough for all three.

                                            It is the app's existing `CustomSelect`: same
                                            control the filters use, full keyboard support,
                                            and the hidden native select that screen readers
                                            and tests read. Plain text options, no color dots.
                                            The values come from `SELECTABLE_ZONE_TYPES`
                                            unchanged, so the payload and the retired-value
                                            guard are untouched. */}
                                        <CustomSelect
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                            options={SELECTABLE_ZONE_TYPES.map((type) => ({
                                                value: type.value,
                                                label: type.label,
                                            }))}
                                            ariaLabel="Zone type"
                                            placeholder="Select a zone type"
                                            tone="neutral"
                                            // A form field, not a filter chip. The trigger of
                                            // this control is deliberately content-sized on
                                            // desktop (in the filter rows a narrow control is
                                            // what you want), so it is stretched to the field
                                            // here and given the same 6px radius, body text
                                            // size and weight as the inputs above it — via the
                                            // container, which leaves every other caller's
                                            // trigger exactly as it was.
                                            className="w-full [&>button]:w-full [&>button]:rounded-md [&>button]:text-sm [&>button]:font-medium [&>button]:text-gray-900 [&>button]:shadow-none dark:[&>button]:text-white"
                                        />
                                    </div>

                                    {/* Severity Level */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                            Severity level
                                        </label>
                                        <div className="flex gap-5 border-b border-gray-200 dark:border-white/10" role="radiogroup" aria-label="Severity level">
                                            {SELECTABLE_SEVERITY_LEVELS.map((level) => {
                                                const isSelected = formData.severity === level.value;
                                                return (
                                                    <button
                                                        key={level.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={isSelected}
                                                        onClick={() => setFormData({ ...formData, severity: level.value })}
                                                        className={`shrink-0 border-b pb-2 text-[13px] ${
                                                            isSelected
                                                                ? 'border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white'
                                                                : 'border-transparent font-normal text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                        }`}
                                                    >
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${level.color}`} aria-hidden="true" />
                                                            <span>{level.label}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Shown only while a zone stored with a withdrawn value
                                        is open: it names what cannot be saved any more, so the
                                        blocked submit is explained where the fix is, not only in
                                        a toast the administrator has already missed. */}
                                    {retiredSelections.length > 0 && (
                                        <div
                                            role="status"
                                            className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-medium leading-snug text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                                        >
                                            <span className="font-semibold">{retiredSelections.join(' and ')}</span>
                                            {' '}are no longer offered. Choose a current zone type and severity
                                            before saving.
                                        </div>
                                    )}

                                    {/* Radius & Municipality */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Radius — a slider, and the whole row wide.

                                            It was a number spinner, which is a
                                            control that asks to be clicked: reaching
                                            300 m from 100 m meant ten presses of a
                                            4 mm arrow, or retyping the field. A
                                            radius is a judgement about how far the
                                            warning reaches, and it is read on the
                                            map, so the control that sets it should
                                            move the same way the thing it draws
                                            does.

                                            Everything the control has to say is on
                                            one caption line: the name, the band the
                                            handle can travel, and the value it is
                                            sitting at. The band used to be printed
                                            under the bar, which spent a whole line on
                                            two numbers that never change. */}
                                        <div className="sm:col-span-2">
                                            <div className="mb-1.5 flex items-baseline gap-2">
                                                <label htmlFor="risk-zone-radius" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                    Radius
                                                </label>
                                                {/* Named so the slider can describe itself by it:
                                                    the ends of the band are read out with the
                                                    value, which is what a range announces. */}
                                                <span id="risk-zone-radius-limits" className="text-[11px] font-normal tabular-nums text-gray-400 dark:text-gray-500">
                                                    {`${RADIUS_LIMITS.min}–${RADIUS_LIMITS.max} m`}
                                                </span>
                                                <span id="risk-zone-radius-value" className="ml-auto text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                                    {`${Number(formData.radius)} m`}
                                                </span>
                                            </div>

                                            {/* The row is exactly as tall as the thumb: the handle
                                                is the only thing here that needs to be
                                                grabbed, and a taller row than the handle
                                                would just be empty space in a form that is
                                                otherwise all compact rows. */}
                                            <div className="flex h-4 items-center">
                                                <input
                                                    id="risk-zone-radius"
                                                    type="range"
                                                    value={sliderRadius}
                                                    onChange={(e) => setFormData({ ...formData, radius: Number(e.target.value) })}
                                                    min={RADIUS_LIMITS.min}
                                                    max={RADIUS_LIMITS.max}
                                                    step={RADIUS_LIMITS.step}
                                                    // The spinner carried its unit in the
                                                    // field; a range has nowhere to print
                                                    // one, so the unit is spoken instead.
                                                    aria-valuetext={`${Number(formData.radius)} meters`}
                                                    // Describes the band the handle can travel: the
                                                    // ends are printed, so they are announced rather
                                                    // than left to be inferred from the min and max.
                                                    aria-describedby="risk-zone-radius-limits"
                                                    // The input *is* the bar — a 4 px hairline whose own
                                                    // background is the filled track, drawn as a two-stop
                                                    // gradient with an inline stop position — and the
                                                    // 16 px thumb is the handle, hung 6 px up so it is
                                                    // centred on that bar.
                                                    //
                                                    // Deliberately the plain recipe rather than a taller
                                                    // input with the bar painted inside it: the input's
                                                    // own box is the one piece of geometry this control
                                                    // can be sure of. A padded box would leave the bar's
                                                    // vertical position, and with it the thumb's, to
                                                    // whatever the engine does with a transparent track
                                                    // inside it.
                                                    //
                                                    // Sizes are chosen against the rest of the form, not
                                                    // against the most a control could be: this sits in a
                                                    // column of 12 px labels and 36 px inputs, and a
                                                    // heavier knob turned one field into a block. 16 px is
                                                    // still the tallest thing in the row, and still well
                                                    // clear of the bar it must stay centred on.
                                                    //
                                                    // The value is a `formData.radius` number either
                                                    // way: the slider writes to it, the readout and the
                                                    // map's draft circle read from it.
                                                    style={{
                                                        backgroundImage: `linear-gradient(to right, var(--radius-fill) 0 ${radiusFillPercent}%, transparent ${radiusFillPercent}% 100%)`,
                                                    }}
                                                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-gray-200 [--radius-fill:#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-emerald-700 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-emerald-700 [&::-webkit-slider-thumb]:shadow-md dark:bg-white/15 dark:[&::-moz-range-thumb]:border-[#0c1813] dark:[&::-moz-range-thumb]:bg-emerald-500 dark:[&::-webkit-slider-thumb]:border-[#0c1813] dark:[&::-webkit-slider-thumb]:bg-emerald-500 dark:[--radius-fill:#10b981]"
                                                />
                                            </div>

                                            {/* A zone saved before the form offered this
                                                band keeps its own value — stated, not
                                                corrected. */}
                                            {isRadiusOutOfRange && (
                                                <p className="mt-1 text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-400">
                                                    {`This zone is saved at a radius outside the ${RADIUS_LIMITS.min}–${RADIUS_LIMITS.max} m this `}
                                                    control offers. Move the slider to change it; leaving it alone saves
                                                    it as it is.
                                                </p>
                                            )}
                                        </div>

                                        {!user?.assignedMunicipality && (
                                            <div>
                                                <label htmlFor="risk-zone-municipality" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                                    Municipality
                                                </label>
                                                <select
                                                    id="risk-zone-municipality"
                                                    value={formData.municipality}
                                                    onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
                                                    className="field-control"
                                                >
                                                    {MUNICIPALITIES.map((m) => (
                                                        <option key={m} value={m}>{m}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label htmlFor="risk-zone-description" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                Description <span className="text-[11px] font-normal text-gray-400">(optional)</span>
                                            </label>
                                        </div>
                                        <textarea
                                            id="risk-zone-description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            rows={2}
                                            className="field-control min-h-20 resize-y"
                                            placeholder="Brief description of the hazard..."
                                        />
                                    </div>

                                    {/* Reference Photos (Optional) */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                Reference photos <span className="text-[11px] font-normal text-gray-400">(optional)</span>
                                            </label>
                                            <span className={`text-[11px] font-medium ${photos.length === 5 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {photos.length === 5 ? 'Max 5 photos reached' : `${photos.length}/5 photos`}
                                            </span>
                                        </div>

                                        {/* Previews Grid with Reorder and Remove */}
                                        {Array.isArray(photoPreviews) && photoPreviews.length > 0 && (
                                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                                {photoPreviews.filter(Boolean).map((preview, index) => (
                                                    <div
                                                        key={`${preview?.url?.slice(0, 32) ?? index}-${index}`}
                                                        className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-gray-800"
                                                    >
                                                        <img
                                                            src={preview?.url}
                                                            alt={`Hazard reference photo ${index + 1}`}
                                                            className="h-full w-full object-cover"
                                                        />

                                                        {/* Overlay Controls: Move Left, Move Right, Remove */}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center justify-center gap-1 p-1">
                                                            {index > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => movePhoto(index, -1)}
                                                                    aria-label={`Move photo ${index + 1} left`}
                                                                    title="Move left"
                                                                    className="rounded-md bg-white/90 hover:bg-white p-1 text-gray-800 dark:bg-gray-900/90 dark:hover:bg-gray-900 dark:text-gray-200 cursor-pointer"
                                                                >
                                                                    <HiOutlineArrowLeft className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                            {index < photoPreviews.length - 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => movePhoto(index, 1)}
                                                                    aria-label={`Move photo ${index + 1} right`}
                                                                    title="Move right"
                                                                    className="rounded-md bg-white/90 hover:bg-white p-1 text-gray-800 dark:bg-gray-900/90 dark:hover:bg-gray-900 dark:text-gray-200 cursor-pointer"
                                                                >
                                                                    <HiOutlineArrowRight className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => removePhoto(index)}
                                                                aria-label={`Remove reference photo ${index + 1}`}
                                                                title="Remove photo"
                                                                className="rounded-md bg-red-600 hover:bg-red-700 p-1 text-white cursor-pointer"
                                                            >
                                                                <HiOutlineTrash className="h-3 w-3" />
                                                            </button>
                                                        </div>

                                                        {/* Mobile Direct Remove Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => removePhoto(index)}
                                                            aria-label={`Remove reference photo ${index + 1}`}
                                                            className="sm:hidden absolute right-1 top-1 rounded-md bg-black/60 p-0.5 text-white cursor-pointer"
                                                        >
                                                            <HiOutlineTrash className="h-3 w-3" />
                                                        </button>

                                                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
                                                            #{index + 1}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Photos Button */}
                                        {photos.length < 5 && (
                                            <button
                                                type="button"
                                                onClick={() => photoInputRef.current?.click()}
                                                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-2.5 text-[13px] font-medium text-gray-700 hover:border-emerald-500 hover:bg-emerald-50/30 hover:text-emerald-800 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300 dark:hover:border-emerald-700/50 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300 cursor-pointer min-h-[38px]"
                                            >
                                                <HiOutlinePhotograph className="h-4 w-4 text-brand-700 dark:text-sky-400 shrink-0" aria-hidden="true" />
                                                <span>{photos.length > 0 ? 'Add more reference photos' : 'Attach reference photos'}</span>
                                            </button>
                                        )}

                                        <input
                                            ref={photoInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            multiple
                                            onChange={handlePhotoChange}
                                            className="sr-only"
                                            aria-label="Upload reference photos"
                                        />
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                            JPEG, PNG, WebP up to 5 MB each. Maximum 5 photos.
                                        </p>
                                    </div>

                                    </div>

                                    {/* Form Actions (Pinned to bottom of panel) */}
                                    <div className="border-t border-gray-200 bg-white p-3 sm:px-4 shrink-0 flex items-center gap-2.5 dark:border-white/10 dark:bg-[#0c1813]">
                                        <button
                                            type="button"
                                            onClick={resetForm}
                                            className="btn-outline flex-1"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || isResolvingLocation || (!selectedLocation && !editingZone)}
                                            className="btn-primary flex-1"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    <span>Saving...</span>
                                                </>
                                            ) : (
                                                <span>{editingZone ? 'Update zone' : 'Create zone'}</span>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </motion.section>
                        ) : (
                            <motion.section
                                key="list"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="surface-panel flex h-full min-h-0 flex-col overflow-hidden"
                                aria-label="Marked high-risk zones"
                            >
                                {/* List Header */}
                                <div className="border-b border-gray-200 px-4 py-3 shrink-0 dark:border-white/10">
                                    <h2 className="section-title">
                                        Marked zones ({Array.isArray(zones) ? zones.length : 0})
                                    </h2>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        Active monitored hazard areas in Sibuyan
                                    </p>
                                </div>

                                {/* Compact Search & Hazard Type Filter */}
                                {(Array.isArray(zones) ? zones.length : 0) > 0 && (
                                    <div className="border-b border-gray-200 px-4 py-3 dark:border-white/10 space-y-2 shrink-0">
                                        <div className="relative">
                                            <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                                            <input
                                                type="text"
                                                value={zoneSearch}
                                                onChange={(e) => setZoneSearch(e.target.value)}
                                                placeholder="Search zones or municipality..."
                                                className="field-control pl-8"
                                                aria-label="Search zones or municipality"
                                            />
                                        </div>
                                        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar" role="toolbar" aria-label="Filter zones by hazard type" tabIndex={0}>
                                            {[
                                                { id: 'all', label: 'All' },
                                                { id: 'landslide_prone', label: 'Landslide' },
                                                { id: 'accident_prone', label: 'Accident' },
                                                { id: 'other', label: 'Other' },
                                            ].map((chip) => (
                                                <button
                                                    key={chip.id}
                                                    type="button"
                                                    onClick={() => setZoneTypeFilter(chip.id)}
                                                    aria-pressed={zoneTypeFilter === chip.id}
                                                    className="filter-tab shrink-0 whitespace-nowrap px-2 text-xs"
                                                >
                                                    {chip.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {loading ? (
                                    <div className="flex-1 min-h-0 divide-y divide-gray-100 dark:divide-white/5 py-1 overflow-y-auto custom-scrollbar" role="status" aria-label="Loading risk zones" aria-busy="true">
                                        <span className="sr-only">Loading risk zones...</span>
                                        {[0, 1, 2, 3].map((i) => (
                                            <div key={i} className="p-3.5 sm:p-4 space-y-2 animate-pulse">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <div className="h-2 w-2 rounded-full bg-gray-200 dark:bg-white/10 shrink-0" />
                                                        <div className="h-3.5 w-1/3 rounded bg-gray-200 dark:bg-white/15" />
                                                    </div>
                                                    <div className="h-5 w-14 rounded-full bg-gray-100 dark:bg-white/10" />
                                                </div>
                                                <div className="h-2.5 w-2/3 rounded bg-gray-100 dark:bg-white/10" />
                                            </div>
                                        ))}
                                    </div>
                                ) : !Array.isArray(zones) || zones.length === 0 ? (
                                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400">
                                        <HiOutlineLocationMarker className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No high-risk zones marked yet</p>
                                        <p className="text-[11px] mt-1 text-gray-400">Click &quot;Add zone&quot; to create a new monitored hazard area.</p>
                                    </div>
                                ) : filteredZones.length === 0 ? (
                                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400">
                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No matching zones found</p>
                                        <p className="text-[11px] mt-1 text-gray-400">Try adjusting your search query or hazard filter.</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 min-h-0 divide-y divide-gray-100 dark:divide-white/5 overflow-y-auto custom-scrollbar">
                                        {filteredZones.filter(Boolean).map((zone, index) => {
                                            const typeInfo = ZONE_TYPES.find((t) => t.value === zone?.type);
                                            const severityInfo = SEVERITY_LEVELS.find((s) => s.value === zone?.severity);

                                            return (
                                                <div
                                                    key={zone?._id ?? index}
                                                    className="p-3.5 sm:p-4 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                                                    onClick={() => handleZoneClick(zone)}
                                                >
                                                    <div className="flex items-start justify-between gap-2.5">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <h3 className="font-semibold text-xs sm:text-[13px] text-gray-900 dark:text-white truncate">
                                                                    {zone?.name}
                                                                </h3>
                                                            </div>
                                                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                                {typeInfo?.label || 'Hazard'} · {zone?.municipality} · {zone?.radius}m
                                                            </p>
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                                                                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300 font-medium">
                                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityInfo?.color || 'bg-gray-400'}`} aria-hidden="true" />
                                                                    <span>{severityInfo?.label || zone?.severity}</span>
                                                                </span>
                                                                {Array.isArray(zone?.photos) && zone.photos.length > 0 && (
                                                                    <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500">
                                                                        <HiOutlinePhotograph className="h-3.5 w-3.5" aria-hidden="true" />
                                                                        <span>{zone.photos.length}</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {canManageZone(zone) ? (
                                                            <div className="flex items-center gap-3 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Edit ${zone?.name || 'zone'}`}
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(zone); }}
                                                                    className="min-h-[44px] text-xs font-medium text-gray-500 hover:text-emerald-700 dark:text-gray-400 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Delete ${zone?.name || 'zone'}`}
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(zone); }}
                                                                    className="min-h-[44px] text-xs font-medium text-gray-500 hover:text-red-700 dark:text-gray-400 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 cursor-pointer"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                                                                View only
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.section>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default AdminHighRiskZonesPage;
