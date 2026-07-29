const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const OPERATIONAL_ROLES = new Set(['municipal_admin', 'responder']);

const REPORT_UPDATE_META = {
    general: { label: 'Situation changed', priority: 'normal', tone: 'indigo' },
    transported: { label: 'Patient transported', priority: 'normal', tone: 'emerald' },
    stabilized: { label: 'Patient stabilized', priority: 'normal', tone: 'emerald' },
    need_help: { label: 'Urgent help requested', priority: 'urgent', tone: 'red' },
    false_alarm: { label: 'Possible false alarm', priority: 'review', tone: 'amber' },
    other: { label: 'Other reporter update', priority: 'normal', tone: 'indigo' },
};

export const normalizeNotificationId = (value) => {
    const normalized = value == null ? '' : String(value);
    return OBJECT_ID_PATTERN.test(normalized) ? normalized : '';
};

export const getReportUpdateMeta = (notificationOrTag) => {
    const tag = typeof notificationOrTag === 'string'
        ? notificationOrTag
        : notificationOrTag?.data?.tag;
    return REPORT_UPDATE_META[tag] || REPORT_UPDATE_META.other;
};

export const isOperationalNotificationRecipient = (role) => OPERATIONAL_ROLES.has(role);

export const shouldDeferNotificationRead = (notification, role) => (
    notification?.type === 'report_update'
    && isOperationalNotificationRecipient(role)
    && Boolean(normalizeNotificationId(notification?.data?.reportId))
);

const buildReportUpdateTarget = (notification, role) => {
    if (!isOperationalNotificationRecipient(role)) return '/my-reports';

    const reportId = normalizeNotificationId(notification?.data?.reportId);
    if (!reportId) return '/admin/reports';

    const params = new URLSearchParams({
        report: reportId,
        source: 'notification',
    });
    const notificationId = normalizeNotificationId(notification?._id || notification?.id);
    const updateId = normalizeNotificationId(notification?.data?.updateId);
    if (notificationId) params.set('notification', notificationId);
    if (updateId) params.set('update', updateId);
    return `/admin/reports?${params.toString()}`;
};

export const buildNotificationTarget = (notification, role) => {
    switch (notification?.type) {
        case 'new_report':
            return '/admin/reports';
        case 'report_verified':
            return role === 'responder' ? '/admin/reports?view=dispatch-queue' : '/my-reports';
        case 'report_rejected':
            return '/my-reports';
        case 'report_responding':
            return isOperationalNotificationRecipient(role) ? '/admin/reports' : '/my-reports';
        case 'report_update':
            return buildReportUpdateTarget(notification, role);
        case 'report_transferred':
        case 'report_transfer_acknowledged':
            return '/admin/reports';
        case 'reporter_verified':
        case 'reporter_rejected':
            return '/';
        default:
            return null;
    }
};

export const isPriorityReporterUpdate = (notification) => (
    notification?.type === 'report_update'
    && ['urgent', 'review'].includes(getReportUpdateMeta(notification).priority)
);
