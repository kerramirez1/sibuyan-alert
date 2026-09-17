import express from 'express';
import { recordView, getReachLeaderboard } from '../controllers/viewController.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleCheck.js';
import { viewLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * Reach recorder, shared by incidents and risk zones.
 *
 * One endpoint for both target types rather than /reports/:id/views and
 * /zones/:id/views: the dedupe rule and the identity derivation are identical
 * for both, so splitting them would duplicate the logic that must not drift.
 * `targetType` in the body selects the record.
 *
 * `optionalAuth` so guests are counted; they are keyed by the anonymous id the
 * client sends, and a request without one is answered `counted: false` rather
 * than being folded into a shared bucket.
 */
router.post('/', optionalAuth, viewLimiter, recordView);

/**
 * Reach leaderboards for the admin dashboard.
 *
 * Admin-gated, and aggregate-only by construction: the service layer has no
 * function that can return a per-viewer list, so no route can expose one.
 */
router.get('/reach', protect, requireAdmin, getReachLeaderboard);

export default router;
