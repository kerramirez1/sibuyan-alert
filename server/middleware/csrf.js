import crypto from 'crypto';
import { CSRF_COOKIE_NAME } from '../config/authConfig.js';
import { getRequestCookie } from '../services/authSessionService.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_AUTH_PATHS = [
    /^\/api\/auth\/login$/,
    /^\/api\/auth\/register$/,
    /^\/api\/auth\/forgot-password$/,
    /^\/api\/auth\/reset-password\/[^/]+$/,
];
const LOGOUT_PATH = '/api/auth/logout';

const safeEquals = (left, right) => {
    if (!left || !right) return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const isTrustedOrigin = (origin) => {
    if (!origin) return true;
    try {
        const configuredClient = process.env.CLIENT_URL || 'http://localhost:5173';
        return new URL(origin).origin === new URL(configuredClient).origin;
    } catch {
        return false;
    }
};

export const csrfProtection = (req, res, next) => {
    if (
        SAFE_METHODS.has(req.method)
        || !req.path.startsWith('/api/')
    ) {
        return next();
    }

    if (!isTrustedOrigin(req.get('origin'))) {
        return res.status(403).json({
            success: false,
            message: 'Request origin is not allowed',
            code: 'CSRF_ORIGIN_REJECTED',
        });
    }

    if (PUBLIC_AUTH_PATHS.some((pattern) => pattern.test(req.path)) || req.path === LOGOUT_PATH) {
        return next();
    }

    const cookieToken = getRequestCookie(req, CSRF_COOKIE_NAME);
    const headerToken = req.get('x-csrf-token');
    if (!safeEquals(cookieToken, headerToken)) {
        return res.status(403).json({
            success: false,
            message: 'Security token is missing or invalid. Refresh the page and try again.',
            code: 'CSRF_TOKEN_INVALID',
        });
    }

    return next();
};

export default csrfProtection;
