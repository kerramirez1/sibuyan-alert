import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login?expired=true';
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
    updateProfile: (data) => {
        // Check if data is FormData (for avatar upload) or regular object
        const isFormData = data instanceof FormData;
        return api.put('/auth/me', data, {
            headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
        });
    },
    savePushSubscription: (subscription) => api.post('/auth/push-subscription', { subscription }),
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
    getAll: (params) => api.get('/high-risk-zones', { params }),
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

