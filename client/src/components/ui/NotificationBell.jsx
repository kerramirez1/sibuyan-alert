import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { notificationsAPI } from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineBell,
    HiOutlineCheck,
    HiOutlineExclamation,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineDocumentText,
    HiOutlineInbox,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi';

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
    const { unreadCount, setUnreadCount, socket } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    // Play notification sound
    const playNotificationSound = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.1); // D6

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            console.error('Audio play failed', e);
        }
    };

    // Play notification sound when new notification arrives (SocketContext handles state)
    useEffect(() => {
        if (!socket) return;

        const handleSound = () => {
            playNotificationSound();
        };

        // Sync bell count for responder verified alerts
        const handleVerifiedAlert = () => {
            if (user?.role !== 'responder') return;
            setTimeout(async () => {
                try {
                    const response = await notificationsAPI.getUnreadCount();
                    setUnreadCount(response.data.data.unreadCount);
                } catch (e) { /* ignore */ }
            }, 1000);
        };

        socket.on('notification', handleSound);
        socket.on('reportVerifiedAlert', handleVerifiedAlert);

        return () => {
            socket.off('notification', handleSound);
            socket.off('reportVerifiedAlert', handleVerifiedAlert);
        };
    }, [socket, setUnreadCount, user?.role]);

    // Fetch notifications when opened
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch initial unread count + poll every 15s to stay in sync with DB
    useEffect(() => {
        const fetchUnreadCount = async () => {
            try {
                const response = await notificationsAPI.getUnreadCount();
                setUnreadCount(response.data.data.unreadCount);
            } catch (error) {
                console.error('Failed to fetch unread count:', error);
            }
        };
        fetchUnreadCount();

        // Poll every 15 seconds to catch any missed socket events
        const interval = setInterval(fetchUnreadCount, 15000);
        return () => clearInterval(interval);
    }, [setUnreadCount]);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await notificationsAPI.getAll({ limit: 20 });
            setNotifications(response.data.data.notifications);
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
        if (!notification.isRead) {
            markAsRead(notification._id);
        }
        setIsOpen(false);

        switch (notification.type) {
            case 'new_report':
                navigate('/admin/reports');
                break;
            case 'report_verified':
                // Responders go to admin reports page; reporters go to my-reports
                if (user?.role === 'responder') {
                    navigate('/admin/reports?view=dispatch-queue');
                } else {
                    navigate('/my-reports');
                }
                break;
            case 'report_rejected':
                navigate('/my-reports');
                break;
            case 'report_responding':
                if (['municipal_admin', 'responder'].includes(user?.role)) {
                    navigate('/admin/reports');
                } else {
                    navigate('/my-reports');
                }
                break;
            case 'report_update':
                if (['municipal_admin', 'responder'].includes(user?.role)) {
                    navigate('/admin/reports');
                } else {
                    navigate('/my-reports');
                }
                break;
            case 'reporter_verified':
            case 'reporter_rejected':
                navigate('/');
                break;
            case 'report_transferred':
            case 'report_transfer_acknowledged':
                navigate('/admin/reports');
                break;
            default:
                break;
        }
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

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'reporter_verified':
            case 'report_verified':
                return <HiOutlineCheckCircle className="w-5 h-5 text-success-500" />;
            case 'reporter_rejected':
            case 'report_rejected':
                return <HiOutlineXCircle className="w-5 h-5 text-danger-500" />;
            case 'report_responding':
                return <HiOutlineExclamation className="w-5 h-5 text-blue-500" />;
            case 'report_update':
                return <HiOutlineDocumentText className="w-5 h-5 text-blue-500" />;
            case 'new_report':
                return <HiOutlineExclamation className="w-5 h-5 text-accent-500" />;
            case 'report_transferred':
            case 'report_transfer_acknowledged':
                return <HiOutlineSwitchHorizontal className="w-5 h-5 text-purple-500" />;
            default:
                return <HiOutlineDocumentText className="w-5 h-5 text-primary-500" />;
        }
    };

    const filteredNotifications = notifications.filter(n =>
        activeTab === 'all' ? true : !n.isRead
    );

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors outline-none focus:ring-2 focus:ring-primary-500/20"
            >
                <motion.div
                    animate={unreadCount > 0 ? { rotate: [0, 15, -15, 0] } : {}}
                    transition={{ repeat: unreadCount > 0 ? Infinity : 0, duration: 2, repeatDelay: 3 }}
                >
                    <HiOutlineBell className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                </motion.div>
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 shadow-sm transform translate-x-1 -translate-y-1">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95, transformOrigin: 'top right' }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 ring-1 ring-black/5"
                    >
                        {/* Header & Tabs */}
                        <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                            <div className="px-4 py-3 flex items-center justify-between">
                                <h3 className="font-display font-semibold text-gray-900 dark:text-white">
                                    Notifications
                                </h3>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="text-xs text-primary-600 hover:text-primary-700 font-medium hover:underline flex items-center gap-1"
                                    >
                                        <HiOutlineCheck className="w-3 h-3" />
                                        Mark all read
                                    </button>
                                )}
                            </div>

                            {/* Tabs */}
                            <div className="flex px-4 gap-4">
                                <button
                                    onClick={() => setActiveTab('all')}
                                    className={`pb-3 text-sm font-medium border-b-2 transition-colors relative ${activeTab === 'all'
                                        ? 'text-primary-600 border-primary-600'
                                        : 'text-gray-500 border-transparent hover:text-gray-700'
                                        }`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setActiveTab('unread')}
                                    className={`pb-3 text-sm font-medium border-b-2 transition-colors relative ${activeTab === 'unread'
                                        ? 'text-primary-600 border-primary-600'
                                        : 'text-gray-500 border-transparent hover:text-gray-700'
                                        }`}
                                >
                                    Unread
                                    {unreadCount > 0 && (
                                        <span className="ml-1.5 px-1.5 py-0.5 bg-danger-100 text-danger-700 rounded-full text-[10px]">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-[450px] overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50">
                            {loading && notifications.length === 0 ? (
                                <div className="py-12 text-center">
                                    <div className="spinner mx-auto" />
                                </div>
                            ) : filteredNotifications.length === 0 ? (
                                <div className="py-12 text-center flex flex-col items-center justify-center text-gray-500">
                                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                                        <HiOutlineInbox className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <p className="font-medium text-gray-900 dark:text-gray-300">All caught up!</p>
                                    <p className="text-sm mt-1">No {activeTab} notifications</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredNotifications.map((notification) => (
                                        <motion.div
                                            key={notification._id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className={`px-4 py-4 hover:bg-white dark:hover:bg-gray-700 transition-all cursor-pointer relative group ${!notification.isRead
                                                ? 'bg-white dark:bg-gray-800'
                                                : 'bg-gray-50/50 dark:bg-gray-900/50 opacity-75 hover:opacity-100'
                                                }`}
                                            onClick={() => handleNotificationClick(notification)}
                                        >
                                            {!notification.isRead && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500" />
                                            )}

                                            <div className="flex gap-3">
                                                <div className={`flex-shrink-0 mt-1 w-9 h-9 rounded-full flex items-center justify-center ${!notification.isRead ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-500'
                                                    }`}>
                                                    {getNotificationIcon(notification.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <p className={`text-sm font-semibold ${!notification.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                                                            }`}>
                                                            {notification.title}
                                                        </p>
                                                        <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                                                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className={`text-sm mt-0.5 line-clamp-2 ${!notification.isRead ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'
                                                        }`}>
                                                        {notification.message}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-sm text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => navigate('/notifications')} // Assuming there's a full page
                                className="text-sm text-primary-600 hover:text-primary-700 font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                            >
                                View all
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationBell;
