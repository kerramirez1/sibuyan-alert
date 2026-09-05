import webpush from 'web-push';
import User from '../models/User.js';

let webPushConfigured = false;

export const configureWebPush = () => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        webPushConfigured = false;
        console.warn('Web Push disabled: VAPID keys are not configured');
        return false;
    }

    try {
        webpush.setVapidDetails(
            process.env.VAPID_EMAIL || 'mailto:sibuyan.alert@gmail.com',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
    } catch (error) {
        webPushConfigured = false;
        console.warn('Web Push disabled: invalid VAPID configuration —', error?.message);
        return false;
    }
    webPushConfigured = true;
    console.log('Web Push configured');
    return true;
};

export const sendPushNotification = async (subscription, payload) => {
    if (!webPushConfigured || !subscription) return false;

    try {
        await webpush.sendNotification(subscription, JSON.stringify({
            title: payload.title || 'Sibuyan Alert',
            body: payload.message || payload.body || 'New notification',
            icon: payload.icon || '/icons/Alert.png',
            badge: payload.badge || '/icons/Alert.png',
            tag: payload.tag || 'sibuyan-alert',
            data: {
                ...payload.data,
                url: payload.url || payload.data?.url || '/',
            },
            actions: payload.actions || [
                { action: 'view', title: 'View' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
            requireInteraction: Boolean(payload.requireInteraction),
            vibrate: [200, 100, 200],
        }));
        return true;
    } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) {
            return { expired: true };
        }
        console.error('Push notification delivery failed:', {
            statusCode: error.statusCode,
            message: error.message,
        });
        return false;
    }
};

/** Send to one account and remove endpoints rejected by the push provider. */
export const sendPushToUser = async (user, payload) => {
    if (!user?.pushSubscription || !user.notificationPreferences?.browserPush) return false;

    const subscription = user.pushSubscription;
    const result = await sendPushNotification(subscription, payload);
    if (result?.expired && user._id) {
        try {
            await User.updateOne(
                {
                    _id: user._id,
                    'pushSubscription.endpoint': subscription.endpoint,
                },
                { $set: { pushSubscription: null } }
            );
        } catch (error) {
            console.error('Failed to remove expired push subscription:', {
                userId: user._id.toString(),
                message: error.message,
            });
        }
        user.pushSubscription = null;
        return false;
    }

    return result === true;
};

export const sendPushToUsers = async (users, payload) => {
    const results = await Promise.allSettled(
        users.map((user) => sendPushToUser(user, payload))
    );
    const successful = results.filter(
        (result) => result.status === 'fulfilled' && result.value === true
    ).length;

    return { total: users.length, successful };
};

export const pushTemplates = {
    newReport: (report) => ({
        title: 'New Accident Report',
        message: `Accident reported at ${report.address}`,
        tag: `report-${report._id}`,
        url: `/dashboard?report=${report._id}`,
        requireInteraction: true,
        data: { reportId: report._id, type: 'new_report' },
    }),
    reportVerified: (report) => ({
        title: 'Report Verified',
        message: `Your report at ${report.address} has been verified`,
        tag: `report-${report._id}-verified`,
        url: `/dashboard?report=${report._id}`,
        data: { reportId: report._id, type: 'report_verified' },
    }),
    reportRejected: (report, reason) => ({
        title: 'Report Not Verified',
        message: reason || `Your report at ${report.address} was not verified`,
        tag: `report-${report._id}-rejected`,
        url: '/dashboard',
        data: { reportId: report._id, type: 'report_rejected' },
    }),
    reporterVerified: () => ({
        title: 'Account Verified',
        message: 'Your reporter account has been approved. Start reporting!',
        tag: 'verification-approved',
        url: '/report',
        data: { type: 'reporter_verified' },
    }),
    reporterRejected: (feedback) => ({
        title: 'Verification Update',
        message: feedback || 'Your reporter verification was not approved',
        tag: 'verification-rejected',
        url: '/login',
        data: { type: 'reporter_rejected' },
    }),
    highRiskAlert: (zone) => ({
        title: 'High-Risk Zone Alert',
        message: `Multiple accidents reported near ${zone.address}`,
        tag: `zone-${zone.id}`,
        url: '/dashboard',
        requireInteraction: true,
        data: { type: 'high_risk_alert', zone },
    }),
};

export default {
    configureWebPush,
    sendPushNotification,
    sendPushToUser,
    sendPushToUsers,
    pushTemplates,
};
