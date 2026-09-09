const REQUIRED_PRODUCTION_VARIABLES = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL'];
const WEB_PUSH_VARIABLES = [
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_EMAIL',
    'VITE_VAPID_PUBLIC_KEY',
];

const isHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
};

/**
 * Web Push keys are compared from environment variables only. The client build
 * embeds VITE_VAPID_PUBLIC_KEY at build time (see HEROKU_DEPLOYMENT.md), so
 * reading client/.env from the server filesystem at runtime is unreliable
 * (the file does not exist on Heroku) and is intentionally not attempted.
 */

/** Fail fast instead of starting a production process with partial security configuration. */
export const validateRuntimeConfig = (env = process.env) => {
    if (env.NODE_ENV !== 'production') {
        const missingDev = REQUIRED_PRODUCTION_VARIABLES.filter((name) => !env[name]?.trim());
        if (missingDev.length > 0) {
            console.warn(`⚠️ Missing configuration for local development: ${missingDev.join(', ')}`);
        }
        if (env.JWT_SECRET?.trim() && env.JWT_SECRET.trim().length < 32) {
            console.warn('⚠️ JWT_SECRET is shorter than 32 chars — use a 32+ char secret before promoting to production');
        }
        if (!env.SMTP_HOST?.trim() || !env.SMTP_USER?.trim() || !env.SMTP_PASS?.trim()) {
            console.warn('⚠️ SMTP is not fully configured — password-reset emails are disabled (MVP degraded mode)');
        }
        if (!env.VAPID_PUBLIC_KEY?.trim() || !env.VAPID_PRIVATE_KEY?.trim()) {
            console.warn('⚠️ VAPID keys missing — Web Push is disabled (MVP degraded mode, Socket.IO still works)');
        } else {
            const clientKey = (env.VITE_VAPID_PUBLIC_KEY || '').trim();
            if (clientKey && env.VAPID_PUBLIC_KEY.trim() !== clientKey) {
                console.warn('⚠️ VAPID_PUBLIC_KEY and VITE_VAPID_PUBLIC_KEY do not match — push subscriptions will fail');
            } else if (!clientKey) {
                console.warn('⚠️ VITE_VAPID_PUBLIC_KEY is not configured — set it to the same value as VAPID_PUBLIC_KEY before building the client');
            }
        }
        return;
    }

    const missing = REQUIRED_PRODUCTION_VARIABLES.filter((name) => !env[name]?.trim());
    if (missing.length > 0) {
        throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
    }

    if (env.JWT_SECRET.trim().length < 32) {
        throw new Error('JWT_SECRET must contain at least 32 characters in production');
    }

    if (!isHttpUrl(env.CLIENT_URL)) {
        throw new Error('CLIENT_URL must be an absolute HTTP(S) URL in production');
    }

    const boundedIntegerSettings = [
        ['JWT_ACCESS_TTL_MINUTES', 5, 30],
        ['AUTH_SESSION_TTL_DAYS', 1, 30],
    ];
    for (const [name, minimum, maximum] of boundedIntegerSettings) {
        if (!env[name]) continue;
        const value = Number(env[name]);
        if (!Number.isInteger(value) || value < minimum || value > maximum) {
            throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
        }
    }

    const hasAnyWebPushConfig = WEB_PUSH_VARIABLES.some((name) => env[name]?.trim());
    if (!hasAnyWebPushConfig) {
        console.warn('⚠️ Web Push not configured — background push disabled, Socket.IO realtime still works (MVP degraded mode)');
    } else {
        const missingWebPush = WEB_PUSH_VARIABLES.filter((name) => !env[name]?.trim());
        if (missingWebPush.length > 0) {
            throw new Error(`Incomplete Web Push configuration: ${missingWebPush.join(', ')}`);
        }
        if (!/^(?:mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(env.VAPID_EMAIL.trim())) {
            throw new Error('VAPID_EMAIL must use a mailto: or HTTPS contact URI');
        }
        if (env.VAPID_PUBLIC_KEY.trim() !== env.VITE_VAPID_PUBLIC_KEY.trim()) {
            throw new Error('VAPID_PUBLIC_KEY and VITE_VAPID_PUBLIC_KEY must match');
        }
    }

    if (!env.SMTP_HOST?.trim() || !env.SMTP_USER?.trim() || !env.SMTP_PASS?.trim()) {
        console.warn('⚠️ SMTP not configured — password-reset emails disabled; use scripts/resetUserPassword.js for ops resets (MVP degraded mode)');
    }
    if (!env.REDIS_URL?.trim()) {
        console.warn('⚠️ REDIS_URL missing — single-dyno mode only. Do not scale past 1 web dyno without a shared rate-limit/socket store.');
    }
    // Fail fast on multi-process Node without a shared store: in-memory rate
    // limits and Socket.IO rooms would silently diverge per process.
    const webConcurrency = Number.parseInt(env.WEB_CONCURRENCY, 10);
    if (Number.isInteger(webConcurrency) && webConcurrency > 1 && !env.REDIS_URL?.trim()) {
        throw new Error('WEB_CONCURRENCY > 1 requires REDIS_URL for shared rate-limit/socket state');
    }
};

export default validateRuntimeConfig;
