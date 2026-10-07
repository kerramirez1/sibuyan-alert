import rateLimit from 'express-rate-limit';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Rate limiters for sensitive endpoints.
 *
 * Default is the in-memory store (single web dyno only). When REDIS_URL is
 * set and the optional `rate-limit-redis` + `redis` packages are installed,
 * all limiters share Redis so limits stay consistent across dynos/processes.
 * If REDIS_URL is set but the packages are missing, startup fails fast via
 * validateRuntimeConfig/scaling guards — limits never silently diverge.
 */

const getSharedRateLimitStore = () => {
    if (!process.env.REDIS_URL?.trim()) return null;
    try {
        const { RedisStore } = require('rate-limit-redis');
        const { createClient } = require('redis');
        const client = createClient({ url: process.env.REDIS_URL.trim() });
        client.on('error', (error) => console.error('❌ Redis rate-limit client error:', error.message));
        // Fire-and-forget: express-rate-limit queues while connecting.
        client.connect().catch((error) => console.error('❌ Redis rate-limit connect failed:', error.message));
        console.log('🔗 Rate limiting uses shared Redis store');
        return new RedisStore({ sendCommand: (...args) => client.sendCommand(args) });
    } catch {
        throw new Error('REDIS_URL is set but optional packages are missing: npm install rate-limit-redis redis --workspace=sibuyan-accident-alert-server');
    }
};

const sharedStore = getSharedRateLimitStore();
const withStore = (options) => (sharedStore ? { ...options, store: sharedStore } : options);

/** Auth endpoints: login, register, forgot-password */
export const authLimiter = rateLimit(withStore({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many attempts. Please try again after 15 minutes.',
    },
}));

/** Stricter limiter for forgot-password (prevents email flooding) */
export const passwordResetLimiter = rateLimit(withStore({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many password reset requests. Please try again after an hour.',
    },
}));

/** Report creation limiter (prevents spam submissions) */
export const reportCreationLimiter = rateLimit(withStore({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 reports per 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    // Key by authenticated user id, not IP: field reporters share carrier NAT
    // IPs, and an IP-keyed budget would let one heavy user starve every other
    // reporter behind the same address. Unauthenticated callers (none on the
    // report routes today, but defensively) fall back to IP.
    keyGenerator: (req) => {
        const userId = req.user?._id || req.user?.id;
        if (userId) return `report-user:${userId}`;
        return `report-ip:${req.ip}`;
    },
    message: {
        success: false,
        message: 'Too many reports submitted. Please try again shortly.',
    },
}));

/**
 * Evidence-upload limiter (POST /:id/evidence). Two-phase submit sends each
 * photo as its own request, so a 5-photo report costs 6 hits against a shared
 * budget — two such reports in 10 minutes would 429 the tail. Photos get
 * their own, roomier budget (same per-user keying, same message shape);
 * report creates keep the stricter 10/10min.
 */
export const reportEvidenceLimiter = rateLimit(withStore({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30, // 30 evidence uploads per 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const userId = req.user?._id || req.user?.id;
        if (userId) return `evidence-user:${userId}`;
        return `evidence-ip:${req.ip}`;
    },
    message: {
        success: false,
        message: 'Too many reports submitted. Please try again shortly.',
    },
}));

/** Public geocoding proxy limiter; protects the upstream Nominatim service. */
export const locationLookupLimiter = rateLimit(withStore({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many location lookups. Please wait a moment and try again.',
    },
}));

/**
 * View recorder, shared by report and zone views.
 *
 * Generous on purpose: opening details is ordinary browsing, and a throttled
 * view is a silently lost data point rather than a blocked action. The limit
 * exists to bound a runaway client, not to police reading. 120/min is well above
 * any human browsing rate while still capping a loop that would otherwise write
 * on every tick.
 */
export const viewLimiter = rateLimit(withStore({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many view updates. Please wait a moment and try again.',
    },
}));

/** Typeahead search: generous burst for keystroke-driven queries, no PII in payload. */
export const searchLimiter = rateLimit(withStore({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many searches. Please wait a moment and try again.',
    },
}));

/**
 * Analytics dashboards: same budget as search (60/min/IP). The aggregations
 * behind these endpoints are the heaviest reads in the API, and the public
 * one is unauthenticated — a scrape loop must not be able to run them
 * unbounded.
 */
export const analyticsLimiter = rateLimit(withStore({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many analytics requests. Please wait a moment and try again.',
    },
}));

/** Protect subscription persistence without interfering with normal silent resync. */
export const pushSubscriptionLimiter = rateLimit(withStore({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many notification subscription updates. Please try again shortly.',
    },
}));
