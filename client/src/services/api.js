import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    withCredentials: true,
    xsrfCookieName: 'sibuyan_csrf',
    xsrfHeaderName: 'X-CSRF-Token',
    headers: {
        'Content-Type': 'application/json',
    },
});

const readCookie = (name) => {
    if (typeof document === 'undefined') return null;
    const prefix = `${name}=`;
    const cookie = document.cookie
        .split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
};

// Axios handles this automatically for same-origin requests. Setting the
// header explicitly also supports the separate Vite origin used in local dev.
api.interceptors.request.use(
    (config) => {
        const method = (config.method || 'get').toLowerCase();
        if (!['get', 'head', 'options'].includes(method)) {
            const csrfToken = readCookie('sibuyan_csrf');
            if (csrfToken) {
                if (typeof config.headers?.set === 'function') {
                    config.headers.set('X-CSRF-Token', csrfToken);
                } else {
                    config.headers = { ...config.headers, 'X-CSRF-Token': csrfToken };
                }
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let refreshPromise = null;

export const refreshAuthSession = () => {
    if (!refreshPromise) {
        const requestRefresh = async () => {
            const retryDelays = [100, 250, 500];
            for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
                try {
                    return await api.post('/auth/refresh', null, { _skipAuthRefresh: true });
                } catch (error) {
                    if (error.response?.data?.code !== 'SESSION_ROTATING' || attempt === retryDelays.length) {
                        throw error;
                    }
                    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
                }
            }
            return null;
        };

        refreshPromise = requestRefresh()
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
};

const isPublicAuthRequest = (url = '') => [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
].some((path) => url.startsWith(path));

// Rotate the refresh credential once when an access JWT expires, then retry
// all queued requests without exposing either credential to JavaScript.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config || {};
        const shouldRefresh = error.response?.status === 401
            && !originalRequest._retry
            && !originalRequest._skipAuthRefresh
            && !isPublicAuthRequest(originalRequest.url);

        if (shouldRefresh) {
            originalRequest._retry = true;
            try {
                await refreshAuthSession();
                return api(originalRequest);
            } catch {
                window.dispatchEvent(new CustomEvent('auth:session-expired'));
            }
        }
        return Promise.reject(error);
    }
);

export default api;

const toApiFilePath = (value) => {
    const path = /^https?:\/\//i.test(value) ? new URL(value).pathname : value;
    return path.startsWith('/api/') ? path.slice('/api'.length) : path;
};

export const filesAPI = {
    getProtected: (url) => api.get(toApiFilePath(url), { responseType: 'blob' }),
};

// Auth API
export const authAPI = {
    login: (data) => api.post('/auth/login', data),
    register: (formData) => api.post('/auth/register', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getMe: () => api.get('/auth/me'),
    logout: () => api.post('/auth/logout', null, { _skipAuthRefresh: true }),
    logoutAll: () => api.post('/auth/logout-all'),
    updateProfile: (data) => {
        // Check if data is FormData (for avatar upload) or regular object
        const isFormData = data instanceof FormData;
        return api.put('/auth/me', data, {
            headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
        });
    },
    savePushSubscription: (subscription) => api.post('/auth/push-subscription', { subscription }),
    deletePushSubscription: (endpoint) => api.delete('/auth/push-subscription', {
        data: endpoint ? { endpoint } : {},
    }),
    testPushSubscription: () => api.post('/auth/push-subscription/test'),
    resubmitId: (formData) => api.post('/auth/resubmit-id', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Reports API
export const reportsAPI = {
    getAll: (params) => api.get('/reports', { params }),
    getById: (id) => api.get(`/reports/${id}`),
    getMyReports: () => api.get('/reports/my-reports'),
    addUpdate: (id, data) => api.post(`/reports/${id}/updates`, data),
    getMapConfig: () => api.get('/reports/map-config'),
    getStats: (params) => api.get('/reports/stats', { params }),
    getMunicipalities: () => api.get('/reports/municipalities'),
    searchLocations: (query, config = {}) => api.get('/reports/location-search', { ...config, params: { ...config.params, q: query } }),
    geocodeLocation: (data, config = {}) => api.post('/reports/geocode', data, config),
    create: (formData) => api.post('/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Admin API
export const adminAPI = {
    getDashboard: (params) => api.get('/admin/dashboard', { params }),
    getUsers: (params) => api.get('/admin/users', { params }),
    getUserById: (id) => api.get(`/admin/users/${id}`),
    verifyReporter: (id, data) => api.put(`/admin/users/${id}/verify`, data),
    getReports: (params) => api.get('/admin/reports', { params }),
    verifyReport: (id, data) => api.put(`/admin/reports/${id}/verify`, data),
    respondToReport: (id, data) => api.put(`/admin/reports/${id}/respond`, data),
    resolveReport: (id, data) => api.put(`/admin/reports/${id}/resolve`, data),
    transferReport: (id, data) => api.put(`/admin/reports/${id}/transfer`, data),
    acknowledgeTransfer: (id) => api.put(`/admin/reports/${id}/acknowledge-transfer`),
    deleteReport: (id) => api.delete(`/admin/reports/${id}`),
    deleteUser: (id) => api.delete(`/admin/users/${id}`),
    getOnlineUsers: (params) => api.get('/admin/online-users', { params }),
    updateMyDutyStatus: (data) => api.put('/admin/responders/me/duty-status', data),
};

// High Risk Zones API
export const highRiskZonesAPI = {
    getAll: () => api.get('/high-risk-zones'),
    create: (data) => api.post('/high-risk-zones', data),
    update: (id, data) => api.put(`/high-risk-zones/${id}`, data),
    delete: (id) => api.delete(`/high-risk-zones/${id}`),
};

// Notifications API
export const notificationsAPI = {
    getAll: (params) => api.get('/notifications', { params }),
    getUnreadCount: () => api.get('/notifications/unread-count'),
    markAsRead: (id) => api.put(`/notifications/${id}/read`),
    markAllAsRead: () => api.put('/notifications/read-all'),
    delete: (id) => api.delete(`/notifications/${id}`),
};

// Analytics API
export const analyticsAPI = {
    getAdmin: (params) => api.get('/analytics/admin', { params }),
    getResponder: (params) => api.get('/analytics/responder', { params }),
    getReporter: (params) => api.get('/analytics/reporter', { params }),
    getPublic: () => api.get('/analytics/public'),
};

