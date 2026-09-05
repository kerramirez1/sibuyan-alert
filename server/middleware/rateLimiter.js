import rateLimit from 'express-rate-limit';

/**
 * Rate limiters for sensitive endpoints.
 * MVP: in-memory store, single web dyno only. Scaling past 1 dyno requires
 * a shared store (e.g. Redis via REDIS_URL) or limits reset per instance.
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

/** Lightweight report-view recorder; generous so archive browsing is never blocked. */
export const reportViewLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many view updates. Please wait a moment and try again.',
    },
});

/** Protect subscription persistence without interfering with normal silent resync. */
export const pushSubscriptionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many notification subscription updates. Please try again shortly.',
    },
});
