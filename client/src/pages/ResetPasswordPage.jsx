import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from '../router';
import PageHeader from '../components/ui/PageHeader';
import api from '../services/api';
import { isPasswordPolicyCompliant, PASSWORD_MIN_CHARACTERS, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
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
    const timeoutRef = useRef(null);

    useEffect(() => () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (loading) return;

        if (!token) {
            toast.error('This password reset link is invalid or has expired. Please request a new one.');
            return;
        }

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

            if (response?.data?.success) {
                setSuccess(true);
                toast.success('Password reset successful!');
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    navigate('/login');
                }, 3000);
            } else {
                const message = response?.data?.message != null && response.data.message !== ''
                    ? String(response.data.message)
                    : 'Failed to reset password';
                toast.error(message);
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to reset password';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const passwordChecks = [
        { label: `${PASSWORD_MIN_CHARACTERS}+ characters, within bcrypt limit`, met: isPasswordPolicyCompliant(formData.password) },
        { label: 'Passwords match', met: formData.password === formData.confirmPassword && formData.password !== '' },
    ];

    if (!token) {
        return (
            <div className="w-full py-2">
                <Link
                    to="/login"
                    className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                    <HiOutlineArrowLeft className="h-4 w-4" /> Back to login
                </Link>
                <div className="form-surface w-full" role="alert">
                    <h1 className="page-title">
                        Invalid reset link
                    </h1>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 sm:text-sm leading-relaxed">
                        This password reset link is missing or invalid. Please request a new one.
                    </p>
                    <div className="mt-5">
                        <Link
                            to="/forgot-password"
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                            Request a new link
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

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
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
                <HiOutlineArrowLeft className="h-4 w-4" /> Back to login
            </Link>

            {/* Main Card Container */}
            <div className="form-surface w-full">
                {!success ? (
                    <>
                        {/* Header */}
                        <PageHeader className="mb-6" eyebrow="Password Reset" title="Set a new password" description="Enter and confirm your new secure account password below." />

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="reset-password" className="field-label">
                                    New Password
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <HiOutlineLockClosed className="h-4.5 w-4.5" />
                                    </div>
                                    <input
                                        id="reset-password"
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder={`At least ${PASSWORD_MIN_CHARACTERS} characters`}
                                        required
                                        minLength={PASSWORD_MIN_CHARACTERS}
                                        maxLength={72}
                                        className="field-control pl-10 pr-12"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(prev => !prev)}
                                        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <HiOutlineEyeOff className="h-4.5 w-4.5" /> : <HiOutlineEye className="h-4.5 w-4.5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="reset-confirm-password" className="field-label">
                                    Confirm New Password
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <HiOutlineLockClosed className="h-4.5 w-4.5" />
                                    </div>
                                    <input
                                        id="reset-confirm-password"
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        placeholder="Re-enter your password"
                                        required
                                        minLength={PASSWORD_MIN_CHARACTERS}
                                        maxLength={72}
                                        className="field-control pl-10 pr-12"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(prev => !prev)}
                                        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                    >
                                        {showConfirmPassword ? <HiOutlineEyeOff className="h-4.5 w-4.5" /> : <HiOutlineEye className="h-4.5 w-4.5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Password Requirements */}
                            <div className="rounded-lg bg-[var(--surface-muted)] p-4">
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
                                className="btn-primary w-full disabled:opacity-60"
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

                        <h1 className="page-title">
                            Password Reset Successful
                        </h1>
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
