import { describe, test, expect } from 'vitest';

/**
 * Pure logic tests for auth utility functions.
 * These mirror the logic in AuthContext but test the pure functions
 * without needing React context wrappers.
 */

// Extracted from AuthContext for testability
const hasRole = (user, roles) => {
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    return roles.includes(user.role);
};

const isVerifiedReporter = (user) => {
    return user?.role === 'reporter' && user?.isVerified;
};

const canSubmitReports = (user) => {
    if (!user) return false;
    return user.role === 'admin' || (user.role === 'reporter' && user.isVerified);
};

describe('hasRole', () => {
    test('returns false for null user', () => {
        expect(hasRole(null, 'admin')).toBe(false);
    });

    test('matches single role string', () => {
        expect(hasRole({ role: 'admin' }, 'admin')).toBe(true);
        expect(hasRole({ role: 'reporter' }, 'admin')).toBe(false);
    });

    test('matches against role array', () => {
        expect(hasRole({ role: 'municipal_admin' }, ['admin', 'municipal_admin'])).toBe(true);
        expect(hasRole({ role: 'reporter' }, ['admin', 'municipal_admin'])).toBe(false);
    });

    test('handles responder role', () => {
        expect(hasRole({ role: 'responder' }, ['admin', 'municipal_admin', 'responder'])).toBe(true);
        expect(hasRole({ role: 'responder' }, ['admin'])).toBe(false);
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

    test('returns false for admin (not a reporter)', () => {
        expect(isVerifiedReporter({ role: 'admin', isVerified: true })).toBe(false);
    });
});

describe('canSubmitReports', () => {
    test('returns false for null user', () => {
        expect(canSubmitReports(null)).toBe(false);
    });

    test('returns true for admin regardless of verification', () => {
        expect(canSubmitReports({ role: 'admin' })).toBe(true);
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
