import express from 'express';
import {
    getUsers,
    getUserById,
    verifyReporter,
    getAllReports,
    verifyReport,
    respondToReport,
    resolveReport,
    deleteReport,
    deleteUser,
    getDashboardStats,
    updateMyDutyStatus,
    transferReport,
} from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import {
    validateVerifyReporter,
    validateVerifyReport,
    validateRespondToReport,
    validateResolveReport,
    validateTransferReport,
} from '../middleware/validate.js';

const router = express.Router();

// All admin routes require authentication and admin-level role (admin, municipal_admin, responder)
router.use(protect);
router.use(requireRole('admin', 'municipal_admin', 'responder'));

// ============================================================
// Dashboard — admin & municipal_admin ONLY (NOT responders)
// ============================================================
router.get('/dashboard', requireRole('admin', 'municipal_admin'), getDashboardStats);

// ============================================================
// User management — admin & municipal_admin ONLY (NOT responders)
// ============================================================
router.get('/users', requireRole('admin', 'municipal_admin'), getUsers);
router.get('/users/:id', requireRole('admin', 'municipal_admin'), getUserById);
router.put('/users/:id/verify', requireRole('admin', 'municipal_admin'), validateVerifyReporter, verifyReporter);
router.delete('/users/:id', requireRole('admin', 'municipal_admin'), deleteUser);

// ============================================================
// Report management — accessible to all admin-level roles
// ============================================================
router.get('/reports', getAllReports);
router.put('/reports/:id/verify', requireRole('admin', 'municipal_admin'), validateVerifyReport, verifyReport);
router.put('/reports/:id/respond', requireRole('responder'), validateRespondToReport, respondToReport);
router.put('/reports/:id/resolve', requireRole('responder'), validateResolveReport, resolveReport);
router.put('/reports/:id/transfer', requireRole('admin', 'municipal_admin'), validateTransferReport, transferReport);
router.delete('/reports/:id', requireRole('admin', 'municipal_admin'), deleteReport);

// ============================================================
// Responder duty status — responders can toggle own status
// ============================================================
router.put('/responders/me/duty-status', requireRole('responder'), updateMyDutyStatus);

export default router;
