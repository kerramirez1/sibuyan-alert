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
        <div className="w-full">
            {/* Mobile Logo */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="lg:hidden flex items-center gap-3 mb-6"
            >
                <div className="w-11 h-11 bg-white rounded-xl p-1 overflow-hidden flex items-center justify-center shadow-lg ring-1 ring-gray-100">
                    <img src="/icons/Alert.png" alt="Sibuyan Alert Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="font-display font-bold text-xl text-gray-900 leading-none">
                        Sibuyan <span className="text-brand-600">Alert</span>
                    </h1>
                    <p className="text-gray-400 text-[10px] tracking-wider uppercase font-medium mt-0.5">Safety Platform</p>
                </div>
            </motion.div>

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="mb-7 sm:mb-8"
            >
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-1.5">
                    Welcome Back
                </h2>
                <p className="text-sm sm:text-base text-gray-500 leading-relaxed">
                    Sign in to your account to continue.
                </p>
            </motion.div>

            {/* Session Expired Warning */}
            {isExpired && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-5 p-3.5 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl flex items-center gap-3 text-red-700"
                >
                    <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center shrink-0">
                        <HiOutlineExclamation className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span className="text-sm font-semibold">Session expired. Please sign in again.</span>
                </motion.div>
            )}

            {/* Login Form */}
            <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                onSubmit={handleSubmit}
                className="space-y-4 sm:space-y-5"
            >
                {/* Email Field */}
                <div>
                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                        Email Address
                    </label>
                    <div className="relative group">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-500 transition-colors duration-200">
                            <HiOutlineMail className="w-[18px] h-[18px]" />
                        </div>
                        <input
                            type="email"
                            name="email"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            autoComplete="email"
                            className={`w-full pl-11 pr-4 py-3 sm:py-3.5 border-2 rounded-xl text-sm transition-all duration-200 shadow-sm outline-none ${errors.email
                                ? 'border-red-300 bg-red-50/50 focus:ring-2 focus:ring-red-500/20 focus:border-red-400'
                                : 'border-gray-200 bg-white hover:border-gray-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                                }`}
                        />
                    </div>
                    {errors.email && (
                        <p className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1">
                            <HiOutlineExclamation className="w-3.5 h-3.5 shrink-0" />
                            {errors.email}
                        </p>
                    )}
                </div>

                {/* Password Field */}
                <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                        <label className="block text-xs sm:text-sm font-bold text-gray-700">
                            Password
                        </label>
                        <Link
                            to="/forgot-password"
                            className="text-[11px] sm:text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <div className="relative group">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-500 transition-colors duration-200">
                            <HiOutlineLockClosed className="w-[18px] h-[18px]" />
                        </div>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                            autoComplete="current-password"
                            className={`w-full pl-11 pr-12 py-3 sm:py-3.5 border-2 rounded-xl text-sm transition-all duration-200 shadow-sm outline-none ${errors.password
                                ? 'border-red-300 bg-red-50/50 focus:ring-2 focus:ring-red-500/20 focus:border-red-400'
                                : 'border-gray-200 bg-white hover:border-gray-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                                }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword
                                ? <HiOutlineEyeOff className="w-4 h-4" />
                                : <HiOutlineEye className="w-4 h-4" />
                            }
                        </button>
                    </div>
                    {errors.password && (
                        <p className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1">
                            <HiOutlineExclamation className="w-3.5 h-3.5 shrink-0" />
                            {errors.password}
                        </p>
                    )}
                </div>

                {/* Form Error */}
                {errors.form && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3.5 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 text-red-700 rounded-xl flex items-center gap-3"
                    >
                        <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center shrink-0">
                            <HiOutlineExclamation className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-semibold text-sm">{errors.form}</span>
                    </motion.div>
                )}

                {/* Submit Button */}
                <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: loading ? 1 : 1.015 }}
                    whileTap={{ scale: loading ? 1 : 0.97 }}
                    className="relative w-full py-3.5 sm:py-4 text-sm sm:text-base text-white font-bold rounded-xl shadow-xl hover:shadow-2xl transition-all bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-700 hover:to-emerald-700 shadow-brand-500/25 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
                >
                    {/* Shimmer */}
                    {!loading && (
                        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {loading ? (
                            <>
                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Signing in...
                            </>
                        ) : (
                            <>
                                Sign In
                                <HiOutlineArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </span>
                </motion.button>
            </motion.form>

            {/* Divider */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="relative my-6 sm:my-7"
            >
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100" />
                </div>
                <div className="relative flex justify-center text-[10px] sm:text-xs">
                    <span className="px-3 bg-white text-gray-400 font-medium">or</span>
                </div>
            </motion.div>

            {/* Bottom Actions */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="space-y-3"
            >
                {/* Register as Reporter */}
                <Link
                    to="/register"
                    className="group flex items-center gap-3 sm:gap-4 w-full p-3.5 sm:p-4 bg-white border-2 border-gray-100 hover:border-emerald-300 rounded-xl hover:shadow-lg transition-all text-left"
                >
                    <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/30 group-hover:scale-105 transition-all">
                        <HiOutlineUserAdd className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm sm:text-[15px] text-gray-900 group-hover:text-emerald-700 transition-colors">
                            Register as a Reporter
                        </h3>
                        <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                            Create account to submit accident reports
                        </p>
                    </div>
                    <HiOutlineArrowRight className="w-4 h-4 text-gray-200 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>

                {/* View Public Map */}
                <Link
                    to="/dashboard?view=map"
                    className="group flex items-center gap-3 sm:gap-4 w-full p-3 sm:p-3.5 bg-gray-50 hover:bg-gray-100/80 border border-gray-100 hover:border-gray-200 rounded-xl transition-all text-left"
                >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm border border-gray-100 group-hover:shadow-md transition-all shrink-0">
                        <HiOutlineGlobe className="w-4.5 h-4.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-xs sm:text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                            View Public Safety Map
                        </h3>
                        <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">No login required</p>
                    </div>
                    <HiOutlineArrowRight className="w-3.5 h-3.5 text-gray-200 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
            </motion.div>

            {/* Security Footer */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-6 sm:mt-8 flex items-center justify-center gap-1.5 text-gray-300"
            >
                <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] sm:text-xs font-medium">Encrypted & Secured</span>
            </motion.div>
        </div>
    );
};

export default LoginPage;
