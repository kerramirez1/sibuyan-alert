import { describe, test, expect } from 'vitest';
import {
    hasRole,
    isVerifiedReporter,
    canSubmitReports,
    getDefaultRoleRoute,
    resolvePostLoginRedirect,
} from '../utils/authUtils';

describe('hasRole', () => {
    test('returns false for null user', () => {
        expect(hasRole(null, 'municipal_admin')).toBe(false);
    });

    test('matches single role string', () => {
        expect(hasRole({ role: 'municipal_admin' }, 'municipal_admin')).toBe(true);
        expect(hasRole({ role: 'reporter' }, 'municipal_admin')).toBe(false);
    });

    test('matches against role array', () => {
        expect(hasRole({ role: 'municipal_admin' }, ['municipal_admin', 'responder'])).toBe(true);
        expect(hasRole({ role: 'reporter' }, ['municipal_admin', 'responder'])).toBe(false);
    });

    test('handles responder role', () => {
        expect(hasRole({ role: 'responder' }, ['municipal_admin', 'responder'])).toBe(true);
        expect(hasRole({ role: 'responder' }, ['municipal_admin'])).toBe(false);
    });
});

describe('isVerifiedReporter', () => {
    test('returns false for null user', () => {
        expect(isVerifiedReporter(null)).toBe(false);
    });

    test('returns false for unverified reporter', () => {
        expect(isVerifiedReporter({ role: 'reporter', isVerified: false })).toBe(false);
    });

    test('returns true for verified reporter', () => {
        expect(isVerifiedReporter({ role: 'reporter', isVerified: true })).toBe(true);
    });

    test('returns false for municipal administrators', () => {
        expect(isVerifiedReporter({ role: 'municipal_admin', isVerified: true })).toBe(false);
    });
});

describe('canSubmitReports', () => {
    test('returns false for null user', () => {
        expect(canSubmitReports(null)).toBe(false);
    });

    test('returns false for municipal administrators', () => {
        expect(canSubmitReports({ role: 'municipal_admin' })).toBe(false);
    });

    test('returns true for verified reporter', () => {
        expect(canSubmitReports({ role: 'reporter', isVerified: true })).toBe(true);
    });

    test('returns false for unverified reporter', () => {
        expect(canSubmitReports({ role: 'reporter', isVerified: false })).toBe(false);
    });

    test('returns false for responder role', () => {
        expect(canSubmitReports({ role: 'responder' })).toBe(false);
    });

    test('returns false for ordinary role', () => {
        expect(canSubmitReports({ role: 'ordinary' })).toBe(false);
    });
});

describe('getDefaultRoleRoute', () => {
    test('returns /admin (Operations Dashboard) for municipal_admin', () => {
        expect(getDefaultRoleRoute({ role: 'municipal_admin' })).toBe('/admin');
    });

    test('returns /admin/reports?view=dispatch-queue for responder', () => {
        expect(getDefaultRoleRoute({ role: 'responder' })).toBe('/admin/reports?view=dispatch-queue');
    });

    test('returns /reporter for reporter', () => {
        expect(getDefaultRoleRoute({ role: 'reporter' })).toBe('/reporter');
    });

    test('returns /profile for ordinary (pending verification)', () => {
        expect(getDefaultRoleRoute({ role: 'ordinary' })).toBe('/profile');
    });

    test('returns /dashboard for unknown role or null user', () => {
        expect(getDefaultRoleRoute(null)).toBe('/dashboard');
        expect(getDefaultRoleRoute({ role: 'guest' })).toBe('/dashboard');
    });
});

describe('resolvePostLoginRedirect', () => {
    const adminUser = { role: 'municipal_admin' };
    const responderUser = { role: 'responder' };
    const reporterUser = { role: 'reporter' };

    test('defaults municipal_admin to /admin (Operations Dashboard) without requested target', () => {
        expect(resolvePostLoginRedirect(adminUser, null)).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, undefined)).toBe('/admin');
    });

    test('preserves valid internal deep-link targets for municipal_admin', () => {
        expect(resolvePostLoginRedirect(adminUser, '/admin/zones')).toBe('/admin/zones');
        expect(resolvePostLoginRedirect(adminUser, '/admin/users?page=2')).toBe('/admin/users?page=2');
        expect(resolvePostLoginRedirect(adminUser, '/admin/reports?status=active')).toBe('/admin/reports?status=active');
    });

    test('preserves valid deep-link targets for responder and reporter', () => {
        expect(resolvePostLoginRedirect(responderUser, '/admin/reports')).toBe('/admin/reports');
        expect(resolvePostLoginRedirect(reporterUser, '/report')).toBe('/report');
        expect(resolvePostLoginRedirect(reporterUser, '/my-reports')).toBe('/my-reports');
    });

    test('rejects auth page targets to prevent redirect loops and falls back to canonical role route', () => {
        expect(resolvePostLoginRedirect(adminUser, '/login')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '/register')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '/forgot-password')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '/reset-password/token123')).toBe('/admin');
        expect(resolvePostLoginRedirect(reporterUser, '/login')).toBe('/reporter');
    });

    test('rejects external, protocol-relative, and invalid targets safely', () => {
        expect(resolvePostLoginRedirect(adminUser, 'https://attacker.com')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, 'http://malicious.org/admin')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '//evil.com/admin')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '\\\\bad-server\\path')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, 'javascript:alert(1)')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, 'relative-path')).toBe('/admin');
    });
});
