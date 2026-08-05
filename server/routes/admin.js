import express from 'express';
import {
    getUsers,
    getUserById,
    verifyReporter,
    getAllReports,
    getOperationalReportById,
    verifyReport,
    respondToReport,
    resolveReport,
    deleteReport,
    deleteUser,
    getDashboardStats,
    transferReport,
    acknowledgeTransfer,
} from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import {
    validateVerifyReporter,
    validateVerifyReport,
    validateRespondToReport,
    validateResolveReport,
    validateTransferReport,
    validateAcknowledgeTransfer,
} from '../middleware/validate.js';

const router = express.Router();

// Operational routes are shared by municipal administrators and responders.
router.use(protect);
router.use(requireRole('municipal_admin', 'responder'));

// ============================================================
// Dashboard — municipal administrators only (not responders)
// ============================================================
router.get('/dashboard', requireRole('municipal_admin'), getDashboardStats);

// ============================================================
// User management — municipal administrators only (not responders)
// ============================================================
router.get('/users', requireRole('municipal_admin'), getUsers);
router.get('/users/:id', requireRole('municipal_admin'), getUserById);
router.put('/users/:id/verify', requireRole('municipal_admin'), validateVerifyReporter, verifyReporter);
router.delete('/users/:id', requireRole('municipal_admin'), deleteUser);

// ============================================================
// Report queue — shared read access with capability-specific mutations below.
// ============================================================
router.get('/reports', getAllReports);
router.get('/reports/:id', getOperationalReportById);
router.put('/reports/:id/verify', requireRole('municipal_admin'), validateVerifyReport, verifyReport);
router.put('/reports/:id/respond', requireRole('responder'), validateRespondToReport, respondToReport);
router.put('/reports/:id/resolve', requireRole('responder'), validateResolveReport, resolveReport);
router.put('/reports/:id/transfer', requireRole('municipal_admin'), validateTransferReport, transferReport);
router.put('/reports/:id/acknowledge-transfer', requireRole('municipal_admin'), validateAcknowledgeTransfer, acknowledgeTransfer);
router.delete('/reports/:id', requireRole('municipal_admin'), deleteReport);

export default router;
