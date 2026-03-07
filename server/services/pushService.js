import webpush from 'web-push';

// Configure web-push with VAPID keys
const configureWebPush = () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
            process.env.VAPID_EMAIL || 'mailto:sibuyan.alert@gmail.com',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        console.log('✅ Web Push configured');
    } else {
        console.warn('⚠️ VAPID keys not configured - Web Push disabled');
    }
};

/**
 * Send push notification
 * @param {Object} subscription - Push subscription object
 * @param {Object} payload - Notification payload
 * @returns {Promise<boolean>}
 */
export const sendPushNotification = async (subscription, payload) => {
    if (!subscription) {
        return false;
    }

    try {
        const notificationPayload = JSON.stringify({
            title: payload.title || 'Sibuyan Alert',
            body: payload.message || payload.body,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            tag: payload.tag || 'default',
            data: {
                url: payload.url || '/',
                ...payload.data,
            },
            actions: payload.actions || [
                { action: 'view', title: 'View' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
            requireInteraction: payload.requireInteraction || false,
            vibrate: [200, 100, 200],
        });

        await webpush.sendNotification(subscription, notificationPayload);

        return true;
    } catch (error) {
        console.error('❌ Push notification error:', error);
        // Subscription may be expired or invalid
        if (error.statusCode === 410 || error.statusCode === 404) {

            return { expired: true };
        }
        return false;
    }
};

/**
 * Send push notification to multiple users
 * @param {Array} users - Array of users with pushSubscription
 * @param {Object} payload - Notification payload
 */
export const sendPushToUsers = async (users, payload) => {
    const results = await Promise.allSettled(
        users.map(async (user) => {
            if (user.pushSubscription && user.notificationPreferences?.browserPush) {
                return await sendPushNotification(user.pushSubscription, payload);
            }
            return false;
        })
    );

    const successful = results.filter(
        (r) => r.status === 'fulfilled' && r.value === true
    ).length;


    return { total: users.length, successful };
};

/**
 * Notification templates
 */
export const pushTemplates = {
    newReport: (report) => ({
        title: '🚨 New Accident Report',
        message: `Accident reported at ${report.address}`,
        tag: `report-${report._id}`,
        url: `/dashboard?report=${report._id}`,
        requireInteraction: true,
        data: { reportId: report._id, type: 'new_report' },
    }),

    reportVerified: (report) => ({
        title: '✅ Report Verified',
        message: `Your report at ${report.address} has been verified`,
        tag: `report-${report._id}-verified`,
        url: `/dashboard?report=${report._id}`,
        data: { reportId: report._id, type: 'report_verified' },
    }),

    reportRejected: (report, reason) => ({
        title: '❌ Report Not Verified',
        message: reason || `Your report at ${report.address} was not verified`,
        tag: `report-${report._id}-rejected`,
        url: `/dashboard`,
        data: { reportId: report._id, type: 'report_rejected' },
    }),

    reporterVerified: () => ({
        title: '🎉 Account Verified!',
        message: 'Your reporter account has been approved. Start reporting!',
        tag: 'verification-approved',
        url: '/report',
        data: { type: 'reporter_verified' },
    }),

    reporterRejected: (feedback) => ({
        title: '⚠️ Verification Update',
        message: feedback || 'Your reporter verification was not approved',
        tag: 'verification-rejected',
        url: '/login',
        data: { type: 'reporter_rejected' },
    }),

    highRiskAlert: (zone) => ({
        title: '⚠️ High-Risk Zone Alert',
        message: `Multiple accidents reported near ${zone.address}`,
        tag: `zone-${zone.id}`,
        url: '/dashboard',
        requireInteraction: true,
        data: { type: 'high_risk_alert', zone },
    }),
};

export { configureWebPush };

export default {
    configureWebPush,
    sendPushNotification,
    sendPushToUsers,
    pushTemplates,
};
