import express from 'express';
import {
    register,
    login,
    getMe,
    updateProfile,
    savePushSubscription,
    resubmitIdDocument,
    forgotPassword,
    resetPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { uploadIdDocument, uploadAvatar, handleMulterError } from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.post('/register', uploadIdDocument, handleMulterError, register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);


// Protected routes
router.get('/me', protect, getMe);
router.put('/me', protect, uploadAvatar, handleMulterError, updateProfile);
router.post('/push-subscription', protect, savePushSubscription);
router.post('/resubmit-id', protect, uploadIdDocument, handleMulterError, resubmitIdDocument);

export default router;
