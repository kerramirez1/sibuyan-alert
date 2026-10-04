import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useConnectivity } from '../hooks/useConnectivity';

const setOnline = (value) => {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => value,
    });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

afterEach(() => {
    setOnline(true);
    vi.unstubAllGlobals();
});

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

    test('treats a failed server probe as offline even when the link is up', async () => {
        // Mobile data ON with no load/internet: navigator.onLine stays true,
        // but /api/health is unreachable.
        setOnline(true);
        const fetchSpy = vi.fn().mockRejectedValue(new Error('no route to host'));
        vi.stubGlobal('fetch', fetchSpy);
        const { result } = renderHook(() => useConnectivity());

        // Optimistic at first: boot is never blocked waiting for the probe.
        expect(result.current.isOnline).toBe(true);

        await waitFor(() => expect(result.current.isOffline).toBe(true));
        expect(result.current.lastChangedAt).toEqual(expect.any(Number));

        // The probe is a light raw GET with a short timeout — never axios, so
        // interceptors cannot touch it.
        expect(fetchSpy).toHaveBeenCalledWith(
            '/api/health',
            expect.objectContaining({ method: 'GET', cache: 'no-store', signal: expect.any(AbortSignal) }),
        );
    });

    test('never probes while the link is down', async () => {
        setOnline(false);
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const { result } = renderHook(() => useConnectivity());

        expect(result.current.isOffline).toBe(true);

        // Let any floating probe settle: a dead link means definitely
        // offline, so no probe is ever fired.
        await act(async () => {});
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('a successful probe flips the state back online', async () => {
        setOnline(true);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no route to host')));
        const { result } = renderHook(() => useConnectivity());
        await waitFor(() => expect(result.current.isOffline).toBe(true));

        // The server answers again: the next probe restores the online state.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));
        await act(async () => {
            const reachable = await result.current.probeNow();
            expect(reachable).toBe(true);
        });
        expect(result.current.isOnline).toBe(true);
        expect(result.current.isOffline).toBe(false);
    });

    test('probeNow resolves to the fresh reachability boolean', async () => {
        setOnline(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));
        const { result } = renderHook(() => useConnectivity());

        let reachable;
        await act(async () => {
            reachable = await result.current.probeNow();
        });
        expect(reachable).toBe(true);

        // Link down: no probe is fired, and the answer is immediately false.
        act(() => setOnline(false));
        await act(async () => {
            reachable = await result.current.probeNow();
        });
        expect(reachable).toBe(false);
    });
});
