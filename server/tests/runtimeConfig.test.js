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
});
