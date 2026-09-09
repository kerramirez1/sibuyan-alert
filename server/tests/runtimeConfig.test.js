import { validateRuntimeConfig } from '../config/runtimeConfig.js';

describe('production runtime configuration', () => {
    test('does not require production secrets in development or test', () => {
        expect(() => validateRuntimeConfig({ NODE_ENV: 'test' })).not.toThrow();
        expect(() => validateRuntimeConfig({ NODE_ENV: 'development' })).not.toThrow();
    });

    test('reports all missing core production variables', () => {
        expect(() => validateRuntimeConfig({ NODE_ENV: 'production' }))
            .toThrow('MONGODB_URI, JWT_SECRET, CLIENT_URL');
    });

    test('rejects a weak production JWT secret', () => {
        expect(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'too-short',
            CLIENT_URL: 'https://sibuyan-alert.example',
        })).toThrow('at least 32 characters');
    });

    test('accepts complete production configuration', () => {
        expect(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'https://sibuyan-alert.example',
        })).not.toThrow();
    });

    test('rejects unsafe access-token and session lifetimes', () => {
        const base = {
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'https://sibuyan-alert.example',
        };
        expect(() => validateRuntimeConfig({ ...base, JWT_ACCESS_TTL_MINUTES: '60' }))
            .toThrow('JWT_ACCESS_TTL_MINUTES');
        expect(() => validateRuntimeConfig({ ...base, AUTH_SESSION_TTL_DAYS: '90' }))
            .toThrow('AUTH_SESSION_TTL_DAYS');
    });

    test('rejects partial Web Push configuration', () => {
        expect(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'https://sibuyan-alert.example',
            VAPID_PUBLIC_KEY: 'public-key',
        })).toThrow('Incomplete Web Push configuration');
    });

    test('requires matching public keys for a Web Push deployment', () => {
        expect(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'https://sibuyan-alert.example',
            VAPID_PUBLIC_KEY: 'public-key',
            VAPID_PRIVATE_KEY: 'private-key',
            VAPID_EMAIL: 'mailto:alerts@example.com',
            VITE_VAPID_PUBLIC_KEY: 'different-public-key',
        })).toThrow('must match');
    });

    test('warns in development when VAPID public keys mismatch', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        validateRuntimeConfig({
            NODE_ENV: 'development',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'http://localhost:5173',
            VAPID_PUBLIC_KEY: 'key-a',
            VAPID_PRIVATE_KEY: 'private-key',
            VITE_VAPID_PUBLIC_KEY: 'key-b',
        });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('VAPID_PUBLIC_KEY and VITE_VAPID_PUBLIC_KEY do not match')
        );
        warnSpy.mockRestore();
    });

    test('does not warn in development when VAPID public keys match', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        validateRuntimeConfig({
            NODE_ENV: 'development',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'http://localhost:5173',
            SMTP_HOST: 'smtp.example.com',
            SMTP_USER: 'user',
            SMTP_PASS: 'pass',
            VAPID_PUBLIC_KEY: 'matching-key',
            VAPID_PRIVATE_KEY: 'private-key',
            VITE_VAPID_PUBLIC_KEY: 'matching-key',
        });
        const mismatchCalls = warnSpy.mock.calls.filter(([msg]) =>
            typeof msg === 'string' && msg.includes('do not match')
        );
        expect(mismatchCalls.length).toBe(0);
        warnSpy.mockRestore();
    });
});
