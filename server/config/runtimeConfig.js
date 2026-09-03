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

/** Fail fast instead of starting a production process with partial security configuration. */
export const validateRuntimeConfig = (env = process.env) => {
    if (env.NODE_ENV !== 'production') {
        const missingDev = REQUIRED_PRODUCTION_VARIABLES.filter((name) => !env[name]?.trim());
        if (missingDev.length > 0) {
            console.warn(`⚠️ Missing configuration for local development: ${missingDev.join(', ')}`);
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
    if (!hasAnyWebPushConfig) return;

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
};

export default validateRuntimeConfig;
