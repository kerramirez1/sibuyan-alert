import { useEffect, useRef, useState } from 'react';
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
    HiOutlinePencil,
    HiOutlineLocationMarker,
    HiOutlineX,
    HiOutlineCheck,
    HiOutlineSearch,
} from 'react-icons/hi';

const ZONE_TYPES = [
    { value: 'landslide_prone', label: 'Landslide Prone', color: 'bg-amber-500' },
    { value: 'accident_prone', label: 'Accident Prone', color: 'bg-red-500' },
    { value: 'fire_risk', label: 'Fire Risk', color: 'bg-orange-500' },
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResolvingLocation, setIsResolvingLocation] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const focusRequestSequenceRef = useRef(0);
    const locationRequestRef = useRef(0);
    const locationAbortRef = useRef(null);
    const searchRequestRef = useRef(0);
    const searchAbortRef = useRef(null);

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

    const handleLocationSearch = async (event) => {
        event.preventDefault();
        const query = String(new FormData(event.currentTarget).get('search') || '').trim();
        if (!query) return;

        searchAbortRef.current?.abort();
        const requestId = searchRequestRef.current + 1;
        searchRequestRef.current = requestId;
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);

        try {
            toast.loading('Searching Sibuyan locations...', { id: 'search' });
            const response = await reportsAPI.searchLocations(query, { signal: controller.signal });
            if (searchRequestRef.current !== requestId) return;

            const result = response.data?.data?.[0];
            if (!result) {
                toast.error('Location not found. Try a different landmark or spelling.', { id: 'search' });
                return;
            }

            const location = { lat: Number(result.lat), lng: Number(result.lng) };
            focusMapLocation(location);
            const verified = await handleLocationSelect(location);
            if (verified) toast.success('Location found and verified', { id: 'search' });
            else toast.dismiss('search');
        } catch (error) {
            const isCanceled = error?.code === 'ERR_CANCELED'
                || error?.name === 'CanceledError'
                || error?.name === 'AbortError';
            if (!isCanceled) {
                console.error('Location search error:', error);
                toast.error(error.response?.data?.message || 'Location search failed', { id: 'search' });
            }
        } finally {
            if (searchRequestRef.current === requestId) {
                searchAbortRef.current = null;
                setIsSearching(false);
            }
        }
    };

    useEffect(() => () => {
        locationAbortRef.current?.abort();
        searchAbortRef.current?.abort();
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
        mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current);
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
            const data = {
                ...formData,
                coordinates: selectedLocation || editingZone?.coordinates,
            };

            if (editingZone) {
                await highRiskZonesAPI.update(editingZone._id, data);
                toast.success('High-risk zone updated');
            } else {
                await highRiskZonesAPI.create(data);
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
        setSelectedLocation(zone.coordinates);
        setShowForm(true);
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
        searchAbortRef.current?.abort();
        searchRequestRef.current += 1;
        toast.dismiss('geocoding');
        toast.dismiss('search');
        setIsResolvingLocation(false);
        setIsSearching(false);
        setShowForm(false);
        setEditingZone(null);
        setSelectedLocation(null);
        setFormData({
            name: '',
            description: '',
            type: 'accident_prone',
            severity: 'medium',
            radius: 100,
            municipality: user?.assignedMunicipality || MUNICIPALITIES[0],
        });
    };

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5">
            {/* Page Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        High-risk zones
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        High-risk zone management
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        View mapped hazards and manage zones for {user?.assignedMunicipality || 'all municipalities'}.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 shadow-2xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Sibuyan Island · Alert System Active</span>
                    </div>
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
                            }
                        }}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-brand-600 dark:hover:bg-brand-500"
                    >
                        <HiOutlinePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Add zone</span>
                    </button>
                </div>
            </header>

            {/* Main Workspace: Map + Editor / List */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
                {/* Map Workspace */}
                <section
                    ref={mapSectionRef}
                    className="scroll-mt-20 overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90 lg:col-span-8"
                    aria-label="High-risk zones map workspace"
                >
                    {/* Map Section Header */}
                    <div className="flex flex-col gap-2.5 border-b border-gray-200/80 bg-gray-50/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 dark:border-white/10 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                            <HiOutlineLocationMarker className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                                {showForm ? 'Select zone location' : 'High-risk zones map'}
                            </h2>
                        </div>

                        {/* Location Search Bar */}
                        <form onSubmit={handleLocationSearch} className="flex w-full items-center gap-1.5 sm:w-80">
                            <div className="relative flex-1 min-w-0">
                                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" aria-hidden="true" />
                                <input
                                    type="text"
                                    name="search"
                                    placeholder="Search place or landmark..."
                                    className="h-9 w-full rounded-xl border border-gray-200/90 bg-white py-1.5 pl-10 pr-3 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSearching}
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 px-3 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
                            >
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                        </form>
                    </div>

                    {/* Map View Frame */}
                    <div className="aspect-square w-full sm:aspect-auto sm:h-[500px] lg:h-[580px]">
                        <MapView
                            highRiskZones={zones}
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
                <div className="lg:col-span-4">
                    <AnimatePresence mode="wait">
                        {showForm ? (
                            <motion.section
                                key="form"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                                aria-label={editingZone ? 'Edit high-risk zone' : 'Add high-risk zone'}
                            >
                                {/* Editor Header */}
                                <div className="flex items-center justify-between border-b border-gray-200/80 bg-gray-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                                    <div>
                                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                                            {editingZone ? 'Edit high-risk zone' : 'Add high-risk zone'}
                                        </h2>
                                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                            {editingZone ? 'Update monitored hazard parameters' : 'Click on the map to set zone coordinates'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        aria-label="Close zone editor"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
                                    >
                                        <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
                                    {/* Zone Name */}
                                    <div>
                                        <label htmlFor="risk-zone-name" className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                                            Zone name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            id="risk-zone-name"
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g. Flood Prone Area near River"
                                            required
                                            className="h-9 w-full rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                        />
                                    </div>

                                    {/* Zone Type */}
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
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
                                                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${
                                                            isSelected
                                                                ? 'border-emerald-500/80 bg-emerald-50/70 font-semibold text-emerald-950 ring-1 ring-emerald-500/30 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                                                                : 'border-gray-200/90 bg-white font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/[0.08]'
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
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                                            Severity level
                                        </label>
                                        <div className="flex rounded-xl border border-gray-200/90 bg-gray-100/80 p-0.5 dark:border-white/10 dark:bg-white/5 gap-0.5" role="radiogroup" aria-label="Severity level">
                                            {SEVERITY_LEVELS.map((level) => {
                                                const isSelected = formData.severity === level.value;
                                                return (
                                                    <button
                                                        key={level.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={isSelected}
                                                        onClick={() => setFormData({ ...formData, severity: level.value })}
                                                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 px-1 text-xs font-semibold transition-all ${
                                                            isSelected
                                                                ? 'bg-white text-gray-950 shadow-2xs dark:bg-[#0c1813] dark:text-white'
                                                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                        }`}
                                                    >
                                                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${level.color}`} aria-hidden="true" />
                                                        <span>{level.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Radius & Municipality */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="risk-zone-radius" className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
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
                                                    className="h-9 w-full rounded-xl border border-gray-200/90 bg-white px-3 pr-8 text-xs font-medium text-gray-900 shadow-2xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">m</span>
                                            </div>
                                        </div>

                                        {!user?.assignedMunicipality && (
                                            <div>
                                                <label htmlFor="risk-zone-municipality" className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                                                    Municipality
                                                </label>
                                                <select
                                                    id="risk-zone-municipality"
                                                    value={formData.municipality}
                                                    onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
                                                    className="h-9 w-full rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
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
                                            <label htmlFor="risk-zone-description" className="text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                Description <span className="text-[10px] font-normal text-gray-400 lowercase">(optional)</span>
                                            </label>
                                        </div>
                                        <textarea
                                            id="risk-zone-description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            rows={2}
                                            className="w-full rounded-xl border border-gray-200/90 bg-white p-2.5 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                            placeholder="Brief description of the hazard..."
                                        />
                                    </div>

                                    {/* Location Feedback Box */}
                                    {isResolvingLocation ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/70 p-2.5 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                                            <div className="h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                                            <span>Verifying barangay boundary...</span>
                                        </div>
                                    ) : selectedLocation ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                                            <HiOutlineCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            <span className="truncate">
                                                Location selected: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                                            <HiOutlineLocationMarker className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                            <span>Click a point on the map to set coordinates.</span>
                                        </div>
                                    )}

                                    {/* Form Actions */}
                                    <div className="flex items-center gap-2.5 pt-2">
                                        <button
                                            type="button"
                                            onClick={resetForm}
                                            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || isResolvingLocation || (!selectedLocation && !editingZone)}
                                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-3 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
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
                                className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                                aria-label="Marked high-risk zones"
                            >
                                <div className="border-b border-gray-200/80 bg-gray-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                                        Marked zones ({zones.length})
                                    </h2>
                                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                        Active monitored hazard areas in Sibuyan
                                    </p>
                                </div>

                                {loading ? (
                                    <div className="p-8 text-center">
                                        <div className="h-6 w-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
                                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading risk zones...</p>
                                    </div>
                                ) : zones.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                        <HiOutlineLocationMarker className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No high-risk zones marked yet</p>
                                        <p className="text-[11px] mt-1 text-gray-400">Click &quot;Add zone&quot; to create a new monitored hazard area.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-white/5 max-h-[520px] overflow-y-auto">
                                        {zones.map((zone) => {
                                            const typeInfo = ZONE_TYPES.find((t) => t.value === zone.type);
                                            const severityInfo = SEVERITY_LEVELS.find((s) => s.value === zone.severity);

                                            return (
                                                <div
                                                    key={zone._id}
                                                    className="p-3.5 sm:p-4 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                                                    onClick={() => handleZoneClick(zone)}
                                                >
                                                    <div className="flex items-start justify-between gap-2.5">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`h-2 w-2 shrink-0 rounded-full ${typeInfo?.color || 'bg-gray-400'}`} aria-hidden="true" />
                                                                <h3 className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                                                                    {zone.name}
                                                                </h3>
                                                            </div>
                                                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                                {typeInfo?.label || 'Hazard'} · {zone.municipality} · {zone.radius}m
                                                            </p>
                                                            <div className="mt-2 flex items-center gap-1.5">
                                                                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-gray-200/90 bg-gray-50/80 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityInfo?.color || 'bg-gray-400'}`} aria-hidden="true" />
                                                                    <span>{severityInfo?.label || zone.severity}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {canManageZone(zone) ? (
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Edit ${zone.name}`}
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(zone); }}
                                                                    className="inline-flex h-7 w-7 items-center justify-center text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                                                                >
                                                                    <HiOutlinePencil className="h-3.5 w-3.5" aria-hidden="true" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Delete ${zone.name}`}
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(zone); }}
                                                                    className="inline-flex h-7 w-7 items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                                                                >
                                                                    <HiOutlineTrash className="h-3.5 w-3.5" aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="shrink-0 rounded-md border border-gray-200/90 bg-gray-50/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
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
