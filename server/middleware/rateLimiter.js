import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Rate limiters for sensitive endpoints.
 *
 * Default is the in-memory store (single web dyno only). When REDIS_URL is
 * set and the optional `rate-limit-redis` + `redis` packages are installed,
 * every limiter gets its OWN RedisStore over ONE shared Redis client, so
 * limits stay consistent across dynos/processes. The stores must not be
 * shared between limiters: express-rate-limit's unsharedStore validation
 * throws ERR_ERL_STORE_REUSE for a reused store instance, which would crash
 * the boot. If REDIS_URL is set but the packages are missing, startup fails
 * fast via validateRuntimeConfig/scaling guards — limits never silently
 * diverge.
 */

const createRateLimitStoreFactory = () => {
    if (!process.env.REDIS_URL?.trim()) return null;
    try {
        const { RedisStore } = require('rate-limit-redis');
        const { createClient } = require('redis');
        const client = createClient({ url: process.env.REDIS_URL.trim() });
        client.on('error', (error) => console.error('❌ Redis rate-limit client error:', error.message));
        // Fire-and-forget: express-rate-limit queues while connecting.
        client.connect().catch((error) => console.error('❌ Redis rate-limit connect failed:', error.message));
        console.log('🔗 Rate limiting uses shared Redis store');
        // One client, one fresh RedisStore per limiter (unique key prefix).
        return (prefix) => new RedisStore({
            sendCommand: (...args) => client.sendCommand(args),
            prefix,
        });
    } catch {
        throw new Error('REDIS_URL is set but optional packages are missing: npm install rate-limit-redis redis --workspace=sibuyan-accident-alert-server');
    }
};

const createRateLimitStore = createRateLimitStoreFactory();
const withStore = (options, prefix) => (createRateLimitStore ? { ...options, store: createRateLimitStore(prefix) } : options);

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
}, 'rl:auth:'));

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
}, 'rl:pwreset:'));

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
        // ipKeyGenerator normalises IPv6 to its /56 network; a client that
        // controls a /64 could otherwise rotate addresses inside it and get a
        // fresh budget per address. IPv4 (and IPv4-mapped IPv6) is returned
        // unchanged, so existing IPv4 keying is identical.
        //
        // The call must stay INSIDE this function. express-rate-limit validates
        // ERR_ERL_KEY_GEN_IPV6 by inspecting this function's source text for the
        // `ipKeyGenerator` identifier — hoisting the call into a module-level
        // helper would still fail validation.
        return `report-ip:${ipKeyGenerator(req.ip)}`;
    },
    message: {
        success: false,
        message: 'Too many reports submitted. Please try again shortly.',
    },
}, 'rl:report:'));

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
        // Same reasoning as reportCreationLimiter: normalise IPv6 to its /56
        // network so one client cannot rotate addresses for extra budget.
        return `evidence-ip:${ipKeyGenerator(req.ip)}`;
    },
    message: {
        success: false,
        message: 'Too many reports submitted. Please try again shortly.',
    },
}, 'rl:evidence:'));

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
}, 'rl:geocode:'));

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
}, 'rl:view:'));

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
}, 'rl:search:'));

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
}, 'rl:analytics:'));

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
}, 'rl:pushsub:'));
