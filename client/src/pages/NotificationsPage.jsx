import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineArrowRight,
    HiOutlineBell,
    HiOutlineCheck,
    HiOutlineCheckCircle,
    HiOutlineDocumentText,
    HiOutlineExclamation,
    HiOutlineInbox,
    HiOutlineLocationMarker,
    HiOutlineRefresh,
    HiOutlineSwitchHorizontal,
    HiOutlineXCircle,
    HiOutlineStatusOnline,
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

const UPDATE_TONE_STYLES = {
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
};

const getNotificationVisual = (notification) => {
    switch (notification.type) {
        case 'reporter_verified':
        case 'report_verified':
        case 'report_resolved':
            return { icon: HiOutlineCheckCircle, iconClass: 'text-brand-600' };
        case 'reporter_rejected':
        case 'report_rejected':
            return { icon: HiOutlineXCircle, iconClass: 'text-red-600' };
        case 'report_responding':
            return { icon: HiOutlineStatusOnline, iconClass: 'text-cyan-600' };
        case 'report_update': {
            const meta = getReportUpdateMeta(notification);
            if (meta.priority === 'urgent') return { icon: HiOutlineExclamation, iconClass: 'text-red-600' };
            if (meta.priority === 'review') return { icon: HiOutlineExclamation, iconClass: 'text-amber-600' };
            return { icon: HiOutlineDocumentText, iconClass: 'text-indigo-600' };
        }
        case 'report_transferred':
        case 'report_transfer_acknowledged':
            return { icon: HiOutlineSwitchHorizontal, iconClass: 'text-violet-600' };
        case 'new_report':
            return { icon: HiOutlineExclamation, iconClass: 'text-amber-600' };
        default:
            return { icon: HiOutlineBell, iconClass: 'text-gray-600' };
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
        <div className="mx-auto w-full max-w-5xl space-y-5">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                        <HiOutlineBell className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Operational inbox</p>
                        <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">Notifications</h1>
                        <p className="mt-1 text-sm text-gray-500">Review report activity and open the exact incident that needs attention.</p>
                    </div>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                    <button
                        type="button"
                        onClick={() => fetchNotifications()}
                        disabled={loading}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
                    >
                        <HiOutlineRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                    {counts.unread > 0 && (
                        <button
                            type="button"
                            onClick={markAllAsRead}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:flex-none"
                        >
                            <HiOutlineCheck className="h-4 w-4" aria-hidden="true" />
                            Mark all read
                        </button>
                    )}
                </div>
            </header>

            <nav className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 hide-scrollbar" aria-label="Notification filters">
                {FILTERS.map((filter) => {
                    const active = activeFilter === filter.key;
                    return (
                        <button
                            key={filter.key}
                            type="button"
                            onClick={() => setActiveFilter(filter.key)}
                            aria-pressed={active}
                            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                        >
                            {filter.label}
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                {counts[filter.key]}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
                    <p className="text-sm font-semibold text-red-800">{error}</p>
                </div>
            )}

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Notification inbox">
                {loading && notifications.length === 0 ? (
                    <div className="p-10 text-center" role="status">
                        <div className="spinner mx-auto" />
                        <p className="mt-3 text-sm text-gray-500">Loading notifications…</p>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="px-5 py-14 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                            <HiOutlineInbox className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <h2 className="mt-4 text-base font-semibold text-gray-900">No notifications in this view</h2>
                        <p className="mt-1 text-sm text-gray-500">New report activity will appear here.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {filteredNotifications.map((notification) => {
                            const visual = getNotificationVisual(notification);
                            const Icon = visual.icon;
                            const updateMeta = notification.type === 'report_update' ? getReportUpdateMeta(notification) : null;
                            const notificationId = getNotificationId(notification);
                            const createdAt = getNotificationDate(notification.createdAt);
                            return (
                                <li key={notificationId}>
                                    <button
                                        type="button"
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:px-5 ${notification.isRead ? 'bg-white hover:bg-gray-50' : 'bg-brand-50/40 hover:bg-brand-50/70'}`}
                                    >
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 border border-gray-100 ${visual.iconClass}`}>
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold text-gray-950">{cleanNotificationTitle(notification.title)}</span>
                                                {!notification.isRead && <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="Unread" />}
                                                {updateMeta && (
                                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${UPDATE_TONE_STYLES[updateMeta.tone]}`}>
                                                        {updateMeta.priority === 'urgent'
                                                            ? 'Urgent'
                                                            : updateMeta.priority === 'review' ? 'Review needed' : updateMeta.label}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="mt-1 block line-clamp-2 text-sm leading-5 text-gray-600">
                                                {notification.data?.updatePreview || cleanNotificationMessage(notification.message)}
                                            </span>
                                            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                                {notification.data?.address && (
                                                    <span className="inline-flex min-w-0 items-center gap-1">
                                                        <HiOutlineLocationMarker className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                        <span className="max-w-64 truncate">{notification.data.address}</span>
                                                    </span>
                                                )}
                                                <time dateTime={createdAt?.toISOString()}>
                                                    {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : 'Time unavailable'}
                                                </time>
                                                {notification.type === 'report_update' && <span className="font-semibold text-brand-700">Open incident</span>}
                                            </span>
                                        </span>
                                        <HiOutlineArrowRight className="mt-3 h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700" aria-hidden="true" />
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
