import express from 'express';
import { protect, requireAdmin, requireResponder, requireVerifiedReporter } from '../middleware/auth.js';
import {
    getAdminAnalytics,
    getResponderAnalytics,
    getReporterAnalytics,
    getPublicAnalytics
} from '../controllers/analyticsController.js';

const router = express.Router();

// Route for Admins
router.get('/admin', protect, requireAdmin, getAdminAnalytics);

// Route for Responders
router.get('/responder', protect, requireResponder, getResponderAnalytics);

// Route for Reporters
router.get('/reporter', protect, requireVerifiedReporter, getReporterAnalytics);

// Route for Public (No auth required)
router.get('/public', getPublicAnalytics);

export default router;
