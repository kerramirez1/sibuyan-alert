import { useState } from 'react';
import { useParams, useNavigate, Link } from '../router';
import { motion } from 'framer-motion';
import api from '../services/api';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import toast from '../utils/appToast';
import { HiOutlineLockClosed, HiOutlineCheckCircle, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

const ResetPasswordPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isPasswordPolicyCompliant(formData.password)) {
            toast.error(PASSWORD_POLICY_MESSAGE);
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const response = await api.post(`/auth/reset-password/${token}`, {
                password: formData.password,
            });

            if (response.data.success) {
                setSuccess(true);
                toast.success('Password reset successful!');
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to reset password';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const passwordChecks = [
        { label: '12+ characters, within bcrypt limit', met: isPasswordPolicyCompliant(formData.password) },
        { label: 'Passwords match', met: formData.password === formData.confirmPassword && formData.password !== '' },
    ];

    return (
        <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 -z-20" />
            <div className="absolute top-1/3 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-blue-200/40 rounded-full blur-3xl animate-pulse -z-10" />
            <div className="absolute bottom-1/3 right-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-indigo-200/40 rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '1.5s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 sm:w-72 h-48 sm:h-72 bg-purple-200/30 rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '3s' }} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-md relative z-10"
            >
                <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-500/10 p-6 sm:p-8 border border-white/80">
                    {!success ? (
                        <>
                            {/* Icon */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                                className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-5 sm:mb-6 shadow-lg shadow-blue-500/30"
                            >
                                <HiOutlineLockClosed className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                            </motion.div>

                            {/* Header */}
                            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-gray-700 bg-clip-text text-transparent text-center mb-2">
                                Reset Password
                            </h1>
                            <p className="text-gray-500 text-sm sm:text-base text-center mb-6 sm:mb-8">
                                Enter your new password below
                            </p>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            placeholder="At least 12 characters"
                                            className="w-full px-3 sm:px-4 pr-12 py-2.5 sm:py-3.5 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm hover:shadow-md hover:border-gray-300"
                                            required
                                            minLength={12}
                                            maxLength={72}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(prev => !prev)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                                        Confirm New Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            placeholder="Re-enter your password"
                                            className="w-full px-3 sm:px-4 pr-12 py-2.5 sm:py-3.5 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm hover:shadow-md hover:border-gray-300"
                                            required
                                            minLength={12}
                                            maxLength={72}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(prev => !prev)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                        >
                                            {showConfirmPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Password Requirements */}
                                <div className="bg-gray-50 border-2 border-gray-100 rounded-xl p-3 sm:p-4">
                                    <p className="text-xs sm:text-sm font-bold text-gray-700 mb-2 sm:mb-3 flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Password must:
                                    </p>
                                    <ul className="space-y-2">
                                        {passwordChecks.map((check, idx) => (
                                            <li key={idx} className="flex items-center gap-2">
                                                <span className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center transition-all duration-300 ${check.met ? 'bg-emerald-500 scale-100' : 'bg-gray-300 scale-90'}`}>
                                                    {check.met ? (
                                                        <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : (
                                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                                    )}
                                                </span>
                                                <span className={`text-xs sm:text-sm transition-colors ${check.met ? 'text-gray-700 font-semibold' : 'text-gray-500'}`}>
                                                    {check.label}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 sm:py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm sm:text-base font-bold rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-95"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Resetting...
                                        </span>
                                    ) : (
                                        'Reset Password'
                                    )}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            {/* Success State */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 200 }}
                                className="text-center"
                            >
                                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6 shadow-lg shadow-emerald-500/30 animate-bounce">
                                    <HiOutlineCheckCircle className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
                                </div>

                                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">
                                    Password Reset Successful!
                                </h2>
                                <p className="text-gray-600 text-sm mb-5 sm:mb-6 px-2">
                                    Your password has been successfully reset. You can now login with your new password.
                                </p>

                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-5 sm:mb-6">
                                    <p className="text-xs sm:text-sm text-blue-800 flex items-center justify-center gap-2">
                                        <svg className="animate-spin w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Redirecting to login in 3 seconds...
                                    </p>
                                </div>

                                <Link
                                    to="/login"
                                    className="inline-block w-full py-2.5 sm:py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm sm:text-base font-bold rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                                >
                                    Go to Login
                                </Link>
                            </motion.div>
                        </>
                    )}
                </div>

                {/* Back to Login */}
                {!success && (
                    <p className="text-center text-gray-500 text-xs sm:text-sm mt-6 sm:mt-8">
                        Remember your password?{' '}
                        <Link to="/login" className="text-blue-600 hover:text-blue-700 underline font-bold transition-colors">
                            Back to Login
                        </Link>
                    </p>
                )}
            </motion.div>
        </div>
    );
};

export default ResetPasswordPage;
