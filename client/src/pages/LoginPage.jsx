import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from '../router';
import { useAuth } from '../context/AuthContext';
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

    useEffect(() => () => {
        isMountedRef.current = false;
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
            <div className="w-full rounded-2xl border border-gray-200/90 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90 sm:p-8">
                {/* Compact system context for mobile screens */}
                <div className="mb-6 border-b border-gray-200/80 pb-4.5 dark:border-white/10 lg:hidden">
                    <div className="flex items-center gap-2.5">
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
                    <p className="mt-2.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        Official account access for Sibuyan Island incident coordination.
                    </p>
                </div>

                {/* Header */}
                <div className="mb-6">
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400">
                        Secure Authentication
                    </p>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                        Sign in to Sibuyan Alert
                    </h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                        Access your account securely.
                    </p>
                </div>

                {/* Session Expired Warning */}
                {isExpired && (
                    <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
                        <HiOutlineExclamation className="h-4 w-4 shrink-0" />
                        <span>Session expired. Please sign in again.</span>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-4">
                    {/* Email Field */}
                    <div>
                        <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                            Email Address
                        </label>
                        <div className="relative">
                            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineMail className="h-4.5 w-4.5" />
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
                                className={`h-11 w-full rounded-lg border pl-10 pr-9 text-sm bg-white dark:bg-[#07130e] text-gray-900 dark:text-white outline-none transition-colors ${errors.email
                                    ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950/40'
                                    : 'border-gray-300 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:hover:border-gray-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40'
                                }`}
                            />
                            {formData.email && !errors.email && (
                                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500">
                                    <HiOutlineCheckCircle className="h-4.5 w-4.5" />
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
                            <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                Password
                            </label>
                            <Link
                                to="/forgot-password"
                                className="text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineLockClosed className="h-4.5 w-4.5" />
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
                                className={`h-11 w-full rounded-lg border pl-10 pr-11 text-sm bg-white dark:bg-[#07130e] text-gray-900 dark:text-white outline-none transition-colors ${errors.password
                                    ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950/40'
                                    : 'border-gray-300 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:hover:border-gray-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40'
                                }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 dark:hover:text-gray-300"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword
                                    ? <HiOutlineEyeOff className="h-4.5 w-4.5" />
                                    : <HiOutlineEye className="h-4.5 w-4.5" />
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
                <div className="mt-6 border-t border-gray-200/80 pt-4.5 dark:border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Additional Options</p>
                    <div className="mt-3 flex flex-col gap-3.5">
                        <div>
                            <Link
                                to="/register"
                                className="inline-flex items-center text-xs sm:text-sm font-semibold text-brand-700 transition-colors hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-emerald-400 dark:hover:text-emerald-300"
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
                                className="inline-flex items-center text-xs sm:text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:text-white"
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
