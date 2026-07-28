import {
    normalizePushEndpoint,
    normalizePushSubscription,
    PushSubscriptionValidationError,
} from '../utils/pushSubscription.js';

const validSubscription = {
    endpoint: 'https://push.example.test/subscriptions/123',
    expirationTime: null,
    keys: {
        p256dh: 'AbCdEfGhIjKlMnOpQrStUvWxYz_12345',
        auth: 'AbCdEfGhIjKlMnOp',
    },
};

describe('push subscription validation', () => {
    test('keeps only the provider fields required for Web Push delivery', () => {
        expect(normalizePushSubscription({
            ...validSubscription,
            injected: { $set: { role: 'municipal_admin' } },
        })).toEqual(validSubscription);
    });

    test.each([
        'http://push.example.test/subscriptions/123',
        'javascript:alert(1)',
        'not-a-url',
    ])('rejects unsafe endpoint %s', (endpoint) => {
        expect(() => normalizePushEndpoint(endpoint))
            .toThrow(PushSubscriptionValidationError);
    });

    test('rejects missing provider encryption keys', () => {
        expect(() => normalizePushSubscription({
            endpoint: validSubscription.endpoint,
            keys: {},
        })).toThrow('p256dh');
    });
});

