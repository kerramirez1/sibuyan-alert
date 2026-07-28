const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

export class PushSubscriptionValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PushSubscriptionValidationError';
    }
}

const normalizeKey = (value, fieldName) => {
    if (
        typeof value !== 'string'
        || value.length < 16
        || value.length > 512
        || !BASE64_URL_PATTERN.test(value)
    ) {
        throw new PushSubscriptionValidationError(`Push subscription ${fieldName} key is invalid`);
    }

    return value;
};

export const normalizePushEndpoint = (value) => {
    if (typeof value !== 'string' || value.length > 2048) {
        throw new PushSubscriptionValidationError('Push subscription endpoint is invalid');
    }

    let endpoint;
    try {
        endpoint = new URL(value);
    } catch {
        throw new PushSubscriptionValidationError('Push subscription endpoint is invalid');
    }

    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
        throw new PushSubscriptionValidationError('Push subscription endpoint must use HTTPS');
    }

    return endpoint.href;
};

export const normalizePushSubscription = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new PushSubscriptionValidationError('Push subscription is required');
    }

    const expirationTime = value.expirationTime == null ? null : Number(value.expirationTime);
    if (expirationTime !== null && (!Number.isFinite(expirationTime) || expirationTime < 0)) {
        throw new PushSubscriptionValidationError('Push subscription expiration time is invalid');
    }

    return {
        endpoint: normalizePushEndpoint(value.endpoint),
        expirationTime,
        keys: {
            p256dh: normalizeKey(value.keys?.p256dh, 'p256dh'),
            auth: normalizeKey(value.keys?.auth, 'auth'),
        },
    };
};
