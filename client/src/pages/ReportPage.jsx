import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '../router';
import { reportsAPI } from '../services/api';
import toast from '../utils/appToast';
import ReportLocationPanel from '../components/report/ReportLocationPanel';
import ReportDetailsPanel from '../components/report/ReportDetailsPanel';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';
import { assessGpsAccuracy, buildLocationCapture, GPS_MAX_ACCURACY_METERS, isValidLocation } from '../utils/locationQuality';
import { prepareEvidenceImages, validateEvidenceImageFile } from '../utils/evidenceImage';
import { createThrottledProgressEmitter } from '../utils/progressThrottle';
import {
    clearQueuedReportSending,
    createClientReportId,
    enqueueReport,
    isTransientSubmitFailure,
    removeQueuedReport,
} from '../utils/offlineReportQueue';
import { useConnectivity } from '../hooks/useConnectivity';
import { useAuth } from '../context/AuthContext';
import { REPORT_SUBMIT_TIMEOUT_MS } from '../config/reportSubmission';
import { clearReportDraft, loadReportDraft, saveReportDraft } from '../utils/reportDraft';
import { OPERATIONAL_MAX_ZOOM } from '../config/mapProvider';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { HiCheck } from 'react-icons/hi';

const LOCATION_TOAST_ID = 'location-acquisition';

// What the reporter is told when the report is safe on the device but not yet
// in the dispatch queue. Each variant names the real reason, because "offline"
// and "the upload was cut halfway" need different reactions from the reporter.
const QUEUED_REPORT_MESSAGES = {
    offline: 'You are offline. This report is saved on your device and will be sent automatically.',
    signalLost: 'Signal lost while submitting. This report is saved on your device and will be sent automatically once the connection returns.',
};

// Shown only when the report could neither be stored nor delivered. Saying so is
// the point: navigating away would hide a report that no longer exists anywhere.
const DEVICE_STORAGE_ERROR = 'This device could not store the report locally. Keep this screen open and retry, or free up storage.';

const DEFAULT_REPORT_FORM = {
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
};

// The guided report flow: exactly one step is visible at a time. headingId
// points at the focusable h2 inside each step's panel for focus management.
const STEPS = [
    { id: 1, label: 'Location', headingId: 'location-heading' },
    { id: 2, label: 'Details', headingId: 'details-heading' },
    { id: 3, label: 'Casualties', headingId: 'casualties-heading' },
    { id: 4, label: 'Evidence & review', headingId: 'evidence-heading' },
];

const LAST_STEP = STEPS.length;

// Single progress system for the wizard. The stepper lives inside the same
// card as the step content (with a light divider between them) so the flow
// reads as one continuous task. Below sm the labels collapse and the caption
// underneath names the current step — the compressed mobile stepper.
const StepIndicator = ({ activeStep }) => (
    <nav aria-label="Report progress" className="px-4 pt-4 sm:px-6 sm:pt-5">
        <ol className="flex items-center">
            {STEPS.map((step) => {
                const isDone = step.id < activeStep;
                const isCurrent = step.id === activeStep;
                return (
                    <li
                        key={step.id}
                        aria-current={isCurrent ? 'step' : undefined}
                        className="flex min-w-0 flex-1 items-center last:flex-none"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <span
                                aria-hidden="true"
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                    isDone
                                        ? 'bg-emerald-600 text-white'
                                        : isCurrent
                                            ? 'bg-brand-700 text-white dark:bg-sky-500'
                                            : 'bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                                }`}
                            >
                                {isDone ? <HiCheck className="h-3.5 w-3.5" /> : step.id}
                            </span>
                            <span
                                className={`hidden truncate text-xs font-semibold sm:block ${
                                    isCurrent ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                                }`}
                            >
                                {step.label}
                            </span>
                        </span>
                        {step.id < LAST_STEP && (
                            <span aria-hidden="true" className="mx-2 h-px min-w-[0.5rem] flex-1 bg-gray-200 sm:mx-3 dark:bg-white/10" />
                        )}
                    </li>
                );
            })}
        </ol>
        <p className="mt-2 text-center text-xs font-medium text-gray-500 sm:hidden dark:text-gray-400">
            Step {activeStep} of {LAST_STEP}: {STEPS[activeStep - 1]?.label}
        </p>
    </nav>
);

// The step-4 Submit mounts where the step-3 Continue was. A second tap
// landing in that spot (double-tap, impatient re-tap) must not file the
// report before the review screen is even seen, so Submit stays disabled
// for a beat after step 4 appears. Nobody can review and deliberately
// submit faster than this; a disabled submit button also cannot trigger
// implicit (Enter-key) submission while disarmed.
const SUBMIT_ARM_MS = 600;

// Back/Continue for steps 1-3. On step 4, Back and the red Submit share one
// action row beneath the review section. StepNav renders inside the form, so
// the submit button stays type="submit" and invokes the form's onSubmit;
// Back stays type="button" and never submits.
const StepNav = ({ activeStep, onBack, onContinue, loading, uploadProgress }) => {
    const [submitArmed, setSubmitArmed] = useState(false);

    useEffect(() => {
        if (activeStep < LAST_STEP) {
            setSubmitArmed(false);
            return undefined;
        }
        setSubmitArmed(false);
        const timer = setTimeout(() => setSubmitArmed(true), SUBMIT_ARM_MS);
        return () => clearTimeout(timer);
    }, [activeStep]);

    if (activeStep >= LAST_STEP) {
        return (
            <div className="mt-5 flex items-stretch gap-3">
                <button type="button" onClick={onBack} className="btn-outline min-h-12 min-w-0 flex-1 px-6">
                    <span aria-hidden="true">←</span> Back
                </button>
                <button
                    type="submit"
                    disabled={loading || !submitArmed}
                    className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg bg-red-600 px-4 text-center text-sm font-semibold leading-tight text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 dark:bg-red-600 dark:hover:bg-red-500"
                >
                    {loading ? (
                        <span className="mr-2 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                    ) : null}
                    {loading
                        ? (uploadProgress?.percent !== null && uploadProgress?.percent !== undefined
                            ? `Uploading ${uploadProgress.percent}%…`
                            : 'Submitting report…')
                        : (<>Submit report <span aria-hidden="true">→</span></>)}
                </button>
            </div>
        );
    }
    return (
        <div className="mt-5 flex items-stretch gap-3">
            {activeStep > 1 && (
                <button type="button" onClick={onBack} className="btn-outline min-h-12 flex-1 px-6">
                    <span aria-hidden="true">←</span> Back
                </button>
            )}
            <button
                type="button"
                onClick={onContinue}
                className="btn-primary min-h-12 flex-1 px-6"
            >
                Continue <span aria-hidden="true">→</span>
            </button>
        </div>
    );
};

const ReportPage = () => {
    const navigate = useNavigate();
    const { isOffline } = useConnectivity();
    const { user } = useAuth();
    // Stamped on every stored copy: only this reporter's own session may deliver
    // it later, so a report cannot be filed under whoever signs in next.
    const reporterId = user?._id || user?.id || null;
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    // Idempotency key for the report currently being submitted. Held in a ref
    // so a retry, a duplicate confirmation, and an offline replay all reuse it.
    const pendingReportIdRef = useRef(null);
    const [uploadProgress, setUploadProgress] = useState(null);
    // True once the current attempt is staged on the device: the reporter can
    // be told the report is safe even while the upload is still running.
    const [deviceSaved, setDeviceSaved] = useState(false);
    // Draft restoration is localStorage-only (fields, never photos).
    const [initialDraft] = useState(() => {
        try {
            return loadReportDraft();
        } catch {
            return null;
        }
    });
    const [draftRestored, setDraftRestored] = useState(() => Boolean(initialDraft));

    // Form State
    const [formData, setFormData] = useState(() => ({
        ...DEFAULT_REPORT_FORM,
        ...initialDraft?.formData,
        casualties: {
            ...DEFAULT_REPORT_FORM.casualties,
            ...initialDraft?.formData?.casualties,
        },
    }));

    const [selectedLocation, setSelectedLocation] = useState(() => initialDraft?.selectedLocation ?? null);
    const [userLocation, setUserLocation] = useState(null);
    const [focusLocation, setFocusLocation] = useState(() => (
        initialDraft?.selectedLocation ? { ...initialDraft.selectedLocation, zoom: 14 } : null
    ));
    const [geoLoading, setGeoLoading] = useState(false);
    const [locationStatus, setLocationStatus] = useState(() => (initialDraft?.selectedLocation ? 'selected' : 'idle'));
    const [gpsAccuracy, setGpsAccuracy] = useState(null);
    const [locationCapture, setLocationCapture] = useState(() => initialDraft?.locationCapture ?? null);
    const [images, setImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    // Guided flow position. All form state lives in this component, so moving
    // between steps never clears values, photos, previews, or location data —
    // only the visible step's panel is mounted.
    const [activeStep, setActiveStep] = useState(1);
    // Top of the wizard form: step changes scroll the page back here (with a
    // scroll margin for the fixed header) without moving the fixed chrome.
    const formTopRef = useRef(null);
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

    // Step 1 gate: a location pin or a typed address, and no unconfirmed GPS.
    const validateLocationStep = () => {
        const stepErrors = {};
        const addressRaw = typeof formData.address === 'string'
            ? formData.address.trim()
            : String(formData.address ?? '').trim();
        if (!selectedLocation && !addressRaw) stepErrors.location = 'Please select a location on the map or enter an address';
        if (locationStatus === 'confirming') stepErrors.location = 'Confirm the GPS position or choose another location before submitting';
        return stepErrors;
    };

    // Step 2 gate: incident time is the only required field here.
    const validateDetailsStep = () => {
        const stepErrors = {};
        const incidentTimeRaw = typeof formData.incidentTime === 'string'
            ? formData.incidentTime.trim()
            : formData.incidentTime;
        if (!incidentTimeRaw) {
            stepErrors.incidentTime = 'Accident time is required';
        } else {
            const parsedTime = new Date(incidentTimeRaw);
            if (Number.isNaN(parsedTime.getTime())) {
                stepErrors.incidentTime = 'Accident time is invalid';
            } else if (parsedTime.getTime() > Date.now()) {
                stepErrors.incidentTime = 'Accident time cannot be in the future';
            }
        }
        return stepErrors;
    };

    // Step 3 (casualties) has no required fields: blanks mean "not recorded".
    const validateStep = (step) => {
        if (step === 1) return validateLocationStep();
        if (step === 2) return validateDetailsStep();
        return {};
    };

    const validate = () => {
        const newErrors = { ...validateLocationStep(), ...validateDetailsStep() };
        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) {
            toast.error('Please complete the required fields');
        }
        return Object.keys(newErrors).length === 0;
    };

    // Focus target for a failed step validation: the first invalid field, so
    // the existing inline error is announced beside it.
    const focusFirstInvalidField = (stepErrors, step) => {
        const focusSelectors = {
            location: 'input[name="address"]',
            incidentTime: 'input[name="incidentTime"]',
        };
        window.requestAnimationFrame(() => {
            for (const key of Object.keys(stepErrors)) {
                const selector = focusSelectors[key];
                const field = selector ? document.querySelector(selector) : null;
                if (field) {
                    field.focus();
                    return;
                }
            }
            document.getElementById(STEPS[step - 1]?.headingId)?.focus({ preventScroll: true });
        });
    };

    const goToStep = (step) => {
        const clamped = Math.min(LAST_STEP, Math.max(1, step));
        setActiveStep(clamped);
        // Return the form content to its start. The scroll margin on the form
        // keeps it clear of the fixed header; the fixed bottom nav never moves.
        window.requestAnimationFrame(() => {
            try {
                formTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            } catch {
                // Scrolling is a nicety; the step change itself must not fail.
            }
            document.getElementById(STEPS[clamped - 1]?.headingId)?.focus({ preventScroll: true });
        });
    };

    const handleContinue = () => {
        const stepErrors = validateStep(activeStep);
        if (Object.keys(stepErrors).length > 0) {
            setErrors((prev) => ({ ...prev, ...stepErrors }));
            toast.error('Please complete the required fields');
            focusFirstInvalidField(stepErrors, activeStep);
            return;
        }
        goToStep(activeStep + 1);
    };

    const handleBack = () => {
        goToStep(activeStep - 1);
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

    // Stable identity on purpose: this handler is a `MapView` prop, and the map
    // is memoized so typing or an upload progress update does not rebuild it.
    const resolveLocationLabels = useCallback(async (location, successPrefix = 'Pinned in') => {
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
    }, []);

    const watchIdRef = useRef(null);
    const locationTimeoutRef = useRef(null);
    const locationRequestRef = useRef(0);
    const locationDetectionActiveRef = useRef(false);

    const stopLocationDetection = useCallback(({ dismissToast = false } = {}) => {
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
    }, []);

    const handleLocationSelect = useCallback(async (location, source = 'map_pin') => {
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
    }, [stopLocationDetection, resolveLocationLabels]);

    const detectLocation = useCallback(() => {
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
    }, [stopLocationDetection, resolveLocationLabels]);

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
        // A restored draft already has the reporter's pin: do not let the
        // auto GPS pass overwrite it on mount.
        if (initialDraft?.selectedLocation) return;
        detectLocation();
        return () => {
            stopLocationDetection({ dismissToast: true });
            reverseGeocodeAbortRef.current?.abort();
        };
    }, []);

    // Draft autosave: fields only, debounced, never photos or tokens. A closed
    // tab or a validation-blocked submit still restores on return.
    useEffect(() => {
        if (loading) return undefined;
        const timer = setTimeout(() => {
            saveReportDraft({ formData, selectedLocation, locationCapture });
        }, 500);
        return () => clearTimeout(timer);
    }, [formData, selectedLocation, locationCapture, loading]);

    const handleDiscardDraft = () => {
        clearReportDraft();
        setDraftRestored(false);
        setFormData({ ...DEFAULT_REPORT_FORM, casualties: { ...DEFAULT_REPORT_FORM.casualties } });
        setSelectedLocation(null);
        setFocusLocation(null);
        setLocationStatus('idle');
        setGpsAccuracy(null);
        setLocationCapture(null);
        setErrors({});
        setActiveStep(1);
    };

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

    /**
     * Fields for the on-device copy: identical to the live submission, plus the
     * reporter's answer to the duplicate warning. A replay that dropped that
     * answer would come back as the same 409 the reporter had already resolved.
     */
    const buildQueueFields = ({ confirmDistinct = false } = {}) => {
        const fields = buildSubmitFields();
        if (confirmDistinct) fields.confirmDistinct = 'true';
        return fields;
    };

    /**
     * Write-ahead: stores the report on the device before the request leaves, and
     * - unless this is a proactive save - marks it as in flight so the queue
     * cannot upload a second copy of a submission that is still running.
     *
     * @returns {Promise<{entry: object, imagesDropped: boolean}|null>} null when
     *   the device stores nothing at all (private mode, blocked IndexedDB,
     *   quota exhausted). The caller must then treat the report as unsaved.
     */
    const stageOnDevice = async (clientReportId, { confirmDistinct = false, leased = true } = {}) => {
        const fields = buildQueueFields({ confirmDistinct });

        const stored = await enqueueReport({ clientReportId, fields, images, leased, reporterId });
        if (stored) return { entry: stored, imagesDropped: false };
        if (!images.length) return null;

        // Photos are the bulk of the payload. Losing them is bad; losing the
        // whole report is worse, so the fields are stored on their own.
        const fieldsOnly = await enqueueReport({ clientReportId, fields, images: [], leased, reporterId });
        return fieldsOnly ? { entry: fieldsOnly, imagesDropped: true } : null;
    };

    /** Hands the reporter to the inbox, where the queue is visible. */
    const reportQueued = (staged, variant) => {
        pendingReportIdRef.current = null;
        clearReportDraft();
        setDraftRestored(false);
        toast.success(QUEUED_REPORT_MESSAGES[variant] || QUEUED_REPORT_MESSAGES.offline);
        if (staged?.imagesDropped) {
            // Silent photo loss would look like the server dropped them.
            toast.error('The photos could not be stored on this device. The report will be sent without them.');
        }
        navigate('/my-reports');
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
        setDeviceSaved(false);
        setUploadProgress({ percent: 0, loaded: 0, total: 0 });
        // One emitter per attempt. It collapses the XHR progress stream to a
        // few updates per second, so the progress bar cannot re-render this page
        // (and its map) hundreds of times during a single upload.
        const progressEmitter = createThrottledProgressEmitter({ onEmit: setUploadProgress });
        let removeOfflineAbort = null;

        try {
            // Write-ahead. The report is on the device before the request leaves
            // and is dropped only once the server acknowledges it, so a signal
            // drop mid-upload, a stall past the request timeout, or the app being
            // closed can no longer lose an emergency report.
            const staged = await stageOnDevice(getClientReportId(), {
                confirmDistinct: Boolean(options.confirmDistinct),
                leased: !isOffline,
            });

            // Instant safety signal: the reporter knows the report is on the
            // device before the network answers, instead of staring at a
            // spinner for the full request timeout when the signal is fading.
            if (staged) setDeviceSaved(true);

            // Known-offline: there is no route to the server. Sending anyway only
            // spins the button until the OS gives the request up.
            if (isOffline) {
                if (staged) reportQueued(staged, 'offline');
                else toast.error(DEVICE_STORAGE_ERROR);
                return;
            }

            // A signal loss mid-upload aborts the request at once instead of
            // waiting out the full submit timeout. The abort surfaces as a
            // transient failure below, which queues the already-staged copy.
            const submitController = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const abortOnOffline = () => {
                try {
                    submitController?.abort();
                } catch {
                    // Aborting is best-effort; the timeout still bounds the request.
                }
            };
            if (typeof window !== 'undefined' && submitController) {
                window.addEventListener('offline', abortOnOffline);
                removeOfflineAbort = () => window.removeEventListener('offline', abortOnOffline);
            }

            try {
                await reportsAPI.create(buildSubmitData(options), {
                    timeout: REPORT_SUBMIT_TIMEOUT_MS,
                    ...(submitController ? { signal: submitController.signal } : {}),
                    onUploadProgress: (progressEvent) => {
                        const loaded = progressEvent.loaded || 0;
                        const total = progressEvent.total || 0;
                        const percent = total > 0 ? Math.min(100, Math.round((loaded * 100) / total)) : null;
                        progressEmitter.push({ percent, loaded, total });
                    },
                });
            } catch (error) {
                // The server warns rather than blocks: it hands back the nearby
                // reports so the reporter can confirm this is a different event.
                if (error.response?.status === 409 && error.response?.data?.code === 'POSSIBLE_DUPLICATE') {
                    // A deliberate refusal, not a delivery failure, so this copy
                    // must never be replayed on its own. The idempotency key
                    // survives, so the explicit "different incident" retry files
                    // exactly one report.
                    if (staged) await removeQueuedReport(staged.entry.clientReportId);
                    setDuplicateWarning({ duplicates: error.response.data.duplicates || [] });
                    return;
                }

                if (staged && isTransientSubmitFailure(error)) {
                    // Nothing reached the server, or an intermediary cut the
                    // upload. Release the in-flight lease so the queue may retry,
                    // and keep the stored copy — this is the interrupted submit.
                    await clearQueuedReportSending(staged.entry.clientReportId);
                    reportQueued(staged, 'signalLost');
                    return;
                }

                // Replaying a server-refused report would fail forever and bury
                // the real message, so the stored copy is dropped either way.
                if (staged) await removeQueuedReport(staged.entry.clientReportId);

                const serverMessage = error.response?.data?.message;
                if (serverMessage) {
                    toast.error(serverMessage);
                } else if (staged) {
                    toast.error('Failed to submit report');
                } else {
                    // Neither stored nor delivered: keep the reporter on this
                    // page with the form intact rather than navigating away from
                    // a report that is now nowhere.
                    toast.error(DEVICE_STORAGE_ERROR);
                }
                return;
            }

            // Delivered. The staged copy is dropped only after acknowledgement.
            pendingReportIdRef.current = null;
            if (staged) await removeQueuedReport(staged.entry.clientReportId);
            clearReportDraft();
            setDraftRestored(false);
            toast.success('Accident report submitted successfully!');
            navigate('/my-reports');
        } finally {
            try {
                removeOfflineAbort?.();
            } catch {
                // Listener cleanup is best-effort.
            }
            // Dropped, not flushed: a late emit would restore the progress bar
            // after the attempt has already ended.
            progressEmitter.cancel();
            setLoading(false);
            setDeviceSaved(false);
            setUploadProgress(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // The submit button only renders on the last step, but an Enter key in
        // any field submits the form too: advance the wizard instead of filing
        // an incomplete report from an earlier step.
        if (activeStep !== LAST_STEP) {
            handleContinue();
            return;
        }
        if (!validate()) {
            focusFirstInvalidField({ ...validateLocationStep(), ...validateDetailsStep() }, activeStep);
            return;
        }
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
        <div className="page-shell max-w-7xl space-y-5 md:pb-6">
            <PageHeader eyebrow="Incident reporting" title="Submit incident report" description="Pin the incident location and describe what happened. Fields marked with an asterisk (*) are required." />

            {draftRestored && (
                <div
                    role="status"
                    className="flex flex-col gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between dark:border-sky-700/50 dark:bg-sky-950/40 dark:text-sky-200"
                >
                    <p>Unfinished draft restored from this device. Photos are not stored in drafts — please re-attach them.</p>
                    <button
                        type="button"
                        onClick={handleDiscardDraft}
                        className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg px-3 text-xs font-semibold text-sky-900 underline-offset-4 hover:underline dark:text-sky-200"
                    >
                        Discard draft
                    </button>
                </div>
            )}

            {/* Guided four-step flow: one step visible at a time, inside a single
                flow container — stepper on top, a light divider, then the step
                content. The form owns all state, so Back/Continue never clears
                values, photos, or the location pin. Bottom padding on the page
                shell keeps this clear of the fixed mobile bottom navigation. */}
            <form
                ref={formTopRef}
                onSubmit={handleSubmit}
                noValidate
                className="mx-auto w-full max-w-[720px] scroll-mt-24"
            >
                {/* Screen-reader announcement for wizard step changes. */}
                <p aria-live="polite" className="sr-only">
                    Step {activeStep} of {LAST_STEP}: {STEPS[activeStep - 1]?.label}
                </p>

                <div className="surface-panel">
                    <StepIndicator activeStep={activeStep} />

                    <div aria-hidden="true" className="mx-4 mt-4 border-t border-[var(--border)] sm:mx-6" />

                    <div className="px-4 py-5 sm:px-6 sm:py-6">
                        {activeStep === 1 && (
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
                        )}

                        {activeStep >= 2 && (
                            <ReportDetailsPanel
                                step={activeStep}
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
                                uploadProgress={uploadProgress}
                                deviceSaved={deviceSaved}
                                isOffline={isOffline}
                            />
                        )}
                    </div>
                </div>

                <StepNav activeStep={activeStep} onBack={handleBack} onContinue={handleContinue} loading={loading} uploadProgress={uploadProgress} />
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
