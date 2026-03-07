import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { reportsAPI } from '../services/api';
import MapView from '../components/map/MapView';
import toast from 'react-hot-toast';
import {
    HiOutlineDocumentText, HiOutlinePhotograph, HiOutlineX, HiOutlineLocationMarker, HiOutlineExclamation, HiOutlineSearch, HiOutlineClock, HiOutlineTruck, HiOutlineFire,
    HiOutlineChevronDown, HiOutlineShieldCheck
} from 'react-icons/hi';

// Incident Categories Configuration
const INCIDENT_CATEGORIES = {
    accident: {
        label: 'Road Accident',
        icon: HiOutlineTruck,
        color: 'from-blue-500 to-blue-700',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-500',
        types: [
            { value: 'vehicular', label: 'Vehicular Collision' },
            { value: 'motorcycle', label: 'Motorcycle Accident' },
            { value: 'pedestrian', label: 'Hit and Run / Pedestrian' },
            { value: 'bicycle', label: 'Bicycle Accident' },
            { value: 'self_accident', label: 'Self Accident' },
            { value: 'mechanical', label: 'Mechanical Failure' },
            { value: 'other', label: 'Other Road Incident' },
        ],
    },
};

// Fire types (only road-accident related)
const FIRE_TYPES = [
    { value: 'gas_leak', label: 'Gas Leak / Explosion' },
    { value: 'vehicular_fire', label: 'Vehicle Fire' },
];

const SEVERITY_LEVELS = [
    { value: 'minor', label: 'Minor', color: 'bg-success-500', dotColor: 'bg-green-500', description: 'No injuries, cosmetic damage only' },
    { value: 'moderate', label: 'Moderate', color: 'bg-accent-500', dotColor: 'bg-yellow-500', description: 'Minor injuries, requires medical checkup' },
    { value: 'severe', label: 'Severe', color: 'bg-danger-500', dotColor: 'bg-red-500', description: 'Serious injuries, requires ambulance' },
    { value: 'critical', label: 'Critical', color: 'bg-red-800', dotColor: 'bg-red-800', description: 'Life-threatening / Fatalities' },
];

// Stagger animation variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const ReportPage = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    // Form State
    const [formData, setFormData] = useState({
        incidentCategory: 'accident',
        incidentType: 'vehicular',
        fireInvolved: false,
        fireType: 'gas_leak',
        description: '',
        address: '',
        barangay: '',
        incidentTime: '',
        severity: 'moderate',
        casualties: {
            injured: 0,
            fatalities: 0,
            missing: 0,
        },
    });

    const [selectedLocation, setSelectedLocation] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [focusLocation, setFocusLocation] = useState(null);
    const [geoLoading, setGeoLoading] = useState(false);
    const [locationStatus, setLocationStatus] = useState('idle');
    const [gpsAccuracy, setGpsAccuracy] = useState(null);
    const [images, setImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        const category = INCIDENT_CATEGORIES[formData.incidentCategory];
        if (category && category.types.length > 0) {
            setFormData(prev => ({
                ...prev,
                incidentType: category.types[0].value,
            }));
        }
    }, [formData.incidentCategory]);

    const currentCategory = INCIDENT_CATEGORIES[formData.incidentCategory];

    const validate = () => {
        const newErrors = {};
        if (!formData.incidentTime) newErrors.incidentTime = 'Accident time is required';
        if (!selectedLocation && !formData.address.trim()) newErrors.location = 'Please select a location on the map or enter an address';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({
                ...prev,
                [parent]: { ...prev[parent], [child]: parseInt(value) || 0 },
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    };

    // Location Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ' Sibuyan Island')}&addressdetails=1&limit=5`);
            const data = await response.json();
            if (data.length === 0) {
                toast.error('Location not found. Try a different keyword.');
            } else {
                setSearchResults(data);
                if (data.length === 1) selectSearchResult(data[0]);
            }
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search location');
        } finally {
            setIsSearching(false);
        }
    };

    const selectSearchResult = (result) => {
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        const location = { lat, lng };
        setSelectedLocation(location);
        setFocusLocation({ ...location, zoom: 16 });
        if (!formData.address) {
            setFormData(prev => ({
                ...prev,
                address: result.display_name.split(',')[0],
                barangay: result.address?.village || result.address?.suburb || ''
            }));
        }
        setSearchResults([]);
        setSearchQuery('');
        toast.success(`Moved to: ${result.display_name.split(',')[0]}`);
    };

    const watchIdRef = useRef(null);

    const handleLocationSelect = async (location) => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            setGeoLoading(false);
        }
        setSelectedLocation(location);
        setErrors(prev => ({ ...prev, location: '' }));
        setLocationStatus('verified');
        setGpsAccuracy(null);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}&zoom=18&addressdetails=1`);
            const data = await response.json();
            if (data && data.address) {
                const street = data.address.road || data.address.pedestrian || '';
                const village = data.address.village || data.address.suburb || '';
                const landmark = data.address.amenity || data.address.building || '';
                let detectedAddress = street;
                if (landmark) detectedAddress = landmark + (street ? `, ${street}` : '');
                if (detectedAddress || village) {
                    toast.success(`Pinned near: ${detectedAddress || village}`, { duration: 3000 });
                    setFormData(prev => ({
                        ...prev,
                        address: detectedAddress || prev.address,
                        barangay: village || prev.barangay
                    }));
                }
            }
        } catch (e) {
            console.warn('Reverse geocoding failed', e);
        }
    };

    const detectLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            return;
        }
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
        setGeoLoading(true);
        setLocationStatus('detecting');
        const toastId = toast.loading('Acquiring location...');
        let bestAccuracy = Infinity;

        const timeoutId = setTimeout(() => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            setGeoLoading(false);
            if (bestAccuracy === Infinity) {
                toast.error('Could not determine location. Please search or pin manually.', { id: toastId });
                setLocationStatus('idle');
            } else {
                toast.success(`Location found (Accuracy: ${Math.round(bestAccuracy)}m)`, { id: toastId });
                setLocationStatus('confirming');
            }
        }, 12000);

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                if (accuracy < bestAccuracy || bestAccuracy === Infinity) {
                    bestAccuracy = accuracy;
                    setGpsAccuracy(accuracy);
                    const location = { lat: latitude, lng: longitude };
                    setUserLocation(location);
                    if (locationStatus === 'detecting' || locationStatus === 'idle') {
                        setSelectedLocation(location);
                        setFocusLocation({ ...location, zoom: accuracy < 100 ? 17 : 14 });
                        setErrors(prev => ({ ...prev, location: '' }));
                    }
                    if (accuracy < 30) {
                        toast.success(`Precise location found (${Math.round(accuracy)}m)`, { id: toastId });
                        if (watchIdRef.current !== null) {
                            navigator.geolocation.clearWatch(watchIdRef.current);
                            watchIdRef.current = null;
                        }
                        clearTimeout(timeoutId);
                        setGeoLoading(false);
                        setLocationStatus('confirming');
                    } else {
                        toast.loading(`Refining... (${Math.round(accuracy)}m)`, { id: toastId });
                    }
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                if (bestAccuracy === Infinity) {
                    let errorMessage = 'Location error. Please pin manually.';
                    if (!window.isSecureContext) {
                        errorMessage = 'Mobile GPS requires HTTPS. Cannot use GPS on HTTP.';
                    } else if (error.code === 1) {
                        errorMessage = 'Location permission denied. Please enable GPS permissions.';
                    } else if (error.code === 2) {
                        errorMessage = 'GPS Signal weak or unavailable.';
                    } else if (error.code === 3) {
                        errorMessage = 'Location request timed out.';
                    }
                    if (watchIdRef.current !== null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }
                    clearTimeout(timeoutId);
                    setGeoLoading(false);
                    setLocationStatus('idle');
                    toast.error(errorMessage, { id: toastId });
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const confirmLocation = () => {
        setLocationStatus('verified');
        setGpsAccuracy(null);
        toast.success('Location verified!');
    };

    const retryLocation = () => {
        setLocationStatus('idle');
        setSelectedLocation(null);
        setGpsAccuracy(null);
    };

    useEffect(() => {
        detectLocation();
        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        if (images.length + files.length > 5) {
            toast.error('Maximum 5 images allowed');
            return;
        }
        const validFiles = files.filter((file) => {
            if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image`); return false; }
            if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} is too large (max 5MB)`); return false; }
            return true;
        });
        setImages(prev => [...prev, ...validFiles]);
        validFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (e) => { setImagePreviews(prev => [...prev, e.target.result]); };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        setImagePreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            const submitData = new FormData();
            submitData.append('incidentCategory', formData.incidentCategory);
            submitData.append('incidentType', formData.incidentType);
            submitData.append('fireInvolved', formData.fireInvolved);
            if (formData.fireInvolved) submitData.append('fireType', formData.fireType);
            submitData.append('description', formData.description);
            submitData.append('incidentTime', formData.incidentTime);
            submitData.append('severity', formData.severity);
            if (selectedLocation) {
                submitData.append('lat', selectedLocation.lat);
                submitData.append('lng', selectedLocation.lng);
            }
            if (formData.address) submitData.append('address', formData.address);
            if (formData.barangay) submitData.append('barangay', formData.barangay);
            submitData.append('casualties[injured]', formData.casualties.injured);
            submitData.append('casualties[fatalities]', formData.casualties.fatalities);
            submitData.append('casualties[missing]', formData.casualties.missing);
            images.forEach((image) => { submitData.append('images', image); });
            await reportsAPI.create(submitData);
            toast.success('Accident report submitted successfully!');
            navigate('/my-reports');
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to submit report';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset * 60 * 1000));
    const maxDateTime = localNow.toISOString().slice(0, 16);

    const selectedSeverity = SEVERITY_LEVELS.find(l => l.value === formData.severity);

    return (
        <div className="max-w-6xl mx-auto -mt-2 sm:-mt-0">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {/* Header — Premium Gradient */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-5 sm:mb-6"
                >
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-brand-500/25">
                            <HiOutlineExclamation className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">
                                Report an Accident
                            </h1>
                            <p className="text-gray-500 text-xs sm:text-sm leading-snug">
                                Help keep Sibuyan Island safe — report road accidents immediately.
                            </p>
                        </div>
                    </div>
                </motion.div>

                <form onSubmit={handleSubmit}>
                    <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
                        {/* Right Column - Map (Prioritized on Mobile) */}
                        <div className="flex flex-col gap-3 lg:gap-4 h-auto lg:h-[calc(100vh-8rem)] lg:sticky lg:top-24 order-1 lg:order-2">

                            {/* Top Bar: Search & Status */}
                            <motion.div
                                variants={itemVariants}
                                initial="hidden" animate="visible"
                                className="bg-white/80 backdrop-blur-lg p-3 sm:p-4 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 w-full z-10"
                            >
                                <div className="flex flex-row items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${locationStatus === 'verified' ? 'bg-green-500 animate-pulse' :
                                            locationStatus === 'detecting' ? 'bg-blue-500 animate-ping' : 'bg-gray-400'
                                            }`} />
                                        <span className="text-[10px] sm:text-xs font-bold text-gray-700 uppercase tracking-wider">
                                            {locationStatus === 'detecting' ? 'Locating...' :
                                                locationStatus === 'verified' ? '✓ Location Verified' :
                                                    locationStatus === 'confirming' ? 'Confirm Location' : 'Select Location'}
                                        </span>
                                    </div>

                                    <div className="flex gap-2">
                                        {locationStatus === 'idle' && (
                                            <button
                                                type="button"
                                                onClick={detectLocation}
                                                disabled={geoLoading}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] sm:text-xs font-semibold bg-gradient-to-r from-brand-500 to-emerald-600 text-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                <HiOutlineLocationMarker className="w-3.5 h-3.5" />
                                                <span className="hidden sm:inline">Locate Me</span>
                                                <span className="sm:hidden">GPS</span>
                                            </button>
                                        )}
                                        {locationStatus === 'verified' && (
                                            <button
                                                type="button"
                                                onClick={retryLocation}
                                                className="flex items-center gap-1 px-3 py-1.5 text-[10px] sm:text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                                            >
                                                Change
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Search Bar */}
                                {locationStatus !== 'confirming' && (
                                    <div className="relative">
                                        <form onSubmit={handleSearch} className="flex gap-2">
                                            <div className="relative flex-1">
                                                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    placeholder="Search landmark or place..."
                                                    className="w-full bg-gray-50/80 border border-gray-200 text-sm rounded-xl pl-9 pr-4 py-2.5 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all placeholder:text-gray-400"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={isSearching}
                                                className="px-3.5 py-2.5 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                                            >
                                                {isSearching ? '...' : 'Go'}
                                            </button>
                                        </form>
                                        <AnimatePresence>
                                            {searchResults.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-gray-100 z-50"
                                                >
                                                    {searchResults.map((result, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => selectSearchResult(result)}
                                                            className="w-full text-left px-4 py-3 hover:bg-brand-50/60 transition-colors text-xs group"
                                                        >
                                                            <p className="font-semibold text-gray-900 truncate group-hover:text-brand-700">{result.display_name.split(',')[0]}</p>
                                                            <p className="text-[10px] text-gray-500 truncate mt-0.5">{result.display_name}</p>
                                                        </button>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSearchResults([])}
                                                        className="w-full text-center py-2.5 text-[10px] text-gray-400 hover:bg-gray-50 uppercase tracking-widest font-medium"
                                                    >
                                                        Close
                                                    </button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </motion.div>

                            {/* Map Container */}
                            <motion.div
                                variants={itemVariants}
                                initial="hidden" animate="visible"
                                transition={{ delay: 0.15 }}
                                className="relative flex flex-col h-[350px] sm:h-[420px] lg:flex-1 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-gray-200/60"
                            >
                                <div className="absolute inset-0 z-0">
                                    <MapView
                                        onLocationSelect={handleLocationSelect}
                                        selectedLocation={selectedLocation}
                                        userLocation={userLocation}
                                        focusLocation={focusLocation}
                                        enable3D={true}
                                        gpsAccuracy={gpsAccuracy}
                                        className="h-full w-full"
                                    />
                                </div>

                                {/* Confirmation Box */}
                                <AnimatePresence>
                                    {locationStatus === 'confirming' && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            className="relative z-10 p-3 pointer-events-none flex flex-col items-start mt-auto mb-4"
                                        >
                                            <div className="pointer-events-auto bg-white/95 backdrop-blur-xl border-l-4 border-orange-500 rounded-r-2xl shadow-2xl p-4 ml-2 max-w-xs">
                                                <p className="text-sm font-bold text-gray-800 mb-1">📍 Is this accurate?</p>
                                                <p className="text-xs text-gray-600 mb-3">GPS Accuracy: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded-md text-[11px] font-bold">{gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m</span></p>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all active:scale-95"
                                                        onClick={confirmLocation}
                                                    >
                                                        ✓ Yes, Verify
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold py-2 rounded-xl shadow-sm transition-all"
                                                        onClick={retryLocation}
                                                    >
                                                        Adjust
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </div>

                        {/* Left Column - Form (Second on Mobile) */}
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            className="space-y-4 sm:space-y-5 order-2 lg:order-1"
                        >

                            {/* ===== SECTION 1: Accident Details ===== */}
                            <motion.div variants={itemVariants} className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100/80">
                                <div className="flex items-center gap-2.5 mb-5">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                        <HiOutlineTruck className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <h3 className="text-base sm:text-lg font-bold text-gray-900">Accident Details</h3>
                                </div>

                                {/* Accident Type */}
                                <div className="mb-4">
                                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">Type of Accident</label>
                                    <div className="relative">
                                        <select
                                            name="incidentType"
                                            value={formData.incidentType}
                                            onChange={handleChange}
                                            className="input w-full appearance-none pr-10 cursor-pointer text-sm"
                                        >
                                            {currentCategory?.types.map((type) => (
                                                <option key={type.value} value={type.value}>{type.label}</option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                            <HiOutlineChevronDown className="w-4 h-4 text-gray-400" />
                                        </div>
                                    </div>
                                </div>

                                {/* Fire Involved Toggle */}
                                <div className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, fireInvolved: !prev.fireInvolved, fireType: 'gas_leak' }))}
                                        className={`w-full p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-3 group ${formData.fireInvolved
                                            ? 'border-orange-400 bg-gradient-to-r from-orange-50 to-red-50 ring-2 ring-orange-200/50'
                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                                            }`}
                                    >
                                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-md transition-all ${formData.fireInvolved
                                            ? 'bg-gradient-to-br from-orange-500 to-red-600 text-white scale-105'
                                            : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                                            }`}>
                                            <HiOutlineFire className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-xs sm:text-sm text-gray-900">🔥 Fire / Gas Leak Involved?</p>
                                            <p className="text-[10px] sm:text-xs text-gray-500 truncate">Toggle if the accident involves fire or explosion</p>
                                        </div>
                                        <div className={`w-11 h-6 rounded-full transition-all duration-300 flex items-center px-0.5 shrink-0 ${formData.fireInvolved ? 'bg-gradient-to-r from-orange-500 to-red-500 justify-end' : 'bg-gray-300 justify-start'
                                            }`}>
                                            <motion.div
                                                layout
                                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                className="w-5 h-5 rounded-full bg-white shadow-md"
                                            />
                                        </div>
                                    </button>

                                    <AnimatePresence>
                                        {formData.fireInvolved && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-3 p-3 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl">
                                                    <label className="block text-xs font-semibold text-orange-800 mb-1.5">Type of Fire</label>
                                                    <div className="relative">
                                                        <select
                                                            name="fireType"
                                                            value={formData.fireType}
                                                            onChange={handleChange}
                                                            className="input border-orange-300 focus:ring-orange-500 focus:border-orange-500 w-full appearance-none pr-10 text-sm"
                                                        >
                                                            {FIRE_TYPES.map((type) => (
                                                                <option key={type.value} value={type.value}>{type.label}</option>
                                                            ))}
                                                        </select>
                                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                                            <HiOutlineChevronDown className="w-4 h-4 text-orange-400" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Description */}
                                <div className="mb-4">
                                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">
                                        Description
                                        <span className="ml-1.5 text-[10px] font-medium text-gray-400 normal-case">(optional)</span>
                                    </label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        rows={3}
                                        placeholder="Describe what happened, vehicles involved, road conditions..."
                                        className={`input resize-none text-sm ${errors.description ? 'input-error' : ''}`}
                                    />
                                    {errors.description && (
                                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-xs sm:text-sm text-danger-600 flex items-center gap-1">
                                            <HiOutlineExclamation className="w-3.5 h-3.5 shrink-0" /> {errors.description}
                                        </motion.p>
                                    )}
                                </div>

                                {/* Date/Time */}
                                <div className="mb-4">
                                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">
                                        <HiOutlineClock className="inline w-3.5 h-3.5 mr-1 opacity-60" />
                                        When did it happen? *
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="incidentTime"
                                        value={formData.incidentTime}
                                        onChange={handleChange}
                                        max={maxDateTime}
                                        className={`input text-sm ${errors.incidentTime ? 'input-error' : ''}`}
                                    />
                                    {errors.incidentTime && (
                                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-xs sm:text-sm text-danger-600 flex items-center gap-1">
                                            <HiOutlineExclamation className="w-3.5 h-3.5 shrink-0" /> {errors.incidentTime}
                                        </motion.p>
                                    )}
                                </div>

                                {/* Severity Dropdown */}
                                <div>
                                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">Severity Level</label>
                                    <div className="relative">
                                        <select
                                            value={formData.severity}
                                            onChange={(e) => setFormData(prev => ({ ...prev, severity: e.target.value }))}
                                            className="input w-full appearance-none pl-9 pr-10 cursor-pointer text-sm"
                                        >
                                            {SEVERITY_LEVELS.map((level) => (
                                                <option key={level.value} value={level.value}>
                                                    {level.label}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                            <HiOutlineChevronDown className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                            <div className={`w-3 h-3 rounded-full shadow-sm ${selectedSeverity?.dotColor || 'bg-gray-300'}`} />
                                        </div>
                                    </div>
                                    <p className="mt-1.5 text-[10px] sm:text-xs text-gray-400">
                                        {selectedSeverity?.description}
                                    </p>
                                </div>
                            </motion.div>

                            {/* ===== SECTION 2: Casualties ===== */}
                            <motion.div variants={itemVariants} className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100/80">
                                <div className="flex items-center gap-2.5 mb-5">
                                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                                        <HiOutlineExclamation className="w-4 h-4 text-red-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-bold text-gray-900">Casualties & Injuries</h3>
                                        <p className="text-[10px] sm:text-xs text-gray-400">Optional — enter 0 if none</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                                    {[
                                        { name: 'casualties.injured', label: 'Injured', value: formData.casualties.injured, emoji: '🤕' },
                                        { name: 'casualties.fatalities', label: 'Fatalities', value: formData.casualties.fatalities, emoji: '💀' },
                                        { name: 'casualties.missing', label: 'Missing', value: formData.casualties.missing, emoji: '❓' },
                                    ].map((field) => (
                                        <div key={field.name} className="text-center">
                                            <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                                                <span className="hidden sm:inline">{field.emoji} </span>{field.label}
                                            </label>
                                            <input
                                                type="number"
                                                name={field.name}
                                                value={field.value}
                                                onChange={handleChange}
                                                min="0"
                                                className="input text-center px-2 sm:px-3 text-lg sm:text-xl font-bold text-gray-900 !py-3"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* ===== SECTION 3: Location ===== */}
                            <motion.div variants={itemVariants} className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100/80">
                                <div className="flex items-center gap-2.5 mb-5">
                                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                                        <HiOutlineLocationMarker className="w-4 h-4 text-green-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-bold text-gray-900">Location</h3>
                                        <p className="text-[10px] sm:text-xs text-gray-400">Auto-filled from map pin, or enter manually</p>
                                    </div>
                                </div>

                                <div className="space-y-3 sm:space-y-4">
                                    <div>
                                        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">Address / Landmark *</label>
                                        <input
                                            type="text"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            placeholder="e.g., Near Municipal Hall, Poblacion"
                                            className={`input text-sm ${errors.location ? 'input-error' : ''}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">Barangay</label>
                                        <input
                                            type="text"
                                            name="barangay"
                                            value={formData.barangay}
                                            onChange={handleChange}
                                            placeholder="e.g., Poblacion, Cajidiocan"
                                            className="input text-sm"
                                        />
                                    </div>
                                </div>
                                {errors.location && (
                                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-xs sm:text-sm text-danger-600 flex items-center gap-1">
                                        <HiOutlineExclamation className="w-3.5 h-3.5 shrink-0" /> {errors.location}
                                    </motion.p>
                                )}
                            </motion.div>

                            {/* ===== SECTION 4: Photos ===== */}
                            <motion.div variants={itemVariants} className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100/80">
                                <div className="flex items-center gap-2.5 mb-5">
                                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                                        <HiOutlinePhotograph className="w-4 h-4 text-purple-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-bold text-gray-900">Photos</h3>
                                        <p className="text-[10px] sm:text-xs text-gray-400">Optional — max 5 images, 5MB each</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {imagePreviews.length > 0 && (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                                            {imagePreviews.map((preview, index) => (
                                                <motion.div
                                                    key={index}
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="relative group"
                                                >
                                                    <img
                                                        src={preview}
                                                        alt={`Upload ${index + 1}`}
                                                        className="w-full aspect-square object-cover rounded-xl ring-1 ring-gray-200"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(index)}
                                                        className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 hover:scale-110"
                                                    >
                                                        <HiOutlineX className="w-3 h-3" />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}

                                    {images.length < 5 && (
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="border-2 border-dashed border-gray-200 rounded-2xl p-5 sm:p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all group"
                                        >
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl bg-gray-100 flex items-center justify-center mb-2 group-hover:bg-brand-100 transition-colors">
                                                <HiOutlinePhotograph className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 group-hover:text-brand-600 transition-colors" />
                                            </div>
                                            <p className="text-sm font-semibold text-gray-600 group-hover:text-brand-700 transition-colors">
                                                {images.length > 0 ? 'Add more photos' : 'Add photos'}
                                            </p>
                                            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">
                                                {images.length}/5 uploaded
                                            </p>
                                        </div>
                                    )}

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageChange}
                                        className="hidden"
                                    />
                                </div>
                            </motion.div>

                            {/* ===== Submit Button ===== */}
                            <motion.div variants={itemVariants} className="space-y-3 pb-4 sm:pb-6">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full relative overflow-hidden flex items-center justify-center gap-2.5 px-6 py-3.5 sm:py-4 bg-gradient-to-r from-brand-600 to-emerald-600 text-white text-sm sm:text-base font-bold rounded-2xl shadow-[0_4px_14px_rgba(22,163,74,0.35)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.45)] hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {/* Shimmer effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full animate-shimmer" />
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <HiOutlineDocumentText className="w-5 h-5" />
                                    )}
                                    {loading ? 'Submitting...' : 'Submit Incident Report'}
                                </button>

                                <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-xs text-gray-400">
                                    <HiOutlineShieldCheck className="w-3.5 h-3.5" />
                                    <span>Your report will be reviewed by authorities before appearing on the map.</span>
                                </div>
                            </motion.div>
                        </motion.div>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default ReportPage;
