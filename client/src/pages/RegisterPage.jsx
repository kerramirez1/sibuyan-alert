import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import {
    HiOutlineMail,
    HiOutlineLockClosed,
    HiOutlineUser,
    HiOutlineIdentification,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCloudUpload,
    HiOutlineLocationMarker,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineCamera,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
} from 'react-icons/hi';

const MUNICIPALITIES_DATA = {
    'Cajidiocan': ['Alibagon', 'Cambajao', 'Cambalo', 'Cambijang', 'Cantagda', 'Danao Norte', 'Danao Sur', 'Lico', 'Lumbang Este', 'Lumbang Weste', 'Marigondon Norte', 'Marigondon Sur', 'Poblacion', 'Sugod', 'Taguilos'],
    'Magdiwang': ['Agsao', 'Agutay', 'Ambulong', 'Dulangan', 'Ipil', 'Jao-asan', 'Poblacion', 'Silum', 'Tampayan'],
    'San Fernando': ['Azagra', 'Butong', 'Cabugao', 'Catmon', 'Lambingan', 'Mabolo', 'Otod', 'Pili', 'Poblacion', 'San Isidro', 'Taclobo', 'Tuburan'],
};

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
    const [idFile, setIdFile] = useState(null);
    const [idPreview, setIdPreview] = useState(null);
    const [selfieBlob, setSelfieBlob] = useState(null);
    const [selfiePreview, setSelfiePreview] = useState(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [step, setStep] = useState(1);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Cleanup camera on unmount
    useEffect(() => {
        return () => stopCamera();
    }, []);

    // Attach stream to video element once cameraActive causes it to mount
    useEffect(() => {
        if (cameraActive && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(err => console.error('Video play error:', err));
        }
    }, [cameraActive]);

    const startCamera = useCallback(async () => {
        setCameraError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
            streamRef.current = stream;
            // Set cameraActive to mount the <video> element first,
            // then the useEffect above will attach the stream
            setCameraActive(true);
        } catch (err) {
            console.error('Camera error:', err);
            setCameraError(
                err.name === 'NotAllowedError'
                    ? 'Camera access denied. Please allow camera permissions.'
                    : 'Could not access camera. Please check your device.'
            );
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
    }, []);

    const captureSelfie = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        // Mirror the selfie horizontally for natural look
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                setSelfieBlob(blob);
                setSelfiePreview(URL.createObjectURL(blob));
                stopCamera();
            }
        }, 'image/jpeg', 0.9);
    }, [stopCamera]);

    const retakeSelfie = useCallback(() => {
        if (selfiePreview) URL.revokeObjectURL(selfiePreview);
        setSelfieBlob(null);
        setSelfiePreview(null);
        startCamera();
    }, [selfiePreview, startCamera]);

    const validate = () => {
        const newErrors = {};

        if (step === 1) {
            if (!formData.name.trim()) newErrors.name = 'Full Name is required';
            if (!formData.email) {
                newErrors.email = 'Email is required';
            } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
                newErrors.email = 'Please enter a valid email';
            }
            if (!formData.password) {
                newErrors.password = 'Password is required';
            } else if (formData.password.length < 6) {
                newErrors.password = 'Password must be at least 6 characters';
            }
            if (formData.password !== formData.confirmPassword) {
                newErrors.confirmPassword = 'Passwords do not match';
            }
            if (!formData.municipality) {
                newErrors.municipality = 'Municipality is required';
            }
            if (!formData.barangay) {
                newErrors.barangay = 'Barangay is required';
            }
        }

        if (step === 2) {
            if (!idFile) {
                newErrors.idDocument = 'Proof of identification is required.';
            }
        }

        if (step === 3) {
            if (!selfieBlob) {
                newErrors.selfie = 'A selfie photo is required for face verification.';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validate()) {
            const nextStep = step + 1;
            setStep(nextStep);
            // Auto-start camera when entering selfie step
            if (nextStep === 3 && !selfieBlob) {
                setTimeout(() => startCamera(), 400);
            }
        }
    };

    const handleBack = () => {
        if (step === 3) stopCamera();
        setStep(step - 1);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setLoading(true);
        const submitData = new FormData();
        submitData.append('name', formData.name);
        submitData.append('email', formData.email);
        submitData.append('password', formData.password);
        submitData.append('municipality', formData.municipality);
        submitData.append('address', `${formData.barangay}, ${formData.municipality}, Sibuyan Island, Romblon`);
        submitData.append('idDocument', idFile);

        // Append selfie as a file
        if (selfieBlob) {
            const selfieFile = new File([selfieBlob], 'selfie.jpg', { type: 'image/jpeg' });
            submitData.append('selfiePhoto', selfieFile);
        }

        try {
            await register(submitData);
        } catch (err) {
            console.error(err);
            setErrors({ form: 'Registration failed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: '' });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
            if (!allowedTypes.includes(file.type)) {
                setErrors({ ...errors, idDocument: 'Only images (JPG, PNG) or PDF allowed' });
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                setErrors({ ...errors, idDocument: 'File too large (Max 10MB)' });
                return;
            }

            setIdFile(file);
            setErrors({ ...errors, idDocument: '' });

            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => setIdPreview(e.target.result);
                reader.readAsDataURL(file);
            } else {
                setIdPreview(null);
            }
        }
    };

    const removeFile = (e) => {
        e.stopPropagation();
        setIdFile(null);
        setIdPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const stepLabels = ['Account Info', 'Upload ID', 'Face Verify'];

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-bold transition-all mb-6 group hover:gap-3">
                    <HiOutlineArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    ← Back to Login
                </Link>
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/40 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                    <HiOutlineUser className="w-10 h-10 text-white relative z-10" />
                </div>
                <h2 className="text-4xl font-display font-black bg-gradient-to-r from-gray-900 via-emerald-700 to-green-600 bg-clip-text text-transparent mb-2">
                    Create Account
                </h2>
                <p className="text-gray-600 text-base font-medium">
                    Join the network as a <span className="text-emerald-600 font-bold">verified reporter</span>
                </p>
            </div>

            {/* Progress Indicators - 3 Steps */}
            <div className="flex items-center gap-2 mb-8">
                {[1, 2, 3].map((s, idx) => (
                    <div key={s} className="flex-1 flex items-center gap-2">
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm transition-all duration-300 ${step > s
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-xl shadow-emerald-500/40 scale-110'
                            : step === s
                                ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-xl shadow-emerald-500/40 ring-4 ring-emerald-200 scale-110'
                                : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
                            }`}>
                            {step > s ? <HiOutlineCheck className="w-5 h-5" /> : s}
                        </motion.div>
                        {idx < 2 && (
                            <div className={`flex-1 h-2 rounded-full transition-all duration-500 ${step > s ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30' : 'bg-gray-200'}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Labels */}
            <div className="flex justify-between mb-8 px-1">
                {stepLabels.map((label, idx) => (
                    <span key={label} className={`text-xs font-black uppercase tracking-wider transition-colors ${step === idx + 1 ? 'text-emerald-600' : step > idx + 1 ? 'text-emerald-500' : 'text-gray-400'}`}>
                        {label}
                    </span>
                ))}
            </div>

            <form onSubmit={handleSubmit}>
                <AnimatePresence mode="wait">
                    {/* ==================== STEP 1: Account Info ==================== */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <Input label="Full Name" name="name" placeholder="Juan Dela Cruz" value={formData.name} onChange={handleChange} error={errors.name} icon={HiOutlineUser} />
                            <Input label="Email Address" type="email" name="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} error={errors.email} icon={HiOutlineMail} />
                            <Input
                                label="Password" type={showPassword ? 'text' : 'password'} name="password" placeholder="Create a password" value={formData.password} onChange={handleChange} error={errors.password} icon={HiOutlineLockClosed}
                                rightElement={
                                    <button type="button" onClick={() => setShowPassword(p => !p)} className="p-1 text-gray-500 hover:text-gray-700 transition-colors" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                                    </button>
                                }
                            />
                            <Input
                                label="Confirm Password" type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} error={errors.confirmPassword} icon={HiOutlineLockClosed}
                                rightElement={
                                    <button type="button" onClick={() => setShowConfirmPassword(p => !p)} className="p-1 text-gray-500 hover:text-gray-700 transition-colors" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                                        {showConfirmPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                                    </button>
                                }
                            />

                            {/* Address Section */}
                            <div className="pt-2">
                                <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <HiOutlineLocationMarker className="w-4 h-4 text-emerald-500" />
                                    Address
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <select
                                            name="municipality"
                                            value={formData.municipality}
                                            onChange={(e) => {
                                                setFormData({ ...formData, municipality: e.target.value, barangay: '' });
                                                if (errors.municipality) setErrors({ ...errors, municipality: '' });
                                            }}
                                            className={`w-full px-4 py-3.5 bg-gray-50 border-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer ${errors.municipality ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'} ${!formData.municipality ? 'text-gray-400' : 'text-gray-900'}`}
                                        >
                                            <option value="">Select Municipality</option>
                                            {Object.keys(MUNICIPALITIES_DATA).map((mun) => (
                                                <option key={mun} value={mun}>{mun}</option>
                                            ))}
                                        </select>
                                        {errors.municipality && <p className="mt-1.5 text-xs text-red-600 font-semibold">{errors.municipality}</p>}
                                    </div>
                                    <div>
                                        <select
                                            name="barangay"
                                            value={formData.barangay}
                                            onChange={(e) => {
                                                setFormData({ ...formData, barangay: e.target.value });
                                                if (errors.barangay) setErrors({ ...errors, barangay: '' });
                                            }}
                                            disabled={!formData.municipality}
                                            className={`w-full px-4 py-3.5 bg-gray-50 border-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer ${errors.barangay ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'} ${!formData.barangay ? 'text-gray-400' : 'text-gray-900'} ${!formData.municipality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <option value="">{formData.municipality ? 'Select Barangay' : 'Select municipality first'}</option>
                                            {formData.municipality && MUNICIPALITIES_DATA[formData.municipality]?.map((brgy) => (
                                                <option key={brgy} value={brgy}>{brgy}</option>
                                            ))}
                                        </select>
                                        {errors.barangay && <p className="mt-1.5 text-xs text-red-600 font-semibold">{errors.barangay}</p>}
                                    </div>
                                </div>
                            </div>

                            <Button type="button" onClick={handleNext} className="w-full py-4 text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl shadow-xl hover:shadow-2xl shadow-emerald-500/30 mt-6 transform hover:scale-[1.02] active:scale-95 transition-all">
                                Continue <HiOutlineArrowRight className="inline ml-2 w-5 h-5" />
                            </Button>
                        </motion.div>
                    )}

                    {/* ==================== STEP 2: ID Upload ==================== */}
                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">
                                    Upload Identification Document
                                </label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 group
                                        ${errors.idDocument ? 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gradient-to-br hover:from-emerald-50 hover:to-green-50'}`}
                                >
                                    {!idFile ? (
                                        <>
                                            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-3xl shadow-lg shadow-emerald-500/30 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                                <HiOutlineCloudUpload className="w-10 h-10 text-white" />
                                            </div>
                                            <p className="text-gray-900 font-bold text-lg">Click to upload document</p>
                                            <p className="text-sm text-gray-600 mt-2">Supports JPG, PNG, PDF (Max 10MB)</p>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-4 text-left p-4 bg-white rounded-xl shadow-md border-2 border-emerald-200 relative">
                                            {idPreview ? (
                                                <img src={idPreview} alt="Preview" className="w-20 h-20 object-cover rounded-xl bg-gray-100 shadow-sm" />
                                            ) : (
                                                <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center shadow-inner">
                                                    <HiOutlineIdentification className="w-10 h-10 text-gray-400" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-900 truncate text-lg">{idFile.name}</p>
                                                <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                                                    <HiOutlineCheck className="w-4 h-4" /> Ready to upload
                                                </p>
                                            </div>
                                            <button
                                                onClick={removeFile}
                                                className="absolute -top-3 -right-3 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-full p-2 shadow-lg hover:shadow-xl hover:scale-110 transition-all"
                                            >
                                                <HiOutlineX className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </div>
                                {errors.idDocument && (
                                    <p className="mt-3 text-sm text-red-600 font-semibold flex items-center gap-2 bg-red-50 p-3 rounded-xl">
                                        <HiOutlineX className="w-5 h-5" /> {errors.idDocument}
                                    </p>
                                )}
                            </div>

                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5 flex gap-4 shadow-md">
                                <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                                    <HiOutlineIdentification className="w-7 h-7 text-white" />
                                </div>
                                <p className="text-sm text-blue-900 leading-relaxed">
                                    <strong className="font-bold">Accepted IDs:</strong> Government-issued ID, School ID, Barangay ID, or any valid document with your photo and name.
                                </p>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button type="button" onClick={handleBack} className="flex-1 py-4 font-bold bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-xl shadow-sm hover:shadow-md transition-all">
                                    Back
                                </Button>
                                <Button type="button" onClick={handleNext} className="flex-1 py-4 font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl shadow-xl hover:shadow-2xl shadow-emerald-500/30 transform hover:scale-[1.02] active:scale-95 transition-all">
                                    Continue <HiOutlineArrowRight className="inline ml-1 w-5 h-5" />
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {/* ==================== STEP 3: Selfie / Face Verification ==================== */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">
                                    Face Verification
                                </label>
                                <p className="text-xs text-gray-500 mb-4">Take a clear selfie to match with your ID document.</p>

                                {/* Camera / Preview Area */}
                                <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-[4/3] shadow-2xl border-2 border-gray-200">
                                    {/* Live Camera Feed */}
                                    {cameraActive && !selfiePreview && (
                                        <>
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="w-full h-full object-cover"
                                                style={{ transform: 'scaleX(-1)' }}
                                            />
                                            {/* Face Guide Overlay */}
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="w-48 h-60 sm:w-56 sm:h-72 border-[3px] border-white/50 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                                            </div>
                                            <div className="absolute top-4 left-0 right-0 text-center">
                                                <span className="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-full inline-flex items-center gap-2">
                                                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                                    Position your face in the oval
                                                </span>
                                            </div>
                                            {/* Capture Button */}
                                            <div className="absolute bottom-5 left-0 right-0 flex justify-center">
                                                <motion.button
                                                    type="button"
                                                    onClick={captureSelfie}
                                                    whileHover={{ scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    className="w-16 h-16 bg-white rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white/30 hover:ring-emerald-400/50 transition-all"
                                                >
                                                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center">
                                                        <HiOutlineCamera className="w-6 h-6 text-white" />
                                                    </div>
                                                </motion.button>
                                            </div>
                                        </>
                                    )}

                                    {/* Captured Preview */}
                                    {selfiePreview && (
                                        <>
                                            <img src={selfiePreview} alt="Selfie" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                                                <motion.button
                                                    type="button"
                                                    onClick={retakeSelfie}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    className="flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur-md text-gray-800 font-bold text-sm rounded-xl shadow-xl hover:bg-white transition-all"
                                                >
                                                    <HiOutlineRefresh className="w-4 h-4" /> Retake
                                                </motion.button>
                                            </div>
                                            <div className="absolute top-4 right-4">
                                                <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-lg">
                                                    <HiOutlineCheck className="w-3.5 h-3.5" /> Captured
                                                </span>
                                            </div>
                                        </>
                                    )}

                                    {/* Camera Error / Not Started */}
                                    {!cameraActive && !selfiePreview && (
                                        <div className="flex flex-col items-center justify-center h-full text-center p-6">
                                            {cameraError ? (
                                                <>
                                                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                                                        <HiOutlineX className="w-8 h-8 text-red-400" />
                                                    </div>
                                                    <p className="text-red-300 font-semibold text-sm mb-4">{cameraError}</p>
                                                    <button type="button" onClick={startCamera} className="text-white text-sm font-bold bg-white/20 hover:bg-white/30 px-5 py-2.5 rounded-xl transition-all">
                                                        Try Again
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-3xl shadow-lg flex items-center justify-center mb-4">
                                                        <HiOutlineCamera className="w-10 h-10 text-white" />
                                                    </div>
                                                    <p className="text-white font-bold text-lg mb-2">Ready for Selfie</p>
                                                    <p className="text-gray-400 text-sm mb-5">Click below to open your camera</p>
                                                    <button type="button" onClick={startCamera} className="text-white text-sm font-bold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:scale-105">
                                                        Open Camera
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {/* Hidden canvas for capture */}
                                <canvas ref={canvasRef} className="hidden" />

                                {errors.selfie && (
                                    <p className="mt-3 text-sm text-red-600 font-semibold flex items-center gap-2 bg-red-50 p-3 rounded-xl">
                                        <HiOutlineX className="w-5 h-5" /> {errors.selfie}
                                    </p>
                                )}
                            </div>

                            {/* Info Banner */}
                            <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-2xl p-4 flex gap-3 shadow-md">
                                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <HiOutlineShieldCheck className="w-5 h-5 text-white" />
                                </div>
                                <p className="text-xs text-emerald-900 leading-relaxed">
                                    <strong className="font-bold">Privacy Protected:</strong> Your selfie is used only for identity verification by administrators. It will be stored securely and never shared.
                                </p>
                            </div>

                            {/* Form Error */}
                            {errors.form && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3.5 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 text-red-700 rounded-xl flex items-center gap-3"
                                >
                                    <HiOutlineX className="w-5 h-5 shrink-0" />
                                    <span className="font-semibold text-sm">{errors.form}</span>
                                </motion.div>
                            )}

                            <div className="flex gap-4 pt-2">
                                <Button type="button" onClick={handleBack} className="flex-1 py-4 font-bold bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-xl shadow-sm hover:shadow-md transition-all">
                                    Back
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-4 font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl shadow-xl hover:shadow-2xl shadow-emerald-500/30 disabled:opacity-50 transform hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Registering...
                                        </span>
                                    ) : 'Complete Registration'}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>
        </div>
    );
};

export default RegisterPage;
