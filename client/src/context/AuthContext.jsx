import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '../router';
import api from '../services/api';
import toast from '../utils/appToast';
import {
    getPushState,
    subscribeToPush,
    unsubscribeFromPush,
} from '../services/pushNotifications';

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

    // Restore the server-managed HttpOnly session on mount.
    useEffect(() => {
        const initAuth = async () => {
            // Remove credentials left by the previous localStorage-based auth flow.
            localStorage.removeItem('token');
            try {
                const response = await api.get('/auth/me');
                setUser(response.data.data);
            } catch {
                setUser(null);
            }
            setLoading(false);
        };

        initAuth();
    }, []);

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
    const login = useCallback(async (email, password) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const { user } = response.data.data;
            setUser(user);

            toast.success(`Welcome back, ${user.name}!`);

            if (user.role === 'responder') {
                navigate('/admin/reports?view=dispatch-queue');
            } else if (user.role === 'municipal_admin') {
                navigate('/admin');
            } else {
                navigate('/dashboard');
            }

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
            const { user } = response.data.data;
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
            await api.post('/auth/logout', null, { _skipAuthRefresh: true });
        } catch {
            // Local state must still be cleared when the network is unavailable.
        }
        setUser(null);
        toast.success('Logged out successfully');
        navigate('/');
    }, [navigate]);

    useEffect(() => {
        const handleExpiredSession = () => setUser(null);
        window.addEventListener('auth:session-expired', handleExpiredSession);
        return () => window.removeEventListener('auth:session-expired', handleExpiredSession);
    }, []);

    // Update user profile
    const updateProfile = useCallback(async (data) => {
        try {
            const response = await api.put('/auth/me', data);
            setUser(response.data.data);
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

    // Resubmit ID document
    const resubmitIdDocument = useCallback(async (formData) => {
        try {
            const response = await api.post('/auth/resubmit-id', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUser((prev) => ({
                ...prev,
                verificationStatus: response.data.data.verificationStatus,
            }));
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
        return roles.includes(user.role);
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

    // Manual user state update
    const updateUser = useCallback((userData) => {
        setUser(userData);
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
