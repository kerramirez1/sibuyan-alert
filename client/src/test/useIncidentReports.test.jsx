import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getReportsMock, listeners, subscribeMock } = vi.hoisted(() => {
    const socketListeners = new Map();
    return {
        getReportsMock: vi.fn(),
        listeners: socketListeners,
        subscribeMock: vi.fn((event, callback) => {
            socketListeners.set(event, callback);
            return vi.fn(() => socketListeners.delete(event));
        }),
    };
});

vi.mock('../services/api', () => ({
    adminAPI: { getReports: getReportsMock },
}));

import useIncidentReports from '../hooks/useIncidentReports';

const fetchQueuePage = (reportIds) => Promise.resolve({
    data: {
        data: {
            reports: reportIds.map((_id) => ({ _id, status: 'pending' })),
            stats: { pending: reportIds.length },
            pagination: { page: 1, limit: 20, total: reportIds.length, pages: 1 },
        },
    },
});

describe('useIncidentReports realtime synchronization', () => {
    beforeEach(() => {
        listeners.clear();
        subscribeMock.mockClear();
        getReportsMock.mockReset();
        getReportsMock.mockReturnValue(fetchQueuePage(['report-1']));
    });

    test('adds newly submitted reports to the queue without a manual refresh', async () => {
        const { result } = renderHook(() => useIncidentReports({
            subscribe: subscribeMock,
            role: 'municipal_admin',
        }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getReportsMock).toHaveBeenCalledTimes(1);
        expect(result.current.reports.map((report) => report._id)).toEqual(['report-1']);

        getReportsMock.mockReturnValue(fetchQueuePage(['report-2', 'report-1']));
        await act(async () => {
            listeners.get('newReport')({ id: 'report-2', status: 'pending' });
        });

        await waitFor(() => expect(getReportsMock).toHaveBeenCalledTimes(2));
        expect(result.current.reports.map((report) => report._id)).toEqual(['report-2', 'report-1']);
        // The silent refetch must not blank out the already-rendered queue.
        expect(result.current.loading).toBe(false);
    });

    test('resynchronizes the queue after a socket reconnect', async () => {
        const { result, rerender } = renderHook(
            ({ reconnectVersion }) => useIncidentReports({
                subscribe: subscribeMock,
                role: 'municipal_admin',
                reconnectVersion,
            }),
            { initialProps: { reconnectVersion: 0 } },
        );
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getReportsMock).toHaveBeenCalledTimes(1);

        rerender({ reconnectVersion: 1 });
        await waitFor(() => expect(getReportsMock).toHaveBeenCalledTimes(2));
        expect(result.current.loading).toBe(false);
    });

    test('unsubscribes from every lifecycle event on unmount', async () => {
        const { unmount } = renderHook(() => useIncidentReports({
            subscribe: subscribeMock,
            role: 'municipal_admin',
        }));
        await waitFor(() => expect(listeners.has('newReport')).toBe(true));

        unmount();
        expect(listeners.size).toBe(0);
    });
});
