import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../router';
import { useAuth } from '../context/AuthContext';
import { reportsAPI } from '../services/api';
import {
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCamera,
    HiOutlineCheck,
    HiOutlineCloudUpload,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineIdentification,
    HiOutlineLocationMarker,
    HiOutlineMail,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
    HiOutlineUser,
    HiOutlineX,
} from 'react-icons/hi';

const STEP_LABELS = ['Account', 'Identification', 'Face check'];
const FIELD_CLASS = 'block min-h-12 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';

const FieldError = ({ id, children }) => children ? (
    <p id={id} className="mt-1.5 text-xs font-medium text-red-600" role="alert">{children}</p>
) : null;

const RegisterPage = () => {
    const { register } = useAuth();
    const fileInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

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
    const [selfieBlob, setSelfieBlob] = useState(null);
    const [selfiePreview, setSelfiePreview] = useState(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [step, setStep] = useState(1);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
    }, []);

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
            videoRef.current.play().catch((error) => console.error('Video play error:', error));
        }
    }, [cameraActive]);

    useEffect(() => () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
    }, []);

    useEffect(() => () => {
        if (idPreview) URL.revokeObjectURL(idPreview);
    }, [idPreview]);

    useEffect(() => () => {
        if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    }, [selfiePreview]);

    const selectedBarangays = useMemo(() => {
        const municipality = municipalities.find((item) => item.name === formData.municipality);
        return municipality?.barangays || [];
    }, [formData.municipality, municipalities]);

    const startCamera = useCallback(async () => {
        setCameraError('');
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError('Camera access is not supported by this browser or connection.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
            streamRef.current = stream;
            setCameraActive(true);
        } catch (error) {
            console.error('Camera error:', error);
            setCameraError(error.name === 'NotAllowedError'
                ? 'Camera access was denied. Allow camera permission, then try again.'
                : 'The camera could not be opened. Check whether another app is using it.');
        }
    }, []);

    const captureSelfie = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0);
        context.setTransform(1, 0, 0, 1, 0, 0);

        canvas.toBlob((blob) => {
            if (!blob) return;
            if (selfiePreview) URL.revokeObjectURL(selfiePreview);
            setSelfieBlob(blob);
            setSelfiePreview(URL.createObjectURL(blob));
            setErrors((current) => ({ ...current, selfie: '' }));
            stopCamera();
        }, 'image/jpeg', 0.9);
    }, [selfiePreview, stopCamera]);

    const retakeSelfie = useCallback(() => {
        if (selfiePreview) URL.revokeObjectURL(selfiePreview);
        setSelfieBlob(null);
        setSelfiePreview(null);
        startCamera();
    }, [selfiePreview, startCamera]);

    const validate = () => {
        const nextErrors = {};
        if (step === 1) {
            if (!formData.name.trim()) nextErrors.name = 'Enter your full name.';
            if (!formData.email) nextErrors.email = 'Enter your email address.';
            else if (!/\S+@\S+\.\S+/.test(formData.email)) nextErrors.email = 'Enter a valid email address.';
            if (!formData.password) nextErrors.password = 'Create a password.';
            else if (formData.password.length < 6) nextErrors.password = 'Use at least 6 characters.';
            if (!formData.confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
            else if (formData.password !== formData.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
            if (!formData.municipality) nextErrors.municipality = 'Select your municipality.';
            if (!formData.barangay) nextErrors.barangay = 'Select your barangay.';
        }
        if (step === 2 && !idFile) nextErrors.idDocument = 'Upload a valid identification document.';
        if (step === 3 && !selfieBlob) nextErrors.selfie = 'Take a selfie before submitting.';
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
        const nextStep = step + 1;
        setStep(nextStep);
        setErrors({});
        if (nextStep === 3 && !selfieBlob) startCamera();
    };

    const handleBack = () => {
        if (step === 3) stopCamera();
        setErrors({});
        setStep((current) => Math.max(1, current - 1));
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            setErrors((current) => ({ ...current, idDocument: 'Use a JPG, PNG, WebP, or PDF file.' }));
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setErrors((current) => ({ ...current, idDocument: 'The file must be 10 MB or smaller.' }));
            return;
        }

        if (idPreview) URL.revokeObjectURL(idPreview);
        setIdFile(file);
        setIdPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
        setErrors((current) => ({ ...current, idDocument: '' }));
    };

    const removeFile = () => {
        if (idPreview) URL.revokeObjectURL(idPreview);
        setIdFile(null);
        setIdPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validate()) return;

        setLoading(true);
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

    const inputClass = (field) => `${FIELD_CLASS} ${errors[field] ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`;

    return (
        <div className="w-full py-2">
            <Link
                to="/login"
                className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-brand-700 hover:text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
                <HiOutlineArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to sign in
            </Link>

            <header className="mb-6">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                    <HiOutlineUser className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    Reporter registration
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-gray-950 sm:text-[2rem]">
                    Create your account
                </h1>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                    Register as a resident reporter. An administrator reviews your identity before report submission is enabled.
                </p>
            </header>

            <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Registration progress">
                {STEP_LABELS.map((label, index) => {
                    const number = index + 1;
                    const complete = step > number;
                    const active = step === number;
                    return (
                        <li key={label} aria-current={active ? 'step' : undefined}>
                            <div className={`h-1 rounded-full ${step >= number ? 'bg-brand-600' : 'bg-gray-200'}`} />
                            <div className="mt-2 flex items-center gap-2">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${complete || active ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-500'}`}>
                                    {complete ? <HiOutlineCheck className="h-3.5 w-3.5" aria-hidden="true" /> : number}
                                </span>
                                <span className={`hidden text-xs font-semibold min-[380px]:block ${active ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" noValidate>
                {step === 1 && (
                    <section aria-labelledby="account-step-title" className="space-y-4">
                        <div>
                            <h2 id="account-step-title" className="text-lg font-semibold text-gray-950">Account and home address</h2>
                            <p className="mt-1 text-sm text-gray-500">Use your current Sibuyan Island address.</p>
                        </div>

                        <div>
                            <label htmlFor="register-name" className="mb-1.5 block text-sm font-semibold text-gray-800">Full name</label>
                            <span className="relative block">
                                <HiOutlineUser className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                <input id="register-name" className={`${inputClass('name')} pl-12`} name="name" autoComplete="name" value={formData.name} onChange={handleChange} placeholder="Juan Dela Cruz" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />
                            </span>
                            <FieldError id="name-error">{errors.name}</FieldError>
                        </div>

                        <div>
                            <label htmlFor="register-email" className="mb-1.5 block text-sm font-semibold text-gray-800">Email address</label>
                            <span className="relative block">
                                <HiOutlineMail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                <input id="register-email" className={`${inputClass('email')} pl-12`} type="email" name="email" autoComplete="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
                            </span>
                            <FieldError id="email-error">{errors.email}</FieldError>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="register-password" className="mb-1.5 block text-sm font-semibold text-gray-800">Password</label>
                                <div className={`flex min-h-12 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 ${errors.password ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100' : 'border-gray-300 focus-within:border-brand-600 focus-within:ring-brand-100'}`}>
                                    <input id="register-password" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400" type={showPassword ? 'text' : 'password'} name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} placeholder="At least 6 characters" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : 'password-hint'} />
                                    <button type="button" onClick={() => setShowPassword((current) => !current)} className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        {showPassword ? <HiOutlineEyeOff className="h-5 w-5" aria-hidden="true" /> : <HiOutlineEye className="h-5 w-5" aria-hidden="true" />}
                                    </button>
                                </div>
                                {!errors.password && <p id="password-hint" className="mt-1.5 text-xs text-gray-500">Use at least 6 characters.</p>}
                                <FieldError id="password-error">{errors.password}</FieldError>
                            </div>

                            <div>
                                <label htmlFor="register-confirm-password" className="mb-1.5 block text-sm font-semibold text-gray-800">Confirm password</label>
                                <div className={`flex min-h-12 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 ${errors.confirmPassword ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100' : 'border-gray-300 focus-within:border-brand-600 focus-within:ring-brand-100'}`}>
                                    <input id="register-confirm-password" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400" type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} placeholder="Enter the same password again" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined} />
                                    <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                                        {showConfirmPassword ? <HiOutlineEyeOff className="h-5 w-5" aria-hidden="true" /> : <HiOutlineEye className="h-5 w-5" aria-hidden="true" />}
                                    </button>
                                </div>
                                <FieldError id="confirm-password-error">{errors.confirmPassword}</FieldError>
                            </div>
                        </div>

                        <fieldset>
                            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                                <HiOutlineLocationMarker className="h-4 w-4 text-brand-600" aria-hidden="true" />
                                Home address
                            </legend>
                            {locationsError && (
                                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="alert">
                                    <span>{locationsError}</span>
                                    <button type="button" onClick={loadLocations} className="min-h-9 shrink-0 rounded-lg border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100">Retry</button>
                                </div>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="register-municipality" className="mb-1.5 block text-xs font-medium text-gray-600">Municipality</label>
                                    <select id="register-municipality" className={inputClass('municipality')} name="municipality" value={formData.municipality} onChange={handleMunicipalityChange} disabled={locationsLoading || Boolean(locationsError)} aria-invalid={Boolean(errors.municipality)} aria-describedby={errors.municipality ? 'municipality-error' : undefined}>
                                        <option value="">{locationsLoading ? 'Loading locations…' : 'Select municipality'}</option>
                                        {municipalities.map((municipality) => <option key={municipality.name} value={municipality.name}>{municipality.name}</option>)}
                                    </select>
                                    <FieldError id="municipality-error">{errors.municipality}</FieldError>
                                </div>
                                <div>
                                    <label htmlFor="register-barangay" className="mb-1.5 block text-xs font-medium text-gray-600">Barangay</label>
                                    <select id="register-barangay" className={inputClass('barangay')} name="barangay" value={formData.barangay} onChange={handleChange} disabled={!formData.municipality || locationsLoading || Boolean(locationsError)} aria-invalid={Boolean(errors.barangay)} aria-describedby={errors.barangay ? 'barangay-error' : undefined}>
                                        <option value="">{formData.municipality ? 'Select barangay' : 'Select municipality first'}</option>
                                        {selectedBarangays.map((barangay) => <option key={barangay.name} value={barangay.name}>{barangay.name}</option>)}
                                    </select>
                                    <FieldError id="barangay-error">{errors.barangay}</FieldError>
                                </div>
                            </div>
                        </fieldset>

                        <button type="button" onClick={handleNext} disabled={locationsLoading || Boolean(locationsError)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                            Continue to identification
                            <HiOutlineArrowRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </section>
                )}

                {step === 2 && (
                    <section aria-labelledby="id-step-title" className="space-y-5">
                        <div>
                            <h2 id="id-step-title" className="text-lg font-semibold text-gray-950">Identification document</h2>
                            <p className="mt-1 text-sm leading-5 text-gray-500">Upload a clear government-issued or school ID for administrator review.</p>
                        </div>

                        {!idFile ? (
                            <button type="button" onClick={() => fileInputRef.current?.click()} className={`flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${errors.idDocument ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/40'}`}>
                                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                                    <HiOutlineCloudUpload className="h-6 w-6" aria-hidden="true" />
                                </span>
                                <span className="text-sm font-semibold text-gray-900">Choose an ID file</span>
                                <span className="mt-1 text-xs text-gray-500">JPG, PNG, WebP, or PDF · up to 10 MB</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
                                {idPreview ? <img src={idPreview} alt="Selected identification preview" className="h-16 w-16 shrink-0 rounded-xl border border-gray-200 object-cover" /> : (
                                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white text-gray-500 ring-1 ring-gray-200"><HiOutlineIdentification className="h-7 w-7" /></span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-gray-900">{idFile.name}</p>
                                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700"><HiOutlineCheck className="h-4 w-4" /> Ready to upload</p>
                                </div>
                                <button type="button" onClick={removeFile} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Remove selected identification file"><HiOutlineX className="h-5 w-5" /></button>
                            </div>
                        )}
                        <input ref={fileInputRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} />
                        <FieldError id="id-document-error">{errors.idDocument}</FieldError>

                        <div className="flex flex-col-reverse gap-3 sm:flex-row">
                            <button type="button" onClick={handleBack} className="min-h-12 flex-1 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Back</button>
                            <button type="button" onClick={handleNext} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">Continue <HiOutlineArrowRight className="h-5 w-5" /></button>
                        </div>
                    </section>
                )}

                {step === 3 && (
                    <section aria-labelledby="face-step-title" className="space-y-5">
                        <div>
                            <h2 id="face-step-title" className="text-lg font-semibold text-gray-950">Identity selfie</h2>
                            <p className="mt-1 text-sm leading-5 text-gray-500">Take a clear, front-facing photo so an administrator can compare it with your ID.</p>
                        </div>

                        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-gray-300 bg-gray-950">
                            {cameraActive && !selfiePreview && (
                                <>
                                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover [transform:scaleX(-1)]" />
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true"><div className="h-[72%] w-[58%] rounded-[50%] border-2 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" /></div>
                                    <p className="absolute left-4 right-4 top-4 rounded-lg bg-black/65 px-3 py-2 text-center text-xs font-medium text-white">Center your face inside the guide</p>
                                    <button type="button" onClick={captureSelfie} className="absolute bottom-4 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-brand-600 text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Capture selfie"><HiOutlineCamera className="h-6 w-6" /></button>
                                </>
                            )}
                            {selfiePreview && (
                                <>
                                    <img src={selfiePreview} alt="Captured identity selfie" className="h-full w-full object-cover" />
                                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white"><HiOutlineCheck className="h-4 w-4" /> Captured</span>
                                    <button type="button" onClick={retakeSelfie} className="absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><HiOutlineRefresh className="h-4 w-4" /> Retake</button>
                                </>
                            )}
                            {!cameraActive && !selfiePreview && (
                                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white"><HiOutlineCamera className="h-6 w-6" /></span>
                                    <p className={`text-sm font-medium ${cameraError ? 'text-red-300' : 'text-white'}`}>{cameraError || 'Camera is ready to start.'}</p>
                                    <button type="button" onClick={startCamera} className="mt-4 min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">{cameraError ? 'Try camera again' : 'Open camera'}</button>
                                </div>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                        <FieldError id="selfie-error">{errors.selfie}</FieldError>

                        <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <HiOutlineShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                            <p className="text-xs leading-5 text-gray-600">Your ID and selfie are private verification records. They are available only to authorized administrators and are not shown on public reports.</p>
                        </div>

                        {errors.form && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{errors.form}</div>}

                        <div className="flex flex-col-reverse gap-3 sm:flex-row">
                            <button type="button" onClick={handleBack} disabled={loading} className="min-h-12 flex-1 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50">Back</button>
                            <button type="submit" disabled={loading} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                                {loading ? 'Creating account…' : 'Submit for review'}
                            </button>
                        </div>
                    </section>
                )}
            </form>
        </div>
    );
};

export default RegisterPage;
