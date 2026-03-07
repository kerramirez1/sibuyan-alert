import { describe, expect, test, jest } from '@jest/globals';
import { requireAdmin as requireAdminRoleCheck } from '../middleware/roleCheck.js';
import { extractTokenFromCookieHeader } from '../middleware/auth.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('security middleware', () => {
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
});

describe('cookie token extraction', () => {
    test('extracts token from cookie header', () => {
        const token = extractTokenFromCookieHeader('foo=bar; token=abc123; theme=light');
        expect(token).toBe('abc123');
    });

    test('returns null when token cookie is missing', () => {
        const token = extractTokenFromCookieHeader('foo=bar; theme=light');
        expect(token).toBeNull();
    });
});
