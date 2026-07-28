import { describe, expect, test } from 'vitest';
import { resolveSocketOrigin } from '../utils/runtimeUrl';

describe('resolveSocketOrigin', () => {
    test('uses the current page origin for a combined client/server deployment', () => {
        expect(resolveSocketOrigin({ browserOrigin: 'https://sibuyan-alert.example' }))
            .toBe('https://sibuyan-alert.example');
    });

    test('derives the origin from an explicitly configured API URL', () => {
        expect(resolveSocketOrigin({
            apiUrl: 'https://api.sibuyan-alert.example/api',
            browserOrigin: 'https://sibuyan-alert.example',
        })).toBe('https://api.sibuyan-alert.example');
    });

    test('allows an explicit socket deployment to override other URLs', () => {
        expect(resolveSocketOrigin({
            socketUrl: 'https://realtime.sibuyan-alert.example/',
            apiUrl: 'https://api.sibuyan-alert.example/api',
            browserOrigin: 'https://sibuyan-alert.example',
        })).toBe('https://realtime.sibuyan-alert.example');
    });

    test('never falls back to localhost when optional configuration is invalid', () => {
        expect(resolveSocketOrigin({
            apiUrl: 'not a valid absolute URL',
            browserOrigin: 'https://sibuyan-alert.example',
        })).toBe('https://sibuyan-alert.example');
    });
});
