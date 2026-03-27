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
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-brand-50 to-emerald-50 border border-brand-200 rounded-full mb-4">
                    <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-brand-700">Secure Login</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-display font-black text-gray-900 mb-2 tracking-tight">
                    Welcome Back!
                </h2>
                <p className="text-sm sm:text-base text-gray-500 leading-relaxed">
                    Sign in to access your <span className="text-brand-600 font-semibold">Sibuyan Alert</span> account.
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
                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-2">
                        Email Address
                    </label>
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors duration-200">
                            <HiOutlineMail className="w-5 h-5" />
                        </div>
                        <input
                            type="email"
                            name="email"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            autoComplete="email"
                            className={`w-full pl-12 pr-4 py-4 border-2 rounded-2xl text-sm transition-all duration-200 shadow-sm outline-none font-medium ${errors.email
                                ? 'border-red-300 bg-red-50/50 focus:ring-4 focus:ring-red-500/10 focus:border-red-400'
                                : 'border-gray-200 bg-white hover:border-gray-300 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-brand-50/30'
                                }`}
                        />
                        {formData.email && !errors.email && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                                <HiOutlineCheckCircle className="w-5 h-5" />
                            </div>
                        )}
                    </div>
                    {errors.email && (
                        <motion.p 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg"
                        >
                            <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                            {errors.email}
                        </motion.p>
                    )}
                </div>

                {/* Password Field */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs sm:text-sm font-bold text-gray-700">
                            Password
                        </label>
                        <Link
                            to="/forgot-password"
                            className="text-xs text-brand-600 hover:text-brand-700 font-bold transition-colors hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors duration-200">
                            <HiOutlineLockClosed className="w-5 h-5" />
                        </div>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                            autoComplete="current-password"
                            className={`w-full pl-12 pr-14 py-4 border-2 rounded-2xl text-sm transition-all duration-200 shadow-sm outline-none font-medium ${errors.password
                                ? 'border-red-300 bg-red-50/50 focus:ring-4 focus:ring-red-500/10 focus:border-red-400'
                                : 'border-gray-200 bg-white hover:border-gray-300 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-brand-50/30'
                                }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-700 transition-colors rounded-xl hover:bg-gray-100 active:scale-95"
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
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg"
                        >
                            <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                            {errors.password}
                        </motion.p>
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
                    whileHover={{ scale: loading ? 1 : 1.02 }}
                    whileTap={{ scale: loading ? 1 : 0.98 }}
                    className="group relative w-full py-4 sm:py-5 text-sm sm:text-base text-white font-black rounded-2xl shadow-2xl hover:shadow-3xl transition-all bg-gradient-to-r from-blue-600 via-brand-600 to-emerald-600 hover:from-blue-700 hover:via-brand-700 hover:to-emerald-700 shadow-brand-500/30 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
                >
                    {/* Animated Background */}
                    {!loading && (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-emerald-600 animate-pulse" />
                            </div>
                        </>
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-2.5">
                        {loading ? (
                            <>
                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span className="font-bold">Signing in...</span>
                            </>
                        ) : (
                            <>
                                <span>Sign In to Dashboard</span>
                                <HiOutlineArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
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
                className="relative my-7 sm:my-8"
            >
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-gray-100" />
                </div>
                <div className="relative flex justify-center text-xs">
                    <span className="px-4 py-1 bg-white text-gray-400 font-bold uppercase tracking-wider">or continue with</span>
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
                    className="group flex items-center gap-4 w-full p-4 sm:p-5 bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl hover:shadow-xl transition-all text-left relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shrink-0 shadow-xl shadow-emerald-500/30 group-hover:shadow-emerald-500/50 group-hover:scale-110 transition-all relative z-10">
                        <HiOutlineUserAdd className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 relative z-10">
                        <h3 className="font-black text-sm sm:text-base text-gray-900 group-hover:text-emerald-700 transition-colors mb-1">
                            Register as a Reporter
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 font-medium">
                            Create account to submit accident reports
                        </p>
                    </div>
                    <HiOutlineArrowRight className="w-5 h-5 text-emerald-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all shrink-0 relative z-10" />
                </Link>

                {/* View Public Map */}
                <Link
                    to="/dashboard?view=map"
                    className="group flex items-center gap-4 w-full p-4 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 hover:border-blue-300 rounded-2xl transition-all text-left shadow-sm hover:shadow-lg"
                >
                    <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 group-hover:scale-105 transition-all shrink-0">
                        <HiOutlineGlobe className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-black text-xs sm:text-sm text-gray-900 group-hover:text-blue-700 transition-colors mb-0.5">
                            View Public Safety Map
                        </h3>
                        <p className="text-[11px] sm:text-xs text-gray-600 font-medium">No login required • Free access</p>
                    </div>
                    <HiOutlineArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all shrink-0" />
                </Link>
            </motion.div>

            {/* Security Footer */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-7 sm:mt-8 flex items-center justify-center gap-2 text-gray-400"
            >
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-full border border-gray-100">
                    <HiOutlineCheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold">256-bit Encrypted & Secured</span>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
