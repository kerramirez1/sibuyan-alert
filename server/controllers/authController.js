import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/emailService.js';

/**
 * @desc    Register a new reporter (with ID upload)
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req, res) => {
    try {
        const { email, password, name, address, municipality } = req.body;
        const allowedMunicipalities = ['Cajidiocan', 'Magdiwang', 'San Fernando'];

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered',
            });
        }

        // Get file paths from multer (.fields())
        const idDocument = req.files?.idDocument?.[0]?.path || null;
        const selfiePhoto = req.files?.selfiePhoto?.[0]?.path || null;

        if (!idDocument) {
            return res.status(400).json({
                success: false,
                message: 'ID document is required for reporter registration',
            });
        }

        if (!municipality || !allowedMunicipalities.includes(municipality)) {
            return res.status(400).json({
                success: false,
                message: 'Valid municipality is required',
            });
        }

        // Create reporter user (pending verification)
        const user = await User.create({
            email: email.toLowerCase(),
            password,
            name,
            address: address || null,
            assignedMunicipality: municipality,
            role: 'reporter',
            idDocument,
            selfiePhoto,
            isVerified: false,
            verificationStatus: 'pending',
        });

        // Generate token
        const token = generateToken(user._id);

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
                    assignedMunicipality: user.assignedMunicipality,
                    isVerified: user.isVerified,
                    verificationStatus: user.verificationStatus,
                },
                token,
            },
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message,
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
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

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

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

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
                    isOnDuty: user.isOnDuty !== false,
                    isVerified: user.isVerified,
                    verificationStatus: user.verificationStatus,
                },
                token,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message,
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
                isOnDuty: user.isOnDuty !== false,
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
    try {
        const { name, email, currentPassword, newPassword, notificationPreferences } = req.body;

        const user = await User.findById(req.user._id).select('+password');

        // Update name
        if (name) user.name = name;

        // Update email (with uniqueness check)
        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email: email.toLowerCase() });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use by another account',
                });
            }
            user.email = email.toLowerCase();
        }

        // Update password (requires current password verification)
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required to set a new password',
                });
            }

            // Verify current password
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect',
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

        // Handle avatar upload
        if (req.file) {
            user.avatar = req.file.path;
        }

        // Save user (role is protected - cannot be changed via this endpoint)
        await user.save();

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
                isOnDuty: user.isOnDuty !== false,
                notificationPreferences: user.notificationPreferences,
            },
        });
    } catch (error) {
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
        const { subscription } = req.body;

        await User.findByIdAndUpdate(req.user._id, {
            pushSubscription: subscription,
        });

        res.json({
            success: true,
            message: 'Push subscription saved',
        });
    } catch (error) {
        console.error('Save push subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save push subscription',
        });
    }
};

/**
 * @desc    Resubmit ID document for verification
 * @route   POST /api/auth/resubmit-id
 * @access  Private (reporters only)
 */
export const resubmitIdDocument = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user.role !== 'reporter') {
            return res.status(400).json({
                success: false,
                message: 'Only reporters can submit ID documents',
            });
        }

        if (user.verificationStatus === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Your account is already verified',
            });
        }

        const idDoc = req.files?.idDocument?.[0]?.path || null;
        if (!idDoc) {
            return res.status(400).json({
                success: false,
                message: 'Please upload an ID document',
            });
        }

        user.idDocument = idDoc;
        // Also update selfie if resubmitted
        const selfie = req.files?.selfiePhoto?.[0]?.path || null;
        if (selfie) user.selfiePhoto = selfie;
        user.verificationStatus = 'pending';
        user.verificationFeedback = null;
        await user.save();

        res.json({
            success: true,
            message: 'ID document resubmitted. Your verification is pending review.',
            data: {
                verificationStatus: user.verificationStatus,
            },
        });
    } catch (error) {
        console.error('Resubmit ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to res ubmit ID document',
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
        const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

        await sendPasswordResetEmail(user.email, user.name, resetUrl);

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

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
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

export default {
    register,
    login,
    getMe,
    updateProfile,
    savePushSubscription,
    resubmitIdDocument,
    forgotPassword,
    resetPassword,
};
