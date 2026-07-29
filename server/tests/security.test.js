import { describe, expect, test, vi as jest } from 'vitest';
import { requireAdmin as requireAdminRoleCheck } from '../middleware/roleCheck.js';
import { extractTokenFromCookieHeader } from '../middleware/auth.js';
import { ACCESS_COOKIE_NAME } from '../config/authConfig.js';
import User from '../models/User.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('security middleware', () => {
    test('user schema no longer accepts the retired system-admin role', () => {
        expect(User.schema.path('role').enumValues).toEqual([
            'ordinary',
            'reporter',
            'municipal_admin',
            'responder',
        ]);
    });

    test('roleCheck.requireAdmin denies responder role', () => {
        const req = { user: { role: 'responder' } };
        const res = createRes();
        const next = jest.fn();

        requireAdminRoleCheck(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('roleCheck.requireAdmin allows municipal_admin role', () => {
        const req = { user: { role: 'municipal_admin' } };
        const res = createRes();
        const next = jest.fn();

        requireAdminRoleCheck(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('roleCheck.requireAdmin denies the retired system-admin role', () => {
        const req = { user: { role: 'admin' } };
        const res = createRes();
        const next = jest.fn();

        requireAdminRoleCheck(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe('cookie token extraction', () => {
    test('extracts token from cookie header', () => {
        const token = extractTokenFromCookieHeader(`foo=bar; ${ACCESS_COOKIE_NAME}=abc123; theme=light`);
        expect(token).toBe('abc123');
    });

    test('returns null when token cookie is missing', () => {
        const token = extractTokenFromCookieHeader('foo=bar; theme=light');
        expect(token).toBeNull();
    });
});
