import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { highRiskZonesAPI } from '../services/api';
import MapView from '../components/map/MapView';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlinePencil,
    HiOutlineLocationMarker,
    HiOutlineExclamation,
    HiOutlineX,
    HiOutlineCheck,
} from 'react-icons/hi';

const ZONE_TYPES = [
    { value: 'landslide_prone', label: 'Landslide Prone', color: 'bg-amber-500' },
    { value: 'accident_prone', label: 'Accident Prone', color: 'bg-red-500' },
    { value: 'fire_risk', label: 'Fire Risk', color: 'bg-orange-500' },
    { value: 'other', label: 'Other Hazard', color: 'bg-gray-500' },
];

const SEVERITY_LEVELS = [
    { value: 'low', label: 'Low', color: 'bg-green-500' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'critical', label: 'Critical', color: 'bg-red-600' },
];

const MUNICIPALITIES = ['Cajidiocan', 'Magdiwang', 'San Fernando'];

const AdminHighRiskZonesPage = () => {
    const { user } = useAuth();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
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

    // Fetch zones
    useEffect(() => {
        fetchZones();
    }, []);

    const fetchZones = async () => {
        try {
            setLoading(true);
            const params = user?.assignedMunicipality
                ? { municipality: user.assignedMunicipality }
                : {};
            const response = await highRiskZonesAPI.getAll(params);
            setZones(response.data.data || []);
        } catch (error) {
            console.error('Failed to fetch zones:', error);
            toast.error('Failed to load high-risk zones');
        } finally {
            setLoading(false);
        }
    };

    const handleLocationSelect = async (location) => {
        setSelectedLocation(location);

        // Reverse Geocoding
        try {
            toast.loading('Fetching precise address...', { id: 'geocoding' });
            // Request detailed address structure
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}&zoom=18&addressdetails=1`
            );
            const data = await response.json();

            if (data && data.address) {
                const addr = data.address;

                // Construct address with strict priority for rural areas
                // 1. Most specific: Building/Feature -> Road -> Village/Hamlet (Barangay/Sitio)
                const specificName = addr.amenity || addr.building || addr.tourism || addr.leisure || addr.shop;
                const road = addr.road || addr.street || addr.pedestrian;
                const localArea = addr.village || addr.hamlet || addr.neighbourhood || addr.suburb || addr.quarter;
                const townCity = addr.town || addr.municipality || addr.city;

                // Build the name: Start with the most specific part available
                let finalName = '';

                if (specificName) {
                    finalName = specificName + (localArea ? `, ${localArea}` : '');
                } else if (localArea) {
                    finalName = localArea + (road ? ` near ${road}` : '');
                } else if (road) {
                    finalName = road;
                } else {
                    finalName = townCity || data.display_name.split(',')[0];
                }

                // Clean up any double commas or trimming issues
                finalName = finalName.replace(/,\s*$/, '').trim();

                setFormData(prev => ({
                    ...prev,
                    name: finalName,
                    description: prev.description || data.display_name
                }));
                toast.success('Address detected (You can edit this)', { id: 'geocoding' });
            } else {
                toast.dismiss('geocoding');
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            toast.error('Could not fetch address', { id: 'geocoding' });
        }
    };

    const handleZoneClick = (zone) => {
        setFocusLocation({
            lat: zone.coordinates.lat,
            lng: zone.coordinates.lng,
            zoom: 16,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

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
            fetchZones();
        } catch (error) {
            console.error('Save zone error:', error);
            toast.error(error.response?.data?.message || 'Failed to save zone');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (zone) => {
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

    const handleDelete = async (zoneId) => {
        if (!window.confirm('Are you sure you want to delete this zone?')) return;

        try {
            await highRiskZonesAPI.delete(zoneId);
            toast.success('Zone deleted');
            fetchZones();
        } catch (error) {
            console.error('Delete zone error:', error);
            toast.error('Failed to delete zone');
        }
    };

    const resetForm = () => {
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
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-display font-bold text-gray-900">
                            High-Risk Zone Management
                        </h1>
                        <p className="text-gray-600 mt-1">
                            Plot and manage danger zones for {user?.assignedMunicipality || 'all municipalities'}
                        </p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => setShowForm(true)}
                        className="gap-2"
                    >
                        <HiOutlinePlus className="w-5 h-5" />
                        Add Zone
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Map */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row justify-between gap-4 items-center bg-gray-50">
                                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <HiOutlineLocationMarker className="w-5 h-5 text-primary-600" />
                                    {showForm ? 'Select Zone Location' : 'High-Risk Zones Map'}
                                </h2>

                                {/* Location Search Bar */}
                                <div className="relative w-full md:w-80">
                                    <form
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            const query = e.target.search.value;
                                            if (!query) return;

                                            const searchLocation = async (q) => {
                                                const response = await fetch(
                                                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
                                                );
                                                return await response.json();
                                            };

                                            try {
                                                toast.loading('Searching...', { id: 'search' });

                                                // Strategy 1: Try with "Romblon" as suffix (Province level is safer than Island)
                                                let results = await searchLocation(query + ', Romblon');

                                                // Strategy 2: If no result, try just the query itself (maybe user typed full address)
                                                if (!results || results.length === 0) {
                                                    results = await searchLocation(query);
                                                }

                                                if (results && results.length > 0) {
                                                    const result = results[0];
                                                    const lat = parseFloat(result.lat);
                                                    const lng = parseFloat(result.lon);

                                                    // Update Map View
                                                    setFocusLocation({ lat, lng, zoom: 16 });

                                                    // Select the location
                                                    handleLocationSelect({ lat, lng });

                                                    // Override with search result name
                                                    if (showForm) {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            name: result.name || query,
                                                        }));
                                                    }

                                                    toast.success('Location found!', { id: 'search' });
                                                } else {
                                                    toast.error('Location not found. Try spelling it differently.', { id: 'search' });
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                toast.error('Search failed', { id: 'search' });
                                            }
                                        }}
                                        className="flex"
                                    >
                                        <input
                                            type="text"
                                            name="search"
                                            placeholder="Search place (e.g. Cambijang)..."
                                            className="w-full px-4 py-2 text-sm border border-gray-300 rounded-l-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                        />
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-primary-600 text-white rounded-r-lg hover:bg-primary-700 text-sm font-medium"
                                        >
                                            Search
                                        </button>
                                    </form>
                                </div>
                            </div>
                            <div className="h-[500px]">
                                <MapView
                                    highRiskZones={zones}
                                    onLocationSelect={showForm ? handleLocationSelect : null}
                                    selectedLocation={selectedLocation}
                                    focusLocation={focusLocation}
                                    enable3D={true}
                                    className="h-full"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sidebar - Form or List */}
                    <div className="lg:col-span-1">
                        <AnimatePresence mode="wait">
                            {showForm ? (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="bg-white rounded-2xl shadow-lg p-6"
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-gray-900">
                                            {editingZone ? 'Edit Zone' : 'Add New Zone'}
                                        </h2>
                                        <button
                                            onClick={resetForm}
                                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            <HiOutlineX className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <Input
                                            label="Zone Name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Flood Prone Area near River"
                                            required
                                        />

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Zone Type
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {ZONE_TYPES.map((type) => (
                                                    <button
                                                        key={type.value}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, type: type.value })}
                                                        className={`p-2 rounded-lg border-2 text-sm font-medium transition-all ${formData.type === type.value
                                                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                                                            : 'border-gray-200 hover:border-gray-300'
                                                            }`}
                                                    >
                                                        <div className={`w-3 h-3 rounded-full ${type.color} mx-auto mb-1`} />
                                                        {type.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Severity Level
                                            </label>
                                            <div className="flex gap-2">
                                                {SEVERITY_LEVELS.map((level) => (
                                                    <button
                                                        key={level.value}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, severity: level.value })}
                                                        className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all ${formData.severity === level.value
                                                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                                                            : 'border-gray-200 hover:border-gray-300'
                                                            }`}
                                                    >
                                                        {level.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <Input
                                            label="Radius (meters)"
                                            type="number"
                                            value={formData.radius}
                                            onChange={(e) => setFormData({ ...formData, radius: parseInt(e.target.value) })}
                                            min={10}
                                            max={5000}
                                        />

                                        {!user?.assignedMunicipality && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Municipality
                                                </label>
                                                <select
                                                    value={formData.municipality}
                                                    onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500"
                                                >
                                                    {MUNICIPALITIES.map((m) => (
                                                        <option key={m} value={m}>{m}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Description (Optional)
                                            </label>
                                            <textarea
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                rows={3}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500"
                                                placeholder="Brief description of the hazard..."
                                            />
                                        </div>

                                        {selectedLocation && (
                                            <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                                                <p className="text-sm text-green-700 flex items-center gap-2">
                                                    <HiOutlineCheck className="w-4 h-4" />
                                                    Location selected: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex gap-3 pt-4">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={resetForm}
                                                className="flex-1"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                type="submit"
                                                variant="primary"
                                                loading={isSubmitting}
                                                disabled={!selectedLocation && !editingZone}
                                                className="flex-1"
                                            >
                                                {editingZone ? 'Update Zone' : 'Create Zone'}
                                            </Button>
                                        </div>
                                    </form>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="list"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="bg-white rounded-2xl shadow-lg overflow-hidden"
                                >
                                    <div className="p-4 border-b border-gray-200">
                                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                            <HiOutlineExclamation className="w-5 h-5 text-red-500" />
                                            Marked Zones ({zones.length})
                                        </h2>
                                    </div>

                                    {loading ? (
                                        <div className="p-8 text-center">
                                            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                        </div>
                                    ) : zones.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            <HiOutlineLocationMarker className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p>No high-risk zones marked yet</p>
                                            <p className="text-sm mt-1">Click "Add Zone" to get started</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                                            {zones.map((zone) => {
                                                const typeInfo = ZONE_TYPES.find((t) => t.value === zone.type);
                                                const severityInfo = SEVERITY_LEVELS.find((s) => s.value === zone.severity);

                                                return (
                                                    <motion.div
                                                        key={zone._id}
                                                        className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                                                        onClick={() => handleZoneClick(zone)}
                                                        whileHover={{ x: 4 }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <div className={`w-3 h-3 rounded-full ${typeInfo?.color || 'bg-gray-400'}`} />
                                                                    <h3 className="font-medium text-gray-900 truncate">
                                                                        {zone.name}
                                                                    </h3>
                                                                </div>
                                                                <p className="text-xs text-gray-500">
                                                                    {typeInfo?.label} • {zone.municipality}
                                                                </p>
                                                                <span className={`inline-block mt-2 px-2 py-0.5 text-xs font-medium text-white rounded-full ${severityInfo?.color || 'bg-gray-400'}`}>
                                                                    {severityInfo?.label}
                                                                </span>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(zone); }}
                                                                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                                >
                                                                    <HiOutlinePencil className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(zone._id); }}
                                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                >
                                                                    <HiOutlineTrash className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminHighRiskZonesPage;
