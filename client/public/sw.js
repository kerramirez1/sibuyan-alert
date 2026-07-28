const DEFAULT_URL = '/dashboard';
const DEFAULT_ICON = '/icons/Alert.png';

const internalUrl = (value) => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
        return DEFAULT_URL;
    }
    return value;
};

const readPayload = (event) => {
    if (!event.data) return {};
    try {
        return event.data.json();
    } catch {
        return { body: event.data.text() };
    }
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    const payload = readPayload(event);
    const destination = internalUrl(payload.data?.url || payload.url);
    const options = {
        body: payload.body || payload.message || 'New notification',
        icon: payload.icon || DEFAULT_ICON,
        badge: payload.badge || DEFAULT_ICON,
        tag: payload.tag || 'sibuyan-alert',
        renotify: Boolean(payload.renotify),
        requireInteraction: Boolean(payload.requireInteraction),
        vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [200, 100, 200],
        data: { ...payload.data, url: destination },
        actions: Array.isArray(payload.actions) ? payload.actions : [],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Sibuyan Alert', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const destination = new URL(internalUrl(event.notification.data?.url), self.location.origin);
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        });

        for (const client of clientList) {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === destination.origin && 'focus' in client) {
                if ('navigate' in client && clientUrl.href !== destination.href) {
                    await client.navigate(destination.href);
                }
                return client.focus();
            }
        }

        return self.clients.openWindow?.(destination.href);
    })());
});
