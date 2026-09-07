import { useState } from 'react';
import { Link } from '../router';
import api from '../services/api';
import toast from '../utils/appToast';
import {
    HiOutlineMail,
    HiOutlineArrowLeft,
    HiOutlineCheckCircle,
} from 'react-icons/hi';

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
        <div className="w-full py-2">
            {/* Mobile Brand Header */}
            <div className="mb-5 flex items-center gap-2.5 lg:hidden">
                <img src="/icons/Alert.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
                <div>
                    <p className="font-display text-base font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
                        Sibuyan <span className="text-brand-700 dark:text-sky-400">Alert</span>
                    </p>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        Accident Alert &amp; Mapping System
                    </p>
                </div>
            </div>

            {/* Back to Login */}
            <Link
                to="/login"
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
                <HiOutlineArrowLeft className="h-4 w-4" /> Back to login
            </Link>

            {/* Main Card Container */}
            <div className="w-full rounded-2xl border border-gray-200/90 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90 sm:p-8">
                {!sent ? (
                    <>
                        {/* Header */}
                        <div className="mb-6">
                            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400">
                                Account Recovery
                            </p>
                            <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                                Forgot your password?
                            </h1>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm leading-relaxed">
                                Enter the email address associated with your account to receive a password reset link.
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="recovery-email" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <HiOutlineMail className="h-4.5 w-4.5" />
                                    </div>
                                    <input
                                        type="email"
                                        id="recovery-email"
                                        name="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        required
                                        className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-9 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-[#07130e] dark:text-white dark:hover:border-gray-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="min-h-12 w-full rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span className="flex items-center justify-center gap-2">
                                    {loading ? (
                                        <>
                                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            <span>Sending...</span>
                                        </>
                                    ) : (
                                        'Send Reset Link'
                                    )}
                                </span>
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <HiOutlineCheckCircle className="h-7 w-7" />
                        </div>

                        <h2 className="font-display text-xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-2xl">
                            Check your email
                        </h2>
                        <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            We have sent a password reset link to <strong className="text-gray-900 dark:text-white font-semibold">{email}</strong>.
                        </p>

                        <div className="mt-5 rounded-xl border border-gray-200/80 bg-gray-50/80 p-3.5 dark:border-white/10 dark:bg-[#07130e]">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Didn&apos;t receive the email? Check your spam folder or{' '}
                                <button
                                    type="button"
                                    onClick={() => setSent(false)}
                                    className="font-semibold text-brand-700 hover:text-brand-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                    try again
                                </button>
                            </p>
                        </div>

                        <div className="mt-5">
                            <Link
                                to="/login"
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-xs sm:text-sm font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                                Back to login
                            </Link>
                        </div>
                    </div>
                )}

                {/* Additional Help */}
                <div className="mt-6 border-t border-gray-200/80 pt-4.5 text-center dark:border-white/10">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Need help?{' '}
                        <a
                            href="mailto:sibuyan.alert@gmail.com"
                            className="font-semibold text-brand-700 transition-colors hover:text-brand-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                            Contact Support
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
