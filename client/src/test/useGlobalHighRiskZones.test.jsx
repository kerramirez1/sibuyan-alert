import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getAllMock, listeners, socketState, subscribeMock } = vi.hoisted(() => {
    const socketListeners = new Map();
    return {
        getAllMock: vi.fn(),
        listeners: socketListeners,
        socketState: { reconnectVersion: 0 },
        subscribeMock: vi.fn((event, callback) => {
            socketListeners.set(event, callback);
            return vi.fn(() => socketListeners.delete(event));
        }),
    };
});

vi.mock('../services/api', () => ({
    highRiskZonesAPI: { getAll: getAllMock },
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({ subscribe: subscribeMock, reconnectVersion: socketState.reconnectVersion }),
}));

import useGlobalHighRiskZones from '../hooks/useGlobalHighRiskZones';

describe('useGlobalHighRiskZones', () => {
    beforeEach(() => {
        listeners.clear();
        socketState.reconnectVersion = 0;
        subscribeMock.mockClear();
        getAllMock.mockReset();
        getAllMock.mockResolvedValue({
            data: {
                data: [
                    { _id: 'zone-cajidiocan', municipality: 'Cajidiocan', isActive: true },
                    { _id: 'zone-magdiwang', municipality: 'Magdiwang', isActive: true },
                ],
            },
        });
    });

    test('loads every active municipality without sending a municipal filter', async () => {
        const { result } = renderHook(() => useGlobalHighRiskZones());

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(getAllMock).toHaveBeenCalledWith();
        expect(result.current.zones.map((zone) => zone.municipality)).toEqual([
            'Cajidiocan',
            'Magdiwang',
        ]);
    });

    test('keeps island-wide socket updates synchronized and removes inactive zones', async () => {
        const { result } = renderHook(() => useGlobalHighRiskZones());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            listeners.get('highRiskZoneCreated')({
                _id: 'zone-san-fernando',
                municipality: 'San Fernando',
                isActive: true,
            });
        });
        expect(result.current.zones.some((zone) => zone.municipality === 'San Fernando')).toBe(true);

        act(() => {
            listeners.get('highRiskZoneUpdated')({
                _id: 'zone-magdiwang',
                municipality: 'Magdiwang',
                isActive: false,
            });
        });
        expect(result.current.zones.some((zone) => zone._id === 'zone-magdiwang')).toBe(false);

        act(() => {
            listeners.get('highRiskZoneDeleted')({ id: 'zone-cajidiocan' });
        });
        expect(result.current.zones.some((zone) => zone._id === 'zone-cajidiocan')).toBe(false);
    });

    test('resynchronizes zones after a socket reconnect without a loading flicker', async () => {
        const { result, rerender } = renderHook(() => useGlobalHighRiskZones());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getAllMock).toHaveBeenCalledTimes(1);

        socketState.reconnectVersion = 1;
        rerender();

        await waitFor(() => expect(getAllMock).toHaveBeenCalledTimes(2));
        // Silent resync must not hide the already-rendered zones behind a spinner.
        expect(result.current.loading).toBe(false);
    });

    test('clears a previous request error immediately when retrying', async () => {
        getAllMock.mockRejectedValueOnce(new Error('Network unavailable'));
        const { result } = renderHook(() => useGlobalHighRiskZones());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('High-risk zones are temporarily unavailable.');

        let resolveRetry;
        getAllMock.mockReturnValueOnce(new Promise((resolve) => {
            resolveRetry = resolve;
        }));
        act(() => {
            result.current.refresh();
        });

        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBe('');

        await act(async () => {
            resolveRetry({ data: { data: [] } });
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
    });
});
