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
import { clearQueryCache } from '../utils/queryCache';

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
        clearQueryCache();
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

    test('a stale tab response never overwrites the current tab (P2-9)', async () => {
        clearQueryCache();
        // The pending fetch hangs; the verified fetch resolves immediately.
        let resolvePending;
        const pendingPromise = new Promise((resolve) => { resolvePending = resolve; });
        getReportsMock.mockImplementation((params) => (
            params?.status === 'pending' ? pendingPromise : fetchQueuePage(['verified-1'])
        ));

        const { result } = renderHook(() => useIncidentReports({
            subscribe: subscribeMock,
            role: 'municipal_admin',
            initialStatus: 'pending',
        }));

        // Rapid pending→verified tab switch before the pending response lands.
        await act(async () => {
            result.current.setStatus('verified');
        });
        await waitFor(() => expect(result.current.reports.map((r) => r._id)).toEqual(['verified-1']));
        expect(result.current.status).toBe('verified');

        // The stale pending response finally arrives — it must be ignored.
        await act(async () => {
            resolvePending({
                data: {
                    data: {
                        reports: [{ _id: 'pending-1', status: 'pending' }],
                        stats: {},
                        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
                    },
                },
            });
        });

        expect(result.current.reports.map((r) => r._id)).toEqual(['verified-1']);
        expect(result.current.status).toBe('verified');
    });
});

describe('useIncidentReports category filter', () => {
    beforeEach(() => {
        clearQueryCache();
        listeners.clear();
        subscribeMock.mockClear();
        getReportsMock.mockReset();
        getReportsMock.mockReturnValue(fetchQueuePage(['report-1']));
    });

    test('includes the category in the API call and a distinct cache key', async () => {
        const { result } = renderHook(() => useIncidentReports({
            subscribe: subscribeMock,
            role: 'municipal_admin',
        }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getReportsMock).toHaveBeenCalledTimes(1);
        expect(getReportsMock.mock.calls[0][0]).not.toHaveProperty('category');

        await act(async () => {
            result.current.setCategory('fire');
        });
        await waitFor(() => expect(getReportsMock).toHaveBeenCalledTimes(2));

        const lastParams = getReportsMock.mock.calls[getReportsMock.mock.calls.length - 1][0];
        expect(lastParams).toMatchObject({ category: 'fire', page: 1 });
        expect(result.current.category).toBe('fire');

        // Switching back to '' must reuse its own fresh cache instead of
        // re-fetching — proof the keys for the two categories are distinct.
        await act(async () => {
            result.current.setCategory('');
        });
        await act(async () => {});
        expect(getReportsMock).toHaveBeenCalledTimes(2);
        expect(result.current.category).toBe('');
    });

    test('clearFilters resets the category and page', async () => {
        const { result } = renderHook(() => useIncidentReports({
            subscribe: subscribeMock,
            role: 'municipal_admin',
        }));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            result.current.setCategory('hazard');
        });
        await waitFor(() => expect(result.current.category).toBe('hazard'));

        await act(async () => {
            result.current.clearFilters();
        });
        expect(result.current.category).toBe('');
        expect(result.current.page).toBe(1);
    });
});
