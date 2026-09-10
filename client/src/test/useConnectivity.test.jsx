import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { useConnectivity } from '../hooks/useConnectivity';

const setOnline = (value) => {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => value,
    });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

afterEach(() => setOnline(true));

describe('useConnectivity', () => {
    test('reports the current connection state on mount', () => {
        setOnline(true);
        const { result } = renderHook(() => useConnectivity());

        expect(result.current.isOnline).toBe(true);
        expect(result.current.isOffline).toBe(false);
    });

    test('surfaces a lost connection', () => {
        setOnline(true);
        const { result } = renderHook(() => useConnectivity());

        act(() => setOnline(false));

        expect(result.current.isOffline).toBe(true);
        expect(result.current.lastChangedAt).toEqual(expect.any(Number));
    });

    test('clears the offline state when the connection returns', () => {
        setOnline(false);
        const { result } = renderHook(() => useConnectivity());
        expect(result.current.isOffline).toBe(true);

        act(() => setOnline(true));

        expect(result.current.isOnline).toBe(true);
    });

    test('stops listening once unmounted', () => {
        setOnline(true);
        const { result, unmount } = renderHook(() => useConnectivity());
        unmount();

        act(() => setOnline(false));

        expect(result.current.isOffline).toBe(false);
    });
});
