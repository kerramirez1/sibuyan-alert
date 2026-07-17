import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

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
    const navigate = useNavigate();
    const prevVerificationStatusRef = useRef(null);

    // Check for existing token on mount
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const response = await api.get('/auth/me');
                    setUser(response.data.data);
                } catch (error) {
                    console.error('Auth init error:', error);
                    localStorage.removeItem('token');
                }
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
            } catch (error) {
                // Silent fail: avoid noisy errors from temporary connectivity issues
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [user?.id, user?.role, user?.verificationStatus]);

    // Login with email/password
    const login = useCallback(async (email, password) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const { user, token } = response.data.data;

            localStorage.setItem('token', token);
            setUser(user);

            toast.success(`Welcome back, ${user.name}!`);

            if (user.role === 'responder') {
                navigate('/admin/reports?view=dispatch-queue');
            } else if (['admin', 'municipal_admin'].includes(user.role)) {
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
            const { user, token } = response.data.data;

            localStorage.setItem('token', token);
            setUser(user);

            toast.success('Registration successful! Your account is pending verification.');
            navigate('/dashboard');

            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Registration failed';
            toast.error(message);
            return { success: false, message };
        }
    }, [navigate]);



    // Logout
    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setUser(null);
        toast.success('Logged out successfully');
        navigate('/');
    }, [navigate]);

    // Update user profile
    const updateProfile = useCallback(async (data) => {
        try {
            const response = await api.put('/auth/me', data);
            setUser(response.data.data);
            toast.success('Profile updated successfully');
            return { success: true };
        } catch (error) {
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
        } catch (error) {
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
        return user.role === 'admin' || (user.role === 'reporter' && user.isVerified);
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
