/**
 * Role-based access control middleware
 */

/**
 * Restrict access to specific roles
 * @param  {...string} roles - Allowed roles
 */
export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized - Please login',
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied - Requires ${roles.join(' or ')} role`,
            });
        }

        next();
    };
};

/**
 * Require verified reporter status
 */
export const requireVerifiedReporter = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - Please login',
        });
    }

    if (req.user.role !== 'reporter' && req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Reporters only',
        });
    }

    // Admins bypass verification check
    if (req.user.role === 'admin') {
        return next();
    }

    if (!req.user.isVerified) {
        return res.status(403).json({
            success: false,
            message: 'Your reporter account is pending verification',
            verificationStatus: req.user.verificationStatus,
        });
    }

    next();
};

/**
 * Require admin role (admin and municipal_admin only)
 */
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - Please login',
        });
    }

    if (!['admin', 'municipal_admin'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Admin privileges required',
        });
    }

    next();
};

/**
 * Check if user owns the resource or is admin
 */
export const requireOwnerOrAdmin = (resourceUserIdField = 'reporter') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized - Please login',
            });
        }

        // Admins can access anything
        if (req.user.role === 'admin') {
            return next();
        }

        // Check resource ownership (will be set by controllers)
        if (req.resource) {
            const ownerId = req.resource[resourceUserIdField];
            if (ownerId && ownerId.toString() === req.user._id.toString()) {
                return next();
            }
        }

        return res.status(403).json({
            success: false,
            message: 'Access denied - Not authorized to access this resource',
        });
    };
};

/**
 * Block ordinary users from accessing individual reports
 * Ordinary users can only view high-risk zones and aggregated statistics
 */
export const blockOrdinaryUsers = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    if (req.user.role === 'ordinary') {
        return res.status(403).json({
            success: false,
            message: 'Access denied - Verified Reporter status required to view individual reports',
            hint: 'Ordinary users can view high-risk zones and aggregated statistics',
            upgradeUrl: '/register-reporter',
            availableEndpoints: {
                highRiskZones: '/api/reports/high-risk-zones',
                statistics: '/api/reports/stats',
                municipalities: '/api/reports/municipalities'
            }
        });
    }

    next();
};

export default {
    requireRole,
    requireVerifiedReporter,
    requireAdmin,
    requireOwnerOrAdmin,
    blockOrdinaryUsers,
};
