import express from 'express';
import {
    register,
    login,
    getMe,
    updateProfile,
    savePushSubscription,
    deletePushSubscription,
    testPushSubscription,
    resubmitIdDocument,
    forgotPassword,
    resetPassword,
    refreshSession,
    logout,
    logoutAll,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import {
    uploadIdDocument,
    uploadAvatar,
    handleMulterError,
    validateUploadContent,
    requireRegistrationVerificationImages,
} from '../middleware/upload.js';
import {
    validateLogin,
    validateRegister,
    validateForgotPassword,
    validateResetPassword,
} from '../middleware/validate.js';
import { authLimiter, passwordResetLimiter, pushSubscriptionLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes (with validation + rate limiting)
router.post('/register', authLimiter, uploadIdDocument, handleMulterError, validateUploadContent, requireRegistrationVerificationImages, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', authLimiter, validateResetPassword, resetPassword);
router.post('/refresh', authLimiter, refreshSession);
router.post('/logout', logout);


// Protected routes
router.get('/me', protect, getMe);
router.post('/logout-all', protect, logoutAll);
router.put('/me', protect, uploadAvatar, handleMulterError, validateUploadContent, updateProfile);
router.post('/push-subscription', protect, pushSubscriptionLimiter, savePushSubscription);
router.delete('/push-subscription', protect, pushSubscriptionLimiter, deletePushSubscription);
router.post('/push-subscription/test', protect, pushSubscriptionLimiter, testPushSubscription);
router.post('/resubmit-id', protect, uploadIdDocument, handleMulterError, validateUploadContent, resubmitIdDocument);

export default router;
