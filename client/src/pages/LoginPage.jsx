import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
            const result = await login(formData.email, formData.password);
            if (!result?.success) {
                setErrors({ form: result?.message || 'Unable to sign in. Please check your credentials and try again.' });
            }
        } catch (error) {
            console.error(error);
            setErrors({ form: 'Unable to sign in. Please try again.' });
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
            <div className="w-full rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
                {/* Mobile Logo */}
                <div className="mb-7 flex items-center gap-3 lg:hidden">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-1">
                        <img src="/icons/Alert.png" alt="" className="h-full w-full object-contain" />
                    </div>
                    <div>
                        <p className="font-display text-lg font-bold leading-none text-gray-900">
                            Sibuyan <span className="text-brand-600">Alert</span>
                        </p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Accident Alert &amp; Mapping</p>
                    </div>
                </div>

                {/* Header */}
                <div className="mb-7">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Account access</p>
                    <h2 className="mb-2 font-display text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                        Welcome back
                    </h2>
                    <p className="text-sm leading-6 text-gray-600">
                        Sign in to access your <span className="text-brand-700 font-semibold">Sibuyan Alert</span> account.
                    </p>
                </div>

                {/* Session Expired Warning */}
                {isExpired && (
                    <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700" role="alert">
                        <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium">Session expired. Please sign in again.</span>
                    </div>
                )}

                {/* Login Form */}
                <form
                    onSubmit={handleSubmit}
                    className="space-y-5"
                >
                    {/* Email Field */}
                    <div>
                        <label htmlFor="login-email" className="block text-sm font-semibold text-gray-700 mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                <HiOutlineMail className="w-5 h-5" />
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
                            <p
                                id="login-email-error"
                                role="alert"
                                className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1.5"
                            >
                                <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                                {errors.email}
                            </p>
                        )}
                    </div>

                    {/* Password Field */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label htmlFor="login-password" className="block text-sm font-semibold text-gray-700">
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
                                id="login-password"
                                name="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                aria-invalid={Boolean(errors.password)}
                                aria-describedby={errors.password ? 'login-password-error' : undefined}
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
                            <p
                                id="login-password-error"
                                role="alert"
                                className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1.5"
                            >
                                <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                                {errors.password}
                            </p>
                        )}
                    </div>

                    {/* Form Error */}
                    {errors.form && (
                        <div
                            className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"
                            role="alert"
                        >
                            <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                            <span className="text-sm font-medium">{errors.form}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="min-h-12 w-full rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
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
                                    <span>Sign in</span>
                                    <HiOutlineArrowRight className="w-4.5 h-4.5" />
                                </>
                            )}
                        </span>
                    </button>
                </form>

                {/* Secondary Actions */}
                <div className="my-6 flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-gray-200" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Other options</span>
                    <span className="h-px flex-1 bg-gray-200" />
                </div>
                <div className="space-y-2.5">
                    <Link
                        to="/register"
                        className="group flex min-h-[68px] w-full items-center gap-3 rounded-xl border border-gray-200 p-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                            <HiOutlineUserAdd className="h-5 w-5 text-brand-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-gray-900">
                                Register as a reporter
                            </h3>
                            <p className="text-xs text-gray-600">
                                Administrator approval is required before reporting
                            </p>
                        </div>
                        <HiOutlineArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                    </Link>

                    <Link
                        to="/dashboard?view=map"
                        className="group flex min-h-[68px] w-full items-center gap-3 rounded-xl border border-gray-200 p-3.5 transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                            <HiOutlineGlobe className="h-5 w-5 text-gray-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-gray-900">
                                View public incident map
                            </h3>
                            <p className="text-xs text-gray-600">Published incidents and risk zones · no sign-in required</p>
                        </div>
                        <HiOutlineArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
