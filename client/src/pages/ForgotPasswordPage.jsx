import { useState } from 'react';
import { Link } from '../router';
import { motion } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';
import { HiOutlineMail, HiOutlineArrowLeft, HiOutlineCheckCircle } from 'react-icons/hi';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            toast.error('Please enter your email');
            return;
        }

        setLoading(true);

        try {
            const response = await api.post('/auth/forgot-password', { email });

            if (response.data.success) {
                setSent(true);
                toast.success('Password reset link sent to your email!');
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to send reset link';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

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
                {/* Back to Login */}
                <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-5 sm:mb-7 font-bold text-sm transition-all group"
                >
                    <HiOutlineArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Login
                </Link>

                <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-500/10 p-6 sm:p-8 border border-white/80">
                    {!sent ? (
                        <>
                            {/* Icon */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                                className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-5 sm:mb-6 shadow-lg shadow-blue-500/30"
                            >
                                <HiOutlineMail className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                            </motion.div>

                            {/* Header */}
                            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-gray-700 bg-clip-text text-transparent text-center mb-2">
                                Forgot Password?
                            </h1>
                            <p className="text-gray-500 text-sm sm:text-base text-center mb-6 sm:mb-8 leading-relaxed px-2">
                                No worries! Enter your email and we'll send you a reset link.
                            </p>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="your.email@example.com"
                                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3.5 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm hover:shadow-md hover:border-gray-300"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 sm:py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm sm:text-base rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-95"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Sending...
                                        </span>
                                    ) : (
                                        'Send Reset Link'
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
                                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6 shadow-lg shadow-emerald-500/30">
                                    <HiOutlineCheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                                </div>

                                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">
                                    Check Your Email
                                </h2>
                                <p className="text-gray-600 text-sm mb-5 sm:mb-6 px-2">
                                    We've sent a password reset link to{' '}
                                    <strong className="text-gray-900">{email}</strong>
                                </p>

                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-5 sm:mb-6">
                                    <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
                            Didn't receive the email? Check your spam folder or{' '}
                                        <button
                                            onClick={() => setSent(false)}
                                            className="text-blue-600 font-bold hover:underline transition-all"
                                        >
                                            try again
                                        </button>
                                    </p>
                                </div>

                                <Link
                                    to="/login"
                                    className="inline-block w-full py-2.5 sm:py-3.5 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 text-sm sm:text-base font-bold rounded-lg sm:rounded-xl hover:from-gray-200 hover:to-gray-300 transition-all shadow-md hover:shadow-lg"
                                >
                                    Back to Login
                                </Link>
                            </motion.div>
                        </>
                    )}
                </div>

                {/* Additional Help */}
                <p className="text-center text-gray-500 text-xs sm:text-sm mt-6 sm:mt-8">
                    Need help?{' '}
                    <a href="mailto:sibuyan.alert@gmail.com" className="text-blue-600 hover:text-blue-700 underline font-bold transition-colors">
                        Contact Support
                    </a>
                </p>
            </motion.div>
        </div>
    );
};

export default ForgotPasswordPage;
