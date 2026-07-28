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
    if (env.NODE_ENV !== 'production') return;

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
