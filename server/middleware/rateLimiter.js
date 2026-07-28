import rateLimit from 'express-rate-limit';

/**
 * Rate limiters for sensitive endpoints.
 * Uses in-memory store (suitable for single-instance deployments).
 */

/** Auth endpoints: login, register, forgot-password */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many attempts. Please try again after 15 minutes.',
    },
});

/** Stricter limiter for forgot-password (prevents email flooding) */
export const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many password reset requests. Please try again after an hour.',
    },
});

/** Report creation limiter (prevents spam submissions) */
export const reportCreationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 reports per 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many reports submitted. Please try again shortly.',
    },
});

/** Public geocoding proxy limiter; protects the upstream Nominatim service. */
export const locationLookupLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many location lookups. Please wait a moment and try again.',
    },
});
