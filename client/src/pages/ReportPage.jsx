import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsAPI } from '../services/api';
import toast from 'react-hot-toast';
import ReportLocationPanel from '../components/report/ReportLocationPanel';
import ReportDetailsPanel from '../components/report/ReportDetailsPanel';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';

const LOCATION_TOAST_ID = 'location-acquisition';

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

    const validate = () => {
        const newErrors = {};
        if (!formData.incidentTime) newErrors.incidentTime = 'Accident time is required';
        if (!selectedLocation && !formData.address.trim()) newErrors.location = 'Please select a location on the map or enter an address';
        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) {
            toast.error('Please complete the required fields');
        }
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
        if (name === 'address' && value.trim() && errors.location) {
            setErrors(prev => ({ ...prev, location: '' }));
        }
    };

    // Location Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

    const handleSearch = async () => {
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
        stopLocationDetection({ dismissToast: true });
        setGeoLoading(false);
        setSelectedLocation(location);
        setFocusLocation({ ...location, zoom: 16 });
        setLocationStatus('verified');
        setGpsAccuracy(null);
        setErrors((current) => ({ ...current, location: '' }));
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
    const locationTimeoutRef = useRef(null);
    const locationRequestRef = useRef(0);
    const locationDetectionActiveRef = useRef(false);

    const stopLocationDetection = ({ dismissToast = false } = {}) => {
        locationRequestRef.current += 1;
        locationDetectionActiveRef.current = false;

        if (watchIdRef.current !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (locationTimeoutRef.current !== null) {
            clearTimeout(locationTimeoutRef.current);
            locationTimeoutRef.current = null;
        }
        if (dismissToast) {
            toast.dismiss(LOCATION_TOAST_ID);
        }
    };

    const handleLocationSelect = async (location) => {
        stopLocationDetection({ dismissToast: true });
        setGeoLoading(false);
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
        if (locationDetectionActiveRef.current) return;

        stopLocationDetection({ dismissToast: true });
        const requestId = locationRequestRef.current + 1;
        locationRequestRef.current = requestId;
        locationDetectionActiveRef.current = true;
        setGeoLoading(true);
        setLocationStatus('detecting');
        toast.loading('Acquiring location...', { id: LOCATION_TOAST_ID });
        let bestAccuracy = Infinity;

        locationTimeoutRef.current = setTimeout(() => {
            if (locationRequestRef.current !== requestId) return;
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            locationTimeoutRef.current = null;
            locationDetectionActiveRef.current = false;
            setGeoLoading(false);
            if (bestAccuracy === Infinity) {
                toast.error('Could not determine location. Please search or pin manually.', { id: LOCATION_TOAST_ID });
                setLocationStatus('idle');
            } else {
                toast.success(`Location found (Accuracy: ${Math.round(bestAccuracy)}m)`, { id: LOCATION_TOAST_ID });
                setLocationStatus('confirming');
            }
        }, 12000);

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                if (locationRequestRef.current !== requestId) return;
                const { latitude, longitude, accuracy } = position.coords;
                if (accuracy < bestAccuracy || bestAccuracy === Infinity) {
                    bestAccuracy = accuracy;
                    setGpsAccuracy(accuracy);
                    const location = { lat: latitude, lng: longitude };
                    setUserLocation(location);
                    setSelectedLocation(location);
                    setFocusLocation({ ...location, zoom: accuracy < 100 ? 17 : 14 });
                    setErrors(prev => ({ ...prev, location: '' }));
                    if (accuracy < 30) {
                        toast.success(`Precise location found (${Math.round(accuracy)}m)`, { id: LOCATION_TOAST_ID });
                        if (watchIdRef.current !== null) {
                            navigator.geolocation.clearWatch(watchIdRef.current);
                            watchIdRef.current = null;
                        }
                        if (locationTimeoutRef.current !== null) {
                            clearTimeout(locationTimeoutRef.current);
                            locationTimeoutRef.current = null;
                        }
                        locationDetectionActiveRef.current = false;
                        setGeoLoading(false);
                        setLocationStatus('confirming');
                    } else {
                        toast.loading(`Refining... (${Math.round(accuracy)}m)`, { id: LOCATION_TOAST_ID });
                    }
                }
            },
            (error) => {
                if (locationRequestRef.current !== requestId) return;
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
                    if (locationTimeoutRef.current !== null) {
                        clearTimeout(locationTimeoutRef.current);
                        locationTimeoutRef.current = null;
                    }
                    locationDetectionActiveRef.current = false;
                    setGeoLoading(false);
                    setLocationStatus('idle');
                    toast.error(errorMessage, { id: LOCATION_TOAST_ID });
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const confirmLocation = () => {
        stopLocationDetection({ dismissToast: true });
        setLocationStatus('verified');
        setGpsAccuracy(null);
        toast.success('Location verified!');
    };

    const retryLocation = () => {
        stopLocationDetection({ dismissToast: true });
        setGeoLoading(false);
        setLocationStatus('idle');
        setSelectedLocation(null);
        setGpsAccuracy(null);
    };

    useEffect(() => {
        detectLocation();
        return () => {
            stopLocationDetection({ dismissToast: true });
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


    return (
        <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reporter workflow</p>
                    <h1 className="text-2xl font-display font-bold text-gray-900 sm:text-3xl">Submit incident report</h1>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">Pin the incident location and provide the information authorities need to verify and dispatch the report.</p>
                </div>
                <p className="text-xs font-medium text-gray-400">Required fields are marked *</p>
            </header>

            <form onSubmit={handleSubmit} noValidate className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:gap-5">
                <div className="lg:sticky lg:top-24">
                    <ReportLocationPanel
                        locationStatus={locationStatus}
                        geoLoading={geoLoading}
                        gpsAccuracy={gpsAccuracy}
                        selectedLocation={selectedLocation}
                        userLocation={userLocation}
                        focusLocation={focusLocation}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        isSearching={isSearching}
                        searchResults={searchResults}
                        setSearchResults={setSearchResults}
                        detectLocation={detectLocation}
                        retryLocation={retryLocation}
                        confirmLocation={confirmLocation}
                        handleSearch={handleSearch}
                        selectSearchResult={selectSearchResult}
                        handleLocationSelect={handleLocationSelect}
                        formData={formData}
                        handleChange={handleChange}
                        locationError={errors.location}
                    />
                </div>

                <ReportDetailsPanel
                    formData={formData}
                    setFormData={setFormData}
                    handleChange={handleChange}
                    errors={errors}
                    maxDateTime={maxDateTime}
                    images={images}
                    imagePreviews={imagePreviews}
                    fileInputRef={fileInputRef}
                    handleImageChange={handleImageChange}
                    removeImage={removeImage}
                    loading={loading}
                />
            </form>
        </div>
    );
};

export default ReportPage;
