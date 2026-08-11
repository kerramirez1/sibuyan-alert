import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from '../utils/appToast';
import { resolveSocketOrigin } from '../utils/runtimeUrl';
import { refreshAuthSession } from '../services/api';

const SocketContext = createContext(null);

const getNotificationId = (notification) => notification?.id ?? notification?._id ?? null;

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const receivedNotificationIdsRef = useRef(new Set());
    const { user, isAuthenticated } = useAuth();

    // Initialize socket connection
    useEffect(() => {
        const socketUrl = resolveSocketOrigin({
            socketUrl: import.meta.env.VITE_SOCKET_URL,
            apiUrl: import.meta.env.VITE_API_URL,
            browserOrigin: window.location.origin,
        });

        const socketInstance = io(socketUrl, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            withCredentials: true,
        });

        socketInstance.on('connect', () => {
            setConnected(true);
        });

        socketInstance.on('disconnect', () => {
            setConnected(false);
        });

        socketInstance.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            setConnected(false);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    // Join user room when authenticated
    useEffect(() => {
        const userId = user?._id || user?.id;
        if (socket && isAuthenticated && userId) {
            const authenticateSocket = () => {
                socket.emit('join');
            };

            const handleAuthError = async () => {
                try {
                    await refreshAuthSession();
                    if (socket.connected) authenticateSocket();
                } catch {
                    setConnected(false);
                }
            };

            // Socket.IO rooms are cleared on disconnect, so authenticate on the
            // initial connection and every successful reconnect.
            socket.on('connect', authenticateSocket);
            socket.on('authError', handleAuthError);
            if (socket.connected) authenticateSocket();

            return () => {
                socket.off('connect', authenticateSocket);
                socket.off('authError', handleAuthError);
                socket.emit('leave');
            };
        }
    }, [socket, isAuthenticated, user?._id, user?.id]);

    // Listen for real-time events
    useEffect(() => {
        if (!socket) return;

        // newReport event is NOT handled here anymore — the server already creates
        // a DB notification via Notification.createAndSend which emits the 'notification'
        // socket event. Handling both caused duplicate notifications and toasts.

        const currentUserId = String(user?._id || user?.id || '');

        // RESPONDER-SPECIFIC: Auto-alert when a report is verified in their municipality.
        const handleReportVerifiedAlert = (alertData) => {
            if (user?.role !== 'responder') return;

            toast(`VERIFIED: ${alertData.incidentType || alertData.incidentCategory} at ${alertData.address || alertData.municipalityName}`, {
                dedupeKey: `report-verified:${alertData.id || alertData._id || 'unknown'}`,
                style: {
                    background: 'var(--danger)',
                    color: '#ffffff',
                    border: '1px solid color-mix(in srgb, var(--danger) 70%, white)',
                    fontWeight: 'bold',
                },
            });
        };

        // RESPONDER-SPECIFIC: Alert when a NEW report is submitted in their municipality.
        const handleNewReportAlert = (alertData) => {
            // Soft hint only for responder accounts; no unread badge increment for unverified reports.
            if (user?.role !== 'responder') return;

            toast(`Incoming unverified report: ${alertData.incidentType || alertData.category} at ${alertData.address || alertData.municipalityName}`, {
                dedupeKey: `new-report:${alertData.id || alertData._id || 'unknown'}`,
                icon: 'i',
                style: {
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                },
            });
        };

        // Only other response units need a toast. The acting responder already
        // receives the API success confirmation for the same action.
        const handleLocalUnitResponse = (data) => {
            if (user?.role !== 'responder') return;
            const actorId = String(data.responder?._id || '');
            if (actorId && actorId === currentUserId) return;

            const reportId = String(data.reportId || 'unknown');
            const unitLabel = data.responder?.unitName || data.responder?.unitType || 'Another response unit';
            toast(`${unitLabel} is responding`, {
                dedupeKey: `unit-response:${reportId}:${actorId || unitLabel}`,
            });
        };

        // Public resolution events update the map. Only scoped operational users
        // other than the actor need a toast announcement.
        const handleResolutionDetails = (data) => {
            if (!['municipal_admin', 'responder'].includes(user?.role)) return;
            const actorId = String(data.resolvedBy?._id || '');
            if (actorId && actorId === currentUserId) return;

            const reportId = String(data.id || data.reportId || 'unknown');
            const label = data.resolvedBy?.agencyLabel || data.resolvedBy?.agency || 'Responder';
            toast.success(`Report resolved by ${label}`, {
                dedupeKey: `report-resolved:${reportId}`,
            });
        };

        // Personal notification (from Notification.createAndSend). Persisted ids
        // are deduplicated so reconnects cannot increment the badge twice.
        const handleNotification = (notification) => {
            const rawNotificationId = getNotificationId(notification);
            const notificationId = rawNotificationId ? String(rawNotificationId) : '';
            if (notificationId && receivedNotificationIdsRef.current.has(notificationId)) return;
            if (notificationId) receivedNotificationIdsRef.current.add(notificationId);

            setNotifications((previous) => [notification, ...previous]);
            setUnreadCount((previous) => previous + 1);

            // The municipality-scoped alert already announced this to responders.
            // Retain the real database notification for the bell without a second toast.
            if (user?.role === 'responder' && notification.type === 'report_verified') return;

            const reportId = String(notification.data?.reportId || 'none');
            const toastOptions = {
                dedupeKey: `notification:${notificationId || `${notification.type}:${reportId}`}`,
            };
            switch (notification.type) {
                case 'reporter_verified':
                case 'report_verified':
                case 'report_transfer_acknowledged':
                case 'report_responding':
                case 'report_resolved':
                    toast.success(notification.message, toastOptions);
                    break;
                case 'reporter_rejected':
                case 'report_rejected':
                    toast.error(notification.message, toastOptions);
                    break;
                case 'report_update':
                    toast(notification.message, { ...toastOptions, icon: 'i' });
                    break;
                default:
                    toast(notification.message, toastOptions);
            }
        };

        socket.on('reportVerifiedAlert', handleReportVerifiedAlert);
        socket.on('newReportAlert', handleNewReportAlert);
        socket.on('localUnitResponse', handleLocalUnitResponse);
        socket.on('reportResolutionDetails', handleResolutionDetails);
        socket.on('notification', handleNotification);

        return () => {
            socket.off('reportVerifiedAlert', handleReportVerifiedAlert);
            socket.off('newReportAlert', handleNewReportAlert);
            socket.off('localUnitResponse', handleLocalUnitResponse);
            socket.off('reportResolutionDetails', handleResolutionDetails);
            socket.off('notification', handleNotification);
        };
    }, [socket, user?._id, user?.id, user?.role]);

    // Emit event
    const emit = useCallback((event, data) => {
        if (socket && connected) {
            socket.emit(event, data);
        }
    }, [socket, connected]);

    // Subscribe to event
    const subscribe = useCallback((event, callback) => {
        if (socket) {
            socket.on(event, callback);
            return () => socket.off(event, callback);
        }
        return () => { };
    }, [socket]);

    // Clear notifications
    const clearNotifications = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
    }, []);

    // Mark notification as read
    const markAsRead = useCallback((notificationId) => {
        let unreadNotificationWasUpdated = false;

        setNotifications((prev) =>
            prev.map((notification) => {
                if (getNotificationId(notification) !== notificationId) {
                    return notification;
                }

                if (!notification.isRead) {
                    unreadNotificationWasUpdated = true;
                }

                return { ...notification, isRead: true };
            })
        );

        if (unreadNotificationWasUpdated) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
        }
    }, []);

    const value = {
        socket,
        connected,
        emit,
        subscribe,
        notifications,
        unreadCount,
        setUnreadCount,
        clearNotifications,
        markAsRead,
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketContext;

