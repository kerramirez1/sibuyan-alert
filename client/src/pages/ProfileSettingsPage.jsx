import { useState, useEffect, useRef } from 'react';
import { useNavigate } from '../router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import toast from '../utils/appToast';
import { resolveAssetUrl } from '../utils/assets';
import { isPasswordPolicyCompliant, PASSWORD_MIN_CHARACTERS, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import {
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineCamera,
    HiOutlinePhotograph,
    HiOutlineX,
    HiOutlineBell,
    HiOutlineLockClosed,
} from 'react-icons/hi';

const ROLE_DISPLAY_NAMES = {
    municipal_admin: 'Municipal Admin',
    responder: 'Responder',
    reporter: 'Reporter',
    ordinary: 'Community Member',
};

const ROLE_DOT_COLORS = {
    municipal_admin: 'bg-indigo-500',
    responder: 'bg-cyan-500',
    reporter: 'bg-emerald-500',
    ordinary: 'bg-gray-400',
};

const ProfileSettingsPage = () => {
    const {
        user,
        updateUser,
        pushState,
        enablePushNotifications,
        disablePushNotifications,
        sendTestPushNotification,
    } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const avatarInputRef = useRef(null);     // gallery / file picker
    const videoRef = useRef(null);           // webcam video element
    const streamRef = useRef(null);          // webcam media stream
    const [isWebcamOpen, setIsWebcamOpen] = useState(false);
    const [showPhotoMenu, setShowPhotoMenu] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        avatar: null,
    });
    const [errors, setErrors] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                name: user.name || '',
                email: user.email || '',
            }));
            if (user.avatar) {
                setAvatarPreview(resolveAssetUrl(user.avatar));
            }
        }
    }, [user]);

    useEffect(() => {
        return () => {
            if (avatarPreview?.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreview);
            }
        };
    }, [avatarPreview]);

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Image must be less than 5MB');
                return;
            }
            if (avatarPreview?.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreview);
            }
            setFormData(prev => ({ ...prev, avatar: file }));
            setAvatarPreview(URL.createObjectURL(file));
            e.target.value = '';
        }
    };

    const startWebcam = async () => {
        setShowPhotoMenu(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            streamRef.current = stream;
            setIsWebcamOpen(true);
        } catch (err) {
            toast.error('Could not access camera. Please allow camera permissions.');
            console.error('Camera error:', err);
        }
    };

    const stopWebcam = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsWebcamOpen(false);
    };

    const captureWebcamPhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');

            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, 0, 0);

            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], "camera-photo.jpg", { type: "image/jpeg" });

                    if (avatarPreview?.startsWith('blob:')) {
                        URL.revokeObjectURL(avatarPreview);
                    }
                    setFormData(prev => ({ ...prev, avatar: file }));
                    setAvatarPreview(URL.createObjectURL(file));
                    stopWebcam();
                }
            }, 'image/jpeg', 0.9);
        }
    };

    useEffect(() => {
        if (isWebcamOpen && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [isWebcamOpen]);

    const triggerCamera = () => {
        startWebcam();
    };

    const triggerGallery = () => {
        setShowPhotoMenu(false);
        avatarInputRef.current?.click();
    };

    const openPhotoMenu = (e) => {
        e.stopPropagation();
        setShowPhotoMenu(prev => !prev);
    };

    const emailChanged = formData.email.trim().toLowerCase()
        !== (user?.email || '').trim().toLowerCase();
    const passwordChangeRequested = Boolean(formData.newPassword || formData.confirmPassword);
    const hasPasswordInput = Boolean(formData.currentPassword || passwordChangeRequested);

    const hasChanges = Boolean(
        formData.avatar ||
        formData.name.trim() !== (user?.name || '').trim() ||
        emailChanged ||
        hasPasswordInput
    );

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!hasChanges) {
            toast('No changes to save');
            return;
        }

        const newErrors = {};

        if (passwordChangeRequested) {
            if (!formData.currentPassword) {
                newErrors.currentPassword = 'Enter your current password';
            }
            if (!formData.newPassword) {
                newErrors.newPassword = 'Enter a new password';
            } else if (!isPasswordPolicyCompliant(formData.newPassword)) {
                newErrors.newPassword = PASSWORD_POLICY_MESSAGE;
            }
            if (!formData.confirmPassword) {
                newErrors.confirmPassword = 'Confirm your new password';
            } else if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
                newErrors.confirmPassword = 'Passwords do not match';
            }
        }

        if (emailChanged && !formData.currentPassword) {
            newErrors.currentPassword = 'Enter your current password to change your email address';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            const firstErrorMessage = Object.values(newErrors)[0];
            toast.error(firstErrorMessage);
            return;
        }

        setLoading(true);

        try {
            const data = new FormData();
            const trimmedName = formData.name.trim();
            const trimmedEmail = formData.email.trim().toLowerCase();

            if (trimmedName !== (user?.name || '').trim()) {
                data.append('name', trimmedName);
            }
            if (trimmedEmail !== (user?.email || '').trim().toLowerCase()) {
                data.append('email', trimmedEmail);
            }
            if (emailChanged || passwordChangeRequested) {
                data.append('currentPassword', formData.currentPassword);
            }
            if (passwordChangeRequested) {
                data.append('newPassword', formData.newPassword);
            }
            if (formData.avatar) {
                data.append('avatar', formData.avatar);
            }

            const response = await authAPI.updateProfile(data);

            if (response.data.success) {
                updateUser(response.data.data);
                toast.success('Profile updated successfully');
                setErrors({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: '',
                });
                setFormData(prev => ({
                    ...prev,
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: '',
                    avatar: null,
                }));
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to update profile';
            if (message.toLowerCase().includes('current password')) {
                setErrors(prev => ({ ...prev, currentPassword: message }));
            } else if (message.toLowerCase().includes('password')) {
                setErrors(prev => ({ ...prev, newPassword: message }));
            }
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handlePushToggle = async () => {
        if (pushState.subscribed) {
            const result = await disablePushNotifications();
            if (result.success) toast.success('Browser notifications disabled');
            else toast.error('Could not disable browser notifications');
            return;
        }

        const result = await enablePushNotifications();
        if (result.success) {
            toast.success('Browser notifications enabled');
            return;
        }

        const messages = {
            denied: 'Notifications are blocked. Allow them in your browser site settings, then try again.',
            unsupported: 'This browser does not support Web Push notifications.',
            unconfigured: 'Browser notifications are not configured on this deployment.',
            save_failed: 'The browser subscribed, but the account could not be updated. Please try again.',
        };
        toast.error(messages[result.status] || 'Could not enable browser notifications');
    };

    const handleTestPush = async () => {
        const result = await sendTestPushNotification();
        if (result.success) toast.success('Test notification sent');
        else toast.error(result.message);
    };

    const roleName = ROLE_DISPLAY_NAMES[user?.role] || user?.role || 'User';
    const roleDotColor = ROLE_DOT_COLORS[user?.role] || 'bg-gray-400';

    return (
        <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4 sm:space-y-5 overflow-x-hidden pb-10">
            {/* Page Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Account
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Profile settings
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Update your personal information and account preferences.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 shadow-2xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Sibuyan Island · Alert System Active</span>
                    </div>
                </div>
            </header>

            {/* Account Identity Row */}
            <section
                className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                aria-label="Account identity summary"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                            {avatarPreview ? (
                                <img
                                    src={avatarPreview}
                                    alt="Profile avatar"
                                    className="h-16 w-16 sm:h-18 sm:w-18 rounded-2xl object-cover border border-gray-200/90 shadow-2xs dark:border-white/10"
                                />
                            ) : (
                                <div className="flex h-16 w-16 sm:h-18 sm:w-18 items-center justify-center rounded-2xl bg-brand-700 font-display text-2xl font-bold text-white shadow-2xs dark:bg-brand-600">
                                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                </div>
                            )}
                        </div>

                        {/* User Details */}
                        <div className="min-w-0">
                            <h2 className="truncate font-display text-base sm:text-lg font-bold text-gray-950 dark:text-white">
                                {user?.name || 'User'}
                            </h2>
                            <p className="truncate text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                {user?.email}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/90 bg-gray-50/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${roleDotColor}`} aria-hidden="true" />
                                    <span>{roleName}</span>
                                    {user?.assignedMunicipality && (
                                        <span className="text-gray-400 dark:text-gray-500">· {user.assignedMunicipality}</span>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Change Photo Action Button */}
                    <div className="relative shrink-0 sm:self-center">
                        <button
                            type="button"
                            onClick={openPhotoMenu}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                            aria-expanded={showPhotoMenu}
                            aria-haspopup="true"
                            aria-label="Change profile photo"
                        >
                            <HiOutlineCamera className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                            <span>Change photo</span>
                        </button>

                        {/* Photo Source Dropdown Menu */}
                        {showPhotoMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setShowPhotoMenu(false)}
                                    aria-hidden="true"
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 6 }}
                                    transition={{ duration: 0.12 }}
                                    className="absolute right-0 top-full mt-1.5 z-30 w-52 overflow-hidden rounded-xl border border-gray-200/90 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#0c1813]"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <button
                                        type="button"
                                        onClick={triggerCamera}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
                                    >
                                        <HiOutlineCamera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                        <span>Take photo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={triggerGallery}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
                                    >
                                        <HiOutlinePhotograph className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                        <span>Choose from device</span>
                                    </button>
                                </motion.div>
                            </>
                        )}

                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            onChange={handleAvatarChange}
                            className="hidden"
                            aria-label="Upload profile image from device"
                        />
                    </div>
                </div>
            </section>

            {/* Main Settings Form */}
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                {/* Unified Settings Workspace Surface */}
                <div className="divide-y divide-gray-200/80 overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/90">
                    {/* 1. Basic Information Section */}
                    <section className="p-4 sm:p-6" aria-labelledby="basic-info-heading">
                        <div className="mb-4">
                            <h3 id="basic-info-heading" className="text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                Basic information
                            </h3>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                Update your full display name and contact email.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="name-input" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Full name
                                </label>
                                <input
                                    id="name-input"
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="h-10 w-full rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs sm:text-sm font-medium text-gray-950 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                    placeholder="Enter your full name"
                                />
                            </div>
                            <div>
                                <label htmlFor="email-input" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Email address
                                </label>
                                <input
                                    id="email-input"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="h-10 w-full rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs sm:text-sm font-medium text-gray-950 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                                    placeholder="Enter email address"
                                />
                            </div>
                        </div>
                    </section>

                    {/* 2. Protected Information Section */}
                    <section className="p-4 sm:p-6" aria-labelledby="protected-info-heading">
                        <div className="mb-4">
                            <div className="flex items-center gap-1.5">
                                <HiOutlineLockClosed className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                                <h3 id="protected-info-heading" className="text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                    Protected information
                                </h3>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                System-assigned operational attributes and permissions managed by administrators.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Account role
                                </span>
                                <p className="mt-1 font-semibold text-xs sm:text-sm text-gray-950 dark:text-white">
                                    {roleName}
                                </p>
                            </div>

                            {user?.assignedMunicipality && (
                                <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Municipality
                                    </span>
                                    <p className="mt-1 font-semibold text-xs sm:text-sm text-gray-950 dark:text-white">
                                        {user.assignedMunicipality}
                                    </p>
                                </div>
                            )}

                            {user?.agency && (
                                <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Agency / Unit
                                    </span>
                                    <p className="mt-1 font-semibold text-xs sm:text-sm text-gray-950 dark:text-white">
                                        {user.agency}
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 3. Browser Notifications Section */}
                    <section className="p-4 sm:p-6" aria-labelledby="notifications-heading">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    <HiOutlineBell className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                    <h3 id="notifications-heading" className="text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                        Browser notifications
                                    </h3>
                                    <p className="mt-0.5 max-w-xl text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                        Receive incident, dispatch, response, and account updates even when Sibuyan Alert is not open.
                                    </p>
                                    <div className="mt-2 flex items-center gap-1.5" aria-live="polite">
                                        <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${
                                                pushState.subscribed
                                                    ? 'bg-emerald-500'
                                                    : pushState.permission === 'denied'
                                                        ? 'bg-amber-500'
                                                        : 'bg-gray-400'
                                            }`}
                                            aria-hidden="true"
                                        />
                                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                            {pushState.loading
                                                ? 'Checking this browser…'
                                                : pushState.subscribed
                                                    ? 'Enabled on this browser'
                                                    : pushState.permission === 'denied'
                                                        ? 'Blocked in browser settings'
                                                        : pushState.supported === false
                                                            ? 'Not supported by this browser'
                                                            : 'Disabled on this browser'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                                {pushState.subscribed && (
                                    <button
                                        type="button"
                                        onClick={handleTestPush}
                                        disabled={pushState.loading}
                                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                    >
                                        Send test
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handlePushToggle}
                                    disabled={pushState.loading || pushState.supported === false}
                                    aria-pressed={pushState.subscribed}
                                    className={`inline-flex h-9 items-center justify-center rounded-xl px-4 text-xs font-semibold shadow-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        pushState.subscribed
                                            ? 'border border-gray-200/90 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10'
                                            : 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-brand-600 dark:hover:bg-brand-500'
                                    }`}
                                >
                                    {pushState.loading
                                        ? 'Please wait…'
                                        : pushState.subscribed ? 'Disable' : 'Enable notifications'}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* 4. Security / Change Password Section */}
                    <section className="p-4 sm:p-6" aria-labelledby="security-heading">
                        <div className="mb-4 sm:mb-5">
                            <h3 id="security-heading" className="text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                Change password
                            </h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                Leave these fields blank if you do not want to change your password.
                            </p>
                        </div>

                        <div className="space-y-4 sm:space-y-4.5">
                            {/* Current Password (Full Width) */}
                            <div>
                                <label
                                    htmlFor="current-password-input"
                                    className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                                >
                                    Current password
                                </label>
                                <div className="relative">
                                    <input
                                        id="current-password-input"
                                        type={showCurrentPassword ? 'text' : 'password'}
                                        name="currentPassword"
                                        value={formData.currentPassword}
                                        onChange={handleChange}
                                        className={`h-10 w-full rounded-xl border bg-white pl-3.5 pr-10 text-xs sm:text-sm font-medium text-gray-950 shadow-2xs outline-none transition placeholder:text-gray-400 focus:ring-2 dark:bg-[#07130e] dark:text-white ${
                                            errors.currentPassword
                                                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
                                                : 'border-gray-200/90 focus:border-brand-500 focus:ring-brand-500/20 dark:border-white/10'
                                        }`}
                                        placeholder="Enter current password"
                                        maxLength={72}
                                        aria-invalid={Boolean(errors.currentPassword)}
                                        aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPassword(prev => !prev)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                        aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                                    >
                                        {showCurrentPassword ? <HiOutlineEyeOff className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.currentPassword && (
                                    <p id="current-password-error" className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                                        {errors.currentPassword}
                                    </p>
                                )}
                            </div>

                            {/* New Password & Confirm Password (2-Column Grid on Desktop) */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="new-password-input"
                                        className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                                    >
                                        New password
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="new-password-input"
                                            type={showNewPassword ? 'text' : 'password'}
                                            name="newPassword"
                                            value={formData.newPassword}
                                            onChange={handleChange}
                                            className={`h-10 w-full rounded-xl border bg-white pl-3.5 pr-10 text-xs sm:text-sm font-medium text-gray-950 shadow-2xs outline-none transition placeholder:text-gray-400 focus:ring-2 dark:bg-[#07130e] dark:text-white ${
                                                errors.newPassword
                                                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
                                                    : 'border-gray-200/90 focus:border-brand-500 focus:ring-brand-500/20 dark:border-white/10'
                                            }`}
                                            placeholder="Enter new password"
                                            maxLength={72}
                                            aria-invalid={Boolean(errors.newPassword)}
                                            aria-describedby={errors.newPassword ? 'new-password-error' : 'new-password-helper'}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(prev => !prev)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                            aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                                        >
                                            {showNewPassword ? <HiOutlineEyeOff className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    {errors.newPassword ? (
                                        <p id="new-password-error" className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                                            {errors.newPassword}
                                        </p>
                                    ) : (
                                        <p id="new-password-helper" className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                                            {`At least ${PASSWORD_MIN_CHARACTERS} characters.`}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label
                                        htmlFor="confirm-password-input"
                                        className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                                    >
                                        Confirm password
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="confirm-password-input"
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            className={`h-10 w-full rounded-xl border bg-white pl-3.5 pr-10 text-xs sm:text-sm font-medium text-gray-950 shadow-2xs outline-none transition placeholder:text-gray-400 focus:ring-2 dark:bg-[#07130e] dark:text-white ${
                                                errors.confirmPassword
                                                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
                                                    : 'border-gray-200/90 focus:border-brand-500 focus:ring-brand-500/20 dark:border-white/10'
                                            }`}
                                            placeholder="Re-enter new password"
                                            maxLength={72}
                                            aria-invalid={Boolean(errors.confirmPassword)}
                                            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(prev => !prev)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                        >
                                            {showConfirmPassword ? <HiOutlineEyeOff className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    {errors.confirmPassword && (
                                        <p id="confirm-password-error" className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                                            {errors.confirmPassword}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Save & Cancel Footer Actions */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-1">
                    <button
                        type="button"
                        onClick={() => navigate(user?.role === 'reporter' ? '/my-reports' : '/dashboard')}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200/90 bg-white px-5 text-xs sm:text-sm font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading || !hasChanges}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-700 px-6 text-xs sm:text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-brand-600 dark:hover:bg-brand-500"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Saving...</span>
                            </span>
                        ) : (
                            'Save changes'
                        )}
                    </button>
                </div>
            </form>

            {/* Webcam Capture Modal */}
            <AnimatePresence>
                {isWebcamOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="webcam-modal-title"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-gray-950/70 backdrop-blur-xs"
                            onClick={stopWebcam}
                        />

                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 8 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 8 }}
                            transition={{ duration: 0.15 }}
                            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0c1813]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-gray-200/80 bg-gray-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                                <h3 id="webcam-modal-title" className="text-sm font-bold text-gray-950 dark:text-white flex items-center gap-2">
                                    <HiOutlineCamera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                    Take profile photo
                                </h3>
                                <button
                                    type="button"
                                    onClick={stopWebcam}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors"
                                    aria-label="Close camera"
                                >
                                    <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </div>

                            <div className="relative bg-black aspect-square sm:aspect-video flex items-center justify-center overflow-hidden">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover -scale-x-100"
                                />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-36 w-36 rounded-full border-2 border-dashed border-white/60 pointer-events-none" />
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-gray-200/80 bg-gray-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                                <button
                                    type="button"
                                    onClick={stopWebcam}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white px-4 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={captureWebcamPhoto}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-brand-600 dark:hover:bg-brand-500"
                                >
                                    <HiOutlineCamera className="h-4 w-4" aria-hidden="true" />
                                    Capture photo
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProfileSettingsPage;
