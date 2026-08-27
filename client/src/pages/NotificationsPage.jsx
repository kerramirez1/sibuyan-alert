import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineArrowRight,
    HiOutlineCheck,
    HiOutlineInbox,
    HiOutlineLocationMarker,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
} from 'react-icons/hi';
import { useNavigate } from '../router';
import { notificationsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { cleanNotificationTitle, cleanNotificationMessage } from '../utils/notificationFormatting';
import {
    buildNotificationTarget,
    getReportUpdateMeta,
    isPriorityReporterUpdate,
    shouldDeferNotificationRead,
} from '../utils/notificationNavigation';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'updates', label: 'Reporter updates' },
    { key: 'priority', label: 'Priority' },
];

const getEventMarker = (notification) => {
    switch (notification.type) {
        case 'report_verified':
        case 'reporter_verified':
        case 'report_resolved':
            return {
                dot: 'bg-emerald-500',
                badge: 'text-emerald-700 dark:text-emerald-400',
                label: notification.type === 'report_resolved' ? 'Incident resolved' : 'Report verified',
            };
        case 'report_responding':
            return {
                dot: 'bg-cyan-500',
                badge: 'text-cyan-700 dark:text-cyan-400',
                label: 'Response active',
            };
        case 'reporter_rejected':
        case 'report_rejected':
            return {
                dot: 'bg-red-500',
                badge: 'text-red-700 dark:text-red-400',
                label: 'Report rejected',
            };
        case 'report_update': {
            const updateMeta = getReportUpdateMeta(notification);
            if (updateMeta.priority === 'urgent') {
                return { dot: 'bg-red-500', badge: 'text-red-700 dark:text-red-400', label: 'Urgent help' };
            }
            if (updateMeta.priority === 'review') {
                return { dot: 'bg-amber-500', badge: 'text-amber-700 dark:text-amber-400', label: 'Review needed' };
            }
            return { dot: 'bg-indigo-500', badge: 'text-indigo-700 dark:text-indigo-400', label: 'Situation update' };
        }
        case 'new_report':
            return {
                dot: 'bg-amber-500',
                badge: 'text-amber-700 dark:text-amber-400',
                label: 'New report',
            };
        case 'report_transferred':
        case 'report_transfer_acknowledged':
            return {
                dot: 'bg-purple-500',
                badge: 'text-purple-700 dark:text-purple-400',
                label: 'Transferred',
            };
        default:
            return {
                dot: 'bg-gray-400',
                badge: 'text-gray-600 dark:text-gray-400',
                label: 'Notification',
            };
    }
};

const getNotificationId = (notification) => notification?._id || notification?.id;
const getNotificationDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const NotificationsPage = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const { setUnreadCount, subscribe } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await notificationsAPI.getAll({ limit: 50 });
            const data = response.data?.data || {};
            setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
            if (Number.isFinite(data.unreadCount)) setUnreadCount(data.unreadCount);
        } catch (requestError) {
            console.error('Failed to fetch notifications:', requestError);
            setError('Notifications could not be loaded. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, [setUnreadCount]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    useEffect(() => subscribe('notification', (notification) => {
        const incomingId = getNotificationId(notification);
        setNotifications((current) => (
            current.some((item) => getNotificationId(item) === incomingId)
                ? current
                : [notification, ...current]
        ));
    }), [subscribe]);

    const markAsRead = useCallback(async (id) => {
        if (!id) return false;
        try {
            const response = await notificationsAPI.markAsRead(id);
            setNotifications((current) => current.map((notification) => (
                getNotificationId(notification) === id ? { ...notification, isRead: true } : notification
            )));
            const authoritativeCount = response.data?.data?.unreadCount;
            if (Number.isFinite(authoritativeCount)) setUnreadCount(authoritativeCount);
            return true;
        } catch (requestError) {
            console.error('Failed to mark notification as read:', requestError);
            return false;
        }
    }, [setUnreadCount]);

    const markAllAsRead = async () => {
        try {
            await notificationsAPI.markAllAsRead();
            setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
            setUnreadCount(0);
        } catch (requestError) {
            console.error('Failed to mark all notifications as read:', requestError);
            setError('Notifications could not be marked as read. Please try again.');
        }
    };

    const handleNotificationClick = async (notification) => {
        const deferRead = shouldDeferNotificationRead(notification, user?.role);
        const notificationId = getNotificationId(notification);
        if (!notification.isRead && !deferRead) await markAsRead(notificationId);
        const target = buildNotificationTarget(notification, user?.role);
        if (target) navigate(target);
    };

    const counts = useMemo(() => ({
        all: notifications.length,
        unread: notifications.filter((notification) => !notification.isRead).length,
        updates: notifications.filter((notification) => notification.type === 'report_update').length,
        priority: notifications.filter(isPriorityReporterUpdate).length,
    }), [notifications]);

    const filteredNotifications = useMemo(() => notifications.filter((notification) => {
        if (activeFilter === 'unread') return !notification.isRead;
        if (activeFilter === 'updates') return notification.type === 'report_update';
        if (activeFilter === 'priority') return isPriorityReporterUpdate(notification);
        return true;
    }), [activeFilter, notifications]);

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
            {/* Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <HiOutlineShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Incident Communications</span>
                            <span className="text-emerald-600/60 dark:text-emerald-400/60 font-normal">·</span>
                            <span className="hidden xs:inline text-emerald-700 dark:text-emerald-400 font-bold">Operational Inbox</span>
                        </span>
                    </div>
                    <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Notifications
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Review report activity and open the exact incident that needs attention.
                    </p>
                </div>

                <div className="flex w-full gap-2 sm:w-auto shrink-0">
                    <button
                        type="button"
                        onClick={() => fetchNotifications()}
                        disabled={loading}
                        className="inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-white/5 cursor-pointer min-h-[44px] sm:min-h-0"
                    >
                        <HiOutlineRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        <span>Refresh</span>
                    </button>
                    {counts.unread > 0 && (
                        <button
                            type="button"
                            onClick={markAllAsRead}
                            className="inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px] sm:min-h-0"
                        >
                            <HiOutlineCheck className="h-4 w-4" aria-hidden="true" />
                            <span>Mark all read</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Filter Tabs */}
            <nav
                className="flex items-center gap-1 overflow-x-auto rounded-xl sm:rounded-2xl border border-gray-200/90 bg-gray-50/70 p-1.5 dark:border-white/10 dark:bg-[#0c1813]/70"
                aria-label="Notification filters"
            >
                {FILTERS.map((filter) => {
                    const active = activeFilter === filter.key;
                    return (
                        <button
                            key={filter.key}
                            type="button"
                            onClick={() => setActiveFilter(filter.key)}
                            aria-pressed={active}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer min-h-[44px] sm:min-h-0 ${active
                                    ? 'bg-white text-gray-950 shadow-2xs dark:bg-white/10 dark:text-white'
                                    : 'text-gray-600 hover:bg-white/50 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
                                }`}
                        >
                            <span>{filter.label}</span>
                            <span
                                className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${active
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                        : 'bg-gray-200/70 text-gray-600 dark:bg-white/5 dark:text-gray-400'
                                    }`}
                            >
                                {counts[filter.key]}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {error && (
                <div className="rounded-xl border border-red-200/90 bg-red-50/80 p-4 text-xs sm:text-sm font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" role="alert">
                    {error}
                </div>
            )}

            {/* Notification Ledger */}
            <section
                className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                aria-label="Notification inbox"
            >
                {loading && notifications.length === 0 ? (
                    <div className="p-8 sm:p-12 text-center" role="status">
                        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">Loading notifications…</p>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="px-5 py-12 text-center sm:py-16">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500">
                            <HiOutlineInbox className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <h2 className="mt-3 font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                            No notifications in this view
                        </h2>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            New report activity will appear here.
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-white/5">
                        {filteredNotifications.map((notification) => {
                            const marker = getEventMarker(notification);
                            const notificationId = getNotificationId(notification);
                            const createdAt = getNotificationDate(notification.createdAt);
                            const address = notification.data?.address;
                            const title = cleanNotificationTitle(notification.title);
                            const message = notification.data?.updatePreview || cleanNotificationMessage(notification.message);

                            return (
                                <li key={notificationId}>
                                    <button
                                        type="button"
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`group flex w-full items-start gap-3 p-4 sm:p-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 cursor-pointer min-h-[44px] ${!notification.isRead
                                                ? 'bg-emerald-50/20 hover:bg-emerald-50/40 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20'
                                                : 'bg-white hover:bg-gray-50/80 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                            }`}
                                    >
                                        {/* Status Dot */}
                                        <div className="pt-1 shrink-0">
                                            <span className={`block h-2.5 w-2.5 rounded-full ${marker.dot}`} aria-hidden="true" />
                                        </div>

                                        {/* Content */}
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${marker.badge}`}>
                                                    {marker.label}
                                                </span>
                                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                    &bull;
                                                </span>
                                                <time dateTime={createdAt?.toISOString()} className="text-[11px] text-gray-500 dark:text-gray-400">
                                                    {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : 'Time unavailable'}
                                                </time>
                                            </div>

                                            <h3 className={`text-xs sm:text-sm font-bold leading-snug break-words ${!notification.isRead ? 'text-gray-950 dark:text-white' : 'text-gray-800 dark:text-gray-200'
                                                }`}>
                                                {title}
                                            </h3>

                                            {message && (
                                                <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                                    {message}
                                                </p>
                                            )}

                                            {address && (
                                                <div className="pt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                    <HiOutlineLocationMarker className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                                                    <span className="truncate">{address}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Arrow */}
                                        <div className="pt-1 shrink-0 text-gray-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                                            <HiOutlineArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default NotificationsPage;
