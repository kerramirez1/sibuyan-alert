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
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import ScrollFadeRow from '../components/ui/ScrollFadeRow';
import { notificationsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Skeleton, SkeletonCircle } from '../components/ui/Skeleton';
import { cleanNotificationTitle, cleanNotificationMessage } from '../utils/notificationFormatting';
import {
    dedupedFetch,
    getStaleData,
    isRecentlyRevalidated,
    setCachedData,
} from '../utils/queryCache';
import {
    buildNotificationTarget,
    isPriorityReporterUpdate,
    shouldDeferNotificationRead,
} from '../utils/notificationNavigation';
import { getNotificationEventMarker } from '../utils/notificationEvents';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'updates', label: 'Reporter updates' },
    { key: 'priority', label: 'Priority' },
];

const getNotificationId = (notification) => notification?._id || notification?.id;
const getCachedNotifications = (cached) => {
    if (Array.isArray(cached)) return cached;
    const list = cached?.notifications;
    return Array.isArray(list) ? list : [];
};
const getNotificationDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const NotificationsPage = () => {
    const { user } = useAuth();
    // Session-scoped key: the whole cache is wiped on logout/session-expiry,
    // so entries can never leak across accounts.
    const cacheKey = 'notifications:list:50';
    const [notifications, setNotifications] = useState(() => getCachedNotifications(getStaleData(cacheKey)));
    const [loading, setLoading] = useState(() => getStaleData(cacheKey) === null);
    const [error, setError] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const { setUnreadCount, subscribe } = useSocket();
    const navigate = useNavigate();

    const fetchNotifications = useCallback(async () => {
        setError('');
        const stale = getStaleData(cacheKey);
        if (stale) {
            setNotifications(getCachedNotifications(stale));
            if (Number.isFinite(stale?.unreadCount)) setUnreadCount(stale.unreadCount);
            setLoading(false);
        } else {
            setLoading(true);
        }

        // Avoid micro-burst revalidation within 4 seconds unless forced or cold
        if (stale && isRecentlyRevalidated(cacheKey, 4000)) {
            return;
        }

        try {
            // Pagination is intentionally capped at the latest 50 items for this inbox view.
            // The backend still owns full history; expand to cursor pagination if volume grows.
            const response = await dedupedFetch(`fetch:${cacheKey}`, () => notificationsAPI.getAll({ limit: 50 }));
            const data = response.data?.data || {};
            const rawList = Array.isArray(data?.notifications) ? data.notifications : [];
            const nextNotifications = rawList.slice(0, 50);
            setNotifications(nextNotifications);
            if (Number.isFinite(data.unreadCount)) setUnreadCount(data.unreadCount);
            setCachedData(cacheKey, { notifications: nextNotifications, unreadCount: data.unreadCount });
        } catch (requestError) {
            console.error('Failed to fetch notifications:', requestError);
            if (getStaleData(cacheKey) === null) {
                setError('Notifications could not be loaded. Check your connection and try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [cacheKey, setUnreadCount]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    useEffect(() => subscribe('notification', (notification) => {
        const incomingId = getNotificationId(notification);
        setNotifications((current) => {
            if (incomingId != null && current.some((item, idx) => (getNotificationId(item) ?? idx) === incomingId)) return current;
            const next = [notification, ...current].slice(0, 50);
            const prevCached = getStaleData(cacheKey);
            const prevUnreadCount = Array.isArray(prevCached) ? undefined : prevCached?.unreadCount;
            setCachedData(cacheKey, { notifications: next, unreadCount: prevUnreadCount });
            return next;
        });
    }), [cacheKey, subscribe]);

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
        unread: notifications.filter((notification) => !notification?.isRead).length,
        updates: notifications.filter((notification) => notification?.type === 'report_update').length,
        priority: notifications.filter(isPriorityReporterUpdate).length,
    }), [notifications]);

    const filteredNotifications = useMemo(() => notifications.filter((notification) => {
        if (!notification || typeof notification !== 'object') return false;
        if (activeFilter === 'unread') return !notification.isRead;
        if (activeFilter === 'updates') return notification?.type === 'report_update';
        if (activeFilter === 'priority') return isPriorityReporterUpdate(notification);
        return true;
    }), [activeFilter, notifications]);

    return (
        <div className="page-shell max-w-5xl space-y-6">
            <PageHeader
                eyebrow={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"><HiOutlineShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /><span>Incident Communications</span><span className="hidden xs:inline">· Operational Inbox</span></span>}
                title="Notifications"
                description="Review report activity and open the exact incident that needs attention."
                actions={<>
                    <Button variant="outline" onClick={() => fetchNotifications()} disabled={loading}>
                        <HiOutlineRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        <span>Refresh</span>
                    </Button>
                    {counts.unread > 0 && <Button onClick={markAllAsRead} icon={HiOutlineCheck}>Mark all read</Button>}
                </>}
            />

            {/* Filter Tabs */}
            <ScrollFadeRow
                className="filter-tabs no-scrollbar"
                aria-label="Notification filters"
                role="navigation"
                tabIndex={0}
            >
                {FILTERS.map((filter) => {
                    const active = activeFilter === filter.key;
                    return (
                        <button
                            key={filter.key}
                            type="button"
                            onClick={() => setActiveFilter(filter.key)}
                            aria-pressed={active}
                            className="filter-tab"
                        >
                            <span>{filter.label}</span>
                            <span
                                className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${active
                                        ? 'bg-brand-100 text-brand-800 dark:bg-white/10 dark:text-sky-300'
                                        : 'bg-gray-200/70 text-gray-600 dark:bg-white/5 dark:text-gray-400'
                                    }`}
                            >
                                {counts[filter.key]}
                            </span>
                        </button>
                    );
                })}
            </ScrollFadeRow>

            {error && (
                <div className="rounded-xl border border-red-200/90 bg-red-50/80 p-4 text-xs sm:text-sm font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" role="alert">
                    {error}
                </div>
            )}

            {/* Notification Ledger */}
            <section
                className="surface-panel overflow-hidden"
                aria-label="Notification inbox"
            >
                {loading && notifications.length === 0 ? (
                    <div className="divide-y divide-gray-100 dark:divide-white/5 py-1" role="status" aria-label="Loading notifications" aria-busy="true">
                        <span className="sr-only">Loading notifications...</span>
                        {[1, 2, 3, 4, 5].map((index) => (
                            <div key={index} className="flex items-start gap-3.5 p-4 sm:p-5">
                                <SkeletonCircle size="h-2.5 w-2.5 mt-1" />
                                <div className="flex-1 min-w-0 space-y-2">
                                    <Skeleton variant="text" className="h-3.5 w-3/4 rounded-md" />
                                    <Skeleton variant="text" className="h-3 w-5/6 rounded-md opacity-80" />
                                    <Skeleton variant="text" className="h-2.5 w-1/3 rounded-md opacity-70" />
                                </div>
                                <SkeletonCircle size="h-2 w-2 mt-1" />
                            </div>
                        ))}
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="px-5 py-12 text-center sm:py-16">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500">
                            <HiOutlineInbox className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <h2 className="section-title mt-3">
                            No notifications in this view
                        </h2>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            New report activity will appear here.
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-white/5">
                        {filteredNotifications.map((notification, index) => {
                            const marker = getNotificationEventMarker(notification);
                            const notificationId = getNotificationId(notification) || `${notification?.type || 'notification'}-${index}`;
                            const createdAt = getNotificationDate(notification?.createdAt);
                            const rawAddress = notification?.data?.address;
                            const address = rawAddress != null && rawAddress !== '' ? String(rawAddress) : '';
                            const title = cleanNotificationTitle(notification?.title);
                            const rawPreview = notification?.data?.updatePreview;
                            const message = rawPreview != null && rawPreview !== ''
                                ? String(rawPreview)
                                : cleanNotificationMessage(String(notification?.message || ''));

                            return (
                                <li key={notificationId}>
                                    <button
                                        type="button"
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`group flex w-full items-start gap-3 p-4 sm:p-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 cursor-pointer min-h-[44px] ${!notification.isRead
                                                ? 'bg-brand-50/40 hover:bg-brand-50/70 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
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

                                            <h3 className={`text-sm font-semibold leading-relaxed break-words ${!notification.isRead ? 'text-gray-950 dark:text-white' : 'text-gray-800 dark:text-gray-200'
                                                }`}>
                                                {title}
                                            </h3>

                                            {message && (
                                                <p className="line-clamp-2 text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                                    {message}
                                                </p>
                                            )}

                                            {address && (
                                                <div className="pt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                    <HiOutlineLocationMarker className="h-3.5 w-3.5 text-brand-700 dark:text-sky-400 shrink-0" aria-hidden="true" />
                                                    <span className="truncate">{address}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Arrow */}
                                        <div className="pt-1 shrink-0 text-gray-400 group-hover:text-brand-700 dark:group-hover:text-sky-400 transition-colors">
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
