import { getWebConcurrency, hasSharedStore, requiresSharedStore, assertScalingConfig } from '../config/scaling.js';
import { validateRuntimeConfig } from '../config/runtimeConfig.js';

describe('horizontal scaling guards', () => {
    test('defaults to single-process memory mode', () => {
        expect(getWebConcurrency({})).toBe(1);
        expect(hasSharedStore({})).toBe(false);
        expect(requiresSharedStore({})).toBe(false);
        expect(() => assertScalingConfig({ NODE_ENV: 'production' })).not.toThrow();
    });

    test('refuses multi-process boot without REDIS_URL', () => {
        expect(requiresSharedStore({ WEB_CONCURRENCY: '2' })).toBe(true);
        expect(() => assertScalingConfig({ NODE_ENV: 'production', WEB_CONCURRENCY: '2' })).toThrow('REDIS_URL');
        expect(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'https://sibuyan-alert.example',
            WEB_CONCURRENCY: '3',
        })).toThrow('REDIS_URL');
    });

    test('allows multi-process boot with REDIS_URL', () => {
        expect(() => assertScalingConfig({
            NODE_ENV: 'production',
            WEB_CONCURRENCY: '2',
            REDIS_URL: 'redis://localhost:6379',
        })).not.toThrow();
        expect(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://example.invalid/database',
            JWT_SECRET: 'a-strong-test-secret-with-32-characters',
            CLIENT_URL: 'https://sibuyan-alert.example',
            WEB_CONCURRENCY: '2',
            REDIS_URL: 'redis://localhost:6379',
        })).not.toThrow();
    });
});
