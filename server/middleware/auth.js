import { ACCESS_COOKIE_NAME } from '../config/authConfig.js';
import {
    getCookieValue,
    getRequestCookie,
    resolveAccessIdentity,
} from '../services/authSessionService.js';

export const extractTokenFromCookieHeader = (cookieHeader) => {
    return getCookieValue(cookieHeader, ACCESS_COOKIE_NAME);
};

export const authenticateAccessToken = async (token) => {
    if (!token) return null;
    try {
        return await resolveAccessIdentity(token);
    } catch {
        return null;
    }
};

/**
 * Protect routes - JWT verification middleware
 */
export const protect = async (req, res, next) => {
    try {
        const token = getRequestCookie(req, ACCESS_COOKIE_NAME);

        // No token found
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized - No token provided',
            });
        }

        try {
            const identity = await resolveAccessIdentity(token);
            if (!identity) {
                return res.status(401).json({
                    success: false,
                    message: 'Session is no longer valid - Please login again',
                    code: 'SESSION_INVALID',
                });
            }

            // Attach user to request
            req.user = identity.user;
            req.authSession = identity.session;
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired - Please login again',
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Not authorized - Invalid session',
                code: 'SESSION_INVALID',
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error in authentication',
        });
    }
};

/**
 * Optional auth - attaches user if token exists, but doesn't block
 */
export const optionalAuth = async (req, res, next) => {
    try {
        const token = getRequestCookie(req, ACCESS_COOKIE_NAME);

        if (token) {
            try {
                const identity = await resolveAccessIdentity(token);
                if (identity) {
                    req.user = identity.user;
                    req.authSession = identity.session;
                }
            } catch {
                // Token invalid, but that's okay for optional auth
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Require the municipal administrator role.
 */
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - No user found',
        });
    }

    if (req.user.role !== 'municipal_admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Municipal administrator privileges required',
        });
    }

    next();
};

/**
 * Require municipal admin role specifically
 */
export const requireMunicipalAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - No user found',
        });
    }

    if (req.user.role !== 'municipal_admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Municipal admin privileges required',
        });
    }

    next();
};

/**
 * Require responder role
 */
export const requireResponder = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - No user found',
        });
    }

    if (req.user.role !== 'responder') {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Responder privileges required',
        });
    }

    next();
};

/**
 * Require verified reporter role
 */
export const requireVerifiedReporter = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - No user found',
        });
    }

    if (req.user.role !== 'reporter') {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Reporter privileges required',
        });
    }

    if (!req.user.isVerified) {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Reporter verification pending',
        });
    }

    next();
};

/**
 * Validate municipality access - ensures user belongs to correct municipality
 */
export const validateMunicipalityAccess = (reportMunicipality) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        // Municipal admins and responders must match municipality
        if (['municipal_admin', 'responder'].includes(req.user.role)) {
            if (!req.user.assignedMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'No municipality assigned to your account',
                });
            }

            if (req.user.assignedMunicipality !== reportMunicipality) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied - Report is from different municipality',
                });
            }
        }

        next();
    };
};

export default {
    protect,
    optionalAuth,
    authenticateAccessToken,
    requireAdmin,
    requireMunicipalAdmin,
    requireResponder,
    requireVerifiedReporter,
    validateMunicipalityAccess,
};
