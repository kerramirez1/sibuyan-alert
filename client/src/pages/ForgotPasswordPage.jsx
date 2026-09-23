import { useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import PageHeader from '../components/ui/PageHeader';
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
    const isMountedRef = useRef(true);

    useEffect(() => {
        // StrictMode-safe: the simulated unmount must not permanently disarm
        // the submit guards below.
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            toast.error('Please enter your email');
            return;
        }

        if (loading) return;
        setLoading(true);

        try {
            const response = await api.post('/auth/forgot-password', { email });

            if (response?.data?.success) {
                if (!isMountedRef.current) return;
                setSent(true);
                toast.success('Password reset link sent to your email!');
            } else {
                const message = response?.data?.message != null && response.data.message !== ''
                    ? String(response.data.message)
                    : 'Failed to send reset link';
                toast.error(message);
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to send reset link';
            toast.error(message);
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    return (
        <div className="w-full py-2">
            {/* Mobile Brand Header */}
            <div className="mb-5 flex items-center gap-2.5 lg:hidden">
                <img src="/icons/Alert.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
                <div>
                    <p className="font-display text-base font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
                        Sibuyan <span className="text-red-600 dark:text-red-400">Alert</span>
                    </p>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        Accident Alert &amp; Mapping System
                    </p>
                </div>
            </div>

            {/* Back to Login */}
            <Link
                to="/login"
                className="text-action mb-4"
            >
                <HiOutlineArrowLeft className="h-4 w-4" /> Back to login
            </Link>

            {/* Main Card Container */}
            <div className="form-surface w-full">
                {!sent ? (
                    <>
                        {/* Header */}
                        <PageHeader className="mb-6" eyebrow="Account Recovery" title="Forgot your password?" description="Enter the email address associated with your account to receive a password reset link." />

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="recovery-email" className="field-label">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <HiOutlineMail className="h-4 w-4" aria-hidden="true" />
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
                                        className="field-control pl-10"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full disabled:opacity-60"
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

                        <h1 className="page-title">
                            Check your email
                        </h1>
                        <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            We have sent a password reset link to <strong className="text-gray-900 dark:text-white font-semibold">{email}</strong>.
                        </p>

                        <div className="mt-5 border-y border-[var(--border)] py-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Didn&apos;t receive the email? Check your spam folder or{' '}
                                <button
                                    type="button"
                                    onClick={() => setSent(false)}
                                    className="font-semibold text-[var(--accent-text)] underline underline-offset-4"
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
                <div className="mt-6 border-t border-[var(--border)] pt-5 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Need help?{' '}
                        <a
                            href="mailto:sibuyan.alert@gmail.com"
                            className="font-semibold text-[var(--accent-text)] underline-offset-4 hover:underline"
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
