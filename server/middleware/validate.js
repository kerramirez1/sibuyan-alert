import { body, param, validationResult } from 'express-validator';
import {
    isValidSibuyanAddress,
    SIBUYAN_MUNICIPALITY_NAMES,
} from '../config/sibuyanLocations.js';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy.js';
import {
    INCIDENT_CATEGORY_NAMES,
    isSupportedIncidentType,
} from '../config/incidentCategories.js';
import { RESPONDER_UNIT_TYPES } from '../config/responderUnits.js';

const REPORT_COUNT_FIELDS = [
    ['casualties', 'injured'],
    ['casualties', 'fatalities'],
    ['casualties', 'missing'],
];

const readNestedOrMultipartValue = (bodyValue, group, field) => (
    bodyValue?.[group]?.[field] ?? bodyValue?.[`${group}[${field}]`]
);

const isNonNegativeSafeInteger = (value) => {
    if (value === undefined || value === null || value === '') return true;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0;
};

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
        .custom(isPasswordPolicyCompliant).withMessage(PASSWORD_POLICY_MESSAGE),
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
    body('municipality')
        .trim()
        .notEmpty().withMessage('Municipality is required')
        .isIn(SIBUYAN_MUNICIPALITY_NAMES).withMessage('Invalid municipality'),
    body('barangay')
        .trim()
        .notEmpty().withMessage('Barangay is required')
        .custom((barangay, { req }) => isValidSibuyanAddress(req.body.municipality, barangay))
        .withMessage('Barangay does not belong to the selected municipality'),
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
        .custom(isPasswordPolicyCompliant).withMessage(PASSWORD_POLICY_MESSAGE),
    handleValidationErrors,
];

// ===================== REPORT VALIDATORS =====================

export const validateCreateReport = [
    body().custom((_, { req }) => {
        const incidentTime = req.body.incidentTime || req.body.accidentTime;
        if (!incidentTime) throw new Error('Incident time is required');
        if (Number.isNaN(Date.parse(incidentTime))) {
            throw new Error('Incident time must be a valid date');
        }

        const category = req.body.incidentCategory || 'accident';
        const type = req.body.incidentType || req.body.accidentType || 'vehicular';
        if (!INCIDENT_CATEGORY_NAMES.includes(category)) {
            throw new Error('Invalid incident category');
        }
        if (!isSupportedIncidentType(category, type)) {
            throw new Error('Invalid incident type');
        }

        for (const [group, field] of REPORT_COUNT_FIELDS) {
            const value = readNestedOrMultipartValue(req.body, group, field);
            if (!isNonNegativeSafeInteger(value)) {
                throw new Error(`${field} must be a non-negative whole number`);
            }
        }
        return true;
    }),
    body().custom((_, { req }) => {
        const hasLat = req.body.lat !== undefined && req.body.lat !== '';
        const hasLng = req.body.lng !== undefined && req.body.lng !== '';
        if (hasLat !== hasLng) throw new Error('Latitude and longitude must be provided together');
        return true;
    }),
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
    body('locationSource')
        .optional({ checkFalsy: true })
        .isIn(['gps', 'map_pin', 'search', 'address_geocoded', 'legacy']).withMessage('Invalid location source'),
    body('locationAccuracy')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0, max: 100000 }).withMessage('Location accuracy must be between 0 and 100000 meters'),
    body('locationCapturedAt')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('Location capture time must be a valid ISO date'),
    body('severity')
        .optional({ checkFalsy: true })
        .isIn(['minor', 'moderate', 'severe', 'critical']).withMessage('Invalid severity level'),
    body('description')
        .optional({ checkFalsy: true })
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    // Set by the client only after the reporter dismisses a possible-duplicate
    // warning. Multipart bodies always arrive as strings.
    body('confirmDistinct')
        .optional({ checkFalsy: true })
        .isIn(['true', 'false']).withMessage('confirmDistinct must be "true" or "false"'),
    // Client-generated idempotency key for offline report replays.
    body('clientReportId')
        .optional({ checkFalsy: true })
        .isLength({ max: 100 }).withMessage('clientReportId cannot exceed 100 characters'),
    handleValidationErrors,
];

export const validateMongoIdParam = [
    param('id').isMongoId().withMessage('Invalid resource ID'),
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
    // Optional admin casualty correction — same whole-number rule as intake.
    // Custom (not isInt) so JSON numbers validate without string coercion.
    body('casualties.injured')
        .optional()
        .custom((value) => Number.isInteger(Number(value)) && Number(value) >= 0)
        .withMessage('Injured count must be a non-negative whole number'),
    body('casualties.fatalities')
        .optional()
        .custom((value) => Number.isInteger(Number(value)) && Number(value) >= 0)
        .withMessage('Fatalities count must be a non-negative whole number'),
    body('casualties.missing')
        .optional()
        .custom((value) => Number.isInteger(Number(value)) && Number(value) >= 0)
        .withMessage('Missing count must be a non-negative whole number'),
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
        .isIn(RESPONDER_UNIT_TYPES).withMessage('Invalid unit type'),
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

export const validateAcknowledgeTransfer = [
    param('id')
        .isMongoId().withMessage('Invalid report ID'),
    handleValidationErrors,
];
