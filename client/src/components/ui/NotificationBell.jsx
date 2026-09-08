import { useState, useEffect, useRef, useId, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '../../router';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { notificationsAPI } from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    buildNotificationTarget,
    getReportUpdateMeta,
    shouldDeferNotificationRead,
} from '../../utils/notificationNavigation';
import { cleanNotificationTitle, cleanNotificationMessage } from '../../utils/notificationFormatting';
import {
    HiOutlineBell,
    HiOutlineCheck,
    HiOutlineChevronRight,
    HiOutlineInbox,
    HiOutlineRefresh,
    HiOutlineX,
} from 'react-icons/hi';

const getEventMarker = (notification) => {
    switch (notification.type) {
        case 'report_verified':
        case 'reporter_verified':
            return {
                dot: 'bg-blue-600',
                badge: 'text-blue-700 dark:text-blue-400',
                label: 'Report verified',
            };
        case 'report_resolved':
            return {
                dot: 'bg-green-600',
                badge: 'text-green-700 dark:text-green-400',
                label: 'Incident resolved',
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
            return { dot: 'bg-brand-600', badge: 'text-brand-700 dark:text-sky-400', label: 'Situation update' };
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

const getRelativeTime = (dateValue) => {
    if (!dateValue) return 'Just now';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime())
        ? 'Just now'
        : formatDistanceToNow(date, { addSuffix: true });
};

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
    const [isMobile, setIsMobile] = useState(() => (
        typeof window !== 'undefined' ? window.innerWidth < 640 : false
    ));
    const { unreadCount, setUnreadCount, socket } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const panelId = useId();

    // Viewport resize tracking for mobile drawer vs desktop popover
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Sound effect
    const playNotificationSound = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } catch {
            // Audio context silently ignored if autoplay policy blocked
        }
    };

    // Socket sync
    useEffect(() => {
        if (!socket) return;

        const refreshUnreadCount = async () => {
            try {
                const response = await notificationsAPI.getUnreadCount();
                setUnreadCount(response.data.data.unreadCount);
            } catch {
                // Badge refreshes on the next socket event after transient failures
            }
        };

        const handleNotification = () => {
            playNotificationSound();
            refreshUnreadCount();
        };
        const handleVerifiedAlert = () => {
            if (user?.role !== 'responder') return;
            setTimeout(refreshUnreadCount, 1000);
        };

        socket.on('notification', handleNotification);
        socket.on('reportVerifiedAlert', handleVerifiedAlert);

        return () => {
            socket.off('notification', handleNotification);
            socket.off('reportVerifiedAlert', handleVerifiedAlert);
        };
    }, [socket, setUnreadCount, user?.role]);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await notificationsAPI.getAll({ limit: 25 });
            setNotifications(response.data.data.notifications || []);
            // The list endpoint already returns the fresh unread count — reconcile for free.
            if (typeof response.data.data.unreadCount === 'number') {
                setUnreadCount(response.data.data.unreadCount);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
            setError('Unable to load communications. Please check your network connection.');
        } finally {
            setLoading(false);
        }
    }, [setUnreadCount]);

    // Fetch on open
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen, fetchNotifications]);

    // Outside click, Escape handler, and Focus Trap
    useEffect(() => {
        if (!isOpen) return undefined;

        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !buttonRef.current?.contains(e.target)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setIsOpen(false);
                buttonRef.current?.focus();
                return;
            }

            if (e.key === 'Tab' && dropdownRef.current) {
                const focusableElements = dropdownRef.current.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                if (focusableElements.length === 0) return;

                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstElement || !dropdownRef.current.contains(document.activeElement)) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement || !dropdownRef.current.contains(document.activeElement)) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Unread badge: fetched once on mount, then kept fresh by socket events,
    // panel opens, and local mark-as-read actions — no periodic polling.
    useEffect(() => {
        let cancelled = false;
        const fetchCount = async () => {
            try {
                const response = await notificationsAPI.getUnreadCount();
                if (!cancelled) setUnreadCount(response.data.data.unreadCount);
            } catch {
                // Ignore transient network errors during initial fetch
            }
        };
        fetchCount();
        return () => {
            cancelled = true;
        };
    }, [setUnreadCount]);

    const markAsRead = async (id) => {
        try {
            await notificationsAPI.markAsRead(id);
            setNotifications((prev) =>
                prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const handleNotificationClick = async (notification) => {
        const deferRead = shouldDeferNotificationRead(notification, user?.role);
        if (!notification.isRead && !deferRead) {
            await markAsRead(notification._id);
        }
        setIsOpen(false);
        const target = buildNotificationTarget(notification, user?.role);
        if (target) navigate(target);
    };

    const markAllAsRead = async () => {
        try {
            await notificationsAPI.markAllAsRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const filteredNotifications = useMemo(() => (
        notifications.filter((n) => (activeTab === 'all' ? true : !n.isRead))
    ), [activeTab, notifications]);

    const accessibleBellLabel = unreadCount > 0
        ? `Notifications, ${unreadCount} unread`
        : 'Notifications';

    const renderPanelContent = () => (
        <>
            {/* Header */}
            <div className="border-b border-gray-200/80 bg-gray-50/70 p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02] shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <h3 className="font-display text-xs sm:text-sm font-bold text-gray-950 dark:text-white truncate">
                            Incident communications
                        </h3>
                        {unreadCount > 0 && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-800 dark:bg-white/10 dark:text-sky-300">
                                {unreadCount} unread
                            </span>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllAsRead}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:bg-white/5 cursor-pointer min-h-[32px]"
                            >
                                <HiOutlineCheck className="h-3.5 w-3.5" />
                                <span>Mark all read</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                buttonRef.current?.focus();
                            }}
                            aria-label="Close notification panel"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/5 dark:hover:text-gray-200 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                        >
                            <HiOutlineX className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Segmented Tabs */}
                <div className="mt-2.5 flex items-center gap-3 text-xs font-semibold" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'all'}
                        onClick={() => setActiveTab('all')}
                        className={`relative pb-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xs ${
                            activeTab === 'all'
                                ? 'text-brand-700 dark:text-sky-400'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        <span>All</span>
                        {activeTab === 'all' && (
                            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-600 dark:bg-sky-400 rounded-full" />
                        )}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'unread'}
                        onClick={() => setActiveTab('unread')}
                        className={`relative pb-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xs ${
                            activeTab === 'unread'
                                ? 'text-brand-700 dark:text-sky-400'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        <span>Unread</span>
                        {unreadCount > 0 && <span className="ml-1 text-[11px] font-bold">({unreadCount})</span>}
                        {activeTab === 'unread' && (
                            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-600 dark:bg-sky-400 rounded-full" />
                        )}
                    </button>
                </div>
            </div>

            {/* Notification Items List */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-white/5">
                {loading && notifications.length === 0 ? (
                    <div className="divide-y divide-gray-100 dark:divide-white/5 py-1" aria-label="Loading incident communications" aria-busy="true">
                        {[1, 2, 3, 4].map((index) => (
                            <div key={index} className="flex items-start gap-3 p-3.5 sm:px-4 animate-pulse">
                                {/* Leading Status Indicator Dot */}
                                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-gray-200 dark:bg-white/10 shrink-0" />

                                {/* Notification Content Placeholder Bars */}
                                <div className="flex-1 min-w-0 space-y-2">
                                    {/* Title Line */}
                                    <div className="h-3.5 w-3/4 rounded-md bg-gray-200 dark:bg-white/15" />
                                    {/* Location / Message Subtext */}
                                    <div className="h-3 w-5/6 rounded-md bg-gray-100 dark:bg-white/10" />
                                    {/* Timestamp / Agency Tag */}
                                    <div className="h-2.5 w-1/3 rounded-md bg-gray-100 dark:bg-white/10" />
                                </div>

                                {/* Trailing Unread Marker Placeholder */}
                                <div className="mt-1 h-2 w-2 rounded-full bg-gray-200 dark:bg-white/10 shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="p-4 text-center space-y-2.5">
                        <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                        <button
                            type="button"
                            onClick={fetchNotifications}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 cursor-pointer"
                        >
                            <HiOutlineRefresh className="h-3.5 w-3.5" />
                            <span>Try again</span>
                        </button>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="py-10 text-center px-4">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500">
                            <HiOutlineInbox className="h-5 w-5" />
                        </div>
                        <p className="mt-2 text-xs font-bold text-gray-950 dark:text-white">
                            {activeTab === 'unread' ? 'You are up to date.' : 'No incident updates yet.'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {activeTab === 'unread' ? 'No unread notifications in your feed.' : 'New report activity will appear here.'}
                        </p>
                    </div>
                ) : (
                    filteredNotifications.map((notification) => {
                        const marker = getEventMarker(notification);
                        const address = notification.data?.address;
                        const title = cleanNotificationTitle(notification.title);
                        const message = notification.data?.updatePreview || cleanNotificationMessage(notification.message);
                        const timeStr = getRelativeTime(notification.createdAt);

                        return (
                            <button
                                key={notification._id}
                                type="button"
                                onClick={() => handleNotificationClick(notification)}
                                className={`group flex w-full items-start gap-3 p-3 sm:p-3.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
                                    !notification.isRead
                                        ? 'bg-brand-50/40 hover:bg-brand-50/70 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
                                        : 'bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                }`}
                            >
                                {/* Leading Status Dot */}
                                <div className="pt-1 shrink-0">
                                    <span className={`block h-2 w-2 rounded-full ${marker.dot}`} aria-hidden="true" />
                                </div>

                                {/* Content */}
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${marker.badge}`}>
                                            {marker.label}
                                        </span>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                                            {timeStr}
                                        </span>
                                    </div>

                                    {/* Primary Context: Address or Title */}
                                    <p className={`text-xs font-bold leading-snug break-words ${
                                        !notification.isRead ? 'text-gray-950 dark:text-white' : 'text-gray-800 dark:text-gray-200'
                                    }`}>
                                        {address || title}
                                    </p>

                                    {/* Supporting Message */}
                                    {message && (
                                        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed break-words">
                                            {message}
                                        </p>
                                    )}
                                </div>

                                {/* Navigation Affordance */}
                                <div className="pt-1 shrink-0 text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
                                    <HiOutlineChevronRight className="h-3.5 w-3.5" />
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200/80 bg-gray-50/70 p-2.5 sm:px-3.5 dark:border-white/10 dark:bg-white/[0.02] flex items-center justify-end shrink-0">
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(false);
                        navigate('/notifications');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-sm dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer py-1 px-2"
                >
                    <span>View full inbox</span>
                    <span aria-hidden="true">&rarr;</span>
                </button>
            </div>
        </>
    );

    return (
        <div className="relative">
            {/* Bell Trigger Button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-label={accessibleBellLabel}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-700 shadow-2xs transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-white/5 cursor-pointer"
            >
                <HiOutlineBell className="h-5 w-5" aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold text-white shadow-xs">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Mobile Bottom Sheet (Portaled to document.body to avoid header stacking-context traps) */}
            {isOpen && isMobile && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-50 flex flex-col justify-end">
                    {/* Backdrop */}
                    <div
                        data-testid="notification-backdrop"
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Bottom Sheet Modal */}
                    <div
                        ref={dropdownRef}
                        id={panelId}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Incident communications"
                        className="relative z-10 flex h-[min(540px,85dvh)] max-h-[85dvh] w-full flex-col rounded-t-2xl border-t border-x border-gray-200/90 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-white/10 dark:bg-[#0c1813] overscroll-contain animate-in slide-in-from-bottom duration-200"
                    >
                        {/* Drag Handle Indicator */}
                        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-white/20" aria-hidden="true" />
                        {renderPanelContent()}
                    </div>
                </div>,
                document.body
            )}

            {/* Desktop Anchored Popover */}
            {isOpen && !isMobile && (
                <div
                    ref={dropdownRef}
                    id={panelId}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Incident communications"
                    className="absolute right-0 top-full mt-2 z-50 flex max-h-[min(520px,calc(100dvh-5rem))] w-[380px] md:w-[400px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-gray-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-[#0c1813]"
                >
                    {renderPanelContent()}
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
