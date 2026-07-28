import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { notificationsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineCheck,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineExclamation,
    HiOutlineDocumentText,
    HiOutlineInbox,
    HiOutlineBell,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi';

const NotificationsPage = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');
    const { setUnreadCount, socket } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        fetchNotifications();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handleNewNotification = (notification) => {
            setNotifications(prev => [notification, ...prev]);
        };
        socket.on('notification', handleNewNotification);
        return () => socket.off('notification', handleNewNotification);
    }, [socket]);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await notificationsAPI.getAll({ limit: 50 });
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

    const markAllAsRead = async () => {
        try {
            await notificationsAPI.markAllAsRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.isRead) {
            markAsRead(notification._id);
        }

        switch (notification.type) {
            case 'new_report':
                navigate('/admin/reports');
                break;
            case 'report_verified':
                if (user?.role === 'responder') {
                    navigate('/admin/reports?view=dispatch-queue');
                    break;
                }
                navigate('/my-reports');
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
            case 'report_transferred':
            case 'report_transfer_acknowledged':
                navigate('/admin/reports');
                break;
            case 'reporter_verified':
            case 'reporter_rejected':
                navigate('/');
                break;
            default:
                break;
        }
    };

    const getNotificationStyle = (type) => {
        switch (type) {
            case 'reporter_verified':
            case 'report_verified':
                return { icon: HiOutlineCheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50', ring: 'ring-emerald-100' };
            case 'reporter_rejected':
            case 'report_rejected':
                return { icon: HiOutlineXCircle, color: 'text-red-500', bg: 'bg-red-50', ring: 'ring-red-100' };
            case 'report_responding':
                return { icon: HiOutlineExclamation, color: 'text-blue-500', bg: 'bg-blue-50', ring: 'ring-blue-100' };
            case 'report_update':
                return { icon: HiOutlineDocumentText, color: 'text-indigo-500', bg: 'bg-indigo-50', ring: 'ring-indigo-100' };
            case 'report_transferred':
            case 'report_transfer_acknowledged':
                return { icon: HiOutlineSwitchHorizontal, color: 'text-violet-500', bg: 'bg-violet-50', ring: 'ring-violet-100' };
            case 'new_report':
                return { icon: HiOutlineExclamation, color: 'text-amber-500', bg: 'bg-amber-50', ring: 'ring-amber-100' };
            default:
                return { icon: HiOutlineBell, color: 'text-gray-500', bg: 'bg-gray-50', ring: 'ring-gray-100' };
        }
    };

    const filteredNotifications = notifications.filter(n =>
        activeTab === 'all' ? true : !n.isRead
    );

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="max-w-4xl mx-auto px-1 sm:px-0">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {/* Header */}
                <div className="mb-5 sm:mb-7">
                    <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
                        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                            <div className="relative group">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                                    <HiOutlineBell className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                                </div>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 sm:w-6 sm:h-6 bg-red-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg ring-2 ring-white animate-pulse">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-2xl sm:text-3xl font-display font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-gray-700 bg-clip-text text-transparent">
                                    Notifications
                                </h1>
                                <p className="text-gray-500 text-sm sm:text-base mt-0.5 leading-snug">
                                    Stay updated with latest activity
                                </p>
                            </div>
                        </div>

                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-50 text-indigo-600 text-[11px] sm:text-xs font-bold rounded-lg sm:rounded-xl hover:bg-indigo-100 transition-all active:scale-95"
                            >
                                <HiOutlineCheck className="w-3.5 h-3.5" />
                                <span className="hidden xs:inline">Mark all read</span>
                                <span className="xs:hidden">Read all</span>
                            </button>
                        )}
                    </div>

                    {/* Tab Bar */}
                    <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                        {[
                            { key: 'all', label: 'All', count: notifications.length },
                            { key: 'unread', label: 'Unread', count: unreadCount },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === tab.key
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {tab.label}
                                {tab.count > 0 && (
                                    <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.key
                                        ? 'bg-indigo-100 text-indigo-600'
                                        : 'bg-gray-200 text-gray-500'
                                        }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <HiOutlineBell className="w-8 h-8 text-white" />
                            </div>
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 animate-ping opacity-20" />
                        </div>
                        <p className="text-sm text-gray-500 font-medium animate-pulse">Loading notifications...</p>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative overflow-hidden bg-white rounded-2xl border border-gray-200 p-10 sm:p-14 text-center shadow-sm"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-transparent to-indigo-50/30" />
                        <div className="relative z-10">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                                <HiOutlineInbox className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300" />
                            </div>
                            <h3 className="text-lg sm:text-xl font-display font-bold text-gray-900 mb-2">
                                {activeTab === 'unread' ? 'All caught up!' : 'No notifications yet'}
                            </h3>
                            <p className="text-gray-500 text-sm max-w-sm mx-auto">
                                {activeTab === 'unread'
                                    ? "You've read all your notifications. Great job!"
                                    : 'New alerts and updates will appear here.'}
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="space-y-2 sm:space-y-2.5">
                        <AnimatePresence mode="popLayout">
                            {filteredNotifications.map((notification, index) => {
                                const style = getNotificationStyle(notification.type);
                                const Icon = style.icon;

                                return (
                                    <motion.div
                                        key={notification._id}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: Math.min(index * 0.02, 0.2), duration: 0.25 }}
                                        className={`group relative bg-white rounded-xl sm:rounded-2xl border overflow-hidden cursor-pointer transition-all duration-300 ${!notification.isRead
                                            ? 'border-indigo-200 shadow-md hover:shadow-lg ring-1 ring-indigo-100'
                                            : 'border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200'
                                            }`}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        {/* Unread accent */}
                                        {!notification.isRead && (
                                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                                        )}

                                        <div className="p-3 sm:p-4 flex items-start gap-3 sm:gap-4">
                                            {/* Icon */}
                                            <div className={`shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${style.bg} ring-1 ${style.ring} flex items-center justify-center transition-transform duration-300 group-hover:scale-105`}>
                                                <Icon className={`w-5 h-5 sm:w-5.5 sm:h-5.5 ${style.color}`} />
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-0.5">
                                                    <h4 className={`text-sm sm:text-[15px] font-bold leading-snug ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                                                        {notification.title}
                                                    </h4>
                                                    <span className="shrink-0 text-[9px] sm:text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className={`text-xs sm:text-sm leading-relaxed line-clamp-2 ${!notification.isRead ? 'text-gray-700' : 'text-gray-500'}`}>
                                                    {notification.message}
                                                </p>
                                            </div>

                                            {/* Unread dot on mobile */}
                                            {!notification.isRead && (
                                                <div className="sm:hidden shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-2 animate-pulse" />
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default NotificationsPage;
