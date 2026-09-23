import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '../router';
import api, { refreshAuthSession } from '../services/api';
import toast, { dismissActiveToast } from '../utils/appToast';
import {
    getPushState,
    subscribeToPush,
    unsubscribeFromPush,
    isPushSupported,
} from '../services/pushNotifications';
import {
    resolvePostLoginRedirect,
} from '../utils/authUtils';
import { clearBlobCache } from '../utils/blobCache';
import { clearQueryCache } from '../utils/queryCache';
import {
    setCacheScope,
    clearOfflineCaches,
    onServiceWorkerControllerChange,
} from '../services/serviceWorker';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pushState, setPushState] = useState({
        supported: true,
        permission: 'default',
        subscribed: false,
        loading: true,
    });
    const navigate = useNavigate();
    const prevVerificationStatusRef = useRef(null);
    const greetingTimerRef = useRef(null);
    const lastSessionRefreshAtRef = useRef(Date.now());

    useEffect(() => () => {
        if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
    }, []);

    // Restore the server-managed HttpOnly session on mount.
    useEffect(() => {
        const initAuth = async () => {
            // Remove credentials left by the previous localStorage-based auth flow if accessible.
            try {
                localStorage.removeItem('token');
            } catch {
                // Storage access restricted (e.g. strict private browsing or sandboxed context)
            }
            try {
                const response = await api.get('/auth/me', { _skipAuthRefresh: true });
                setUser(response.data.data);
                lastSessionRefreshAtRef.current = Date.now();
            } catch {
                setUser(null);
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    // Proactive background session renewal (every 10 minutes) and on tab visibility restoration.
    // Keeps the 15-minute HttpOnly access token fresh even during passive dashboard monitoring.
    useEffect(() => {
        if (!user) return undefined;

        const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (token expires at 15m)

        const performProactiveRefresh = async () => {
            try {
                await refreshAuthSession();
                lastSessionRefreshAtRef.current = Date.now();
            } catch {
                // Network or session issues will be handled on demand by the axios interceptor
            }
        };

        const interval = window.setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            performProactiveRefresh();
        }, PROACTIVE_REFRESH_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (typeof document === 'undefined' || document.hidden) return;
            if (Date.now() - lastSessionRefreshAtRef.current >= PROACTIVE_REFRESH_INTERVAL_MS) {
                performProactiveRefresh();
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            window.clearInterval(interval);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [user?.id]);

    // Keep reporter verification status fresh while account is pending/rejected
    useEffect(() => {
        if (!user || user.role !== 'reporter') {
            prevVerificationStatusRef.current = null;
            return;
        }

        prevVerificationStatusRef.current = user.verificationStatus;

        // Poll only if not yet approved, so reporter receives updates without manual refresh
        if (user.verificationStatus === 'approved') return;

        const interval = setInterval(async () => {
            try {
                const response = await api.get('/auth/me');
                const freshUser = response.data?.data;
                if (!freshUser) return;

                setUser((prev) => {
                    if (!prev) return freshUser;
                    return { ...prev, ...freshUser };
                });

                const prevStatus = prevVerificationStatusRef.current;
                const nextStatus = freshUser.verificationStatus;

                if (prevStatus && prevStatus !== nextStatus) {
                    if (nextStatus === 'approved') {
                        toast.success('Account approved. You can now submit reports.');
                    } else if (nextStatus === 'rejected') {
                        toast.error('Verification was rejected. Please check feedback in your profile.');
                    } else if (nextStatus === 'pending') {
                        toast('Your account is waiting for approval.');
                    }
                }

                prevVerificationStatusRef.current = nextStatus;
            } catch {
                // Silent fail: avoid noisy errors from temporary connectivity issues
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [user?.id, user?.role, user?.verificationStatus]);

    // Login with email/password
    const login = useCallback(async (email, password, requestedTarget) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const user = response.data?.data?.user;
            if (!user) {
                throw new Error('Login response did not include a user');
            }
            setUser(user);

            const greeting = `Welcome back, ${user.name}!`;
            toast.success(greeting);

            const targetDestination = resolvePostLoginRedirect(user, requestedTarget);
            navigate(targetDestination);
            // The greeting served its purpose once navigation starts. Clear it
            // on a short timer so post-login toast bursts (map fallback, socket
            // alerts) can't chain its 3s clock — but only if nothing newer
            // replaced it, so real alerts are never cut short.
            if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
            greetingTimerRef.current = setTimeout(() => dismissActiveToast(greeting), 2500);

            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Login failed';
            toast.error(message);
            return { success: false, message };
        }
    }, [navigate]);

    // Register as reporter
    const register = useCallback(async (formData) => {
        try {
            const response = await api.post('/auth/register', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const user = response.data?.data?.user;
            if (!user) {
                throw new Error('Registration response did not include a user');
            }
            setUser(user);

            navigate('/registration-submitted');

            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Registration failed';
            toast.error(message);
            return { success: false, message };
        }
    }, [navigate]);

    // Logout
    const logout = useCallback(async () => {
        try {
            await api.post('/auth/logout', undefined, { _skipAuthRefresh: true });
        } catch {
            // Local state must still be cleared when the network is unavailable.
        }
        clearBlobCache();
        // Municipal-scoped report/queue snapshots must not leak to the next
        // account on a shared device.
        clearQueryCache();
        // The service worker keeps an offline copy of incident data; that copy
        // is per-user and must not survive a logout either.
        clearOfflineCaches();
        setCacheScope(null);
        setUser(null);
        toast.success('Logged out successfully');
        navigate('/');
    }, [navigate]);

    useEffect(() => {
        const handleExpiredSession = () => {
            clearBlobCache();
            clearQueryCache();
            clearOfflineCaches();
            setCacheScope(null);
            setUser(null);
        };
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return () => { };
        }
        window.addEventListener('auth:session-expired', handleExpiredSession);
        return () => window.removeEventListener('auth:session-expired', handleExpiredSession);
    }, []);

    // Update user profile
    const updateProfile = useCallback(async (data) => {
        try {
            const response = await api.put('/auth/me', data);
            const updatedUser = response.data?.data;
            if (!updatedUser) {
                throw new Error('Profile response did not include a user');
            }
            setUser(updatedUser);
            toast.success('Profile updated successfully');
            return { success: true };
        } catch {
            toast.error('Failed to update profile');
            return { success: false };
        }
    }, []);

    // Save push subscription
    const savePushSubscription = useCallback(async (subscription) => {
        try {
            await api.post('/auth/push-subscription', { subscription });
            return { success: true };
        } catch (error) {
            console.error('Failed to save push subscription:', error);
            return { success: false };
        }
    }, []);

    const enablePushNotifications = useCallback(async () => {
        setPushState((current) => ({ ...current, loading: true }));
        const result = await subscribeToPush({ requestPermission: true });

        if (result.status !== 'subscribed') {
            setPushState({
                supported: result.status !== 'unsupported',
                permission: result.status === 'denied'
                    ? 'denied'
                    : (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
                subscribed: false,
                loading: false,
                error: result.status,
            });
            return { success: false, status: result.status };
        }

        const saved = await savePushSubscription(result.subscription);
        setPushState({
            supported: true,
            permission: 'granted',
            subscribed: saved.success,
            loading: false,
            error: saved.success ? null : 'save_failed',
        });
        if (saved.success) {
            setUser((current) => current ? {
                ...current,
                notificationPreferences: {
                    ...current.notificationPreferences,
                    browserPush: true,
                },
            } : current);
        }
        return { success: saved.success, status: saved.success ? 'subscribed' : 'save_failed' };
    }, [savePushSubscription]);

    const disablePushNotifications = useCallback(async () => {
        setPushState((current) => ({ ...current, loading: true }));
        const localResult = await unsubscribeFromPush();
        try {
            await api.delete('/auth/push-subscription', {
                data: localResult.endpoint ? { endpoint: localResult.endpoint } : {},
            });
            setPushState({
                supported: localResult.status !== 'unsupported',
                permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
                subscribed: false,
                loading: false,
            });
            setUser((current) => current ? {
                ...current,
                notificationPreferences: {
                    ...current.notificationPreferences,
                    browserPush: false,
                },
            } : current);
            return { success: true };
        } catch (error) {
            console.error('Failed to disable push notifications:', error);
            const currentState = await getPushState();
            setPushState({ ...currentState, loading: false, error: 'delete_failed' });
            return { success: false };
        }
    }, []);

    const sendTestPushNotification = useCallback(async () => {
        try {
            await api.post('/auth/push-subscription/test');
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to send test notification',
            };
        }
    }, []);

    // Restore an existing granted subscription without displaying a browser
    // permission prompt. Permission prompts are reserved for explicit user actions.
    useEffect(() => {
        let cancelled = false;
        if (!user) {
            setPushState({ supported: true, permission: 'default', subscribed: false, loading: false });
            return () => { cancelled = true; };
        }

        const synchronizePush = async () => {
            if (user.notificationPreferences?.browserPush === false) {
                const state = await getPushState();
                if (state.subscribed) await unsubscribeFromPush();
                if (!cancelled) {
                    setPushState({ ...state, subscribed: false, loading: false });
                }
                return;
            }

            const state = await getPushState();
            if (cancelled) return;

            if (state.supported && state.permission === 'granted') {
                const result = await subscribeToPush({ requestPermission: false });
                if (cancelled) return;
                if (result.status === 'subscribed') {
                    const saved = await savePushSubscription(result.subscription);
                    if (!cancelled) {
                        setPushState({
                            supported: true,
                            permission: 'granted',
                            subscribed: saved.success,
                            loading: false,
                            error: saved.success ? null : 'save_failed',
                        });
                    }
                    return;
                }
            }

            setPushState({ ...state, loading: false });
        };

        synchronizePush();
        return () => { cancelled = true; };
    }, [user?.id, user?.notificationPreferences?.browserPush, savePushSubscription]);

    // Scope the worker's offline cache to the signed-in account, and re-apply
    // the scope if a new worker takes control mid-session.
    useEffect(() => {
        setCacheScope(user?.id ?? null);
        return onServiceWorkerControllerChange(() => setCacheScope(user?.id ?? null));
    }, [user?.id]);

    /**
     * Ask for push permission once per session, for the roles whose job is to
     * receive alerts.
     *
     * Push is the only paging channel this system has (SMS is out of scope), so
     * a responder who was never asked is a responder who cannot be alerted.
     * Prompting silently at login would be wrong, so this asks explicitly — but
     * only while permission is still undecided, and only once per session, so
     * it can never turn into a nag.
     */
    useEffect(() => {
        if (!user || !isPushSupported()) return;
        if (!['responder', 'municipal_admin'].includes(user.role)) return;
        if (user.notificationPreferences?.browserPush === false) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;

        const SESSION_FLAG = 'sibuyan-push-prompted';
        try {
            if (sessionStorage.getItem(SESSION_FLAG)) return;
            sessionStorage.setItem(SESSION_FLAG, '1');
        } catch {
            // No sessionStorage (private mode): skip rather than risk nagging.
            return;
        }

        subscribeToPush({ requestPermission: true }).then((result) => {
            if (result.status === 'subscribed') savePushSubscription(result.subscription);
        });
    }, [user, savePushSubscription]);

    // Resubmit ID document
    const resubmitIdDocument = useCallback(async (formData) => {
        try {
            const response = await api.post('/auth/resubmit-id', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const verificationStatus = response.data?.data?.verificationStatus;
            if (!verificationStatus) {
                throw new Error('Resubmit response did not include a verification status');
            }
            setUser((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    verificationStatus,
                };
            });
            toast.success('ID document resubmitted for verification');
            return { success: true };
        } catch {
            toast.error('Failed to resubmit ID document');
            return { success: false };
        }
    }, []);

    // Check if user has specific role
    const hasRole = useCallback((roles) => {
        if (!user) return false;
        if (typeof roles === 'string') return user.role === roles;
        if (Array.isArray(roles)) return roles.includes(user.role);
        return false;
    }, [user]);

    // Check if user is verified reporter
    const isVerifiedReporter = useCallback(() => {
        return user?.role === 'reporter' && user?.isVerified;
    }, [user]);

    // Check if user can submit reports
    const canSubmitReports = useCallback(() => {
        if (!user) return false;
        return user.role === 'reporter' && user.isVerified;
    }, [user]);

    // Manual user state update.
    //
    // Merges into the current user instead of replacing it. Callers hand this a
    // response projection, and a projection is not the whole account: the
    // profile update answers with the editable fields only, so replacing would
    // drop `isVerified`/`verificationStatus` (which gate `/report` and the
    // submit CTA) plus the address the account restored at sign-in. A null is
    // still a deliberate clear.
    const updateUser = useCallback((userData) => {
        if (userData == null) {
            setUser(null);
            return;
        }
        setUser((current) => (current ? { ...current, ...userData } : userData));
    }, []);

    const value = {
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        updateUser,
        savePushSubscription,
        pushState,
        enablePushNotifications,
        disablePushNotifications,
        sendTestPushNotification,
        resubmitIdDocument,
        hasRole,
        isVerifiedReporter,
        canSubmitReports,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
