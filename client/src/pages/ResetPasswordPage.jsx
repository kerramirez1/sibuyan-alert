import { useState } from 'react';
import { useParams, useNavigate, Link } from '../router';
import api from '../services/api';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import toast from '../utils/appToast';
import {
    HiOutlineLockClosed,
    HiOutlineCheckCircle,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineArrowLeft,
    HiOutlineCheck,
} from 'react-icons/hi';

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
        <div className="w-full py-2">
            {/* Mobile Brand Header */}
            <div className="mb-5 flex items-center gap-2.5 lg:hidden">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-2xs dark:border-white/10 dark:bg-white/10">
                    <img src="/icons/Alert.png" alt="" className="h-full w-full object-contain" />
                </div>
                <div>
                    <p className="font-display text-base font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
                        Sibuyan <span className="text-emerald-700 dark:text-emerald-400">Alert</span>
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
                {!success ? (
                    <>
                        {/* Header */}
                        <div className="mb-6">
                            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                Password Reset
                            </p>
                            <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                                Set a new password
                            </h1>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm leading-relaxed">
                                Enter and confirm your new secure account password below.
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    New Password
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <HiOutlineLockClosed className="h-4.5 w-4.5" />
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="At least 12 characters"
                                        required
                                        minLength={12}
                                        maxLength={72}
                                        className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-11 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-[#07130e] dark:text-white dark:hover:border-gray-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(prev => !prev)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:text-gray-300"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <HiOutlineEyeOff className="h-4.5 w-4.5" /> : <HiOutlineEye className="h-4.5 w-4.5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    Confirm New Password
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <HiOutlineLockClosed className="h-4.5 w-4.5" />
                                    </div>
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        placeholder="Re-enter your password"
                                        required
                                        minLength={12}
                                        maxLength={72}
                                        className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-11 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-[#07130e] dark:text-white dark:hover:border-gray-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(prev => !prev)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:text-gray-300"
                                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                    >
                                        {showConfirmPassword ? <HiOutlineEyeOff className="h-4.5 w-4.5" /> : <HiOutlineEye className="h-4.5 w-4.5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Password Requirements */}
                            <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-3.5 dark:border-white/10 dark:bg-[#07130e]">
                                <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    Password requirements:
                                </p>
                                <ul className="space-y-1.5">
                                    {passwordChecks.map((check, idx) => (
                                        <li key={idx} className="flex items-center gap-2">
                                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${check.met ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}>
                                                {check.met ? <HiOutlineCheck className="h-3 w-3" /> : '•'}
                                            </span>
                                            <span className={`text-xs ${check.met ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {check.label}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
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
                                            <span>Resetting...</span>
                                        </>
                                    ) : (
                                        'Reset Password'
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
                            Password Reset Successful
                        </h2>
                        <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            Your password has been successfully reset. Redirecting to login…
                        </p>

                        <div className="mt-5">
                            <Link
                                to="/login"
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                                Go to Login
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordPage;
