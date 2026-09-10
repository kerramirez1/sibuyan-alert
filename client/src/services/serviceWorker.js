/**
 * Service worker lifecycle and cache scoping.
 *
 * The worker is registered eagerly at app start — not only when a user opts
 * into push — because it also provides the offline app shell and the read-only
 * data cache. Registration is fire-and-forget: a failure here degrades offline
 * support but must never delay or break the app.
 */

const SERVICE_WORKER_URL = '/sw.js';

export const isServiceWorkerSupported = () => (
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
);

export const registerServiceWorker = async () => {
    if (!isServiceWorkerSupported()) return null;

    try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
            scope: '/',
            updateViaCache: 'none',
        });
        return registration;
    } catch (error) {
        console.error('Service worker registration failed:', error);
        return null;
    }
};

/**
 * Resolves the worker that can receive messages right now.
 * Deliberately avoids `navigator.serviceWorker.ready`, which never settles
 * when no worker is registered — that would hang the caller forever.
 */
const getActiveWorker = async () => {
    try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        return registration?.active || navigator.serviceWorker.controller || null;
    } catch {
        return null;
    }
};

const postToWorker = async (message) => {
    if (!isServiceWorkerSupported()) return false;
    const worker = await getActiveWorker();
    if (!worker) return false;

    try {
        worker.postMessage(message);
        return true;
    } catch {
        return false;
    }
};

/**
 * Namespaces cached per-user data. Passing null resets to anonymous, so a
 * logged-out device cannot read the previous account's cached incidents.
 */
export const setCacheScope = (scope) => postToWorker({
    type: 'set-cache-scope',
    scope: scope ? String(scope) : null,
});

/** Purges every cache. Must run on logout. */
export const clearOfflineCaches = () => postToWorker({ type: 'clear-caches' });

/**
 * Hands the worker what it needs to re-register a rotated push subscription
 * on its own, without a page being open.
 */
export const sharePushConfig = ({ vapidPublicKey, csrfToken } = {}) => postToWorker({
    type: 'set-push-config',
    vapidPublicKey: vapidPublicKey || null,
    csrfToken: csrfToken || null,
});

/**
 * Re-applies the cache scope whenever a new worker takes control, so a scope
 * set before activation is not lost.
 */
export const onServiceWorkerControllerChange = (callback) => {
    if (!isServiceWorkerSupported()) return () => {};
    const handler = () => callback();
    navigator.serviceWorker.addEventListener('controllerchange', handler);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
};

export default {
    isServiceWorkerSupported,
    registerServiceWorker,
    setCacheScope,
    clearOfflineCaches,
    sharePushConfig,
    onServiceWorkerControllerChange,
};
