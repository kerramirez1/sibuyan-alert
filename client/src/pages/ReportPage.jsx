import { useState, useRef, useEffect } from 'react';
import { useNavigate } from '../router';
import { reportsAPI } from '../services/api';
import toast from '../utils/appToast';
import ReportLocationPanel from '../components/report/ReportLocationPanel';
import ReportDetailsPanel from '../components/report/ReportDetailsPanel';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';
import { assessGpsAccuracy, buildLocationCapture, GPS_MAX_ACCURACY_METERS, isValidLocation } from '../utils/locationQuality';
import { prepareEvidenceImages, validateEvidenceImageFile } from '../utils/evidenceImage';
import { OPERATIONAL_MAX_ZOOM } from '../config/mapProvider';
import { HiOutlineShieldCheck } from 'react-icons/hi';

const LOCATION_TOAST_ID = 'location-acquisition';

const ReportPage = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    // Form State
    const [formData, setFormData] = useState({
        incidentCategory: 'accident',
        incidentType: 'vehicular',
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
    const [locationCapture, setLocationCapture] = useState(null);
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
        if (locationStatus === 'confirming') newErrors.location = 'Confirm the GPS position or choose another location before submitting';
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

    const reverseGeocodeRequestRef = useRef(0);
    const reverseGeocodeAbortRef = useRef(null);

    const resolveLocationLabels = async (location, successPrefix = 'Pinned in') => {
        reverseGeocodeAbortRef.current?.abort();
        const requestId = reverseGeocodeRequestRef.current + 1;
        reverseGeocodeRequestRef.current = requestId;
        const controller = new AbortController();
        reverseGeocodeAbortRef.current = controller;

        // Never display or submit labels that belong to the previous point while
        // the current coordinate is being resolved.
        setFormData((previous) => ({
            ...previous,
            address: '',
            barangay: '',
        }));

        try {
            const response = await reportsAPI.geocodeLocation(
                { lat: location.lat, lng: location.lng },
                { signal: controller.signal }
            );
            if (reverseGeocodeRequestRef.current !== requestId) return;

            const data = response.data?.data;
            const detectedAddress = String(data?.displayAddress || data?.address || '').trim();
            const detectedBarangay = data?.barangay?.name || '';

            setFormData((previous) => ({
                ...previous,
                address: detectedAddress,
                // Only a verified boundary match may populate this field automatically.
                barangay: detectedBarangay,
            }));

            if (detectedBarangay) {
                toast.success(`${successPrefix}: ${detectedBarangay}`);
            } else if (detectedAddress) {
                toast.error('Barangay could not be verified for this location. Adjust the pin or enter it manually.');
            } else {
                toast.error('Could not identify the selected location. Adjust the pin and try again.');
            }
        } catch (error) {
            if (error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError' && error?.name !== 'AbortError') {
                console.warn('Reverse geocoding failed', error);
                toast.error('Could not verify the barangay for this location. Adjust the pin or enter it manually.');
            }
        } finally {
            if (reverseGeocodeRequestRef.current === requestId) {
                reverseGeocodeAbortRef.current = null;
            }
        }
    };

    const watchIdRef = useRef(null);
    const locationTimeoutRef = useRef(null);
    const locationRequestRef = useRef(0);
    const locationDetectionActiveRef = useRef(false);

    const stopLocationDetection = ({ dismissToast = false } = {}) => {
        locationRequestRef.current += 1;
        locationDetectionActiveRef.current = false;

        const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
        if (watchIdRef.current !== null && geolocation) {
            geolocation.clearWatch(watchIdRef.current);
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

    const handleLocationSelect = async (location, source = 'map_pin') => {
        if (!isValidLocation(location)) {
            toast.error('Choose a valid point inside Sibuyan Island.');
            return;
        }
        stopLocationDetection({ dismissToast: true });
        setGeoLoading(false);
        setSelectedLocation(location);
        setFocusLocation({ ...location, zoom: 16 });
        setErrors(prev => ({ ...prev, location: '' }));
        setLocationStatus('selected');
        setGpsAccuracy(null);
        setLocationCapture(buildLocationCapture(source));
        await resolveLocationLabels(location);
    };

    const detectLocation = () => {
        const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
        if (!geolocation) {
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
        let bestLocation = null;

        locationTimeoutRef.current = setTimeout(() => {
            if (locationRequestRef.current !== requestId) return;
            if (watchIdRef.current !== null) {
                geolocation?.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            locationTimeoutRef.current = null;
            locationDetectionActiveRef.current = false;
            setGeoLoading(false);
            if (bestAccuracy === Infinity) {
                toast.error('Could not determine location. Please search or pin manually.', { id: LOCATION_TOAST_ID });
                setLocationStatus('idle');
            } else {
                const assessment = assessGpsAccuracy(bestAccuracy);
                if (assessment.usable) {
                    toast.success(assessment.message, { id: LOCATION_TOAST_ID });
                    setLocationStatus('confirming');
                    if (bestLocation) {
                        void resolveLocationLabels(bestLocation, 'GPS located in');
                    }
                } else {
                    setSelectedLocation(null);
                    setGpsAccuracy(null);
                    setLocationCapture(null);
                    toast.error(assessment.message, { id: LOCATION_TOAST_ID });
                    setLocationStatus('idle');
                }
            }
        }, 12000);

        watchIdRef.current = geolocation.watchPosition(
            (position) => {
                if (locationRequestRef.current !== requestId) return;
                const { latitude, longitude, accuracy } = position.coords;
                if (accuracy < bestAccuracy || bestAccuracy === Infinity) {
                    bestAccuracy = accuracy;
                    setGpsAccuracy(accuracy);
                    const location = { lat: latitude, lng: longitude };
                    bestLocation = location;
                    setUserLocation(location);
                    setSelectedLocation(location);
                    setFocusLocation({
                        ...location,
                        zoom: accuracy < 100 ? OPERATIONAL_MAX_ZOOM : 14,
                    });
                    setLocationCapture(buildLocationCapture('gps', accuracy));
                    setErrors(prev => ({ ...prev, location: '' }));
                    if (accuracy <= GPS_MAX_ACCURACY_METERS && assessGpsAccuracy(accuracy).precise) {
                        toast.success(`Precise location found (${Math.round(accuracy)}m)`, { id: LOCATION_TOAST_ID });
                        if (watchIdRef.current !== null) {
                            geolocation?.clearWatch(watchIdRef.current);
                            watchIdRef.current = null;
                        }
                        if (locationTimeoutRef.current !== null) {
                            clearTimeout(locationTimeoutRef.current);
                            locationTimeoutRef.current = null;
                        }
                        locationDetectionActiveRef.current = false;
                        setGeoLoading(false);
                        setLocationStatus('confirming');
                        void resolveLocationLabels(location, 'GPS located in');
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
                    const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : true;
                    if (!isSecureContext) {
                        errorMessage = 'Mobile GPS requires HTTPS. Cannot use GPS on HTTP.';
                    } else if (error.code === 1) {
                        errorMessage = 'Location permission denied. Please enable GPS permissions.';
                    } else if (error.code === 2) {
                        errorMessage = 'GPS Signal weak or unavailable.';
                    } else if (error.code === 3) {
                        errorMessage = 'Location request timed out.';
                    }
                    if (watchIdRef.current !== null) {
                        geolocation?.clearWatch(watchIdRef.current);
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
        setLocationStatus('confirmed');
        toast.success('GPS location confirmed.');
    };

    const retryLocation = () => {
        stopLocationDetection({ dismissToast: true });
        reverseGeocodeAbortRef.current?.abort();
        reverseGeocodeAbortRef.current = null;
        reverseGeocodeRequestRef.current += 1;
        setGeoLoading(false);
        setLocationStatus('idle');
        setSelectedLocation(null);
        setGpsAccuracy(null);
        setLocationCapture(null);
        setFormData((previous) => ({
            ...previous,
            address: '',
            barangay: '',
        }));
    };

    useEffect(() => {
        detectLocation();
        return () => {
            stopLocationDetection({ dismissToast: true });
            reverseGeocodeAbortRef.current?.abort();
        };
    }, []);

    const handleImageChange = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const remainingSlots = 5 - images.length;
        if (remainingSlots <= 0) {
            toast.error('Maximum 5 photos reached');
            e.target.value = '';
            return;
        }

        if (files.length > remainingSlots) {
            toast.error(`You can only add ${remainingSlots} more photo${remainingSlots > 1 ? 's' : ''}.`);
        }

        const candidateFiles = files.slice(0, remainingSlots);
        const validFiles = [];

        for (const file of candidateFiles) {
            const validationError = validateEvidenceImageFile(file);
            if (validationError) {
                toast.error(`${file.name || 'File'} ${validationError}`);
            } else {
                validFiles.push(file);
            }
        }

        if (!validFiles.length) {
            e.target.value = '';
            return;
        }

        try {
            const prepared = await prepareEvidenceImages(validFiles);
            const optimizedFiles = prepared.map((p) => p.file);

            setImages((prev) => [...prev, ...optimizedFiles]);

            validFiles.forEach((file) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const result = event?.target?.result;
                    if (typeof result === 'string') {
                        setImagePreviews((prev) => [...prev, result]);
                    }
                };
                reader.readAsDataURL(file);
            });
        } catch {
            toast.error('Could not prepare some photos. Please try again.');
        }

        e.target.value = '';
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        setImagePreviews(prev => prev.filter((_, i) => i !== index));
    };

    const retakeImage = (index) => {
        removeImage(index);
        setTimeout(() => {
            cameraInputRef.current?.click();
        }, 50);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            const submitData = new FormData();
            submitData.append('incidentCategory', formData.incidentCategory);
            submitData.append('incidentType', formData.incidentType);
            submitData.append('fireInvolved', 'false');
            submitData.append('description', formData.description);
            submitData.append('incidentTime', formData.incidentTime);
            submitData.append('severity', formData.severity);
            if (selectedLocation) {
                submitData.append('lat', selectedLocation.lat);
                submitData.append('lng', selectedLocation.lng);
            }
            if (locationCapture) {
                submitData.append('locationSource', locationCapture.source);
                if (locationCapture.accuracyMeters !== null) submitData.append('locationAccuracy', locationCapture.accuracyMeters);
                submitData.append('locationCapturedAt', locationCapture.capturedAt);
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
        <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
            {/* Page Header */}
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <HiOutlineShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Emergency Intake</span>
                            <span className="text-emerald-600/60 dark:text-emerald-400/60 font-normal">·</span>
                            <span className="hidden xs:inline text-emerald-700 dark:text-emerald-400 font-bold">Guided Incident Reporting</span>
                        </span>
                    </div>
                    <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Submit incident report
                    </h1>
                    <p className="mt-0.5 max-w-2xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Pin the incident location and provide the details authorities need to verify and dispatch response units.
                        <span className="mt-0.5 block text-[11px] text-gray-400 dark:text-gray-500">
                            Required fields are marked with an asterisk (<span className="text-emerald-700 dark:text-emerald-400 font-bold">*</span>).
                        </span>
                    </p>
                </div>
            </header>

            {/* Guided Form Layout (2-column desktop/tablet, sequential mobile) */}
            <form onSubmit={handleSubmit} noValidate className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
                {/* Left Column: Interactive Location Map (Sticky on Desktop) */}
                <div className="w-full lg:sticky lg:top-20 self-start">
                    <ReportLocationPanel
                        locationStatus={locationStatus}
                        geoLoading={geoLoading}
                        gpsAccuracy={gpsAccuracy}
                        selectedLocation={selectedLocation}
                        userLocation={userLocation}
                        focusLocation={focusLocation}
                        detectLocation={detectLocation}
                        retryLocation={retryLocation}
                        confirmLocation={confirmLocation}
                        handleLocationSelect={handleLocationSelect}
                        formData={formData}
                        handleChange={handleChange}
                        locationError={errors.location}
                    />
                </div>

                {/* Right Column: Incident Details, Casualties, Evidence, and Review */}
                <div className="w-full">
                    <ReportDetailsPanel
                        formData={formData}
                        setFormData={setFormData}
                        handleChange={handleChange}
                        errors={errors}
                        maxDateTime={maxDateTime}
                        images={images}
                        imagePreviews={imagePreviews}
                        fileInputRef={fileInputRef}
                        cameraInputRef={cameraInputRef}
                        handleImageChange={handleImageChange}
                        removeImage={removeImage}
                        onRetakeImage={retakeImage}
                        loading={loading}
                    />
                </div>
            </form>
        </div>
    );
};

export default ReportPage;
