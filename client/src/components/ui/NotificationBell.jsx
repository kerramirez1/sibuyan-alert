import { useState, useEffect, useRef, useId, useMemo } from 'react';
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
    HiOutlineX,
} from 'react-icons/hi';

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
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
    const { unreadCount, setUnreadCount, socket } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const panelId = useId();

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

        const handleSound = () => playNotificationSound();
        const handleVerifiedAlert = () => {
            if (user?.role !== 'responder') return;
            setTimeout(async () => {
                try {
                    const response = await notificationsAPI.getUnreadCount();
                    setUnreadCount(response.data.data.unreadCount);
                } catch {
                    // Poll reconciles failure
                }
            }, 1000);
        };

        socket.on('notification', handleSound);
        socket.on('reportVerifiedAlert', handleVerifiedAlert);

        return () => {
            socket.off('notification', handleSound);
            socket.off('reportVerifiedAlert', handleVerifiedAlert);
        };
    }, [socket, setUnreadCount, user?.role]);

    // Fetch on open
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen]);

    // Outside click & Escape handler
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
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Periodic poll for unread count
    useEffect(() => {
        const fetchCount = async () => {
            try {
                const response = await notificationsAPI.getUnreadCount();
                setUnreadCount(response.data.data.unreadCount);
            } catch {
                // Ignore transient network errors during background poll
            }
        };
        fetchCount();
        const interval = setInterval(fetchCount, 15000);
        return () => clearInterval(interval);
    }, [setUnreadCount]);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await notificationsAPI.getAll({ limit: 25 });
            setNotifications(response.data.data.notifications || []);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id) => {
        try {
            await notificationsAPI.markAsRead(id);
            setNotifications((prev) =>
                prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
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
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const filteredNotifications = useMemo(() => (
        notifications.filter((n) => (activeTab === 'all' ? true : !n.isRead))
    ), [activeTab, notifications]);

    const accessibleBellLabel = unreadCount > 0
        ? `Notifications, ${unreadCount} unread`
        : 'Notifications';

    return (
        <div className="relative">
            {/* Bell Trigger */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-label={accessibleBellLabel}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-700 shadow-2xs transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-white/5 cursor-pointer"
            >
                <HiOutlineBell className="h-5 w-5" aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold text-white shadow-xs">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Desktop Popover / Mobile Drawer */}
            {isOpen && (
                <>
                    {/* Mobile Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs sm:hidden"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Popover / Drawer Content */}
                    <div
                        ref={dropdownRef}
                        id={panelId}
                        role="dialog"
                        aria-label="Incident communications"
                        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-gray-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0c1813] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[500px] sm:w-[400px] md:w-[420px] sm:rounded-2xl sm:shadow-xl"
                    >
                        {/* Header */}
                        <div className="border-b border-gray-200/80 bg-gray-50/70 p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-display text-xs sm:text-sm font-bold text-gray-950 dark:text-white">
                                        Incident communications
                                    </h3>
                                    {unreadCount > 0 && (
                                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                            {unreadCount} unread
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={markAllAsRead}
                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-white/5 cursor-pointer"
                                        >
                                            <HiOutlineCheck className="h-3.5 w-3.5" />
                                            <span>Mark all read</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        aria-label="Close notification panel"
                                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200 cursor-pointer"
                                    >
                                        <HiOutlineX className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Understated Segmented Tabs */}
                            <div className="mt-2.5 flex items-center gap-3 text-xs font-semibold" role="tablist">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'all'}
                                    onClick={() => setActiveTab('all')}
                                    className={`relative pb-1 transition-colors cursor-pointer ${
                                        activeTab === 'all'
                                            ? 'text-emerald-700 dark:text-emerald-400'
                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                                >
                                    <span>All</span>
                                    {activeTab === 'all' && (
                                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'unread'}
                                    onClick={() => setActiveTab('unread')}
                                    className={`relative pb-1 transition-colors cursor-pointer ${
                                        activeTab === 'unread'
                                            ? 'text-emerald-700 dark:text-emerald-400'
                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                                >
                                    <span>Unread</span>
                                    {unreadCount > 0 && <span className="ml-1 text-[11px] font-bold">({unreadCount})</span>}
                                    {activeTab === 'unread' && (
                                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Notification Items List */}
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-white/5 max-h-[360px] sm:max-h-[380px]">
                            {loading && notifications.length === 0 ? (
                                <div className="space-y-3 p-4">
                                    {[1, 2, 3].map((skeletonIndex) => (
                                        <div key={skeletonIndex} className="animate-pulse space-y-2 py-1">
                                            <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
                                            <div className="h-2.5 w-1/2 rounded bg-gray-100 dark:bg-white/5" />
                                        </div>
                                    ))}
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
                                            className={`group flex w-full items-start gap-3 p-3.5 text-left transition-colors cursor-pointer ${
                                                !notification.isRead
                                                    ? 'bg-emerald-50/25 hover:bg-emerald-50/50 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/25'
                                                    : 'bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                            }`}
                                        >
                                            {/* Leading Status Indicator Dot */}
                                            <div className="pt-1 shrink-0">
                                                <span className={`block h-2 w-2 rounded-full ${marker.dot}`} aria-hidden="true" />
                                            </div>

                                            {/* Content */}
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${marker.badge}`}>
                                                        {marker.label}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                                                        {timeStr}
                                                    </span>
                                                </div>

                                                {/* Incident Context / Address */}
                                                <p className={`text-xs font-bold leading-snug break-words ${
                                                    !notification.isRead ? 'text-gray-950 dark:text-white' : 'text-gray-800 dark:text-gray-200'
                                                }`}>
                                                    {address || title}
                                                </p>

                                                {/* Supporting Message */}
                                                {message && (
                                                    <p className="line-clamp-2 text-[11px] text-gray-600 dark:text-gray-400 leading-normal">
                                                        {message}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Chevron Action */}
                                            <div className="pt-1 shrink-0 text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
                                                <HiOutlineChevronRight className="h-3.5 w-3.5" />
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Quiet Footer */}
                        <div className="border-t border-gray-200/80 bg-gray-50/70 p-2.5 sm:px-3.5 dark:border-white/10 dark:bg-white/[0.02] flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    navigate('/notifications');
                                }}
                                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                            >
                                View full inbox &rarr;
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationBell;
