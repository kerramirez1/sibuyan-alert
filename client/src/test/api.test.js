import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock axios before importing api.js
vi.mock('axios', () => {
    const requestInterceptors = [];
    const responseInterceptors = [];

    const instance = {
        interceptors: {
            request: {
                use: (onFulfilled, onRejected) => {
                    requestInterceptors.push({ onFulfilled, onRejected });
                },
            },
            response: {
                use: (onFulfilled, onRejected) => {
                    responseInterceptors.push({ onFulfilled, onRejected });
                },
            },
        },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        _requestInterceptors: requestInterceptors,
        _responseInterceptors: responseInterceptors,
    };

    return {
        default: {
            create: () => instance,
        },
    };
});

// Reset localStorage mock for each test
beforeEach(() => {
    localStorage.clear();
});

describe('API service', () => {
    test('exports expected API namespaces', async () => {
        const apiModule = await import('../services/api');
        expect(apiModule.default).toBeDefined();
        expect(apiModule.authAPI).toBeDefined();
        expect(apiModule.reportsAPI).toBeDefined();
        expect(apiModule.adminAPI).toBeDefined();
        expect(apiModule.notificationsAPI).toBeDefined();
        expect(apiModule.analyticsAPI).toBeDefined();
        expect(apiModule.highRiskZonesAPI).toBeDefined();
    });

    test('authAPI has all expected methods', async () => {
        const { authAPI } = await import('../services/api');
        expect(typeof authAPI.login).toBe('function');
        expect(typeof authAPI.register).toBe('function');
        expect(typeof authAPI.getMe).toBe('function');
        expect(typeof authAPI.updateProfile).toBe('function');
        expect(typeof authAPI.logout).toBe('function');
        expect(typeof authAPI.logoutAll).toBe('function');
        expect(typeof authAPI.savePushSubscription).toBe('function');
        expect(typeof authAPI.resubmitId).toBe('function');
    });

    test('uses HttpOnly cookie sessions instead of localStorage bearer tokens', async () => {
        const apiModule = await import('../services/api');
        localStorage.setItem('token', 'legacy-token-that-must-not-be-used');
        const requestInterceptor = apiModule.default._requestInterceptors[0].onFulfilled;
        const headers = { set: vi.fn() };

        const config = requestInterceptor({ method: 'get', headers });

        expect(config.headers.Authorization).toBeUndefined();
        expect(headers.set).not.toHaveBeenCalledWith('Authorization', expect.anything());
    });

    test('adds the double-submit CSRF header to mutation requests', async () => {
        const apiModule = await import('../services/api');
        document.cookie = 'sibuyan_csrf=test-csrf-token; path=/';
        const requestInterceptor = apiModule.default._requestInterceptors[0].onFulfilled;
        const headers = { set: vi.fn() };

        requestInterceptor({ method: 'post', headers });

        expect(headers.set).toHaveBeenCalledWith('X-CSRF-Token', 'test-csrf-token');
    });

    test('reportsAPI has all expected methods', async () => {
        const { reportsAPI } = await import('../services/api');
        expect(typeof reportsAPI.getAll).toBe('function');
        expect(typeof reportsAPI.getById).toBe('function');
        expect(typeof reportsAPI.getMyReports).toBe('function');
        expect(typeof reportsAPI.create).toBe('function');
        expect(typeof reportsAPI.addUpdate).toBe('function');
        expect(typeof reportsAPI.getMapConfig).toBe('function');
        expect(typeof reportsAPI.getStats).toBe('function');
        expect(typeof reportsAPI.getMunicipalities).toBe('function');
        expect(typeof reportsAPI.geocodeLocation).toBe('function');
        expect(typeof reportsAPI.uploadEvidence).toBe('function');
    });

    test('adminAPI has all expected methods', async () => {
        const { adminAPI } = await import('../services/api');
        expect(typeof adminAPI.getDashboard).toBe('function');
        expect(typeof adminAPI.getUsers).toBe('function');
        expect(typeof adminAPI.verifyReporter).toBe('function');
        expect(typeof adminAPI.getReports).toBe('function');
        expect(typeof adminAPI.getReportById).toBe('function');
        expect(typeof adminAPI.verifyReport).toBe('function');
        expect(typeof adminAPI.respondToReport).toBe('function');
        expect(typeof adminAPI.resolveReport).toBe('function');
        expect(typeof adminAPI.transferReport).toBe('function');
        expect(typeof adminAPI.deleteReport).toBe('function');
        expect(typeof adminAPI.deleteUser).toBe('function');
    });
});
