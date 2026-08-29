import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../router';
import { useAuth } from '../context/AuthContext';
import { isPasswordPolicyCompliant, PASSWORD_MIN_CHARACTERS, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import { reportsAPI } from '../services/api';
import { ID_IMAGE_ACCEPT, prepareIdentityImage, prepareVerificationImage } from '../utils/identityImage';
import { useSelfieFaceDetection } from '../hooks/useSelfieFaceDetection';
import {
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCamera,
    HiOutlineCheck,
    HiOutlineCloudUpload,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineMail,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
    HiOutlineUser,
    HiOutlineX,
} from 'react-icons/hi';

const REGISTRATION_STEPS = [
    {
        label: 'Account',
        title: 'Create your account',
        description: 'Register as a resident reporter. Your identity will be reviewed before incident reporting is enabled.',
    },
    {
        label: 'Government ID',
        title: 'Verify your identity',
        description: 'Submit a clear photo of your valid government-issued or accepted school ID.',
    },
    {
        label: 'Selfie verification',
        title: 'Take a verification selfie',
        description: 'Take a clear selfie so a municipal administrator can compare it with your ID.',
    },
];

const FIELD_CLASS = 'block h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-[#07130e] dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40 dark:disabled:bg-gray-900/50 dark:disabled:text-gray-600';

const FieldError = ({ id, children }) => children ? (
    <p id={id} className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{children}</p>
) : null;

const RegisterPage = () => {
    const { register } = useAuth();
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const selfieInputRef = useRef(null);
    const selfieConfirmButtonRef = useRef(null);
    const submitButtonRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const cameraRequestIdRef = useRef(0);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        municipality: '',
        barangay: '',
    });
    const [municipalities, setMunicipalities] = useState([]);
    const [locationsLoading, setLocationsLoading] = useState(true);
    const [locationsError, setLocationsError] = useState('');
    const [idFile, setIdFile] = useState(null);
    const [idPreview, setIdPreview] = useState(null);
    const [idSource, setIdSource] = useState(null);
    const [idPreparing, setIdPreparing] = useState(false);
    const [selfieBlob, setSelfieBlob] = useState(null);
    const [selfiePreview, setSelfiePreview] = useState(null);
    const [selfieSource, setSelfieSource] = useState(null);
    const [selfieAccepted, setSelfieAccepted] = useState(false);
    const [selfiePreparing, setSelfiePreparing] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraRequesting, setCameraRequesting] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [captureAnnouncement, setCaptureAnnouncement] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [step, setStep] = useState(1);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const currentStep = REGISTRATION_STEPS[step - 1];

    const stopCamera = useCallback(() => {
        cameraRequestIdRef.current += 1;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
    }, []);

    const captureSelfie = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
            setCameraError('The camera image is not ready yet. Wait a moment, then try again.');
            return;
        }
        if (Math.min(video.videoWidth, video.videoHeight) < 300
            || Math.max(video.videoWidth, video.videoHeight) < 480) {
            setCameraError('Camera resolution is too low. Choose a clearer selfie from your device.');
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            setCameraError('This browser could not capture the photo. Choose a selfie from your device.');
            return;
        }
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0);
        context.setTransform(1, 0, 0, 1, 0, 0);

        canvas.toBlob((blob) => {
            if (!blob) {
                setCameraError('The photo could not be captured. Try again.');
                return;
            }
            if (selfiePreview) URL.revokeObjectURL(selfiePreview);
            setSelfieBlob(blob);
            setSelfiePreview(URL.createObjectURL(blob));
            setSelfieSource('camera');
            setSelfieAccepted(false);
            setErrors((current) => ({ ...current, selfie: '' }));
            setCaptureAnnouncement('Selfie captured. Review the preview, then choose Use this photo.');
            stopCamera();
        }, 'image/jpeg', 0.9);
    }, [selfiePreview, stopCamera]);

    const {
        feedback: faceFeedback,
        guideState: faceGuideState,
        resetDetector,
    } = useSelfieFaceDetection({
        videoRef,
        cameraActive: cameraActive && !selfiePreview,
        onAutoCapture: captureSelfie,
    });

    const loadLocations = useCallback(async () => {
        setLocationsLoading(true);
        setLocationsError('');
        try {
            const response = await reportsAPI.getMunicipalities();
            const records = response.data?.data;
            if (!Array.isArray(records) || records.length === 0) {
                throw new Error('No municipality records returned');
            }
            setMunicipalities(records);
        } catch (error) {
            console.error('Unable to load registration locations:', error);
            setLocationsError('Municipality and barangay options could not be loaded.');
        } finally {
            setLocationsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadLocations();
    }, [loadLocations]);

    useEffect(() => {
        if (cameraActive && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
            videoRef.current.srcObject = streamRef.current;
            const playPromise = videoRef.current.play?.();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error) => {
                    console.error('Video play error:', error);
                    setCameraError('The camera preview could not start. Try again or choose a selfie from your device.');
                    stopCamera();
                });
            }
        }
    }, [cameraActive, stopCamera]);

    useEffect(() => () => {
        resetDetector();
        stopCamera();
    }, [resetDetector, stopCamera]);

    useEffect(() => () => {
        if (idPreview) URL.revokeObjectURL(idPreview);
    }, [idPreview]);

    useEffect(() => () => {
        if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    }, [selfiePreview]);

    useEffect(() => {
        if (!selfiePreview || selfieAccepted) return undefined;
        const frame = requestAnimationFrame(() => selfieConfirmButtonRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [selfieAccepted, selfiePreview]);

    const selectedBarangays = useMemo(() => {
        const municipality = municipalities.find((item) => item.name === formData.municipality);
        return municipality?.barangays || [];
    }, [formData.municipality, municipalities]);

    const startCamera = useCallback(async () => {
        resetDetector();
        setCameraError('');
        setCaptureAnnouncement('Requesting camera access.');
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError('Camera access is not supported by this browser or connection.');
            setCaptureAnnouncement('Camera is unavailable. Choose a selfie from your device instead.');
            return;
        }
        setCameraRequesting(true);
        const requestId = ++cameraRequestIdRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
            if (requestId !== cameraRequestIdRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            setCameraActive(true);
            setCaptureAnnouncement('Camera is live. Center your face, then hold still to capture.');
        } catch (error) {
            if (requestId !== cameraRequestIdRef.current) return;
            console.error('Camera error:', error);
            const messages = {
                NotAllowedError: 'Camera access was denied. Allow camera permission, then try again.',
                NotFoundError: 'No camera was found on this device.',
                NotReadableError: 'The camera is being used by another application.',
            };
            setCameraError(messages[error.name] || 'The camera could not be opened. Try again or choose a selfie from your device.');
            setCaptureAnnouncement('Camera could not be opened.');
        } finally {
            if (requestId === cameraRequestIdRef.current) setCameraRequesting(false);
        }
    }, [resetDetector]);

    const retakeSelfie = useCallback(() => {
        const previousSource = selfieSource;
        resetDetector();
        if (selfiePreview) URL.revokeObjectURL(selfiePreview);
        setSelfieBlob(null);
        setSelfiePreview(null);
        setSelfieSource(null);
        setSelfieAccepted(false);
        if (previousSource === 'device' && selfieInputRef.current) {
            selfieInputRef.current.value = '';
            selfieInputRef.current.click();
        } else {
            startCamera();
        }
    }, [resetDetector, selfiePreview, selfieSource, startCamera]);

    const acceptSelfie = () => {
        if (!selfieBlob) return;
        setSelfieAccepted(true);
        setErrors((current) => ({ ...current, selfie: '', form: '' }));
        setCaptureAnnouncement('Selfie accepted and ready for secure submission.');
        requestAnimationFrame(() => submitButtonRef.current?.focus());
    };

    const handleSelfieFileChange = async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        setSelfiePreparing(true);
        setCameraError('');
        setErrors((current) => ({ ...current, selfie: '', form: '' }));
        try {
            const prepared = await prepareVerificationImage(file, {
                subject: 'selfie',
                fallbackName: 'selfie',
            });
            stopCamera();
            if (selfiePreview) URL.revokeObjectURL(selfiePreview);
            setSelfieBlob(prepared.file);
            setSelfiePreview(URL.createObjectURL(prepared.file));
            setSelfieSource('device');
            setSelfieAccepted(false);
            setCaptureAnnouncement('Selfie selected. Review the preview, then choose Use this photo.');
        } catch (error) {
            input.value = '';
            setErrors((current) => ({
                ...current,
                selfie: error.message || 'The selfie could not be prepared.',
            }));
        } finally {
            setSelfiePreparing(false);
        }
    };

    const openSelfiePicker = () => {
        if (!selfieInputRef.current) return;
        selfieInputRef.current.value = '';
        selfieInputRef.current.click();
    };

    const validate = () => {
        const nextErrors = {};
        if (step === 1) {
            if (!formData.name.trim()) nextErrors.name = 'Enter your full name.';
            if (!formData.email) nextErrors.email = 'Enter your email address.';
            else if (!/\S+@\S+\.\S+/.test(formData.email)) nextErrors.email = 'Enter a valid email address.';
            if (!formData.password) nextErrors.password = 'Create a password.';
            else if (!isPasswordPolicyCompliant(formData.password)) nextErrors.password = PASSWORD_POLICY_MESSAGE;
            if (!formData.confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
            else if (formData.password !== formData.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
            if (!formData.municipality) nextErrors.municipality = 'Select your municipality.';
            if (!formData.barangay) nextErrors.barangay = 'Select your barangay.';
        }
        if (step === 2 && !idFile) nextErrors.idDocument = 'Upload a valid identification document.';
        if (step === 3 && (!selfieBlob || !selfieAccepted)) {
            nextErrors.selfie = selfieBlob
                ? 'Review the selfie and select Use this photo before submitting.'
                : 'Take or choose a selfie before submitting.';
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((current) => ({ ...current, [name]: value }));
        setErrors((current) => ({ ...current, [name]: '', form: '' }));
    };

    const handleMunicipalityChange = (event) => {
        setFormData((current) => ({
            ...current,
            municipality: event.target.value,
            barangay: '',
        }));
        setErrors((current) => ({ ...current, municipality: '', barangay: '', form: '' }));
    };

    const handleNext = () => {
        if (!validate()) return;
        setStep(step + 1);
        setErrors({});
    };

    const handleBack = () => {
        if (step === 3) stopCamera();
        setErrors({});
        setStep((current) => Math.max(1, current - 1));
    };

    const handleFileChange = async (event, source) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        setIdPreparing(true);
        setErrors((current) => ({ ...current, idDocument: '', form: '' }));
        try {
            const prepared = await prepareIdentityImage(file);
            if (idPreview) URL.revokeObjectURL(idPreview);
            setIdFile(prepared.file);
            setIdPreview(URL.createObjectURL(prepared.file));
            setIdSource(source);
        } catch (error) {
            input.value = '';
            setErrors((current) => ({
                ...current,
                idDocument: error.message || 'The ID photo could not be prepared.',
            }));
        } finally {
            setIdPreparing(false);
        }
    };

    const removeFile = () => {
        if (idPreview) URL.revokeObjectURL(idPreview);
        setIdFile(null);
        setIdPreview(null);
        setIdSource(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const openIdPicker = (inputRef) => {
        if (!inputRef.current) return;
        inputRef.current.value = '';
        inputRef.current.click();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (loading) return;
        if (!validate()) return;

        setLoading(true);
        stopCamera();
        setErrors({});
        const submitData = new FormData();
        submitData.append('name', formData.name.trim());
        submitData.append('email', formData.email.trim());
        submitData.append('password', formData.password);
        submitData.append('municipality', formData.municipality);
        submitData.append('barangay', formData.barangay);
        submitData.append('idDocument', idFile);
        submitData.append('selfiePhoto', new File([selfieBlob], 'selfie.jpg', { type: 'image/jpeg' }));

        try {
            const result = await register(submitData);
            if (!result?.success) {
                setErrors({ form: result?.message || 'Registration could not be completed.' });
            }
        } catch (error) {
            console.error('Registration error:', error);
            setErrors({ form: 'Registration could not be completed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const inputClass = (field) => `${FIELD_CLASS} ${errors[field] ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950/40' : ''}`;

    return (
        <div className="w-full py-2">
            {/* Mobile Brand Header */}
            <div className="mb-5 flex items-center gap-2.5 lg:hidden">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-2xs dark:border-white/10 dark:bg-white/10">
                    <img src="/icons/Alert.png" alt="" className="h-full w-full object-contain" />
                </div>
                <div>
                    <p className="font-display text-base font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
                        Sibuyan <span className="text-emerald-700 dark:text-emerald-400">Alert</span>
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        Accident Alert &amp; Mapping System
                    </p>
                </div>
            </div>

            {/* Back to login */}
            <Link
                to="/login"
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
                <HiOutlineArrowLeft className="h-4 w-4" /> Back to login
            </Link>

            {/* Step Header */}
            <header className="mb-5">
                <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                    {currentStep.title}
                </h1>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 sm:text-sm leading-relaxed">
                    {currentStep.description}
                </p>
            </header>

            {/* Linear-Style Segmented Progress Indicator */}
            <p className="sr-only" aria-live="polite">{`Step ${step} of ${REGISTRATION_STEPS.length}: ${currentStep.label}`}</p>
            <div className="mb-6 border-b border-gray-200/80 pb-4 dark:border-white/10" aria-label="Registration progress">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                        Step {step} of {REGISTRATION_STEPS.length}: {currentStep.label}
                    </p>
                    <span className="font-mono text-xs font-semibold text-gray-400 dark:text-gray-500">
                        {Math.round((step / REGISTRATION_STEPS.length) * 100)}%
                    </span>
                </div>
                {/* Segmented bar */}
                <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
                    {REGISTRATION_STEPS.map((s, idx) => (
                        <div
                            key={s.label}
                            className={`h-1.5 rounded-full transition-all duration-300 ${idx + 1 <= step
                                ? 'bg-emerald-700 dark:bg-emerald-500'
                                : 'bg-gray-200 dark:bg-white/10'
                            }`}
                        />
                    ))}
                </div>
            </div>

            {/* Main Form Container */}
            <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90 sm:p-7" noValidate>
                {step === 1 && (
                    <section aria-labelledby="account-step-title" className="space-y-4">
                        <div className="border-b border-gray-200/80 pb-2.5 dark:border-white/10">
                            <h2 id="account-step-title" className="font-display text-base font-bold text-gray-950 dark:text-white">Account Information</h2>
                        </div>

                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <div>
                                <label htmlFor="register-name" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Full name</label>
                                <span className="relative block">
                                    <HiOutlineUser className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                    <input id="register-name" className={`${inputClass('name')} pl-10`} name="name" autoComplete="name" value={formData.name} onChange={handleChange} placeholder="Juan Dela Cruz" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />
                                </span>
                                <FieldError id="name-error">{errors.name}</FieldError>
                            </div>

                            <div>
                                <label htmlFor="register-email" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Email address</label>
                                <span className="relative block">
                                    <HiOutlineMail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                    <input id="register-email" className={`${inputClass('email')} pl-10`} type="email" name="email" autoComplete="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
                                </span>
                                <FieldError id="email-error">{errors.email}</FieldError>
                            </div>
                        </div>

                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <div>
                                <label htmlFor="register-password" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Password</label>
                                <div className={`flex h-11 items-center overflow-hidden rounded-lg border bg-white dark:bg-[#07130e] transition ${errors.password ? 'border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100 dark:focus-within:ring-red-950/40' : 'border-gray-300 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-gray-700 dark:focus-within:border-emerald-500'}`}>
                                    <input id="register-password" className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-gray-900 dark:text-white outline-none placeholder:text-gray-400" type={showPassword ? 'text' : 'password'} name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} placeholder={`At least ${PASSWORD_MIN_CHARACTERS} characters`} minLength={PASSWORD_MIN_CHARACTERS} maxLength={72} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : 'password-hint'} />
                                    <button type="button" onClick={() => setShowPassword((current) => !current)} className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md dark:hover:text-gray-300" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        {showPassword ? <HiOutlineEyeOff className="h-4.5 w-4.5" aria-hidden="true" /> : <HiOutlineEye className="h-4.5 w-4.5" aria-hidden="true" />}
                                    </button>
                                </div>
                                <p id="password-hint" className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{`Use a unique password with at least ${PASSWORD_MIN_CHARACTERS} characters.`}</p>
                                <FieldError id="password-error">{errors.password}</FieldError>
                            </div>

                            <div>
                                <label htmlFor="register-confirm-password" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Confirm password</label>
                                <div className={`flex h-11 items-center overflow-hidden rounded-lg border bg-white dark:bg-[#07130e] transition ${errors.confirmPassword ? 'border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100 dark:focus-within:ring-red-950/40' : 'border-gray-300 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-gray-700 dark:focus-within:border-emerald-500'}`}>
                                    <input id="register-confirm-password" className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-gray-900 dark:text-white outline-none placeholder:text-gray-400" type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} placeholder="Enter the same password again" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined} />
                                    <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md dark:hover:text-gray-300" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                                        {showConfirmPassword ? <HiOutlineEyeOff className="h-4.5 w-4.5" aria-hidden="true" /> : <HiOutlineEye className="h-4.5 w-4.5" aria-hidden="true" />}
                                    </button>
                                </div>
                                <FieldError id="confirm-password-error">{errors.confirmPassword}</FieldError>
                            </div>
                        </div>

                        <fieldset className="pt-4">
                            <div className="mb-3 border-b border-gray-200/80 pb-2.5 dark:border-white/10">
                                <legend className="font-display text-base font-bold text-gray-950 dark:text-white">Home Address</legend>
                            </div>
                            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Use your current Sibuyan Island address.</p>
                            {locationsError && (
                                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
                                    <span>{locationsError}</span>
                                    <button type="button" onClick={loadLocations} className="min-h-8 shrink-0 rounded-md border border-amber-300 bg-white px-2.5 font-semibold hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/60 dark:hover:bg-amber-900">Retry</button>
                                </div>
                            )}
                            <div className="grid gap-3.5 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="register-municipality" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Municipality</label>
                                    <select id="register-municipality" className={inputClass('municipality')} name="municipality" value={formData.municipality} onChange={handleMunicipalityChange} disabled={locationsLoading || Boolean(locationsError)} aria-invalid={Boolean(errors.municipality)} aria-describedby={errors.municipality ? 'municipality-error' : undefined}>
                                        <option value="">{locationsLoading ? 'Loading locations…' : 'Select municipality'}</option>
                                        {municipalities.map((municipality) => <option key={municipality.name} value={municipality.name}>{municipality.name}</option>)}
                                    </select>
                                    <FieldError id="municipality-error">{errors.municipality}</FieldError>
                                </div>
                                <div>
                                    <label htmlFor="register-barangay" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Barangay</label>
                                    <select id="register-barangay" className={inputClass('barangay')} name="barangay" value={formData.barangay} onChange={handleChange} disabled={!formData.municipality || locationsLoading || Boolean(locationsError)} aria-invalid={Boolean(errors.barangay)} aria-describedby={errors.barangay ? 'barangay-error' : undefined}>
                                        <option value="">{formData.municipality ? 'Select barangay' : 'Select municipality first'}</option>
                                        {selectedBarangays.map((barangay) => <option key={barangay.name} value={barangay.name}>{barangay.name}</option>)}
                                    </select>
                                    <FieldError id="barangay-error">{errors.barangay}</FieldError>
                                </div>
                            </div>
                        </fieldset>

                        <div className="pt-2">
                            <button type="button" onClick={handleNext} disabled={locationsLoading || Boolean(locationsError)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                Continue to ID Upload <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    </section>
                )}

                {step === 2 && (
                    <section aria-labelledby="id-step-title" className="space-y-4">
                        <div>
                            <h2 id="id-step-title" className="font-display text-base font-bold text-gray-950 dark:text-white">Upload your ID</h2>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Take or upload a clear photo of a valid government-issued or school ID.</p>
                        </div>

                        <div className="border-y border-gray-200/80 py-3.5 dark:border-white/10">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Before you continue</p>
                            <ul className="mt-2.5 grid gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                                {['Show the entire ID and all four corners', 'Make sure the name and details are readable', 'Avoid blur, glare, shadows, and reflections', 'Use your own valid government or school ID'].map((item) => (
                                    <li key={item} className="flex items-start gap-2">
                                        <HiOutlineCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {!idFile ? (
                            <div className={errors.idDocument ? 'border-l-2 border-red-400 pl-3' : ''}>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <button type="button" onClick={() => openIdPicker(cameraInputRef)} disabled={idPreparing} className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-gray-200/80 bg-white p-4 text-center text-gray-900 shadow-2xs transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-[#07130e] dark:text-white dark:hover:border-emerald-500/40 dark:hover:bg-emerald-950/20">
                                        <HiOutlineCamera className="mb-1.5 h-5 w-5 text-brand-700 dark:text-emerald-400" aria-hidden="true" />
                                        <span className="text-xs sm:text-sm font-semibold">Take a photo</span>
                                        <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Use your rear camera</span>
                                    </button>
                                    <button type="button" onClick={() => openIdPicker(fileInputRef)} disabled={idPreparing} className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-gray-200/80 bg-white p-4 text-center text-gray-900 shadow-2xs transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-[#07130e] dark:text-white dark:hover:border-emerald-500/40 dark:hover:bg-emerald-950/20">
                                        <HiOutlineCloudUpload className="mb-1.5 h-5 w-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
                                        <span className="text-xs sm:text-sm font-semibold">Choose from device</span>
                                        <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Select an existing photo</span>
                                    </button>
                                </div>
                                <p className="mt-2.5 text-center text-xs text-gray-500 dark:text-gray-400">JPG, PNG, or WebP · maximum 5 MB</p>
                                {idPreparing && <p className="mt-2 text-center text-xs font-medium text-brand-700 dark:text-emerald-400" role="status">Preparing your ID photo…</p>}
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-brand-200 bg-brand-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                <div className="aspect-[8/5] bg-gray-100 dark:bg-gray-900/60 p-3 sm:p-4">
                                    <img src={idPreview} alt="Selected identification preview" className="h-full w-full rounded-lg object-contain" />
                                </div>
                                <div className="flex flex-col gap-3 border-t border-brand-200/80 dark:border-emerald-900/40 p-3.5 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{idFile.name}</p>
                                        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-emerald-400"><HiOutlineCheck className="h-3.5 w-3.5" /> Ready for secure upload</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 sm:flex">
                                        <button type="button" onClick={() => openIdPicker(idSource === 'camera' ? cameraInputRef : fileInputRef)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                                            <HiOutlineRefresh className="h-3.5 w-3.5" aria-hidden="true" /> {idSource === 'camera' ? 'Retake' : 'Replace'}
                                        </button>
                                        <button type="button" onClick={removeFile} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60">
                                            <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <input ref={cameraInputRef} type="file" className="sr-only" accept={ID_IMAGE_ACCEPT} capture="environment" onChange={(event) => handleFileChange(event, 'camera')} aria-label="Take an ID photo" />
                        <input ref={fileInputRef} type="file" className="sr-only" accept={ID_IMAGE_ACCEPT} onChange={(event) => handleFileChange(event, 'device')} aria-label="Choose an ID photo from device" />
                        <FieldError id="id-document-error">{errors.idDocument}</FieldError>

                        <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-3.5 dark:border-gray-800 dark:bg-[#07130e]">
                            <div className="flex gap-2.5">
                                <HiOutlineShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-700 dark:text-emerald-400" aria-hidden="true" />
                                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                                    Your files are encrypted in transit, stored securely as a private verification record, and never shown on public reports.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
                            <button type="button" onClick={handleBack} className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Back</button>
                            <button type="button" onClick={handleNext} disabled={idPreparing || !idFile} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                Continue to Selfie <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    </section>
                )}

                {step === 3 && (
                    <section aria-labelledby="face-step-title" className="space-y-4">
                        <div>
                            <h2 id="face-step-title" className="font-display text-base font-bold text-gray-950 dark:text-white">Camera preview</h2>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Center your full face inside the guide and make sure the photo is clear.</p>
                        </div>

                        {!cameraActive && !selfiePreview && (
                            <div className="border-y border-gray-200/80 py-3.5 dark:border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Before you continue</p>
                                <ul className="mt-2.5 grid gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                                    {['Face the camera directly', 'Use a well-lit area', 'Remove masks, caps, and tinted glasses', 'Make sure only you are visible'].map((item) => (
                                        <li key={item} className="flex items-start gap-2">
                                            <HiOutlineCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="overflow-hidden rounded-2xl border border-gray-300/80 bg-gray-950 dark:border-gray-700">
                            <div className="relative aspect-[4/3] overflow-hidden">
                                {cameraActive && !selfiePreview && (
                                    <>
                                        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover [transform:scaleX(-1)]" />
                                        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
                                            <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" /> Camera is live
                                        </span>
                                        <button
                                            type="button"
                                            onClick={stopCamera}
                                            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-all hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                            aria-label="Close camera"
                                        >
                                            <HiOutlineX className="h-4 w-4" />
                                        </button>
                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                                            <div
                                                className={`relative h-[80%] aspect-[3/4] max-w-[66%] rounded-[50%] transition-all duration-200 ${
                                                    faceGuideState === 'capturing'
                                                        ? 'border-4 border-white bg-white/30 scale-105 shadow-[0_0_30px_rgba(255,255,255,0.9)]'
                                                        : faceGuideState === 'aligned'
                                                            ? 'border-3 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.7)]'
                                                            : faceGuideState === 'warning'
                                                                ? 'border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                                                                : 'border-2 border-white/75 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]'
                                                }`}
                                            >
                                                <div className={`absolute inset-0 rounded-[50%] transition-opacity duration-200 ${faceGuideState === 'aligned' ? 'opacity-100 ring-2 ring-emerald-300/40' : 'opacity-0'}`} />
                                            </div>
                                        </div>
                                        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
                                            <div className={`inline-flex items-center gap-2 rounded-full backdrop-blur-md px-4 py-1.5 text-center text-xs font-semibold shadow-lg transition-all duration-200 ${
                                                faceGuideState === 'capturing'
                                                    ? 'bg-emerald-600 text-white shadow-emerald-950/50'
                                                    : faceGuideState === 'aligned'
                                                        ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/50 shadow-emerald-950/50'
                                                        : faceGuideState === 'warning'
                                                            ? 'bg-amber-950/90 text-amber-200 border border-amber-500/50'
                                                            : 'bg-black/75 text-white border border-white/15'
                                            }`}>
                                                {faceGuideState === 'aligned' && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                                                {faceGuideState === 'warning' && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                                                <span>{faceFeedback || 'Position your face inside the guide'}</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {selfiePreview && (
                                    <>
                                        <img src={selfiePreview} alt="Verification selfie preview" className="h-full w-full object-cover" />
                                        <span className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${selfieAccepted ? 'bg-brand-700' : 'bg-gray-800/85'}`}><HiOutlineCheck className="h-3.5 w-3.5" /> {selfieAccepted ? 'Ready to submit' : 'Review photo'}</span>
                                    </>
                                )}
                                {!cameraActive && !selfiePreview && (
                                    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                                        <span className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white"><HiOutlineCamera className="h-5 w-5" /></span>
                                        <p className={`max-w-xs text-xs sm:text-sm font-medium ${cameraError ? 'text-red-300' : 'text-white'}`}>{cameraError || 'Open the camera when you are ready.'}</p>
                                    </div>
                                )}
                            </div>

                            {(!cameraActive || selfiePreview) && (
                                <div className="border-t border-white/10 bg-gray-900 p-3">
                                    {selfiePreview && !selfieAccepted && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <button type="button" onClick={retakeSelfie} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs sm:text-sm font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"><HiOutlineRefresh className="h-4 w-4" /> {selfieSource === 'device' ? 'Choose another' : 'Retake'}</button>
                                            <button ref={selfieConfirmButtonRef} type="button" onClick={acceptSelfie} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 text-xs sm:text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"><HiOutlineCheck className="h-4 w-4" /> Use this photo</button>
                                        </div>
                                    )}
                                    {selfiePreview && selfieAccepted && (
                                        <button type="button" onClick={retakeSelfie} className="mx-auto inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs sm:text-sm font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"><HiOutlineRefresh className="h-4 w-4" /> {selfieSource === 'device' ? 'Choose another photo' : 'Retake photo'}</button>
                                    )}
                                    {!cameraActive && !selfiePreview && (
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <button type="button" onClick={startCamera} disabled={cameraRequesting || selfiePreparing} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-xs sm:text-sm font-semibold text-gray-950 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-wait disabled:opacity-60"><HiOutlineCamera className="h-4 w-4" /> {cameraRequesting ? 'Requesting camera…' : cameraError ? 'Try camera again' : 'Open camera'}</button>
                                            <button type="button" onClick={openSelfiePicker} disabled={cameraRequesting || selfiePreparing} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs sm:text-sm font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-60"><HiOutlineCloudUpload className="h-4 w-4" /> {selfiePreparing ? 'Preparing photo…' : 'Choose from device'}</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                        <input ref={selfieInputRef} type="file" className="sr-only" accept={ID_IMAGE_ACCEPT} onChange={handleSelfieFileChange} aria-label="Choose a verification selfie from device" />
                        <p className="sr-only" role="status" aria-live="polite">{captureAnnouncement}</p>
                        <FieldError id="selfie-error">{errors.selfie}</FieldError>

                        <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-3.5 dark:border-gray-800 dark:bg-[#07130e]">
                            <div className="flex gap-2.5">
                                <HiOutlineShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-700 dark:text-emerald-400" aria-hidden="true" />
                                <div className="min-w-0 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                                    <p>Your files are encrypted in transit, stored securely as a private verification record, and never shown on public reports.</p>
                                    <details className="mt-2.5">
                                        <summary className="cursor-pointer font-semibold text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-emerald-400">How verification photos are handled</summary>
                                        <div className="mt-2.5 space-y-1.5 border-t border-gray-200/80 pt-2 text-[11px] dark:border-gray-800">
                                            <p><strong className="font-semibold text-gray-800 dark:text-gray-200">Purpose:</strong> manual identity comparison before reporter access is approved.</p>
                                            <p><strong className="font-semibold text-gray-800 dark:text-gray-200">Visibility:</strong> never displayed on public reports and never shared with responders.</p>
                                            <p><strong className="font-semibold text-gray-800 dark:text-gray-200">Retention:</strong> stored with the account until removed through the authorized account-record process. Contact your municipal administrator to request correction or deletion.</p>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </div>

                        {errors.form && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">{errors.form}</div>}

                        <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
                            <button type="button" onClick={handleBack} disabled={loading} className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Back</button>
                            <button ref={submitButtonRef} type="submit" disabled={loading || !selfieAccepted} aria-disabled={loading || !selfieAccepted} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                {loading ? 'Submitting securely…' : selfieAccepted ? 'Submit for municipal review' : 'Confirm your selfie to continue'}
                            </button>
                        </div>
                    </section>
                )}
            </form>
        </div>
    );
};

export default RegisterPage;
