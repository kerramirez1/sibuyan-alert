import { describe, expect, test } from 'vitest';

/**
 * Recipient-facing link validation for emailed invitation / reset links.
 *
 * A link that leaves this helper without an absolute, reachable origin would
 * be emailed, accepted by SMTP, and reported as delivered — while no
 * recipient could ever open it. These tests lock in the two historical
 * failure modes: a missing/relative CLIENT_URL, and the development localhost
 * default surviving into a deployed environment.
 */
import {
    buildRecipientUrl,
    getConfiguredClientBaseUrl,
    isAbsoluteHttpUrl,
    isLocalClientUrl,
    resolveRecipientClientUrl,
} from '../utils/invitationUrl.js';

describe('invitationUrl', () => {
    test('accepts an absolute client URL and trims a trailing slash', () => {
        expect(resolveRecipientClientUrl({ CLIENT_URL: 'https://app.example/', NODE_ENV: 'production' }))
            .toEqual({ url: 'https://app.example', code: null, error: null });
        expect(getConfiguredClientBaseUrl({ CLIENT_URL: 'https://app.example///' })).toBe('https://app.example');
    });

    test('rejects a missing, blank, or relative CLIENT_URL in every environment', () => {
        for (const env of [
            { NODE_ENV: 'test' },
            { NODE_ENV: 'test', CLIENT_URL: '   ' },
            { NODE_ENV: 'test', CLIENT_URL: '/reset-password/abc' },
            { NODE_ENV: 'production' },
            { NODE_ENV: 'production', CLIENT_URL: 'app.example' },
        ]) {
            const resolved = resolveRecipientClientUrl(env);
            expect(resolved.url).toBeNull();
            expect(resolved.code).toBe('CLIENT_URL_MISSING');
            // Safe to show an administrator: names the variable, never a secret.
            expect(resolved.error).toMatch(/CLIENT_URL/);
            expect(resolved.error).not.toMatch(/reset-password\//);
        }
    });

    test('rejects non-HTTP(S) schemes that URL parsing would otherwise accept', () => {
        expect(isAbsoluteHttpUrl('ftp://files.example/x')).toBe(false);
        expect(isAbsoluteHttpUrl('javascript:alert(1)')).toBe(false);
        expect(isAbsoluteHttpUrl('https://app.example')).toBe(true);
        expect(isAbsoluteHttpUrl('http://192.168.1.10:5173')).toBe(true);
    });

    test('treats localhost as development-only', () => {
        for (const host of ['localhost', '127.0.0.1', '[::1]']) {
            expect(isLocalClientUrl(`http://${host}:5173`)).toBe(true);
        }
        expect(isLocalClientUrl('https://app.example')).toBe(false);

        // Production + localhost: a recipient could never open it.
        const prod = resolveRecipientClientUrl({ NODE_ENV: 'production', CLIENT_URL: 'http://localhost:5173' });
        expect(prod.url).toBeNull();
        expect(prod.code).toBe('CLIENT_URL_LOCAL_IN_PRODUCTION');
        expect(prod.error).toMatch(/localhost/);

        // Development + localhost: the administrator testing the flow locally.
        const dev = resolveRecipientClientUrl({ NODE_ENV: 'development', CLIENT_URL: 'http://localhost:5173' });
        expect(dev).toEqual({ url: 'http://localhost:5173', code: null, error: null });
    });

    test('builds the invitation path on the validated base', () => {
        const token = 'a'.repeat(64);
        expect(buildRecipientUrl(`/reset-password/${token}`, { CLIENT_URL: 'https://app.example', NODE_ENV: 'test' }))
            .toEqual({ url: `https://app.example/reset-password/${token}`, code: null, error: null });
    });

    test('a bad base fails the build without ever containing a token', () => {
        const token = 'b'.repeat(64);
        const result = buildRecipientUrl(`/reset-password/${token}`, { NODE_ENV: 'test' });
        expect(result.url).toBeNull();
        expect(result.code).toBe('CLIENT_URL_MISSING');
        expect(JSON.stringify(result)).not.toContain(token);
    });
});
