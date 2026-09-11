import { useState, useRef, useEffect } from 'react';
import { useNavigate } from '../router';
import { reportsAPI } from '../services/api';
import toast from '../utils/appToast';
import ReportLocationPanel from '../components/report/ReportLocationPanel';
import ReportDetailsPanel from '../components/report/ReportDetailsPanel';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';
import { assessGpsAccuracy, buildLocationCapture, GPS_MAX_ACCURACY_METERS, isValidLocation } from '../utils/locationQuality';
import { prepareEvidenceImages, validateEvidenceImageFile } from '../utils/evidenceImage';
import { createClientReportId, enqueueReport } from '../utils/offlineReportQueue';
import { OPERATIONAL_MAX_ZOOM } from '../config/mapProvider';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

const LOCATION_TOAST_ID = 'location-acquisition';

const ReportPage = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    // Idempotency key for the report currently being submitted. Held in a ref
    // so a retry, a duplicate confirmation, and an offline replay all reuse it.
    const pendingReportIdRef = useRef(null);

    // Form State
    const [formData, setFormData] = useState({
        incidentCategory: 'accident',
        incidentType: 'vehicular',
        description: '',
        address: '',
        barangay: '',
        incidentTime: '',
        severity: 'moderate',
        // Empty means "not recorded" and is deliberately distinct from 0, which
        // the user enters only when they know there were none.
        casualties: {
            injured: '',
            fatalities: '',
            missing: '',
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
    // Populated from a 409 POSSIBLE_DUPLICATE response. Holds the nearby
    // reports the server matched so the reporter can tell them apart.
    const [duplicateWarning, setDuplicateWarning] = useState(null);

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
        const incidentTimeRaw = typeof formData.incidentTime === 'string'
            ? formData.incidentTime.trim()
            : formData.incidentTime;
        if (!incidentTimeRaw) {
            newErrors.incidentTime = 'Accident time is required';
        } else {
            const parsedTime = new Date(incidentTimeRaw);
            if (Number.isNaN(parsedTime.getTime())) {
                newErrors.incidentTime = 'Accident time is invalid';
            } else if (parsedTime.getTime() > Date.now()) {
                newErrors.incidentTime = 'Accident time cannot be in the future';
            }
        }
        const addressRaw = typeof formData.address === 'string'
            ? formData.address.trim()
            : String(formData.address ?? '').trim();
        if (!selectedLocation && !addressRaw) newErrors.location = 'Please select a location on the map or enter an address';
        if (locationStatus === 'confirming') newErrors.location = 'Confirm the GPS position or choose another location before submitting';
        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) {
            toast.error('Please complete the required fields');
        }
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e?.target ?? {};
        if (typeof name !== 'string' || !name) return;
        if (name.includes('.')) {
            const parts = name.split('.');
            if (parts.length !== 2) return;
            const [parent, child] = parts;
            if (!parent || !child) return;
            setFormData(prev => {
                const parentValue = prev?.[parent];
                if (!parentValue || typeof parentValue !== 'object' || Array.isArray(parentValue)) return prev;
                // An empty field means "not recorded" and must stay empty, not
                // silently become 0. Only a non-empty value is coerced into the
                // allowed range.
                const parsed = parseInt(value, 10);
                const safe = value === '' || !Number.isFinite(parsed)
                    ? ''
                    : Math.min(999, Math.max(0, parsed));
                return {
                    ...prev,
                    [parent]: { ...parentValue, [child]: safe },
                };
            });
        } else {
            setFormData(prev => {
                const existing = prev?.[name];
                if (existing !== null && typeof existing === 'object') return prev;
                return { ...prev, [name]: value };
            });
        }
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
        const addressValue = typeof value === 'string' ? value.trim() : '';
        if (name === 'address' && addressValue && errors.location) {
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
            if (!bestLocation) {
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
                const coords = position?.coords;
                if (!coords) return;
                const { latitude, longitude } = coords;
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
                const accuracy = Number.isFinite(coords?.accuracy) ? coords.accuracy : null;
                if (bestLocation !== null && accuracy !== null && accuracy >= bestAccuracy) return;
                {
                    if (accuracy !== null) bestAccuracy = accuracy;
                    setGpsAccuracy(accuracy);
                    const location = { lat: latitude, lng: longitude };
                    bestLocation = location;
                    setUserLocation(location);
                    setSelectedLocation(location);
                    setFocusLocation({
                        ...location,
                        zoom: accuracy !== null && accuracy < 100 ? OPERATIONAL_MAX_ZOOM : 14,
                    });
                    setLocationCapture(buildLocationCapture('gps', accuracy));
                    setErrors(prev => ({ ...prev, location: '' }));
                    if (accuracy !== null && accuracy <= GPS_MAX_ACCURACY_METERS && assessGpsAccuracy(accuracy).precise) {
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
                        toast.loading(
                            accuracy !== null ? `Refining... (${Math.round(accuracy)}m)` : 'Refining... (accuracy unavailable)',
                            { id: LOCATION_TOAST_ID },
                        );
                    }
                }
            },
            (error) => {
                if (locationRequestRef.current !== requestId) return;
                console.error('Geolocation error:', error);
                if (!bestLocation && bestAccuracy === Infinity) {
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

            // MVP: keep images[] and previews[] index-aligned. Read the exact
            // optimized files in order and append as one batch so a slow read
            // or a quick remove can't orphan/mismatch previews.
            const readAsDataUrl = (file) => new Promise((resolve) => {
                try {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const result = event?.target?.result;
                        resolve(typeof result === 'string' ? result : null);
                    };
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                } catch {
                    resolve(null);
                }
            });
            const previewResults = await Promise.all(optimizedFiles.map(readAsDataUrl));
            const paired = optimizedFiles
                .map((file, index) => ({ file, preview: previewResults[index] }))
                .filter((entry) => typeof entry.preview === 'string');

            if (!paired.length) {
                toast.error('Could not prepare some photos. Please try again.');
                e.target.value = '';
                return;
            }

            setImages((prev) => [...prev, ...paired.map((entry) => entry.file)]);
            setImagePreviews((prev) => [...prev, ...paired.map((entry) => entry.preview)]);
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

    /**
     * Flat field map, shared by the live submission and the offline queue so
     * a report replayed from the device is byte-for-byte the same submission.
     */
    const buildSubmitFields = () => {
        const fields = {
            incidentCategory: formData.incidentCategory,
            incidentType: formData.incidentType,
            description: formData.description,
            incidentTime: formData.incidentTime,
            severity: formData.severity,
            'casualties[injured]': formData.casualties.injured,
            'casualties[fatalities]': formData.casualties.fatalities,
            'casualties[missing]': formData.casualties.missing,
        };

        const submitLat = Number(selectedLocation?.lat);
        const submitLng = Number(selectedLocation?.lng);
        if (selectedLocation && Number.isFinite(submitLat) && Number.isFinite(submitLng)) {
            fields.lat = submitLat;
            fields.lng = submitLng;
        }
        // Address-only path: coordinates are omitted; validate() already
        // ensures an address exists.

        if (locationCapture) {
            fields.locationSource = locationCapture.source;
            if (locationCapture.accuracyMeters !== null) fields.locationAccuracy = locationCapture.accuracyMeters;
            fields.locationCapturedAt = locationCapture.capturedAt;
        }
        if (formData.address) fields.address = formData.address;
        if (formData.barangay) fields.barangay = formData.barangay;

        return fields;
    };

    /**
     * One idempotency key per report, not per attempt. It survives the
     * duplicate-confirmation round trip and the offline queue, so a report the
     * server already stored can never be filed a second time.
     */
    const getClientReportId = () => {
        if (!pendingReportIdRef.current) pendingReportIdRef.current = createClientReportId();
        return pendingReportIdRef.current;
    };

    // Rebuilt on every attempt: a FormData body cannot be replayed, and the
    // duplicate confirmation resubmits the same report.
    const buildSubmitData = ({ confirmDistinct = false } = {}) => {
        const submitData = new FormData();

        for (const [key, value] of Object.entries(buildSubmitFields())) {
            if (value === undefined || value === null || value === '') continue;
            submitData.append(key, String(value));
        }

        images.forEach((image) => { submitData.append('images', image); });
        submitData.append('clientReportId', getClientReportId());
        if (confirmDistinct) submitData.append('confirmDistinct', 'true');

        return submitData;
    };

    const submitReport = async (options = {}) => {
        setLoading(true);
        try {
            await reportsAPI.create(buildSubmitData(options));
            pendingReportIdRef.current = null;
            toast.success('Accident report submitted successfully!');
            navigate('/my-reports');
        } catch (error) {
            // The server warns rather than blocks: it hands back the nearby
            // reports so the reporter can confirm this is a different incident.
            if (error.response?.status === 409 && error.response?.data?.code === 'POSSIBLE_DUPLICATE') {
                setDuplicateWarning({ duplicates: error.response.data.duplicates || [] });
            } else if (!error.response) {
                // No response at all: the request never left the device. Keep
                // the report locally rather than losing an emergency report.
                await queueOfflineReport();
            } else {
                const message = error.response?.data?.message || 'Failed to submit report';
                toast.error(message);
            }
        } finally {
            setLoading(false);
        }
    };

    const queueOfflineReport = async () => {
        const queued = await enqueueReport({
            fields: buildSubmitFields(),
            images,
        });

        if (queued) {
            pendingReportIdRef.current = null;
            toast.success('You are offline. This report is saved on your device and will be sent automatically.');
            navigate('/my-reports');
            return;
        }

        toast.error('You are offline and this device could not store the report. Please retry once you have signal.');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        await submitReport();
    };

    const handleConfirmDistinct = async () => {
        setDuplicateWarning(null);
        await submitReport({ confirmDistinct: true });
    };

    const formatDuplicateAge = (minutesAgo) => {
        if (minutesAgo < 1) return 'just now';
        if (minutesAgo < 60) return `${minutesAgo} min ago`;
        const hours = Math.round(minutesAgo / 60);
        return `${hours} hr ago`;
    };

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset * 60 * 1000));
    const maxDateTime = localNow.toISOString().slice(0, 16);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
            {/* Single page title block */}
            <header className="pb-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                    Submit incident report
                </h1>
                <p className="mt-1 max-w-2xl text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                    Pin the incident location and provide the details authorities need to verify and dispatch response units.
                    Required fields are marked with an asterisk (*).
                </p>
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

            <Modal
                isOpen={Boolean(duplicateWarning)}
                onClose={() => setDuplicateWarning(null)}
                title="Possible duplicate report"
                size="lg"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        A similar incident was already reported nearby. If this is the same event, please do not submit
                        again — a second report creates a second dispatch for one incident.
                    </p>
                    <ul className="space-y-2">
                        {(duplicateWarning?.duplicates || []).map((duplicate) => (
                            <li
                                key={String(duplicate.reportId)}
                                className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                            >
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {duplicate.address || 'Location not recorded'}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {duplicate.distanceMeters} m away · reported {formatDuplicateAge(duplicate.minutesAgo)}
                                    {duplicate.status ? ` · ${duplicate.status}` : ''}
                                </p>
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button variant="secondary" onClick={() => setDuplicateWarning(null)} disabled={loading}>
                            Review my report
                        </Button>
                        <Button
                            variant="warning"
                            onClick={handleConfirmDistinct}
                            loading={loading}
                            loadingLabel="Submitting..."
                        >
                            This is a different incident
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ReportPage;
