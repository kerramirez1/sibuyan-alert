import axios from 'axios';
import { toApiFilePath } from '../utils/assets';
import { REPORT_SUBMIT_TIMEOUT_MS } from '../config/reportSubmission';
import { getAnonymousViewerId } from '../utils/viewerIdentity';

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
    if (!cookie) return null;
    // P2-6: a malformed cookie value must not break every POST/PUT/DELETE for
    // the user until the cookie is cleared — treat as absent instead.
    try {
        return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
        return null;
    }
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
                    // No body: axios serializes `null` data to the literal string
                    // "null", which body-parser rejects as invalid JSON.
                    return await api.post('/auth/refresh', undefined, { _skipAuthRefresh: true });
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
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('auth:session-expired'));
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;

export const filesAPI = {
    getProtected: (url, config = {}) => api.get(toApiFilePath(url), { ...config, responseType: 'blob' }),
};

// Auth API
export const authAPI = {
    login: (data) => api.post('/auth/login', data),
    register: (formData) => api.post('/auth/register', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getMe: () => api.get('/auth/me'),
    logout: () => api.post('/auth/logout', undefined, { _skipAuthRefresh: true }),
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
    search: (query, { limit = 8, signal } = {}) => api.get('/reports/search', {
        params: { q: query, limit },
        ...(signal ? { signal } : {}),
    }),
    getById: (id, config = {}) => api.get(`/reports/${id}`, config),
    getMyReports: (params) => api.get('/reports/my-reports', { params }),
    addUpdate: (id, data) => api.post(`/reports/${id}/updates`, data),
    // Per-reporter visibility (NOT a delete): removes the report from the
    // reporter's own views only; it stays in history, queues, and public feeds.
    hideMyReport: (id) => api.post(`/reports/${id}/hide`),
    unhideMyReport: (id) => api.post(`/reports/${id}/unhide`),
    getMapConfig: () => api.get('/reports/map-config'),
    getStats: (params) => api.get('/reports/stats', { params }),
    getMunicipalities: (config = {}) => api.get('/reports/municipalities', config),
    geocodeLocation: (data, config = {}) => api.post('/reports/geocode', data, config),
    create: (formData, config = {}) => api.post('/reports', formData, {
        // A stalled upload must fail fast enough for the report to be handed to
        // the offline queue while the reporter is still on the page. Without a
        // timeout a faded radio leaves the request pending for minutes and the
        // report dies with the app.
        timeout: REPORT_SUBMIT_TIMEOUT_MS,
        ...config,
        headers: {
            'Content-Type': 'multipart/form-data',
            ...config.headers,
        },
    }),
    uploadEvidence: (id, formData, config = {}) => api.post(`/reports/${id}/evidence`, formData, {
        ...config,
        headers: {
            'Content-Type': 'multipart/form-data',
            ...config.headers,
        },
    }),
};

// Admin API
export const adminAPI = {
    getDashboard: (params) => api.get('/admin/dashboard', { params }),
    getPresence: () => api.get('/admin/presence'),
    getUsers: (params) => api.get('/admin/users', { params }),
    getUserById: (id) => api.get(`/admin/users/${id}`),
    verifyReporter: (id, data) => api.put(`/admin/users/${id}/verify`, data),
    // Provisioning a responder. The municipality is never sent: the server reads
    // it from the session, and the endpoint rejects a request that supplies one.
    // There is no password field for the same reason — the responder sets their
    // own from the emailed invitation.
    createResponder: (data) => api.post('/admin/users/responder', data),
    createAdmin: (data) => api.post('/admin/users/admin', data),
    resendResponderInvitation: (id) => api.post(`/admin/users/${id}/invite`),
    getReports: (params) => api.get('/admin/reports', { params }),
    getReportById: (id, config = {}) => api.get(`/admin/reports/${id}`, config),
    verifyReport: (id, data) => api.put(`/admin/reports/${id}/verify`, data),
    respondToReport: (id, data) => api.put(`/admin/reports/${id}/respond`, data),
    resolveReport: (id, data, config = {}) => api.put(
        `/admin/reports/${id}/resolve`,
        data,
        data instanceof FormData
            ? { ...config, headers: { 'Content-Type': 'multipart/form-data', ...config.headers } }
            : config
    ),
    transferReport: (id, data) => api.put(`/admin/reports/${id}/transfer`, data),
    acknowledgeTransfer: (id) => api.put(`/admin/reports/${id}/acknowledge-transfer`),
    deleteReport: (id) => api.delete(`/admin/reports/${id}`),
    dismissReport: (id) => api.post(`/admin/reports/${id}/dismiss`),
    deleteUser: (id) => api.delete(`/admin/users/${id}`),
};

// Reach (view events) API.
//
// One place for both halves of the reach contract: recording a view and reading
// the leaderboard. It exists as its own export because the two call sites that
// record are in different features (the map detail panels and the archive page)
// and only one of them used to find the method — the other optional-chained onto
// a module that never had it, so the map silently recorded nothing for months.
// A single named home makes that class of mistake visible: if this object loses
// a method, every caller fails the same way, in the same place.
//
// The anonymous id is attached here rather than by each caller, so no surface can
// forget it and silently record nothing — a view with no identity is deliberately
// not counted server-side, which would otherwise make the omission invisible.
//
// It is sent even when the viewer is signed in, and that is load-bearing: the
// server uses it to collapse the guest row this browser already wrote before
// signing in. Without it, one person who browsed the public map and then logged
// in would count twice for every record they had already opened, since guests and
// reporters are both public reach.
export const viewsAPI = {
    recordViewEvent: ({ targetType, targetId }) => api.post('/views', {
        targetType,
        targetId,
        anonymousId: getAnonymousViewerId(),
    }),
    // Admin-gated server-side, aggregate-only by construction, and scoped to the
    // requesting administrator's municipality.
    getReach: (params) => api.get('/views/reach', { params }),
};

// High Risk Zones API
export const highRiskZonesAPI = {
    getAll: () => api.get('/high-risk-zones'),
    create: (data, config = {}) => api.post(
        '/high-risk-zones',
        data,
        data instanceof FormData ? { ...config, headers: { 'Content-Type': 'multipart/form-data', ...config.headers } } : config
    ),
    update: (id, data, config = {}) => api.put(
        `/high-risk-zones/${id}`,
        data,
        data instanceof FormData ? { ...config, headers: { 'Content-Type': 'multipart/form-data', ...config.headers } } : config
    ),
    delete: (id) => api.delete(`/high-risk-zones/${id}`),

    // NOAH hazard reference layers (landslide, storm surge). Immutable between
    // deploys and served with a day-long cache plus an ETag, so this is a
    // one-time transfer per browser rather than a per-page-load cost.
    getHazardLayers: (config = {}) => api.get('/high-risk-zones/hazards', config),
    getHazardLayer: (datasetId, config = {}) => api.get(`/high-risk-zones/hazards/${datasetId}`, config),
    // Point lookup used when the map layers are not loaded, or when a caller
    // needs the hazard for a coordinate without running a full verification.
    getHazardsAt: (lat, lng, config = {}) => api.get('/high-risk-zones/hazards/at', {
        params: { lat, lng },
        ...config,
    }),

    // Accident-prone areas, derived server-side from the system's own validated
    // accident reports. Admin-only like the hazard layers above, and aggregated
    // to ~1 km cells: the response carries counts and classes, never a report.
    getAccidentHotspots: (config = {}) => api.get('/high-risk-zones/accident-hotspots', config),
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

// System health API (public GET — no CSRF token required)
export const systemAPI = {
    getHealth: () => api.get('/health'),
};
