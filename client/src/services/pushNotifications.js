import { sharePushConfig } from './serviceWorker';

const SERVICE_WORKER_URL = '/sw.js';

const readCookie = (name) => {
    if (typeof document === 'undefined') return null;
    const prefix = `${name}=`;
    const match = document.cookie.split('; ').find((row) => row.startsWith(prefix));
    return match ? decodeURIComponent(match.slice(prefix.length)) : null;
};

export const isPushSupported = () => (
    typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
);

const urlBase64ToUint8Array = (base64String) => {
    if (typeof base64String !== 'string' || !base64String) {
        throw new TypeError('VAPID public key must be a non-empty string');
    }
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    if (typeof window === 'undefined' || typeof window.atob !== 'function') {
        throw new Error('Base64 decoding is not available in this environment');
    }
    const rawData = window.atob(base64);
    return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const applicationServerKeysMatch = (subscription, expectedKey) => {
    const currentKey = subscription?.options?.applicationServerKey;
    if (!currentKey) return true;

    const currentBytes = new Uint8Array(currentKey);
    return currentBytes.length === expectedKey.length
        && currentBytes.every((value, index) => value === expectedKey[index]);
};

const getRegistration = async () => {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
        await navigator.serviceWorker.ready;
        return existing;
    }
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: '/',
        updateViaCache: 'none',
    });
    await navigator.serviceWorker.ready;
    return registration;
};

/**
 * Create or recover a browser subscription. Permission is requested only when
 * called from an explicit user action; silent synchronization never prompts.
 */
export async function subscribeToPush({ requestPermission = true } = {}) {
    if (!isPushSupported()) {
        return { status: 'unsupported', subscription: null };
    }

    try {
        let permission = Notification.permission;
        if (permission === 'default' && requestPermission) {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            return { status: permission === 'denied' ? 'denied' : 'prompt', subscription: null };
        }

        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
        if (!vapidPublicKey) {
            return { status: 'unconfigured', subscription: null };
        }

        const registration = await getRegistration();
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        let subscription = await registration.pushManager.getSubscription();

        // A subscription created with an old VAPID key cannot receive messages
        // signed by the current key, so replace it after a key rotation.
        if (subscription && !applicationServerKeysMatch(subscription, applicationServerKey)) {
            await subscription.unsubscribe();
            subscription = null;
        }

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });
        }

        // Hand the worker the key and CSRF token it needs to re-register a
        // rotated subscription on its own, when no page is open to do it.
        sharePushConfig({ vapidPublicKey, csrfToken: readCookie('sibuyan_csrf') });

        return { status: 'subscribed', subscription: subscription.toJSON() };
    } catch (error) {
        console.error('Push subscription error:', error);
        return { status: 'error', subscription: null, error };
    }
}

export async function unsubscribeFromPush() {
    if (!isPushSupported()) return { status: 'unsupported', endpoint: null };

    try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint || null;
        if (subscription) await subscription.unsubscribe();
        return { status: 'unsubscribed', endpoint };
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        return { status: 'error', endpoint: null, error };
    }
}

export async function getPushState() {
    if (!isPushSupported()) {
        return { supported: false, permission: 'unsupported', subscribed: false };
    }

    try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        return {
            supported: true,
            permission: Notification.permission,
            subscribed: Boolean(subscription),
            endpoint: subscription?.endpoint || null,
        };
    } catch {
        return {
            supported: true,
            permission: Notification.permission,
            subscribed: false,
        };
    }
}
