import { describe, test, expect } from 'vitest';
import {
    hasRole,
    isRouteAllowedForRole,
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
    test('returns /admin (Dashboard) for municipal_admin', () => {
        expect(getDefaultRoleRoute({ role: 'municipal_admin' })).toBe('/admin');
    });

    test('returns /admin (Dashboard) for responder', () => {
        expect(getDefaultRoleRoute({ role: 'responder' })).toBe('/admin');
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

    test('defaults municipal_admin to /admin (Dashboard) without requested target', () => {
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
        expect(resolvePostLoginRedirect({ role: 'reporter', isVerified: true }, '/report')).toBe('/report');
        expect(resolvePostLoginRedirect(reporterUser, '/my-reports')).toBe('/my-reports');
    });

    test('rejects cross-role targets to the canonical role dashboard', () => {
        // Reporter asking for admin pages lands on /reporter, not Access Denied.
        expect(resolvePostLoginRedirect(reporterUser, '/admin')).toBe('/reporter');
        expect(resolvePostLoginRedirect(reporterUser, '/admin/reports')).toBe('/reporter');
        expect(resolvePostLoginRedirect(reporterUser, '/admin/users')).toBe('/reporter');
        // Admin asking for reporter pages lands on /admin.
        expect(resolvePostLoginRedirect(adminUser, '/reporter')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '/my-reports')).toBe('/admin');
        expect(resolvePostLoginRedirect(adminUser, '/report')).toBe('/admin');
        // Responder is locked out of admin-only and reporter pages.
        expect(resolvePostLoginRedirect(responderUser, '/admin/users')).toBe('/admin');
        expect(resolvePostLoginRedirect(responderUser, '/admin/zones')).toBe('/admin');
        expect(resolvePostLoginRedirect(responderUser, '/reporter')).toBe('/admin');
        // Ordinary accounts only keep public + profile destinations.
        expect(resolvePostLoginRedirect({ role: 'ordinary' }, '/admin')).toBe('/profile');
        expect(resolvePostLoginRedirect({ role: 'ordinary' }, '/reporter')).toBe('/profile');
        expect(resolvePostLoginRedirect({ role: 'ordinary' }, '/profile')).toBe('/profile');
        expect(resolvePostLoginRedirect({ role: 'ordinary' }, '/dashboard')).toBe('/dashboard');
    });

    test('rejects the submit form for unverified reporters', () => {
        expect(resolvePostLoginRedirect({ role: 'reporter', isVerified: false }, '/report'))
            .toBe('/reporter');
        expect(resolvePostLoginRedirect(reporterUser, '/report')).toBe('/reporter');
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

describe('isRouteAllowedForRole', () => {
    test('opens public paths to everyone including guests', () => {
        for (const path of ['/', '/login', '/dashboard', '/accident-history', '/reset-password/abc']) {
            expect(isRouteAllowedForRole(null, path)).toBe(true);
            expect(isRouteAllowedForRole({ role: 'reporter' }, path)).toBe(true);
        }
        expect(isRouteAllowedForRole(null, '/admin')).toBe(false);
        expect(isRouteAllowedForRole(null, '/reporter')).toBe(false);
    });

    test('enforces the App.jsx route table per role', () => {
        expect(isRouteAllowedForRole({ role: 'municipal_admin' }, '/admin/users')).toBe(true);
        expect(isRouteAllowedForRole({ role: 'responder' }, '/admin/users')).toBe(false);
        expect(isRouteAllowedForRole({ role: 'responder' }, '/admin/reports?view=dispatch-queue')).toBe(true);
        expect(isRouteAllowedForRole({ role: 'reporter', isVerified: true }, '/my-reports')).toBe(true);
        expect(isRouteAllowedForRole({ role: 'reporter', isVerified: false }, '/report')).toBe(false);
        expect(isRouteAllowedForRole({ role: 'ordinary' }, '/notifications')).toBe(true);
        expect(isRouteAllowedForRole({ role: 'ordinary' }, '/reporter')).toBe(false);
        expect(isRouteAllowedForRole({ role: 'municipal_admin' }, '/unknown-page')).toBe(false);
    });
});
