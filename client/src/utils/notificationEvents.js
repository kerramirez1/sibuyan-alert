import { getMapStatusDot, getMapStatusTextTone, MAP_STATUS_CONFIG } from '../config/mapVisuals';
import { getReportUpdateMeta } from './notificationNavigation';

/**
 * The one incident-communication palette.
 *
 * The bell popover (`NotificationBell`) and the full inbox (`NotificationsPage`)
 * render the same feed, and each used to carry its own private `getEventMarker`.
 * That copy is exactly how one event came to be violet in the incident queue and
 * purple in the bell, cyan in one screen and cyan-600 in the other. Both screens
 * now read this lookup, and the lifecycle tones are derived from
 * `MAP_STATUS_CONFIG`, so an event and the status it describes cannot disagree.
 */

/**
 * A lifecycle event's marker, read from the status entry that owns the status.
 *
 * The label is passed in rather than looked up: a notification names the *event*
 * ("Report verified", "New report"), which is not always the status label, but
 * its colour is always the status colour. `report_responding` deliberately passes
 * the status's own label (see the table below) because that state has one name.
 */
const statusEvent = (status, label) => Object.freeze({
    dot: getMapStatusDot(status),
    badge: getMapStatusTextTone(status),
    label,
});

const rejectedEvent = Object.freeze({
    // An alert tone, not the lifecycle swatch: a rejection notice is bad news the
    // reader has to act on, so it stays red even though the archived `rejected`
    // status is drawn slate wherever map chrome shows it.
    dot: 'bg-red-500',
    badge: 'text-red-700 dark:text-red-400',
    label: 'Report rejected',
});

export const NOTIFICATION_EVENT_MARKERS = Object.freeze({
    report_verified: statusEvent('verified', 'Report verified'),
    reporter_verified: statusEvent('verified', 'Report verified'),
    report_resolved: statusEvent('resolved', 'Incident resolved'),
    // One lifecycle state, one name: this label comes from the status entry that
    // owns it (MAP_STATUS_CONFIG.responding), never a second spelling.
    report_responding: statusEvent('responding', MAP_STATUS_CONFIG.responding.label),
    new_report: statusEvent('pending', 'New report'),
    report_transferred: statusEvent('transferred', 'Transferred'),
    report_transfer_acknowledged: statusEvent('transferred', 'Transferred'),
    report_rejected: rejectedEvent,
    reporter_rejected: rejectedEvent,
});

/**
 * Reporter situation updates, in the alert ramp.
 *
 * The one event that is not a lifecycle status: the colour says how urgent the
 * update is, not what stage the incident is at, so it keeps its own ramp instead
 * of borrowing a status entry.
 */
const REPORT_UPDATE_MARKERS = Object.freeze({
    urgent: Object.freeze({ dot: 'bg-red-500', badge: 'text-red-700 dark:text-red-400', label: 'Urgent help' }),
    review: Object.freeze({ dot: 'bg-amber-500', badge: 'text-amber-700 dark:text-amber-400', label: 'Review needed' }),
    normal: Object.freeze({ dot: 'bg-brand-600', badge: 'text-brand-700 dark:text-sky-400', label: 'Situation update' }),
});

const DEFAULT_EVENT_MARKER = Object.freeze({
    dot: 'bg-gray-400',
    badge: 'text-gray-600 dark:text-gray-400',
    label: 'Notification',
});

export const getNotificationEventMarker = (notification) => {
    if (notification?.type === 'report_update') {
        const priority = getReportUpdateMeta(notification)?.priority;
        return REPORT_UPDATE_MARKERS[priority] || REPORT_UPDATE_MARKERS.normal;
    }

    return NOTIFICATION_EVENT_MARKERS[notification?.type] || DEFAULT_EVENT_MARKER;
};
