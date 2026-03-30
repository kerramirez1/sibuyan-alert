import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import {
    HiOutlineMail,
    HiOutlineLockClosed,
    HiOutlineExclamation,
    HiOutlineArrowRight,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineGlobe,
    HiOutlineCheckCircle,
    HiOutlineUserAdd,
} from 'react-icons/hi';

const LoginPage = () => {
    const { login } = useAuth();
    const location = useLocation();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const isExpired = new URLSearchParams(location.search).get('expired');

    const validate = () => {
        const newErrors = {};
        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email';
        }
        if (!formData.password) {
            newErrors.password = 'Password is required';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setLoading(true);
        try {
            await login(formData.email, formData.password);
        } catch (error) {
            console.error(error);
            setErrors({ form: 'Invalid email or password. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (errors[e.target.name] || errors.form) {
            setErrors({ ...errors, [e.target.name]: '', form: '' });
        }
    };

    return (
        <div className="w-full flex items-center justify-center py-2">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="w-full max-w-[460px] bg-white border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-8"
            >
                {/* Mobile Logo */}
                <div className="lg:hidden flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-white rounded-lg p-1 overflow-hidden flex items-center justify-center border border-gray-200">
                        <img src="/icons/Alert.png" alt="Sibuyan Alert Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                        <h1 className="font-display font-bold text-lg text-gray-900 leading-none">
                            Sibuyan <span className="text-brand-600">Alert</span>
                        </h1>
                        <p className="text-gray-500 text-[10px] tracking-wider uppercase font-medium mt-0.5">Safety Platform</p>
                    </div>
                </div>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="mb-6"
                >
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                        <span className="text-[11px] font-semibold text-gray-700">Secure Login</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-1.5 tracking-tight">
                        Welcome Back
                    </h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        Sign in to access your <span className="text-brand-700 font-semibold">Sibuyan Alert</span> account.
                    </p>
                </motion.div>

                {/* Session Expired Warning */}
                {isExpired && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mb-5 p-3 border border-red-200 bg-red-50 rounded-lg flex items-center gap-2.5 text-red-700"
                    >
                        <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium">Session expired. Please sign in again.</span>
                    </motion.div>
                )}

                {/* Login Form */}
                <motion.form
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.1 }}
                    onSubmit={handleSubmit}
                    className="space-y-5"
                >
                    {/* Email Field */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineMail className="w-5 h-5" />
                            </div>
                            <input
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                className={`w-full pl-11 pr-10 py-3.5 border rounded-xl text-sm bg-white transition-colors outline-none ${errors.email
                                    ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                                    : 'border-gray-300 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100'
                                    }`}
                            />
                            {formData.email && !errors.email && (
                                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500">
                                    <HiOutlineCheckCircle className="w-5 h-5" />
                                </div>
                            )}
                        </div>
                        {errors.email && (
                            <motion.p
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1.5"
                            >
                                <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                                {errors.email}
                            </motion.p>
                        )}
                    </div>

                    {/* Password Field */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-semibold text-gray-700">
                                Password
                            </label>
                            <Link
                                to="/forgot-password"
                                className="text-xs text-brand-700 hover:text-brand-800 font-semibold transition-colors"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineLockClosed className="w-5 h-5" />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                className={`w-full pl-11 pr-12 py-3.5 border rounded-xl text-sm bg-white transition-colors outline-none ${errors.password
                                    ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                                    : 'border-gray-300 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100'
                                    }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword
                                    ? <HiOutlineEyeOff className="w-5 h-5" />
                                    : <HiOutlineEye className="w-5 h-5" />
                                }
                            </button>
                        </div>
                        {errors.password && (
                            <motion.p
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1.5"
                            >
                                <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                                {errors.password}
                            </motion.p>
                        )}
                    </div>

                    {/* Form Error */}
                    {errors.form && (
                        <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-center gap-2.5"
                        >
                            <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                            <span className="text-sm font-medium">{errors.form}</span>
                        </motion.div>
                    )}

                    {/* Submit Button */}
                    <motion.button
                        type="submit"
                        disabled={loading}
                        whileHover={{ scale: loading ? 1 : 1.01 }}
                        whileTap={{ scale: loading ? 1 : 0.99 }}
                        className="w-full py-3.5 text-sm sm:text-base text-white font-semibold rounded-xl shadow-sm transition-colors bg-brand-700 hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <span className="flex items-center justify-center gap-2">
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign In to Dashboard</span>
                                    <HiOutlineArrowRight className="w-4.5 h-4.5" />
                                </>
                            )}
                        </span>
                    </motion.button>
                </motion.form>

                {/* Secondary Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="mt-6 space-y-2.5"
                >
                    <Link
                        to="/register"
                        className="group flex items-center gap-3 w-full p-3.5 border border-gray-200 hover:border-emerald-300 rounded-xl transition-colors"
                    >
                        <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                            <HiOutlineUserAdd className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-gray-900">
                                Register as a Reporter
                            </h3>
                            <p className="text-xs text-gray-600">
                                Create account to submit accident reports
                            </p>
                        </div>
                        <HiOutlineArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                    </Link>

                    <Link
                        to="/dashboard?view=map"
                        className="group flex items-center gap-3 w-full p-3.5 border border-gray-200 hover:border-blue-300 rounded-xl transition-colors"
                    >
                        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                            <HiOutlineGlobe className="w-5 h-5 text-blue-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-gray-900">
                                View Public Safety Map
                            </h3>
                            <p className="text-xs text-gray-600">No login required</p>
                        </div>
                        <HiOutlineArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                    </Link>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
