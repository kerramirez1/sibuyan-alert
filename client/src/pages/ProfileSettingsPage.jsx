import { useState, useEffect, useRef } from 'react';
import { useNavigate } from '../router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import toast from '../utils/appToast';
import { resolveAssetUrl } from '../utils/assets';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import { HiOutlineEye, HiOutlineEyeOff, HiOutlineCamera, HiOutlineUser, HiOutlineKey, HiOutlineShieldCheck, HiOutlineInformationCircle, HiOutlinePhotograph, HiOutlineX, HiOutlineBell } from 'react-icons/hi';

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
            // Reset so the same file can be re-selected if needed
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

            // Handle mirroring since we use user-facing camera
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
        // Attach stream to video tag when modal opens
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

        if (passwordChangeRequested) {
            if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
                toast.error('Fill in current, new, and confirm password fields');
                return;
            }

            if (!isPasswordPolicyCompliant(formData.newPassword)) {
                toast.error(PASSWORD_POLICY_MESSAGE);
                return;
            }

            if (formData.newPassword !== formData.confirmPassword) {
                toast.error('New passwords do not match');
                return;
            }
        }

        if (emailChanged && !formData.currentPassword) {
            toast.error('Enter your current password to change your email address');
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

    const InputField = ({ label, icon: LabelIcon, ...inputProps }) => (
        <div>
            <label className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                {LabelIcon && <LabelIcon className="w-3.5 h-3.5 text-gray-400" />}
                {label}
            </label>
            <input
                {...inputProps}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm hover:shadow-md hover:border-gray-300"
            />
        </div>
    );

    const PasswordField = ({ label, name, value, show, onToggle, placeholder }) => (
        <div>
            <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                {label}
            </label>
            <div className="relative">
                <input
                    type={show ? 'text' : 'password'}
                    name={name}
                    value={value}
                    onChange={handleChange}
                    className="w-full px-3 sm:px-4 pr-12 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm hover:shadow-md hover:border-gray-300"
                    placeholder={placeholder}
                    maxLength={72}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={show ? `Hide ${label}` : `Show ${label}`}
                >
                    {show ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto px-1 sm:px-0 pb-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {/* Header */}
                <div className="mb-5 sm:mb-7">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0 transition-transform duration-300 hover:scale-110 hover:rotate-3">
                            <HiOutlineUser className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-display font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-gray-700 bg-clip-text text-transparent">
                                Profile Settings
                            </h1>
                            <p className="text-gray-500 text-xs sm:text-sm mt-0.5 leading-snug">
                                Update your personal information and preferences
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                    {/* Avatar Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm"
                    >
                        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                            {/* Avatar — photo picker popup */}
                            <div className="relative" onClick={() => showPhotoMenu && setShowPhotoMenu(false)}>
                                {/* Dismiss backdrop */}
                                {showPhotoMenu && (
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setShowPhotoMenu(false)}
                                    />
                                )}

                                {/* Avatar image */}
                                <div className="relative group cursor-pointer" onClick={openPhotoMenu}>
                                    {avatarPreview ? (
                                        <img
                                            src={avatarPreview}
                                            alt="Profile"
                                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-blue-100 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:border-blue-200"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl sm:text-4xl font-bold shadow-lg group-hover:shadow-xl transition-all duration-300">
                                            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                                        </div>
                                    )}
                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center pointer-events-none">
                                        <HiOutlineCamera className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                    </div>
                                    {/* Camera badge */}
                                    <button
                                        type="button"
                                        onClick={openPhotoMenu}
                                        className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 ring-2 ring-white"
                                        title="Change profile photo"
                                    >
                                        <HiOutlineCamera className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                    </button>
                                </div>

                                {/* ── Photo Source Popup ── */}
                                {showPhotoMenu && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: 8 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: 8 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute left-0 top-full mt-3 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 min-w-[200px]"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-1.5 pb-2">
                                            Change Photo
                                        </p>
                                        {/* Take Photo */}
                                        <button
                                            type="button"
                                            onClick={triggerCamera}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition-colors group/btn text-left"
                                        >
                                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm group-hover/btn:scale-105 transition-transform">
                                                <HiOutlineCamera className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">Take Photo</p>
                                                <p className="text-[10px] text-gray-400">Use camera</p>
                                            </div>
                                        </button>
                                        {/* Choose from Gallery */}
                                        <button
                                            type="button"
                                            onClick={triggerGallery}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group/btn text-left"
                                        >
                                            <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm group-hover/btn:scale-105 transition-transform">
                                                <HiOutlinePhotograph className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">Choose from Gallery</p>
                                                <p className="text-[10px] text-gray-400">Pick an existing photo</p>
                                            </div>
                                        </button>
                                    </motion.div>
                                )}

                                {/* Gallery input — opens file picker */}
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/png, image/jpeg, image/jpg, image/webp"
                                    onChange={handleAvatarChange}
                                    className="hidden"
                                    aria-label="Choose from gallery"
                                />
                            </div>

                            <div className="text-center sm:text-left">
                                <h3 className="text-lg sm:text-xl font-bold text-gray-900">{user?.name || 'User'}</h3>
                                <p className="text-gray-500 text-sm">{user?.email}</p>
                                <div className="flex items-center gap-3 mt-2 justify-center sm:justify-start">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold rounded-lg uppercase tracking-wide">
                                        <HiOutlineShieldCheck className="w-3 h-3" />
                                        {user?.role || 'User'}
                                    </span>
                                    {user?.assignedMunicipality && (
                                        <span className="text-[10px] sm:text-xs text-gray-400 font-medium">
                                            {user.assignedMunicipality}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-[10px] sm:text-xs text-gray-400 flex items-center gap-1 justify-center sm:justify-start">
                                    <HiOutlineInformationCircle className="w-3 h-3" />
                                    PNG, JPG up to 5MB. Tap photo to change.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Basic Information */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm"
                    >
                        <h3 className="font-bold text-gray-900 text-sm sm:text-base mb-4 flex items-center gap-2">
                            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                                <HiOutlineUser className="w-4 h-4 text-blue-600" />
                            </div>
                            Basic Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <InputField
                                label="Full Name"
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                            />
                            <InputField
                                label="Email Address"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </motion.div>

                    {/* Protected Information */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm"
                    >
                        <h3 className="font-bold text-gray-900 text-sm sm:text-base mb-4 flex items-center gap-2">
                            <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                                <HiOutlineShieldCheck className="w-4 h-4 text-gray-500" />
                            </div>
                            Protected Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-gray-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-gray-100">
                            <div>
                                <label className="block text-xs sm:text-sm font-bold text-gray-500 mb-1.5">Role</label>
                                <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-100 rounded-lg sm:rounded-xl text-sm bg-gray-50 text-gray-500 cursor-not-allowed">
                                    {user?.role?.toUpperCase() || '—'}
                                </div>
                            </div>
                            {user?.agency && (
                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-500 mb-1.5">Agency</label>
                                    <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-100 rounded-lg sm:rounded-xl text-sm bg-gray-50 text-gray-500 cursor-not-allowed">
                                        {user.agency}
                                    </div>
                                </div>
                            )}
                            {user?.assignedMunicipality && (
                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-500 mb-1.5">Municipality</label>
                                    <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-100 rounded-lg sm:rounded-xl text-sm bg-gray-50 text-gray-500 cursor-not-allowed">
                                        {user.assignedMunicipality}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Browser Notifications */}
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm"
                        aria-labelledby="browser-notifications-heading"
                    >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                                    <HiOutlineBell className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                                </div>
                                <div>
                                    <h3 id="browser-notifications-heading" className="text-sm font-bold text-gray-900 sm:text-base">
                                        Browser notifications
                                    </h3>
                                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500 sm:text-sm">
                                        Receive verified report, dispatch, response, and account updates even when this page is not open.
                                    </p>
                                    <p className="mt-2 text-xs font-semibold text-gray-600" aria-live="polite">
                                        {pushState.loading
                                            ? 'Checking this browser…'
                                            : pushState.subscribed
                                                ? 'Enabled on this browser'
                                                : pushState.permission === 'denied'
                                                    ? 'Blocked in browser settings'
                                                    : pushState.supported === false
                                                        ? 'Not supported by this browser'
                                                        : 'Disabled on this browser'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                                {pushState.subscribed && (
                                    <button
                                        type="button"
                                        onClick={handleTestPush}
                                        disabled={pushState.loading}
                                        className="min-h-11 rounded-xl border border-transparent bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                                    >
                                        Send test
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handlePushToggle}
                                    disabled={pushState.loading || pushState.supported === false}
                                    aria-pressed={pushState.subscribed}
                                    className={`min-h-11 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        pushState.subscribed
                                            ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                >
                                    {pushState.loading
                                        ? 'Please wait…'
                                        : pushState.subscribed ? 'Disable' : 'Enable notifications'}
                                </button>
                            </div>
                        </div>
                    </motion.section>

                    {/* Change Password */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm"
                    >
                        <h3 className="font-bold text-gray-900 text-sm sm:text-base mb-1 flex items-center gap-2">
                            <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
                                <HiOutlineKey className="w-4 h-4 text-amber-600" />
                            </div>
                            Change Password
                        </h3>
                        <p className="text-[10px] sm:text-xs text-gray-400 mb-4 ml-9">
                            Leave blank if you don't want to change
                        </p>

                        <div className="space-y-3 sm:space-y-4">
                            <PasswordField
                                label="Current Password"
                                name="currentPassword"
                                value={formData.currentPassword}
                                show={showCurrentPassword}
                                onToggle={() => setShowCurrentPassword(prev => !prev)}
                                placeholder="Enter current password"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <PasswordField
                                    label="New Password"
                                    name="newPassword"
                                    value={formData.newPassword}
                                    show={showNewPassword}
                                    onToggle={() => setShowNewPassword(prev => !prev)}
                                    placeholder="At least 12 characters"
                                />
                                <PasswordField
                                    label="Confirm Password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    show={showConfirmPassword}
                                    onToggle={() => setShowConfirmPassword(prev => !prev)}
                                    placeholder="Re-enter password"
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Actions */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2"
                    >
                        <button
                            type="button"
                            onClick={() => navigate(user?.role === 'reporter' ? '/my-reports' : '/dashboard')}
                            className="w-full sm:w-auto px-6 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-700 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !hasChanges}
                            className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-95"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </span>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </motion.div>
                </form>
            </motion.div>

            {/* Webcam Modal Overlay */}
            <AnimatePresence>
                {isWebcamOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-md w-full"
                        >
                            <div className="flex justify-between items-center p-4 border-b border-gray-100">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <HiOutlineCamera className="w-5 h-5 text-gray-500" />
                                    Take Photo
                                </h3>
                                <button
                                    type="button"
                                    onClick={stopWebcam}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <HiOutlineX className="w-5 h-5" />
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
                                {/* Crosshair overlay for styling effect */}
                                <div className="absolute inset-0 border-[8px] border-black/20 pointer-events-none"></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-white/30 rounded-full pointer-events-none"></div>
                            </div>

                            <div className="p-4 flex justify-between items-center bg-gray-50">
                                <button
                                    type="button"
                                    onClick={stopWebcam}
                                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={captureWebcamPhoto}
                                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-105 active:scale-95"
                                >
                                    <HiOutlineCamera className="w-5 h-5" />
                                    Capture
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProfileSettingsPage;
