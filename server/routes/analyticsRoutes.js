import express from 'express';
import { protect, requireAdmin, requireResponder, requireVerifiedReporter } from '../middleware/auth.js';
import { analyticsLimiter } from '../middleware/rateLimiter.js';
import {
    getAdminAnalytics,
    getResponderAnalytics,
    getReporterAnalytics,
    getPublicAnalytics
} from '../controllers/analyticsController.js';

const router = express.Router();

// Route for Admins
router.get('/admin', protect, requireAdmin, analyticsLimiter, getAdminAnalytics);

// Route for Responders
router.get('/responder', protect, requireResponder, analyticsLimiter, getResponderAnalytics);

// Route for Reporters
router.get('/reporter', protect, requireVerifiedReporter, analyticsLimiter, getReporterAnalytics);

// Route for Public (No auth required)
router.get('/public', analyticsLimiter, getPublicAnalytics);

export default router;
