import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const {
    listQueuedReportsMock,
    flushQueuedReportsMock,
    subscribeMock,
    createReportMock,
    toastMock,
    authMock,
} = vi.hoisted(() => ({
    listQueuedReportsMock: vi.fn(),
    flushQueuedReportsMock: vi.fn(),
    subscribeMock: vi.fn(),
    createReportMock: vi.fn(),
    toastMock: {
        success: vi.fn(),
        error: vi.fn(),
        loading: vi.fn(),
        dismiss: vi.fn(),
    },
    authMock: { user: { _id: 'reporter-1' }, canSubmitReports: () => true },
}));

vi.mock('../services/api', () => ({
    reportsAPI: { create: createReportMock },
}));

vi.mock('../utils/appToast', () => ({ default: toastMock }));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => authMock,
}));

// Only the storage and the delivery are stubbed: partitioning is pure, so the
// real implementation runs and the hook is tested against the real rules.
vi.mock('../utils/offlineReportQueue', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        listQueuedReports: listQueuedReportsMock,
        flushQueuedReports: flushQueuedReportsMock,
        subscribeToQueueChanges: subscribeMock,
    };
});

import { nextRetryDelay, useOfflineReportSync } from '../hooks/useOfflineReportSync';
import { BLOCKED_RECOVERY } from '../utils/offlineReportQueue';
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
    foreign: 0,
    remaining: 1,
    deliverableRemaining: 1,
    ...overrides,
});

const queuedEntry = (overrides = {}) => ({
    clientReportId: 'rep-1',
    reporterId: 'reporter-1',
    fields: { address: 'Cajidiocan Port' },
    queuedAt: Date.now(),
    attempts: 0,
    blockedReason: null,
    blockedCode: null,
    sendingSince: null,
    ...overrides,
});

describe('useOfflineReportSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setOnline(true);
        authMock.user = { _id: 'reporter-1' };
        authMock.canSubmitReports = () => true;
        listQueuedReportsMock.mockResolvedValue([]);
        flushQueuedReportsMock.mockResolvedValue(flushResult({ remaining: 0, deliverableRemaining: 0 }));
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
        // A report waiting on the reporter is not worth retrying: the clock
        // resets instead of doubling, and the timer stops arming.
        expect(nextRetryDelay(OFFLINE_SYNC_RETRY_MAX_MS, flushResult({
            blocked: 1,
            deliverableRemaining: 0,
        }))).toBe(OFFLINE_SYNC_RETRY_BASE_MS);
    });

    test('hands the queue the authenticated report endpoint and the signed-in reporter', async () => {
        let send = null;
        let options = null;
        flushQueuedReportsMock.mockImplementation(async (sendFn, passedOptions) => {
            send = sendFn;
            options = passedOptions;
            return flushResult({ sent: 1, remaining: 0, deliverableRemaining: 0 });
        });

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(flushQueuedReportsMock).toHaveBeenCalled());
        expect(result.current.isSyncing).toBe(false);
        expect(options).toEqual({ reporterId: 'reporter-1' });

        const formData = new FormData();
        await send(formData);
        expect(createReportMock).toHaveBeenCalledWith(formData);

        await waitFor(() => expect(result.current.pendingCount).toBe(0));
    });

    test('reports the queue depth and announces delivered reports', async () => {
        let entries = [
            queuedEntry({ clientReportId: 'rep-1' }),
            queuedEntry({ clientReportId: 'rep-2' }),
        ];
        listQueuedReportsMock.mockImplementation(async () => entries);
        flushQueuedReportsMock.mockImplementation(async () => {
            entries = [];
            return flushResult({ sent: 2, remaining: 0, deliverableRemaining: 0 });
        });

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(result.current.pendingCount).toBe(0));
        expect(toastMock.success).toHaveBeenCalledWith('2 offline reports submitted.');
    });

    test('surfaces a blocked report with its reason instead of retrying it silently', async () => {
        listQueuedReportsMock.mockResolvedValue([
            queuedEntry({
                blockedReason: 'A similar incident was already reported nearby.',
                blockedCode: 'duplicate',
            }),
        ]);
        flushQueuedReportsMock.mockResolvedValue(flushResult({
            blocked: 1,
            remaining: 1,
            deliverableRemaining: 0,
        }));

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(result.current.blockedReports).toHaveLength(1));
        expect(result.current.blockedReports[0]).toMatchObject({
            clientReportId: 'rep-1',
            blockedCode: 'duplicate',
            blockedReason: 'A similar incident was already reported nearby.',
            label: 'Cajidiocan Port',
            recovery: BLOCKED_RECOVERY.confirmDuplicate,
            coordinates: null,
        });
        // Still owed to the server, so the banner keeps counting it...
        expect(result.current.pendingCount).toBe(1);
        // ...but nothing is deliverable, so no pass can be worth scheduling.
        expect(result.current.deliverableCount).toBe(0);
        expect(toastMock.error).toHaveBeenCalledWith('1 queued report could not be submitted and needs attention.');
    });

    test('marks a GPS-accuracy block as location-correctable with the refused coordinates', async () => {
        listQueuedReportsMock.mockResolvedValue([
            queuedEntry({
                clientReportId: 'rep-gps',
                fields: {
                    address: 'Cajidiocan Port',
                    lat: 12.3,
                    lng: 122.1,
                    locationSource: 'gps',
                    locationAccuracy: 150,
                },
                blockedCode: 'rejected',
                blockedReason: 'GPS accuracy must be 100 meters or better. Please retry GPS or pin the incident on the map.',
            }),
        ]);
        flushQueuedReportsMock.mockResolvedValue(flushResult({
            blocked: 1,
            remaining: 1,
            deliverableRemaining: 0,
        }));

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(result.current.blockedReports).toHaveLength(1));
        expect(result.current.blockedReports[0]).toMatchObject({
            clientReportId: 'rep-gps',
            recovery: BLOCKED_RECOVERY.correctLocation,
            coordinates: { lat: 12.3, lng: 122.1 },
        });
    });

    test('never shows another account\'s queued report as this reporter\'s own', async () => {
        listQueuedReportsMock.mockResolvedValue([
            queuedEntry({ clientReportId: 'admin-queued', reporterId: 'municipal-admin-9' }),
        ]);

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(listQueuedReportsMock).toHaveBeenCalled());
        await waitFor(() => expect(result.current.pendingCount).toBe(0));
        expect(result.current.deliverableCount).toBe(0);
        expect(result.current.blockedReports).toHaveLength(0);
    });

    test('does not flush at all from a session that cannot submit reports', async () => {
        authMock.user = { _id: 'admin-9', role: 'municipal_admin' };
        authMock.canSubmitReports = () => false;
        listQueuedReportsMock.mockResolvedValue([queuedEntry({ reporterId: 'reporter-1' })]);

        renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(listQueuedReportsMock).toHaveBeenCalled());
        expect(flushQueuedReportsMock).not.toHaveBeenCalled();
    });

    test('retries on its own while the signal is gone and no connection event fires', async () => {
        vi.useFakeTimers();
        listQueuedReportsMock.mockResolvedValue([queuedEntry()]);
        flushQueuedReportsMock.mockResolvedValue(flushResult({ failed: 1 }));

        renderHook(() => useOfflineReportSync());

        // Mount pass and the list read settle without advancing any timer.
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
        listQueuedReportsMock.mockResolvedValue([queuedEntry()]);
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
        listQueuedReportsMock.mockResolvedValue([queuedEntry()]);
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
        listQueuedReportsMock.mockResolvedValue([queuedEntry()]);

        renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(listQueuedReportsMock).toHaveBeenCalled());
        expect(flushQueuedReportsMock).not.toHaveBeenCalled();

        setOnline(true);

        await waitFor(() => expect(flushQueuedReportsMock).toHaveBeenCalled());
    });
});
