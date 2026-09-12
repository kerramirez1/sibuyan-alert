import express from 'express';
import {
    createReport,
    getReports,
    getReportById,
    getMyReports,
    searchReports,
    addReportUpdate,
    getHighRiskZones,
    getMapConfig,
    getStats,
    getMunicipalities,
    getCategories,
    geocodeLocation,
    getReportEvidencePreview,
    recordReportView,
} from '../controllers/reportController.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireVerifiedReporter, blockOrdinaryUsers } from '../middleware/roleCheck.js';
import { uploadReportImages, handleMulterError, validateUploadContent } from '../middleware/upload.js';
import { validateCreateReport, validateMongoIdParam } from '../middleware/validate.js';
import { locationLookupLimiter, reportCreationLimiter, reportViewLimiter, searchLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes - accessible to everyone (including non-authenticated users)
router.get('/high-risk-zones', getHighRiskZones);  // ✅ Ordinary users CAN access
router.get('/map-config', getMapConfig);
router.get('/stats', getStats);  // ✅ Ordinary users CAN access aggregated stats
router.get('/municipalities', getMunicipalities);  // ✅ Ordinary users CAN access
router.get('/categories', getCategories);
router.post('/geocode', locationLookupLimiter, geocodeLocation);

// Public report listing for map visibility (verified/responding only by default)
router.get('/', optionalAuth, getReports);

// RBAC-filtered typeahead search. MUST stay above '/:id' so 'search' is not
// parsed as a report id.
router.get('/search', optionalAuth, searchLimiter, searchReports);

// Protected routes - require authentication AND block ordinary users
router.get('/my-reports', protect, blockOrdinaryUsers, getMyReports);  // ❌ Ordinary users CANNOT access
router.post(
    '/',
    protect,
    requireVerifiedReporter,  // Also blocks ordinary users
    reportCreationLimiter,
    uploadReportImages,
    handleMulterError,
    validateUploadContent,
    validateCreateReport,
    createReport
);  // ❌ Ordinary users CANNOT submit reports

// Single report: public can view verified/responding, private for pending/rejected
router.get('/:id/evidence/:index/preview', optionalAuth, getReportEvidencePreview);
router.post('/:id/updates', protect, requireVerifiedReporter, validateMongoIdParam, addReportUpdate);
// Lightweight view recorder for dossier expands (owner self-views excluded server-side)
router.post('/:id/views', optionalAuth, reportViewLimiter, validateMongoIdParam, recordReportView);
router.get('/:id', optionalAuth, getReportById);

export default router;
