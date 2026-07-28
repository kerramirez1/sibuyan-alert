import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    updateOne: vi.fn(),
}));

vi.mock('web-push', () => ({
    default: {
        setVapidDetails: mocks.setVapidDetails,
        sendNotification: mocks.sendNotification,
    },
}));
vi.mock('../models/User.js', () => ({
    default: { updateOne: mocks.updateOne },
}));

import {
    configureWebPush,
    sendPushNotification,
    sendPushToUser,
} from '../services/pushService.js';

const subscription = {
    endpoint: 'https://push.example.test/subscriptions/123',
    keys: { p256dh: 'public-key', auth: 'auth-key' },
};

describe('Web Push delivery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.VAPID_PUBLIC_KEY = 'public-key';
        process.env.VAPID_PRIVATE_KEY = 'private-key';
        process.env.VAPID_EMAIL = 'mailto:alerts@example.test';
        configureWebPush();
    });

    test('sends a service-worker compatible payload', async () => {
        mocks.sendNotification.mockResolvedValue({});

        await expect(sendPushNotification(subscription, {
            title: 'Report verified',
            body: 'Open the report',
            url: '/my-reports?status=verified',
        })).resolves.toBe(true);

        const payload = JSON.parse(mocks.sendNotification.mock.calls[0][1]);
        expect(payload.data.url).toBe('/my-reports?status=verified');
        expect(payload.icon).toBe('/icons/Alert.png');
        expect(payload.actions).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'view' }),
        ]));
    });

    test('removes an expired endpoint without disabling other account data', async () => {
        mocks.sendNotification.mockRejectedValue({ statusCode: 410 });
        mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
        const user = {
            _id: 'user-1',
            pushSubscription: { ...subscription },
            notificationPreferences: { browserPush: true },
        };

        await expect(sendPushToUser(user, { title: 'Update' })).resolves.toBe(false);
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { _id: 'user-1', 'pushSubscription.endpoint': subscription.endpoint },
            { $set: { pushSubscription: null } }
        );
        expect(user.pushSubscription).toBeNull();
    });
});

