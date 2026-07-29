import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
} from '../config/authConfig.js';
import { csrfProtection } from '../middleware/csrf.js';
import {
    clearAuthCookies,
    getCookieValue,
    hashSessionToken,
    signAccessToken,
    verifyAccessToken,
} from '../services/authSessionService.js';
import { isPasswordPolicyCompliant } from '../utils/passwordPolicy.js';

const createResponse = () => {
    const response = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    response.set = vi.fn(() => response);
    response.clearCookie = vi.fn(() => response);
    return response;
};

describe('hardened authentication primitives', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'test-only-secret-that-is-longer-than-32-characters';
        process.env.CLIENT_URL = 'https://sibuyan-alert.example';
        process.env.NODE_ENV = 'test';
    });

    test('signs a short-lived access token with constrained claims', () => {
        const token = signAccessToken({ userId: 'user-123', sessionId: 'session-456' });
        const payload = verifyAccessToken(token);

        expect(payload.sub).toBe('user-123');
        expect(payload.sid).toBe('session-456');
        expect(payload.typ).toBe('access');
        expect(payload.iss).toBe('sibuyan-alert-api');
        expect(payload.aud).toBe('sibuyan-alert-web');
        expect(payload.exp - payload.iat).toBe(15 * 60);
    });

    test('rejects an access token signed with a different secret', () => {
        const token = signAccessToken({ userId: 'user-123', sessionId: 'session-456' });
        process.env.JWT_SECRET = 'another-test-secret-that-is-longer-than-32-characters';
        expect(() => verifyAccessToken(token)).toThrow();
    });

    test('hashes opaque refresh credentials before persistence', () => {
        const hash = hashSessionToken('raw-refresh-token');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(hash).not.toContain('raw-refresh-token');
    });

    test('enforces the bcrypt input boundary without silently truncating passwords', () => {
        expect(isPasswordPolicyCompliant('correct horse battery staple')).toBe(true);
        expect(isPasswordPolicyCompliant('too-short')).toBe(false);
        expect(isPasswordPolicyCompliant('a'.repeat(73))).toBe(false);
        expect(isPasswordPolicyCompliant('🔐'.repeat(19))).toBe(false);
    });

    test('reads only the requested cookie and tolerates malformed encoding', () => {
        expect(getCookieValue(
            `${ACCESS_COOKIE_NAME}=access; ${REFRESH_COOKIE_NAME}=refresh`,
            REFRESH_COOKIE_NAME
        )).toBe('refresh');
        expect(getCookieValue(`${ACCESS_COOKIE_NAME}=%E0%A4%A`, ACCESS_COOKIE_NAME)).toBeNull();
    });

    test('clears every auth cookie with matching hardened attributes', () => {
        const response = createResponse();
        clearAuthCookies(response);

        expect(response.clearCookie).toHaveBeenCalledTimes(3);
        expect(response.clearCookie).toHaveBeenCalledWith(
            ACCESS_COOKIE_NAME,
            expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' })
        );
        expect(response.clearCookie).toHaveBeenCalledWith(
            REFRESH_COOKIE_NAME,
            expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' })
        );
    });
});

describe('CSRF protection', () => {
    const createRequest = ({ cookieToken, headerToken, origin } = {}) => ({
        method: 'POST',
        path: '/api/reports',
        headers: { cookie: cookieToken ? `${CSRF_COOKIE_NAME}=${cookieToken}` : '' },
        get: (name) => ({
            origin,
            'x-csrf-token': headerToken,
        })[name.toLowerCase()],
    });

    test('allows matching double-submit token from the configured origin', () => {
        process.env.CLIENT_URL = 'https://sibuyan-alert.example';
        const next = vi.fn();
        csrfProtection(
            createRequest({ cookieToken: 'csrf-value', headerToken: 'csrf-value', origin: process.env.CLIENT_URL }),
            createResponse(),
            next
        );
        expect(next).toHaveBeenCalledOnce();
    });

    test('rejects a missing CSRF header', () => {
        const response = createResponse();
        csrfProtection(createRequest({ cookieToken: 'csrf-value' }), response, vi.fn());
        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CSRF_TOKEN_INVALID' }));
    });

    test('rejects a cross-origin mutation even with a matching token', () => {
        process.env.CLIENT_URL = 'https://sibuyan-alert.example';
        const response = createResponse();
        csrfProtection(
            createRequest({ cookieToken: 'csrf-value', headerToken: 'csrf-value', origin: 'https://evil.example' }),
            response,
            vi.fn()
        );
        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CSRF_ORIGIN_REJECTED' }));
    });
});
