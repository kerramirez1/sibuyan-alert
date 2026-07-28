const REQUIRED_PRODUCTION_VARIABLES = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL'];

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
};

export default validateRuntimeConfig;
