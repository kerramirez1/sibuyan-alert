import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

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
    const { user, isAuthenticated } = useAuth();

    // Initialize socket connection
    useEffect(() => {
        // Use VITE_SOCKET_URL if available, otherwise fallback to VITE_API_URL but strip '/api' if present
        const socketUrl = import.meta.env.VITE_SOCKET_URL ||
            (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000');

        const socketInstance = io(socketUrl, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
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
                const token = localStorage.getItem('token');
                socket.emit('join', { token });
            };

            // Socket.IO rooms are cleared on disconnect, so authenticate on the
            // initial connection and every successful reconnect.
            socket.on('connect', authenticateSocket);
            if (socket.connected) authenticateSocket();

            return () => {
                socket.off('connect', authenticateSocket);
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

        // RESPONDER-SPECIFIC: Auto-alert when a report is verified in their municipality
        // This uses the municipality responder room which is reliably joined
        socket.on('reportVerifiedAlert', (alertData) => {
            if (user?.role !== 'responder') return;

            const notification = {
                _id: `alert_${Date.now()}`,
                type: 'report_verified',
                title: 'New Verified Incident!',
                message: `${alertData.incidentType || alertData.incidentCategory} at ${alertData.address || 'Unknown Location'}`,
                isRead: false,
                createdAt: new Date(),
                data: {
                    reportId: alertData.id,
                    severity: alertData.severity,
                }
            };

            setNotifications((prev) => [notification, ...prev]);
            setUnreadCount((prev) => prev + 1);

            toast(`VERIFIED: ${alertData.incidentType || alertData.incidentCategory} at ${alertData.address || alertData.municipalityName}`, {
                duration: 8000,
                style: {
                    background: '#ef4444',
                    color: '#fff',
                    fontWeight: 'bold',
                },
            });
        });

        // RESPONDER-SPECIFIC: Alert when a NEW report is submitted in their municipality
        socket.on('newReportAlert', (alertData) => {
            // Soft hint only for responder accounts; no unread badge increment for unverified reports.
            if (user?.role !== 'responder') return;

            toast(`Incoming unverified report: ${alertData.incidentType || alertData.category} at ${alertData.address || alertData.municipalityName}`, {
                icon: 'i',
                duration: 4500,
                style: {
                    background: '#e0f2fe',
                    color: '#0c4a6e',
                },
            });
        });

        // Multi-unit response notification
        socket.on('multiUnitResponse', (data) => {
            toast(`${data.responder?.unitType} ${data.responder?.unitName} is responding`, {
                duration: 5000,
            });
        });

        // Report verified (visible to all)
        socket.on('reportVerified', (report) => {
            toast.success(`New accident report verified at ${report.address}`, {
                duration: 5000,
            });
        });

        // Report rejected (personal notification)
        socket.on('reportRejected', (data) => {
            toast.error(`Your report was not verified: ${data.reason || 'No reason provided'}`, {
                duration: 6000,
            });
        });

        // Report resolved
        socket.on('reportResolved', (data) => {
            const label = data.resolvedBy?.agencyLabel || data.resolvedBy?.agency || 'Responder';
            toast.success(`Report resolved by ${label}`, {
                duration: 5000,
            });
        });

        // Report transferred
        socket.on('reportTransferred', (data) => {
            toast(`Incident transferred from ${data.fromMunicipality} to ${data.toMunicipality}`, {
                duration: 6000,
                icon: '🔄',
            });
        });

        // Personal notification (from Notification.createAndSend)
        socket.on('notification', (notification) => {
            // Skip report_verified here for responders — already handled by reportVerifiedAlert
            // This prevents double-counting in the notification badge
            if (notification.type === 'report_verified' && notification.title?.includes('Verified Incident')) {
                return;
            }

            setNotifications((prev) => [notification, ...prev]);
            setUnreadCount((prev) => prev + 1);

            // Show toast based on type
            const toastOptions = { duration: 5000 };
            switch (notification.type) {
                case 'reporter_verified':
                    toast.success(notification.message, toastOptions);
                    break;
                case 'reporter_rejected':
                    toast.error(notification.message, toastOptions);
                    break;
                case 'report_verified':
                    toast.success(notification.message, toastOptions);
                    break;
                case 'report_rejected':
                    toast.error(notification.message, toastOptions);
                    break;
                case 'new_report':
                    toast(notification.message, toastOptions);
                    break;
                case 'report_update':
                    toast(notification.message, { ...toastOptions, icon: 'i' });
                    break;
                default:
                    toast(notification.message, toastOptions);
            }
        });

        return () => {
            socket.off('newReport');
            socket.off('newReportAlert');
            socket.off('reportVerifiedAlert');
            socket.off('multiUnitResponse');
            socket.off('reportVerified');
            socket.off('reportRejected');
            socket.off('reportResolved');
            socket.off('reportTransferred');
            socket.off('notification');
        };
    }, [socket, user?.role]);

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
    }, [socket, user?.role]);

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

