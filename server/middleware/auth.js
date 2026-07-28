import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const extractTokenFromCookieHeader = (cookieHeader) => {
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return null;
    }

    const tokenCookie = cookieHeader
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith('token='));

    if (!tokenCookie) {
        return null;
    }

    const rawValue = tokenCookie.slice('token='.length);
    return rawValue ? decodeURIComponent(rawValue) : null;
};

/**
 * Protect routes - JWT verification middleware
 */
export const protect = async (req, res, next) => {
    try {
        let token;

        // Get token from Authorization header
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }

        // Check for token in cookies (for OAuth flow)
        if (!token) {
            token = req.cookies?.token || extractTokenFromCookieHeader(req.headers.cookie);
        }

        // No token found
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized - No token provided',
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from token
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized - User not found',
                });
            }

            // Legacy system-administrator accounts were retired. Reject them
            // even before the one-time data migration has been run.
            if (user.role === 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'This account role is no longer supported',
                });
            }

            // Attach user to request
            req.user = user;
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
                message: 'Not authorized - Invalid token',
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
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            token = req.cookies?.token || extractTokenFromCookieHeader(req.headers.cookie);
        }

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (user && user.role !== 'admin') {
                    req.user = user;
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
 * Generate JWT token
 */
export const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
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
    generateToken,
    requireAdmin,
    requireMunicipalAdmin,
    requireResponder,
    requireVerifiedReporter,
    validateMunicipalityAccess,
};
