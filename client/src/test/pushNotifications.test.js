import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
    getPushState,
    subscribeToPush,
    unsubscribeFromPush,
} from '../services/pushNotifications';

const jsonSubscription = {
    endpoint: 'https://push.example.test/subscriptions/123',
    expirationTime: null,
    keys: { p256dh: 'public-key-material', auth: 'auth-key-material' },
};

describe('browser push subscription lifecycle', () => {
    let permission;
    let registration;
    let currentSubscription;

    beforeEach(() => {
        permission = 'default';
        currentSubscription = null;
        registration = {
            pushManager: {
                getSubscription: vi.fn(async () => currentSubscription),
                subscribe: vi.fn(async () => ({
                    ...jsonSubscription,
                    toJSON: () => jsonSubscription,
                })),
            },
        };

        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: vi.fn(async () => registration),
                getRegistration: vi.fn(async () => registration),
                ready: Promise.resolve(registration),
            },
        });
        vi.stubGlobal('PushManager', function PushManager() {});
        vi.stubGlobal('Notification', {
            get permission() { return permission; },
            requestPermission: vi.fn(async () => {
                permission = 'granted';
                return permission;
            }),
        });
        vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQIDBAUGBwgJCgsMDQ4PEA');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    test('does not display a permission prompt during silent synchronization', async () => {
        await expect(subscribeToPush({ requestPermission: false })).resolves.toEqual({
            status: 'prompt',
            subscription: null,
        });
        expect(Notification.requestPermission).not.toHaveBeenCalled();
        expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
    });

    test('subscribes after an explicit permission-granting action', async () => {
        const result = await subscribeToPush();

        expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
        expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledWith('/');
        expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({
            userVisibleOnly: true,
            applicationServerKey: expect.any(Uint8Array),
        }));
        expect(result).toEqual({ status: 'subscribed', subscription: jsonSubscription });
    });

    test('replaces a subscription created with a previous VAPID key', async () => {
        permission = 'granted';
        currentSubscription = {
            options: {
                applicationServerKey: Uint8Array.from([9, 9, 9, 9]).buffer,
            },
            unsubscribe: vi.fn(async () => true),
            toJSON: () => ({ ...jsonSubscription, endpoint: 'https://push.example.test/old' }),
        };

        await expect(subscribeToPush({ requestPermission: false })).resolves.toEqual({
            status: 'subscribed',
            subscription: jsonSubscription,
        });

        expect(currentSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({
            userVisibleOnly: true,
            applicationServerKey: expect.any(Uint8Array),
        }));
    });

    test('reports and removes an existing local subscription', async () => {
        currentSubscription = {
            endpoint: jsonSubscription.endpoint,
            unsubscribe: vi.fn(async () => true),
        };
        permission = 'granted';

        await expect(getPushState()).resolves.toEqual(expect.objectContaining({
            supported: true,
            permission: 'granted',
            subscribed: true,
            endpoint: jsonSubscription.endpoint,
        }));
        await expect(unsubscribeFromPush()).resolves.toEqual({
            status: 'unsubscribed',
            endpoint: jsonSubscription.endpoint,
        });
        expect(currentSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
