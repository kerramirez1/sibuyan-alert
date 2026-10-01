import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from '../router';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import {
    HiOutlineMail,
    HiOutlineLockClosed,
    HiOutlineExclamation,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineCheckCircle,
} from 'react-icons/hi';

const LoginPage = () => {
    const { login } = useAuth();
    const location = useLocation();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const isMountedRef = useRef(true);

    useEffect(() => {
        // StrictMode-safe: the simulated unmount must not permanently disarm
        // the submit guards below.
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const searchParams = new URLSearchParams(location?.search ?? '');
    const isExpired = searchParams.get('expired');
    const redirectQuery = searchParams.get('redirect') || searchParams.get('next');
    const stateFrom = location?.state?.from;
    const stateTarget = stateFrom
        ? (typeof stateFrom === 'string'
            ? stateFrom
            : `${stateFrom.pathname || ''}${stateFrom.search || ''}${stateFrom.hash || ''}`)
        : null;
    const intendedTarget = redirectQuery || stateTarget;

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
        if (loading) return;
        if (!validate()) return;

        setLoading(true);
        try {
            const result = await login(formData.email, formData.password, intendedTarget);
            if (!result?.success) {
                if (!isMountedRef.current) return;
                const formMessage = result?.message != null && result.message !== ''
                    ? String(result.message)
                    : 'Unable to sign in. Please check your credentials and try again.';
                setErrors({ form: formMessage });
            }
        } catch (error) {
            console.error(error);
            if (!isMountedRef.current) return;
            setErrors({ form: 'Unable to sign in. Please try again.' });
        } finally {
            if (isMountedRef.current) setLoading(false);
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
            <div className="form-surface form-surface--compact w-full">
                {/* Compact system context for mobile screens */}
                <div className="mb-6 border-b border-[var(--border)] pb-5 lg:hidden">
                    <div className="flex items-center gap-2.5">
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
                    <p className="mt-2.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        Official account access for Sibuyan Island incident coordination.
                    </p>
                </div>

                {/* Header */}
                <PageHeader
                    className="mb-4"
                    eyebrow="Secure Authentication"
                    title="Sign in to Sibuyan Alert"
                    description="Access your account securely."
                />

                {/* Session Expired Warning */}
                {isExpired && (
                    <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
                        <HiOutlineExclamation className="h-4 w-4 shrink-0" />
                        <span>Session expired. Please sign in again.</span>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-3">
                    {/* Email Field */}
                    <div>
                        <label htmlFor="login-email" className="field-label">
                            Email Address
                        </label>
                        <div className="relative">
                            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineMail className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <input
                                type="email"
                                id="login-email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                aria-invalid={Boolean(errors.email)}
                                aria-describedby={errors.email ? 'login-email-error' : undefined}
                                className="field-control pl-10 pr-10"
                            />
                            {formData.email && !errors.email && (
                                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500">
                                    <HiOutlineCheckCircle className="h-4 w-4" aria-hidden="true" />
                                </div>
                            )}
                        </div>
                        {errors.email && (
                            <p
                                id="login-email-error"
                                role="alert"
                                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                            >
                                <HiOutlineExclamation className="h-3.5 w-3.5 shrink-0" />
                                {errors.email}
                            </p>
                        )}
                    </div>

                    {/* Password Field */}
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="login-password" className="text-[13px] font-semibold text-[var(--text-secondary)]">
                                Password
                            </label>
                            <Link
                                to="/forgot-password"
                                className="text-xs font-semibold text-[var(--accent-text)] underline-offset-4 hover:underline"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineLockClosed className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="login-password"
                                name="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                aria-invalid={Boolean(errors.password)}
                                aria-describedby={errors.password ? 'login-password-error' : undefined}
                                className="field-control pl-10 pr-12"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword
                                    ? <HiOutlineEyeOff className="h-4 w-4" aria-hidden="true" />
                                    : <HiOutlineEye className="h-4 w-4" aria-hidden="true" />
                                }
                            </button>
                        </div>
                        {errors.password && (
                            <p
                                id="login-password-error"
                                role="alert"
                                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                            >
                                <HiOutlineExclamation className="h-3.5 w-3.5 shrink-0" />
                                {errors.password}
                            </p>
                        )}
                    </div>

                    {/* Form Error */}
                    {errors.form && (
                        <div
                            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                            role="alert"
                        >
                            <HiOutlineExclamation className="h-4 w-4 shrink-0" />
                            <span>{errors.form}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="min-h-12 w-full rounded-lg bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span className="flex items-center justify-center gap-2">
                            {loading ? (
                                <>
                                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <span>Sign in</span>
                            )}
                        </span>
                    </button>
                </form>

                {/* Additional Options */}
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Additional Options</p>
                    <div className="mt-2 flex flex-col gap-2.5">
                        <div>
                            <Link
                                to="/register"
                                className="text-action"
                            >
                                Register as a reporter
                            </Link>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Submit incident reports after administrator approval.
                            </p>
                        </div>

                        <div>
                            <Link
                                to="/dashboard?view=map"
                                className="text-action"
                            >
                                View public incident map
                            </Link>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Accessible without an account.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
