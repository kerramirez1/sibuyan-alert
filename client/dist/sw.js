self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();

        // Customize notification options based on data
        const options = {
            body: data.body || 'New notification',
            icon: '/vite.svg', // Replace with your app icon
            badge: '/vite.svg', // Replace with your app badge
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: 1,
                url: data.url || '/'
            },
            actions: [
                {
                    action: 'explore',
                    title: 'View Details',
                },
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'Sibuyan Alert', options)
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({
            type: 'window'
        }).then(function (clientList) {
            const url = event.notification.data.url;

            // Check if there's already a tab open with this URL
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url === url && 'focus' in client)
                    return client.focus();
            }

            if (clients.openWindow)
                return clients.openWindow(url);
        })
    );
});
