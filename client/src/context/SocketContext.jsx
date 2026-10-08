import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
// socket.io-client is intentionally NOT statically imported here. It is
// dynamically imported inside the connection effect, so unauthenticated
// visitors never download the (~150KB) client and never open an anonymous
// connection against the server.
import { useAuth } from './AuthContext';
import toast from '../utils/appToast';
import { resolveSocketOrigin } from '../utils/runtimeUrl';
import { refreshAuthSession } from '../services/api';
import { getIncidentTypeLabel, getReportIncidentTypeLabel } from '../config/incidentTypes';
import { INCIDENT_CATEGORIES } from '../components/report/reportConfig';

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
    const [reconnectVersion, setReconnectVersion] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const receivedNotificationIdsRef = useRef(new Set());
    const hasConnectedOnceRef = useRef(false);
    const isRefreshingAuthRef = useRef(false);
    const authRetryTimerRef = useRef(null);
    const { user, isAuthenticated } = useAuth();

    // Initialize the socket connection lazily, and only for authenticated
    // users. Anonymous visitors never fetch socket.io-client and never open
    // a connection, so the landing page costs the server nothing.
    useEffect(() => {
        if (!isAuthenticated) return undefined;

        let cancelled = false;
        let socketInstance = null;

        const connectSocket = async () => {
            const { io } = await import('socket.io-client');
            if (cancelled) return;

            const browserOrigin = typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : undefined;
            const socketUrl = resolveSocketOrigin({
                socketUrl: import.meta.env.VITE_SOCKET_URL,
                apiUrl: import.meta.env.VITE_API_URL,
                browserOrigin,
            });

            socketInstance = io(socketUrl, {
                transports: ['polling', 'websocket'],
                autoConnect: true,
                reconnection: true,
                // Field connectivity is intermittent by nature; retry forever with
                // rapid backoff starting at 500ms and capped at 5s (with jitter).
                reconnectionAttempts: Infinity,
                reconnectionDelay: 500,
                reconnectionDelayMax: 5000,
                randomizationFactor: 0.5,
                timeout: 10000,
                withCredentials: true,
            });

            socketInstance.on('connect', () => {
                setConnected(true);
                // The initial fetch already covers the first connection; only
                // reconnects bump the version, signalling consumers to resync
                // data for events missed while the socket was offline.
                if (hasConnectedOnceRef.current) {
                    setReconnectVersion((version) => version + 1);
                } else {
                    hasConnectedOnceRef.current = true;
                }
            });

            socketInstance.on('disconnect', (reason) => {
                setConnected(false);
                // If the server explicitly disconnected the socket (e.g. server restart),
                // auto-reconnect does not fire automatically. Trigger reconnect immediately.
                if (reason === 'io server disconnect') {
                    socketInstance.connect();
                }
            });

            socketInstance.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                setConnected(false);
            });

            if (cancelled) {
                socketInstance.disconnect();
            } else {
                setSocket(socketInstance);
            }
        };

        // P2-7: a rejected lazy socket.io-client chunk import must not become an
        // unhandled rejection with a silently dead socket — log and leave the
        // socket disconnected; the existing guards handle the rest.
        connectSocket().catch((socketError) => {
            console.warn('Socket connection failed:', socketError?.message || socketError);
        });

        return () => {
            cancelled = true;
            // A fresh connection must not inherit the previous session's
            // "already connected once" state: its first connect is covered
            // by the initial fetch, not a resync.
            hasConnectedOnceRef.current = false;
            if (socketInstance) {
                socketInstance.disconnect();
            }
            setSocket(null);
            setConnected(false);
        };
    }, [isAuthenticated]);

    // Fast reconnection on window focus, visibility restoration, and online events
    useEffect(() => {
        if (!socket) return;

        const handleWakeUp = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                return;
            }
            if (!socket.connected) {
                socket.connect();
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('focus', handleWakeUp);
            window.addEventListener('online', handleWakeUp);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleWakeUp);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('focus', handleWakeUp);
                window.removeEventListener('online', handleWakeUp);
            }
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleWakeUp);
            }
        };
    }, [socket]);

    // Join user room when authenticated
    useEffect(() => {
        const userId = user?._id || user?.id;
        if (socket && isAuthenticated && userId) {
            const authenticateSocket = () => {
                socket.emit('join');
            };

            const handleAuthError = async () => {
                if (isRefreshingAuthRef.current) return;
                isRefreshingAuthRef.current = true;

                try {
                    await refreshAuthSession();
                    // Socket.IO handshake cookies are static per connection —
                    // a plain `emit('join')` would still carry the expired
                    // cookie. Reconnect to establish a fresh handshake with the new cookie.
                    try {
                        socket.disconnect();
                    } catch {
                        // Ignore — connect() below still establishes a new handshake.
                    }
                    socket.connect();
                } catch (error) {
                    console.error('Socket auth session renewal failed:', error);
                    setConnected(false);
                    // Schedule a retry attempt in 3s so the socket does not stay dead
                    if (authRetryTimerRef.current) clearTimeout(authRetryTimerRef.current);
                    authRetryTimerRef.current = setTimeout(() => {
                        isRefreshingAuthRef.current = false;
                        if (socket && !socket.connected) {
                            handleAuthError();
                        }
                    }, 3000);
                    return;
                } finally {
                    isRefreshingAuthRef.current = false;
                }
            };

            // Socket.IO rooms are cleared on disconnect, so authenticate on the
            // initial connection and every successful reconnect.
            socket.on('connect', authenticateSocket);
            socket.on('authError', handleAuthError);
            if (socket.connected) authenticateSocket();

            return () => {
                if (authRetryTimerRef.current) clearTimeout(authRetryTimerRef.current);
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

            const what = getIncidentTypeLabel(alertData.incidentType, '')
                || INCIDENT_CATEGORIES[alertData.incidentCategory]?.label
                || 'Incident';
            toast(`VERIFIED: ${what} at ${alertData.address || alertData.municipalityName}`, {
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

        // PUBLIC: announce newly verified incidents to guest viewers, who have
        // no inbox and receive no responder alert. Authenticated users already
        // get scoped notifications/alerts, so guests alone get this popup.
        const handlePublicVerifiedReport = (report) => {
            if (user) return;
            if (!report || typeof report !== 'object') return;
            const reportId = String(report.id || report._id || 'unknown');
            const what = getReportIncidentTypeLabel(report, 'Incident');
            const where = report.address || report.municipalityName || 'Sibuyan Island';
            toast.success(`New verified incident on the map: ${what} at ${where}`, {
                dedupeKey: `public-verified:${reportId}`,
            });
        };

        // Public resolution events update the map. Only scoped operational users
        // other than the actor need a toast announcement.
        const handleResolutionDetails = (data) => {            if (!['municipal_admin', 'responder'].includes(user?.role)) return;
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
            if (!notification || typeof notification !== 'object') return;
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
        socket.on('reportVerified', handlePublicVerifiedReport);
        socket.on('newReportAlert', handleNewReportAlert);
        socket.on('localUnitResponse', handleLocalUnitResponse);
        socket.on('reportResolutionDetails', handleResolutionDetails);
        socket.on('notification', handleNotification);

        return () => {
            socket.off('reportVerifiedAlert', handleReportVerifiedAlert);
            socket.off('reportVerified', handlePublicVerifiedReport);
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

    // Subscribe to event. Safe to call when there is no socket (e.g. an
    // unauthenticated visitor): it returns a no-op unsubscribe function so
    // consumers never have to branch on the socket's presence.
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

    // Manual reconnect trigger for UI controls and watchdog recovery
    const reconnect = useCallback(() => {
        if (!socket) return;
        if (!socket.connected) {
            socket.connect();
        }
    }, [socket]);

    const value = {
        socket,
        connected,
        reconnect,
        reconnectVersion,
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

