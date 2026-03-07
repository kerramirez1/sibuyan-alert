import { useState, useRef } from 'react';
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
    HiOutlineEyeOff
} from 'react-icons/hi';

const MUNICIPALITIES_DATA = {
    'Cajidiocan': ['Alibagon', 'Cambajao', 'Cambalo', 'Cambijang', 'Cantagda', 'Danao Norte', 'Danao Sur', 'Lico', 'Lumbang Este', 'Lumbang Weste', 'Marigondon Norte', 'Marigondon Sur', 'Poblacion', 'Sugod', 'Taguilos'],
    'Magdiwang': ['Agsao', 'Agutay', 'Ambulong', 'Dulangan', 'Ipil', 'Jao-asan', 'Poblacion', 'Silum', 'Tampayan'],
    'San Fernando': ['Azagra', 'Butong', 'Cabugao', 'Catmon', 'Lambingan', 'Mabolo', 'Otod', 'Pili', 'Poblacion', 'San Isidro', 'Taclobo', 'Tuburan'],
};

const RegisterPage = () => {
    const { register } = useAuth();
    const fileInputRef = useRef(null);
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
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [step, setStep] = useState(1);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validate()) setStep(2);
    };

    const handleBack = () => {
        setStep(1);
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

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-semibold transition-colors mb-6 group">
                    <HiOutlineArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Login
                </Link>
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
                    <HiOutlineUser className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-3xl font-display font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                    Create Account
                </h2>
                <p className="text-gray-600 mt-2 text-lg">
                    Join the network as a verified reporter.
                </p>
            </div>

            {/* Progress Indicators */}
            <div className="flex items-center gap-3 mb-8">
                <div className="flex-1 flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 1 ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-gray-200 text-gray-400'}`}>
                        {step > 1 ? <HiOutlineCheck className="w-5 h-5" /> : '1'}
                    </div>
                    <div className={`flex-1 h-2 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gray-200'}`}></div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 2 ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-gray-200 text-gray-400'}`}>
                    2
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <Input
                                label="Full Name"
                                name="name"
                                placeholder="Juan Dela Cruz"
                                value={formData.name}
                                onChange={handleChange}
                                error={errors.name}
                                icon={HiOutlineUser}
                            />
                            <Input
                                label="Email Address"
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                error={errors.email}
                                icon={HiOutlineMail}
                            />
                            <Input
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                placeholder="Create a password"
                                value={formData.password}
                                onChange={handleChange}
                                error={errors.password}
                                icon={HiOutlineLockClosed}
                                rightElement={
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                                    </button>
                                }
                            />
                            <Input
                                label="Confirm Password"
                                type={showConfirmPassword ? 'text' : 'password'}
                                name="confirmPassword"
                                placeholder="Confirm password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                error={errors.confirmPassword}
                                icon={HiOutlineLockClosed}
                                rightElement={
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                    >
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
                                    {/* Municipality */}
                                    <div>
                                        <select
                                            name="municipality"
                                            value={formData.municipality}
                                            onChange={(e) => {
                                                setFormData({ ...formData, municipality: e.target.value, barangay: '' });
                                                if (errors.municipality) setErrors({ ...errors, municipality: '' });
                                            }}
                                            className={`w-full px-4 py-3.5 bg-gray-50 border-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer ${errors.municipality ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                                                } ${!formData.municipality ? 'text-gray-400' : 'text-gray-900'}`}
                                        >
                                            <option value="">Select Municipality</option>
                                            {Object.keys(MUNICIPALITIES_DATA).map((mun) => (
                                                <option key={mun} value={mun}>{mun}</option>
                                            ))}
                                        </select>
                                        {errors.municipality && (
                                            <p className="mt-1.5 text-xs text-red-600 font-semibold">{errors.municipality}</p>
                                        )}
                                    </div>

                                    {/* Barangay */}
                                    <div>
                                        <select
                                            name="barangay"
                                            value={formData.barangay}
                                            onChange={(e) => {
                                                setFormData({ ...formData, barangay: e.target.value });
                                                if (errors.barangay) setErrors({ ...errors, barangay: '' });
                                            }}
                                            disabled={!formData.municipality}
                                            className={`w-full px-4 py-3.5 bg-gray-50 border-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer ${errors.barangay ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                                                } ${!formData.barangay ? 'text-gray-400' : 'text-gray-900'} ${!formData.municipality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <option value="">{formData.municipality ? 'Select Barangay' : 'Select municipality first'}</option>
                                            {formData.municipality && MUNICIPALITIES_DATA[formData.municipality]?.map((brgy) => (
                                                <option key={brgy} value={brgy}>{brgy}</option>
                                            ))}
                                        </select>
                                        {errors.barangay && (
                                            <p className="mt-1.5 text-xs text-red-600 font-semibold">{errors.barangay}</p>
                                        )}
                                    </div>
                                </div>
                            </div>


                            <Button
                                type="button"
                                onClick={handleNext}
                                className="w-full py-4 text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl shadow-xl hover:shadow-2xl shadow-emerald-500/30 mt-6 transform hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                Continue <HiOutlineArrowRight className="inline ml-2 w-5 h-5" />
                            </Button>
                        </motion.div>
                    )}

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
                                    <strong className="font-bold">Verification Required:</strong> Your account will be reviewed by an administrator. You will receive an email once approved.
                                </p>
                            </div>

                            <div className="flex gap-4 pt-6">
                                <Button
                                    type="button"
                                    onClick={handleBack}
                                    className="flex-1 py-4 font-bold bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-xl shadow-sm hover:shadow-md transition-all"
                                >
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
