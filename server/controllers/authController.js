import User from '../models/User.js';
import mongoose from 'mongoose';
import {
    clearAuthCookies,
    issueSession,
    revokeAllUserSessions,
    revokeRequestSession,
    rotateSession,
    setPrivateNoStore,
} from '../services/authSessionService.js';
import {
    deleteGridFsFileByUrl,
    deleteGridFsFilesByUrls,
    uploadFileToGridFS,
} from '../services/gridFsService.js';
import { isValidSibuyanAddress } from '../config/sibuyanLocations.js';
import {
    normalizePushEndpoint,
    normalizePushSubscription,
    PushSubscriptionValidationError,
} from '../utils/pushSubscription.js';
import { sendPushToUser } from '../services/pushService.js';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy.js';
import { detectFaces } from '../services/faceDetectionService.js';

/**
 * @desc    Register a new reporter with private ID-photo verification
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req, res) => {
    const uploadedFileUrls = [];
    let userCreated = false;

    try {
        const { email, password, name, municipality, barangay } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered',
            });
        }

        const idDocumentFile = req.files?.idDocument?.[0] || null;
        const selfiePhotoFile = req.files?.selfiePhoto?.[0] || null;

        if (!idDocumentFile) {
            return res.status(400).json({
                success: false,
                message: 'An ID photo is required for reporter registration',
            });
        }
        if (!selfiePhotoFile) {
            return res.status(400).json({
                success: false,
                message: 'A verification selfie is required for reporter registration',
            });
        }

        // Authoritative server-side face validation (fail-closed).
        // Fast single-pass gate keeps Heroku single-dyno p95 low; the full
        // multi-pass pipeline stays reserved for evidence redaction.
        const selfieDetection = await detectFaces(selfiePhotoFile.buffer, { fastMode: true, maxDimension: 800 });
        if (selfieDetection.status === 'detector_failed') {
            return res.status(503).json({
                success: false,
                message: 'Face verification is temporarily unavailable. Please try again.',
            });
        }
        if (selfieDetection.status === 'invalid_image') {
            return res.status(400).json({
                success: false,
                message: 'The selfie photo is corrupted or invalid. Please upload a clear photo.',
            });
        }
        if (selfieDetection.status === 'no_faces_detected' || (selfieDetection.faces && selfieDetection.faces.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'No face detected in the verification selfie. Please provide a clear, front-facing photo of your face.',
            });
        }
        if (selfieDetection.faces && selfieDetection.faces.length > 1) {
            return res.status(400).json({
                success: false,
                message: 'Multiple faces detected in the verification selfie. Only one person must be visible.',
            });
        }

        if (!isValidSibuyanAddress(municipality, barangay)) {
            return res.status(400).json({
                success: false,
                message: 'Select a valid barangay for the chosen municipality',
            });
        }

        const canonicalAddress = `${barangay}, ${municipality}, Sibuyan Island, Romblon`;

        const userId = new mongoose.Types.ObjectId();
        const storageMetadata = {
            visibility: 'private',
            ownerId: userId,
            municipalityName: municipality,
        };
        // Parallelize the two independent GridFS writes and track each URL
        // as it lands so a partial failure still cleans up (no orphans).
        const trackUpload = (promise) => promise.then((stored) => {
            uploadedFileUrls.push(stored.url);
            return stored;
        });
        const [storedIdDocument, storedSelfie] = await Promise.all([
            trackUpload(uploadFileToGridFS(idDocumentFile, {
                ...storageMetadata,
                category: 'identity_document',
            })),
            trackUpload(uploadFileToGridFS(selfiePhotoFile, {
                ...storageMetadata,
                category: 'identity_selfie',
            })),
        ]);

        // Create reporter user (pending verification)
        const user = await User.create({
            _id: userId,
            email: email.toLowerCase(),
            password,
            name,
            address: canonicalAddress,
            barangay,
            assignedMunicipality: municipality,
            role: 'reporter',
            idDocument: storedIdDocument.url,
            selfiePhoto: storedSelfie?.url || null,
            isVerified: false,
            verificationStatus: 'pending',
            verificationHistory: [{
                action: 'id_submitted',
                actor: userId,
                at: new Date(),
            }],
        });
        userCreated = true;

        await revokeRequestSession(req);
        await issueSession({ req, res, userId: user._id });

        res.status(201).json({
            success: true,
            message: 'Registration successful. Your account is pending verification.',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    address: user.address,
                    barangay: user.barangay,
                    assignedMunicipality: user.assignedMunicipality,
                    isVerified: user.isVerified,
                    verificationStatus: user.verificationStatus,
                },
            },
        });
    } catch (error) {
        if (!userCreated) {
            await deleteGridFsFilesByUrls(uploadedFileUrls);
        }
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
        });
    }
};

/**
 * @desc    Login with email/password
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password',
            });
        }

        // Find user with password field
        const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Check if user has a password set
        if (!user.password) {
            return res.status(401).json({
                success: false,
                message: 'No password set for this account. Please contact an administrator.',
            });
        }

        // Verify password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        if (user.role === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'This account role has been retired. Contact your municipal administrator.',
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        await revokeRequestSession(req);
        await issueSession({ req, res, userId: user._id });

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    agency: user.agency,
                    responderUnit: user.responderUnit,
                    assignedMunicipality: user.assignedMunicipality,
                    avatar: user.avatar,
                    address: user.address,
                    barangay: user.barangay,
                    isVerified: user.isVerified,
                    verificationStatus: user.verificationStatus,
                },
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
        });
    }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User account no longer exists',
                code: 'ACCOUNT_DELETED',
            });
        }

        res.json({
            success: true,
            data: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                agency: user.agency,
                responderUnit: user.responderUnit,
                assignedMunicipality: user.assignedMunicipality,
                avatar: user.avatar,
                address: user.address,
                barangay: user.barangay,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
                notificationPreferences: user.notificationPreferences,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user profile',
        });
    }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/auth/me
 * @access  Private
 */
export const updateProfile = async (req, res) => {
    let uploadedAvatarUrl = null;
    let profileSaved = false;

    try {
        const { name, email, currentPassword, newPassword, notificationPreferences } = req.body;

        const user = await User.findById(req.user._id).select('+password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Account no longer exists',
                code: 'ACCOUNT_DELETED',
            });
        }
        const normalizedEmail = email?.toLowerCase().trim();
        const emailChanged = Boolean(normalizedEmail && normalizedEmail !== user.email);
        const credentialsChanged = Boolean(emailChanged || newPassword);

        if (credentialsChanged) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required to change login credentials',
                });
            }
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect',
                });
            }
        }

        // Update name
        if (name) user.name = name;

        // Update email (with uniqueness check)
        if (emailChanged) {
            const emailExists = await User.findOne({ email: normalizedEmail });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use by another account',
                });
            }
            user.email = normalizedEmail;
        }

        // Update password (requires current password verification)
        if (newPassword) {
            if (!isPasswordPolicyCompliant(newPassword)) {
                return res.status(400).json({
                    success: false,
                    message: PASSWORD_POLICY_MESSAGE,
                });
            }
            // Set new password (will be hashed by pre-save hook)
            user.password = newPassword;
        }

        // Update notification preferences
        if (notificationPreferences) {
            user.notificationPreferences = {
                ...user.notificationPreferences,
                ...notificationPreferences,
            };
        }

        const previousAvatar = user.avatar;

        // Handle avatar upload
        if (req.file) {
            const storedAvatar = await uploadFileToGridFS(req.file, {
                category: 'avatar',
                visibility: 'public',
                ownerId: user._id,
                municipalityName: user.assignedMunicipality,
            });
            uploadedAvatarUrl = storedAvatar.url;
            user.avatar = storedAvatar.url;
        }

        // Save user (role is protected - cannot be changed via this endpoint)
        await user.save();
        profileSaved = true;

        if (credentialsChanged) {
            await revokeAllUserSessions(user._id, 'credential_change');
            await issueSession({ req, res, userId: user._id });
            req.app.get('io')?.in(`user_${user._id}`).disconnectSockets(true)?.catch?.(() => {});
        }

        if (uploadedAvatarUrl && previousAvatar) {
            try {
                await deleteGridFsFileByUrl(previousAvatar);
            } catch (error) {
                console.warn('Failed to remove previous avatar:', error.message);
            }
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                agency: user.agency,
                responderUnit: user.responderUnit,
                assignedMunicipality: user.assignedMunicipality,
                avatar: user.avatar,
                notificationPreferences: user.notificationPreferences,
            },
        });
    } catch (error) {
        if (uploadedAvatarUrl && !profileSaved) {
            await deleteGridFsFileByUrl(uploadedAvatarUrl);
        }
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
        });
    }
};

/**
 * @desc    Save push subscription
 * @route   POST /api/auth/push-subscription
 * @access  Private
 */
export const savePushSubscription = async (req, res) => {
    try {
        const subscription = normalizePushSubscription(req.body?.subscription);

        // A browser endpoint must belong to only one account. This prevents a
        // shared browser from receiving notifications for a previously signed-in user.
        await User.updateMany(
            {
                _id: { $ne: req.user._id },
                'pushSubscription.endpoint': subscription.endpoint,
            },
            { $set: { pushSubscription: null } }
        );

        await User.findByIdAndUpdate(req.user._id, {
            $set: {
                pushSubscription: subscription,
                'notificationPreferences.browserPush': true,
            },
        });

        res.json({
            success: true,
            message: 'Push subscription saved',
        });
    } catch (error) {
        if (error instanceof PushSubscriptionValidationError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        console.error('Save push subscription error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save push subscription',
        });
    }
};

/** Disable browser push for the current account and optionally verify the device endpoint. */
export const deletePushSubscription = async (req, res) => {
    try {
        const endpoint = req.body?.endpoint == null
            ? null
            : normalizePushEndpoint(req.body.endpoint);
        const filter = { _id: req.user._id };
        if (endpoint) filter['pushSubscription.endpoint'] = endpoint;

        await User.updateOne(filter, {
            $set: {
                pushSubscription: null,
                'notificationPreferences.browserPush': false,
            },
        });

        return res.json({
            success: true,
            message: 'Browser push notifications disabled',
        });
    } catch (error) {
        if (error instanceof PushSubscriptionValidationError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error('Delete push subscription error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to disable browser push notifications',
        });
    }
};

/** Deliver a self-service test so users can verify the provider/browser path. */
export const testPushSubscription = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('_id pushSubscription notificationPreferences');
        if (!user?.pushSubscription || !user.notificationPreferences?.browserPush) {
            return res.status(409).json({
                success: false,
                message: 'Browser notifications are not enabled for this account',
            });
        }

        const delivered = await sendPushToUser(user, {
            title: 'Sibuyan Alert test',
            body: 'Browser notifications are working on this device.',
            tag: `push-test-${user._id}`,
            url: '/profile',
        });
        if (!delivered) {
            return res.status(503).json({
                success: false,
                message: 'The push provider did not accept the test notification',
            });
        }

        return res.json({ success: true, message: 'Test notification sent' });
    } catch (error) {
        console.error('Test push notification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send test notification',
        });
    }
};

/**
 * @desc    Resubmit an ID photo for verification
 * @route   POST /api/auth/resubmit-id
 * @access  Private (reporters only)
 */
export const resubmitIdDocument = async (req, res) => {
    const uploadedFileUrls = [];
    let profileSaved = false;

    try {
        const user = await User.findById(req.user._id).select('+verificationHistory');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Session account no longer exists. Please log in again.',
            });
        }

        if (user.role !== 'reporter') {
            return res.status(400).json({
                success: false,
                message: 'Only reporters can submit ID photos',
            });
        }

        if (user.verificationStatus === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Your account is already verified',
            });
        }

        const idDocumentFile = req.files?.idDocument?.[0] || null;
        if (!idDocumentFile) {
            return res.status(400).json({
                success: false,
                message: 'Please upload an ID photo',
            });
        }

        const previousFiles = [user.idDocument].filter(Boolean);
        const storageMetadata = {
            visibility: 'private',
            ownerId: user._id,
            municipalityName: user.assignedMunicipality,
        };
        const storedIdDocument = await uploadFileToGridFS(idDocumentFile, {
            ...storageMetadata,
            category: 'identity_document',
        });
        uploadedFileUrls.push(storedIdDocument.url);
        user.idDocument = storedIdDocument.url;

        const selfieFile = req.files?.selfiePhoto?.[0] || null;
        if (selfieFile) {
            const selfieDetection = await detectFaces(selfieFile.buffer, { fastMode: true, maxDimension: 800 });
            if (selfieDetection.status === 'detector_failed') {
                await deleteGridFsFilesByUrls(uploadedFileUrls);
                return res.status(503).json({
                    success: false,
                    message: 'Face verification is temporarily unavailable. Please try again.',
                });
            }
            if (selfieDetection.status === 'invalid_image') {
                await deleteGridFsFilesByUrls(uploadedFileUrls);
                return res.status(400).json({
                    success: false,
                    message: 'The selfie photo is corrupted or invalid. Please upload a clear photo.',
                });
            }
            if (selfieDetection.status === 'no_faces_detected' || (selfieDetection.faces && selfieDetection.faces.length === 0)) {
                await deleteGridFsFilesByUrls(uploadedFileUrls);
                return res.status(400).json({
                    success: false,
                    message: 'No face detected in the verification selfie. Please provide a clear, front-facing photo of your face.',
                });
            }
            if (selfieDetection.faces && selfieDetection.faces.length > 1) {
                await deleteGridFsFilesByUrls(uploadedFileUrls);
                return res.status(400).json({
                    success: false,
                    message: 'Multiple faces detected in the verification selfie. Only one person must be visible.',
                });
            }
            if (user.selfiePhoto) previousFiles.push(user.selfiePhoto);
            const storedSelfie = await uploadFileToGridFS(selfieFile, {
                ...storageMetadata,
                category: 'identity_selfie',
            });
            uploadedFileUrls.push(storedSelfie.url);
            user.selfiePhoto = storedSelfie.url;
        }
        user.verificationStatus = 'pending';
        user.verificationFeedback = null;
        user.recordVerificationEvent({ action: 'id_resubmitted', actor: user._id });
        await user.save();
        profileSaved = true;

        await deleteGridFsFilesByUrls(previousFiles);

        res.json({
            success: true,
            message: 'ID photo resubmitted. Your verification is pending review.',
            data: {
                verificationStatus: user.verificationStatus,
            },
        });
    } catch (error) {
        if (!profileSaved) {
            await deleteGridFsFilesByUrls(uploadedFileUrls);
        }
        console.error('Resubmit ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resubmit ID photo',
        });
    }
};

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (typeof email !== 'string' || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: 'A valid email address is required',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal that email doesn't exist (security)
            return res.json({
                success: true,
                message: 'If that email exists, a password reset link has been sent.',
            });
        }

        // Generate reset token (random 32-byte hex)
        const crypto = await import('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Hash token before storing (security best practice)
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Save hashed token and expiration (1 hour)
        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Send email with reset link
        const { sendPasswordResetEmail } = await import('../services/emailService.js');
        const clientBase = (process.env.CLIENT_URL || '').trim().replace(/\/$/, '');
        const resetUrl = clientBase
            ? `${clientBase}/reset-password/${resetToken}`
            : `/reset-password/${resetToken}`;

        const emailResult = await sendPasswordResetEmail(user.email, user.name, resetUrl);
        if (!emailResult?.success) {
            console.error('Password reset email failed:', emailResult?.error);
        }

        res.json({
            success: true,
            message: 'Password reset link sent to your email',
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process password reset request',
        });
    }
};

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!isPasswordPolicyCompliant(password)) {
            return res.status(400).json({
                success: false,
                message: PASSWORD_POLICY_MESSAGE,
            });
        }

        // Hash the token to compare with stored hash
        const crypto = await import('crypto');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
            });
        }

        // Update password (will be hashed by pre-save hook)
        user.password = password;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
        await revokeAllUserSessions(user._id, 'credential_change');
        req.app.get('io')?.in(`user_${user._id}`).disconnectSockets(true)?.catch?.(() => {});

        res.json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.',
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
        });
    }
};

/** Rotate the one-time refresh credential and issue a new access session. */
export const refreshSession = async (req, res) => {
    try {
        const rotation = await rotateSession({ req, res });
        if (rotation?.status === 'rotation_in_progress') {
            return res.status(409).json({
                success: false,
                message: 'Session rotation is already in progress',
                code: 'SESSION_ROTATING',
            });
        }
        if (!rotation?.user) {
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                message: 'Session expired - Please login again',
                code: 'SESSION_EXPIRED',
            });
        }

        setPrivateNoStore(res);
        return res.json({ success: true });
    } catch (error) {
        console.error('Session refresh error:', error);
        clearAuthCookies(res);
        return res.status(401).json({
            success: false,
            message: 'Session could not be refreshed',
            code: 'SESSION_REFRESH_FAILED',
        });
    }
};

/** Revoke the current browser session and remove all authentication cookies. */
export const logout = async (req, res) => {
    try {
        const session = await revokeRequestSession(req);
        if (session?.user) {
            req.app.get('io')?.in(`user_${session.user}`).disconnectSockets(true)?.catch?.(() => {});
        }
    } catch (error) {
        console.error('Session logout error:', error);
    } finally {
        clearAuthCookies(res);
    }

    return res.json({ success: true, message: 'Logged out successfully' });
};

/** Revoke every browser/device session owned by the authenticated user. */
export const logoutAll = async (req, res) => {
    try {
        await revokeAllUserSessions(req.user._id, 'logout_all');
        req.app.get('io')?.in(`user_${req.user._id}`).disconnectSockets(true)?.catch?.(() => {});
        clearAuthCookies(res);
        return res.json({ success: true, message: 'All sessions have been signed out' });
    } catch (error) {
        console.error('Session logout-all error:', error);
        clearAuthCookies(res);
        return res.status(500).json({
            success: false,
            message: 'Failed to sign out all sessions',
        });
    }
};

export default {
    register,
    login,
    getMe,
    updateProfile,
    savePushSubscription,
    resubmitIdDocument,
    forgotPassword,
    resetPassword,
    refreshSession,
    logout,
    logoutAll,
};
