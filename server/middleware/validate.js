import { body, param, validationResult } from 'express-validator';

/**
 * Middleware to check validation results and return errors if any.
 * Must be placed AFTER the validation rules in the middleware chain.
 */
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map((e) => ({
                field: e.path,
                message: e.msg,
            })),
        });
    }
    next();
};

// ===================== AUTH VALIDATORS =====================

export const validateLogin = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please enter a valid email'),
    body('password')
        .notEmpty().withMessage('Password is required'),
    handleValidationErrors,
];

export const validateRegister = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please enter a valid email'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
    body('municipality')
        .trim()
        .notEmpty().withMessage('Municipality is required')
        .isIn(['Cajidiocan', 'Magdiwang', 'San Fernando']).withMessage('Invalid municipality'),
    handleValidationErrors,
];

export const validateForgotPassword = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please enter a valid email'),
    handleValidationErrors,
];

export const validateResetPassword = [
    param('token')
        .notEmpty().withMessage('Reset token is required'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    handleValidationErrors,
];

// ===================== REPORT VALIDATORS =====================

export const validateCreateReport = [
    body('address')
        .custom((value, { req }) => {
            const trimmedVal = (value || '').trim();
            const hasLat = req.body.lat !== undefined && req.body.lat !== '';
            const hasLng = req.body.lng !== undefined && req.body.lng !== '';
            if (!trimmedVal && (!hasLat || !hasLng)) {
                throw new Error('Address is required when coordinates are not provided');
            }
            return true;
        }),
    body('lat')
        .optional({ checkFalsy: true })
        .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('lng')
        .optional({ checkFalsy: true })
        .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('severity')
        .optional({ checkFalsy: true })
        .isIn(['minor', 'moderate', 'severe', 'critical']).withMessage('Invalid severity level'),
    body('description')
        .optional({ checkFalsy: true })
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    handleValidationErrors,
];

// ===================== ADMIN VALIDATORS =====================

export const validateVerifyReporter = [
    param('id')
        .isMongoId().withMessage('Invalid user ID'),
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
    body('feedback')
        .optional()
        .isLength({ max: 500 }).withMessage('Feedback cannot exceed 500 characters'),
    handleValidationErrors,
];

export const validateVerifyReport = [
    param('id')
        .isMongoId().withMessage('Invalid report ID'),
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['verified', 'rejected']).withMessage('Status must be verified or rejected'),
    body('rejectionReason')
        .optional()
        .isLength({ max: 500 }).withMessage('Rejection reason cannot exceed 500 characters'),
    handleValidationErrors,
];

export const validateRespondToReport = [
    param('id')
        .isMongoId().withMessage('Invalid report ID'),
    body('unitName')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Unit name cannot exceed 100 characters'),
    body('unitType')
        .optional()
        .isIn(['MDRRMO', 'PNP', 'BFP', 'SDH', 'RESCUE', 'MEDICAL', 'BARANGAY']).withMessage('Invalid unit type'),
    handleValidationErrors,
];

export const validateResolveReport = [
    param('id')
        .isMongoId().withMessage('Invalid report ID'),
    body('resolutionNotes')
        .optional()
        .isLength({ max: 1000 }).withMessage('Resolution notes cannot exceed 1000 characters'),
    handleValidationErrors,
];

export const validateTransferReport = [
    param('id')
        .isMongoId().withMessage('Invalid report ID'),
    body('targetMunicipalityId')
        .notEmpty().withMessage('Target municipality ID is required')
        .isMongoId().withMessage('Invalid target municipality ID'),
    body('reason')
        .notEmpty().withMessage('Transfer reason is required')
        .isLength({ min: 10 }).withMessage('Reason must be at least 10 characters long')
        .isLength({ max: 1000 }).withMessage('Reason cannot exceed 1000 characters'),
    handleValidationErrors,
];

