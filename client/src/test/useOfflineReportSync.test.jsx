import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const {
    countQueuedReportsMock,
    flushQueuedReportsMock,
    subscribeMock,
    createReportMock,
    toastMock,
} = vi.hoisted(() => ({
    countQueuedReportsMock: vi.fn(),
    flushQueuedReportsMock: vi.fn(),
    subscribeMock: vi.fn(),
    createReportMock: vi.fn(),
    toastMock: {
        success: vi.fn(),
        error: vi.fn(),
        loading: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.mock('../services/api', () => ({
    reportsAPI: { create: createReportMock },
}));

vi.mock('../utils/appToast', () => ({ default: toastMock }));

vi.mock('../utils/offlineReportQueue', () => ({
    countQueuedReports: countQueuedReportsMock,
    flushQueuedReports: flushQueuedReportsMock,
    subscribeToQueueChanges: subscribeMock,
}));

import { nextRetryDelay, useOfflineReportSync } from '../hooks/useOfflineReportSync';
import {
    OFFLINE_SYNC_RETRY_BASE_MS,
    OFFLINE_SYNC_RETRY_MAX_MS,
} from '../config/reportSubmission';

const setOnline = (value) => {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => value,
    });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

const flushResult = (overrides = {}) => ({
    sent: 0,
    failed: 0,
    blocked: 0,
    deferred: 0,
    remaining: 1,
    ...overrides,
});

describe('useOfflineReportSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setOnline(true);
        countQueuedReportsMock.mockResolvedValue(0);
        flushQueuedReportsMock.mockResolvedValue(flushResult({ remaining: 0 }));
        subscribeMock.mockImplementation(() => () => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        setOnline(true);
    });

    test('backs off after a failed pass and resets once something is delivered', () => {
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_BASE_MS, flushResult({ failed: 1 })))
            .toBe(OFFLINE_SYNC_RETRY_BASE_MS * 2);
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_BASE_MS, flushResult({ blocked: 1 })))
            .toBe(OFFLINE_SYNC_RETRY_BASE_MS * 2);
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_MAX_MS, flushResult({ failed: 1 })))
            .toBe(OFFLINE_SYNC_RETRY_MAX_MS);
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_MAX_MS, flushResult({ sent: 1, remaining: 0 })))
            .toBe(OFFLINE_SYNC_RETRY_BASE_MS);
        // Attempting nothing is not a failure: a deferred entry keeps its cadence.
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_MAX_MS, flushResult({ deferred: 1 })))
            .toBe(OFFLINE_SYNC_RETRY_MAX_MS);
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_MAX_MS, null)).toBe(OFFLINE_SYNC_RETRY_MAX_MS);
    });

    test('hands the queue the authenticated report endpoint', async () => {
        let send = null;
        flushQueuedReportsMock.mockImplementation(async (sendFn) => {
            send = sendFn;
            return flushResult({ sent: 1, remaining: 0 });
        });

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(flushQueuedReportsMock).toHaveBeenCalled());
        expect(result.current.isSyncing).toBe(false);

        const formData = new FormData();
        await send(formData);
        expect(createReportMock).toHaveBeenCalledWith(formData);

        await waitFor(() => expect(result.current.pendingCount).toBe(0));
    });

    test('reports the queue depth and announces delivered reports', async () => {
        let pending = 2;
        countQueuedReportsMock.mockImplementation(async () => pending);
        flushQueuedReportsMock.mockImplementation(async () => {
            pending = 0;
            return flushResult({ sent: 2, remaining: 0 });
        });

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(result.current.pendingCount).toBe(0));
        expect(toastMock.success).toHaveBeenCalledWith('2 offline reports submitted.');
    });

    test('retries on its own while the signal is gone and no connection event fires', async () => {
        vi.useFakeTimers();
        countQueuedReportsMock.mockResolvedValue(1);
        flushQueuedReportsMock.mockResolvedValue(flushResult({ failed: 1 }));

        renderHook(() => useOfflineReportSync());

        // Mount pass and the count refresh settle without advancing any timer.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        const afterMount = flushQueuedReportsMock.mock.calls.length;
        expect(afterMount).toBeGreaterThanOrEqual(1);

        // A faded radio keeps navigator.onLine true, so no `online` event ever
        // fires when signal returns: only the backoff timer can bring the report
        // back. This is the case a connection listener alone cannot cover.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(OFFLINE_SYNC_RETRY_MAX_MS);
        });

        expect(flushQueuedReportsMock.mock.calls.length).toBeGreaterThan(afterMount);
    });

    test('delivers again when the app regains focus', async () => {
        countQueuedReportsMock.mockResolvedValue(1);
        flushQueuedReportsMock.mockResolvedValue(flushResult({ failed: 1 }));

        renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(flushQueuedReportsMock).toHaveBeenCalled());
        const afterMount = flushQueuedReportsMock.mock.calls.length;

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            await Promise.resolve();
        });

        await waitFor(() => expect(flushQueuedReportsMock.mock.calls.length).toBeGreaterThan(afterMount));
    });

    test('wakes up when the queue itself changes', async () => {
        let queueListener = null;
        subscribeMock.mockImplementation((listener) => {
            queueListener = listener;
            return () => { queueListener = null; };
        });
        countQueuedReportsMock.mockResolvedValue(1);
        flushQueuedReportsMock.mockResolvedValue(flushResult({ failed: 1 }));

        renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(subscribeMock).toHaveBeenCalled());
        const afterMount = flushQueuedReportsMock.mock.calls.length;

        await act(async () => {
            queueListener();
            await Promise.resolve();
        });

        await waitFor(() => expect(flushQueuedReportsMock.mock.calls.length).toBeGreaterThan(afterMount));
    });

    test('stays quiet while the device is offline and delivers when it returns', async () => {
        setOnline(false);
        countQueuedReportsMock.mockResolvedValue(1);

        renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(countQueuedReportsMock).toHaveBeenCalled());
        expect(flushQueuedReportsMock).not.toHaveBeenCalled();

        setOnline(true);

        await waitFor(() => expect(flushQueuedReportsMock).toHaveBeenCalled());
    });
});
