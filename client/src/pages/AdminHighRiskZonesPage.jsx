import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { highRiskZonesAPI, reportsAPI } from '../services/api';
import MapView from '../components/map/MapView';
import toast from '../utils/appToast';
import useGlobalHighRiskZones from '../hooks/useGlobalHighRiskZones';
import { MAP_FOCUS_PRESETS, scheduleElementScroll } from '../utils/mapNavigation';
import {
    applyRiskZoneLocationAutofill,
    buildRiskZoneLocationAutofill,
} from '../utils/riskZoneLocation';
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineLocationMarker,
    HiOutlineCheck,
    HiOutlinePhotograph,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineSearch,
} from 'react-icons/hi';

const ZONE_TYPES = [
    { value: 'landslide_prone', label: 'Landslide Prone', color: 'bg-amber-500' },
    { value: 'accident_prone', label: 'Accident Prone', color: 'bg-red-500' },
    { value: 'flood_prone', label: 'Flood Prone', color: 'bg-blue-500' },
    { value: 'other', label: 'Other Hazard', color: 'bg-gray-500' },
];

const SEVERITY_LEVELS = [
    { value: 'low', label: 'Low', color: 'bg-emerald-500' },
    { value: 'medium', label: 'Medium', color: 'bg-amber-500' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'critical', label: 'Critical', color: 'bg-red-600' },
];

const MUNICIPALITIES = ['Cajidiocan', 'Magdiwang', 'San Fernando'];

const AdminHighRiskZonesPage = () => {
    const { user } = useAuth();
    const { zones, loading, refresh: refreshZones } = useGlobalHighRiskZones();
    const [showForm, setShowForm] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
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
    const focusRequestSequenceRef = useRef(0);
    const locationRequestRef = useRef(0);
    const locationAbortRef = useRef(null);

    const canManageZone = (zone) => (
        !user?.assignedMunicipality || zone?.municipality === user.assignedMunicipality
    );

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
            setFormData((previous) => applyRiskZoneLocationAutofill(previous, detected));
            toast.success(`Location verified in ${detected.barangay}`, { id: 'geocoding' });
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
                entityId: String(entity._id || entity.id || ''),
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
        if (target?.isNew && target.url.startsWith('blob:')) {
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

        setIsSubmitting(true);
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('name', formData.name);
            formDataToSend.append('description', formData.description || '');
            formDataToSend.append('type', formData.type);
            formDataToSend.append('severity', formData.severity);
            formDataToSend.append('radius', String(formData.radius));
            formDataToSend.append('municipality', formData.municipality);
            formDataToSend.append(
                'coordinates',
                JSON.stringify(selectedLocation || editingZone?.coordinates)
            );

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
        if (!canManageZone(zone)) {
            toast.error('You can view this zone but only its assigned municipality may manage it.');
            return;
        }
        setEditingZone(zone);
        setFormData({
            name: zone.name,
            description: zone.description || '',
            type: zone.type,
            severity: zone.severity,
            radius: zone.radius,
            municipality: zone.municipality,
        });
        if (zone.photos && zone.photos.length > 0) {
            setPhotoPreviews(
                zone.photos.map((p) => ({ url: p.url, isNew: false, filename: p.filename }))
            );
            setPhotos(zone.photos);
        } else {
            setPhotos([]);
            setPhotoPreviews([]);
        }
        setSelectedLocation(zone.coordinates);
        setShowForm(true);
        setMobileTab('panel');
        handleZoneClick(zone);
    };

    const handleDelete = async (zone) => {
        if (!canManageZone(zone)) {
            toast.error('You can view this zone but only its assigned municipality may manage it.');
            return;
        }
        if (!window.confirm('Are you sure you want to delete this zone?')) return;

        try {
            await highRiskZonesAPI.delete(zone._id);
            toast.success('Zone deleted');
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
            if (p?.isNew && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
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

    const filteredZones = zones.filter((zone) => {
        const query = zoneSearch.trim().toLowerCase();
        const matchesSearch = !query
            || zone.name?.toLowerCase().includes(query)
            || zone.municipality?.toLowerCase().includes(query)
            || (zone.description && zone.description.toLowerCase().includes(query));
        const matchesType = zoneTypeFilter === 'all'
            || zone.type === zoneTypeFilter;
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
        () => (draftZonePreview ? [...zones, draftZonePreview] : zones),
        [zones, draftZonePreview]
    );

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-3 sm:space-y-4">
            {/* Page Header */}
            <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between dark:border-white/10">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400">
                        High-risk zones
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        High-risk zone management
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                        View mapped hazards and manage zones for {user?.assignedMunicipality || 'all municipalities'}.
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                        <span>Sibuyan Island · Alert System Active</span>
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
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                    >
                        <HiOutlinePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Add zone</span>
                    </button>
                </div>
            </header>

            {/* Mobile / Tablet View Switcher */}
            <div className="flex items-center gap-6 border-b border-gray-200 lg:hidden dark:border-white/10" role="tablist" aria-label="Mobile workspace view">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mobileTab === 'map'}
                    onClick={() => setMobileTab('map')}
                    className={`shrink-0 border-b pb-2.5 text-sm ${
                        mobileTab === 'map'
                            ? 'border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white'
                            : 'border-transparent font-normal text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                >
                    Map View
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mobileTab === 'panel'}
                    onClick={() => setMobileTab('panel')}
                    className={`shrink-0 border-b pb-2.5 text-sm ${
                        mobileTab === 'panel'
                            ? 'border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white'
                            : 'border-transparent font-normal text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                >
                    {showForm ? (editingZone ? 'Edit Zone' : 'New Zone Form') : `Marked Zones (${zones.length})`}
                </button>
            </div>

            {/* Main Workspace: Full-Height Synchronized Stage */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch lg:h-[calc(100vh-190px)] lg:min-h-[580px]">
                {/* Map Workspace */}
                <section
                    ref={mapSectionRef}
                    className={`scroll-mt-20 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90 lg:col-span-7 xl:col-span-7 h-full ${mobileTab === 'panel' ? 'hidden lg:flex' : 'flex'}`}
                    aria-label="High-risk zones map workspace"
                >
                    {/* Map Section Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0 dark:border-white/10">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {showForm ? 'Select zone location' : 'High-risk zones map'}
                        </h2>
                        {showForm && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                {draftZonePreview
                                    ? `${Math.round(Number(formData.radius))} m coverage`
                                    : 'Click map to place epicenter'}
                            </span>
                        )}
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
                            showLegend={false}
                            className="h-full w-full"
                        />
                    </div>
                </section>

                {/* Right Column: Zone Editor / List */}
                <div className={`lg:col-span-5 xl:col-span-5 flex flex-col h-full min-h-0 ${mobileTab === 'map' ? 'hidden lg:flex' : 'flex'}`}>
                    <AnimatePresence mode="wait">
                        {showForm ? (
                            <motion.section
                                key="form"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="flex flex-col h-full min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90"
                                aria-label={editingZone ? 'Edit high-risk zone' : 'Add high-risk zone'}
                            >
                                {/* Editor Header */}
                                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0 dark:border-white/10">
                                    <div>
                                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
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
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3.5 sm:p-4 space-y-3 sm:space-y-3.5">
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
                                                placeholder="e.g. Flood Prone Area near River"
                                                required
                                                className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
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
                                            ) : selectedLocation ? (
                                                <div className="flex items-center justify-between gap-2 py-2 text-xs text-gray-700 dark:text-gray-300">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <HiOutlineCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                        <span className="truncate font-mono tabular-nums">
                                                            Location selected: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
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
                                        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Zone type">
                                            {ZONE_TYPES.map((type) => {
                                                const isSelected = formData.type === type.value;
                                                return (
                                                    <button
                                                        key={type.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={isSelected}
                                                        onClick={() => setFormData({ ...formData, type: type.value })}
                                                        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${
                                                            isSelected
                                                                ? 'font-semibold text-gray-900 underline decoration-emerald-600 decoration-2 underline-offset-4 dark:text-white dark:decoration-emerald-500'
                                                                : 'font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                        }`}
                                                    >
                                                        <span className={`h-2 w-2 shrink-0 rounded-full ${type.color}`} aria-hidden="true" />
                                                        <span className="truncate">{type.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Severity Level */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                            Severity level
                                        </label>
                                        <div className="flex gap-5 border-b border-gray-200 dark:border-white/10" role="radiogroup" aria-label="Severity level">
                                            {SEVERITY_LEVELS.map((level) => {
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

                                    {/* Radius & Municipality */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="risk-zone-radius" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                                Radius (meters)
                                            </label>
                                            <div className="relative">
                                                <input
                                                    id="risk-zone-radius"
                                                    type="number"
                                                    value={formData.radius}
                                                    onChange={(e) => setFormData({ ...formData, radius: parseInt(e.target.value) || 0 })}
                                                    min={10}
                                                    max={5000}
                                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 pr-8 text-sm font-medium text-gray-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">m</span>
                                            </div>
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
                                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
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
                                            className="w-full rounded-md border border-gray-200 bg-white p-2.5 text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
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
                                        {photoPreviews.length > 0 && (
                                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                                {photoPreviews.map((preview, index) => (
                                                    <div
                                                        key={`${preview.url.slice(0, 32)}-${index}`}
                                                        className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-gray-800"
                                                    >
                                                        <img
                                                            src={preview.url}
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
                                    <div className="border-t border-gray-200 p-3 sm:px-4 shrink-0 flex items-center gap-2.5 dark:border-white/10">
                                        <button
                                            type="button"
                                            onClick={resetForm}
                                            className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || isResolvingLocation || (!selectedLocation && !editingZone)}
                                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500 cursor-pointer"
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
                                className="flex flex-col h-full min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90"
                                aria-label="Marked high-risk zones"
                            >
                                {/* List Header */}
                                <div className="border-b border-gray-200 px-4 py-3 shrink-0 dark:border-white/10">
                                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Marked zones ({zones.length})
                                    </h2>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        Active monitored hazard areas in Sibuyan
                                    </p>
                                </div>

                                {/* Compact Search & Hazard Type Filter */}
                                {zones.length > 0 && (
                                    <div className="border-b border-gray-200 px-4 py-3 dark:border-white/10 space-y-2 shrink-0">
                                        <div className="relative">
                                            <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                                            <input
                                                type="text"
                                                value={zoneSearch}
                                                onChange={(e) => setZoneSearch(e.target.value)}
                                                placeholder="Search zones or municipality..."
                                                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-600 dark:border-white/10 dark:bg-white/5 dark:text-white"
                                            />
                                        </div>
                                        <div className="flex items-center gap-4 overflow-x-auto custom-scrollbar pb-0.5 text-xs" role="toolbar" aria-label="Filter zones by hazard type">
                                            {[
                                                { id: 'all', label: 'All' },
                                                { id: 'landslide_prone', label: 'Landslide' },
                                                { id: 'accident_prone', label: 'Accident' },
                                                { id: 'flood_prone', label: 'Flood' },
                                                { id: 'other', label: 'Other' },
                                            ].map((chip) => (
                                                <button
                                                    key={chip.id}
                                                    type="button"
                                                    onClick={() => setZoneTypeFilter(chip.id)}
                                                    aria-pressed={zoneTypeFilter === chip.id}
                                                    className={`shrink-0 border-b pb-1 ${
                                                        zoneTypeFilter === chip.id
                                                            ? 'border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white'
                                                            : 'border-transparent font-normal text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                    }`}
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
                                ) : zones.length === 0 ? (
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
                                        {filteredZones.map((zone) => {
                                            const typeInfo = ZONE_TYPES.find((t) => t.value === zone.type);
                                            const severityInfo = SEVERITY_LEVELS.find((s) => s.value === zone.severity);

                                            return (
                                                <div
                                                    key={zone._id}
                                                    className="p-3.5 sm:p-4 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                                                    onClick={() => handleZoneClick(zone)}
                                                >
                                                    <div className="flex items-start justify-between gap-2.5">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`h-2 w-2 shrink-0 rounded-full ${typeInfo?.color || 'bg-gray-400'}`} aria-hidden="true" />
                                                                <h3 className="font-semibold text-xs sm:text-[13px] text-gray-900 dark:text-white truncate">
                                                                    {zone.name}
                                                                </h3>
                                                            </div>
                                                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                                {typeInfo?.label || 'Hazard'} · {zone.municipality} · {zone.radius}m
                                                            </p>
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                                                                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300 font-medium">
                                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityInfo?.color || 'bg-gray-400'}`} aria-hidden="true" />
                                                                    <span>{severityInfo?.label || zone.severity}</span>
                                                                </span>
                                                                {zone.photos && zone.photos.length > 0 && (
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
                                                                    aria-label={`Edit ${zone.name}`}
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(zone); }}
                                                                    className="min-h-[44px] text-xs font-medium text-gray-500 hover:text-emerald-700 dark:text-gray-400 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Delete ${zone.name}`}
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
