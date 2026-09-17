// TEMPORARY validation harness (deleted after this task).
//
// Exercises the real sync hook against the real offline queue (with an
// in-memory IndexedDB stub) instead of module mocks, because hoisted `vi.mock`
// factories do not apply in this environment.
import { act, renderHook, waitFor } from '@testing-library/react';
import { reportsAPI } from '../services/api';
import appToast from '../utils/appToast';
import { enqueueReport, listQueuedReports } from '../utils/offlineReportQueue';
import { useOfflineReportSync } from '../hooks/useOfflineReportSync';
import { OFFLINE_SYNC_RETRY_MAX_MS } from '../config/reportSubmission';

const installIndexedDbStub = () => {
    const originalIndexedDB = globalThis.indexedDB;
    const storeData = new Map();

    const createRequest = (result) => ({
        result,
        _onsuccess: null,
        get onsuccess() { return this._onsuccess; },
        set onsuccess(fn) {
            this._onsuccess = fn;
            if (typeof fn === 'function') fn();
        },
    });

    const store = {
        put: (entry) => { storeData.set(entry.clientReportId, entry); return createRequest(entry.clientReportId); },
        get: (key) => createRequest(storeData.get(key)),
        getAll: () => createRequest(Array.from(storeData.values())),
        delete: (key) => { storeData.delete(key); return createRequest(undefined); },
        count: () => createRequest(storeData.size),
        clear: () => { storeData.clear(); return createRequest(undefined); },
    };

    globalThis.indexedDB = {
        open: () => createRequest({
            objectStoreNames: { contains: () => true },
            transaction: () => {
                const transaction = { objectStore: () => store, oncomplete: null, onerror: null, onabort: null };
                setTimeout(() => transaction.oncomplete?.(), 0);
                return transaction;
            },
        }),
    };

    return {
        storeData,
        restore: () => {
            if (originalIndexedDB !== undefined) globalThis.indexedDB = originalIndexedDB;
            else delete globalThis.indexedDB;
        },
    };
};

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

describe('useOfflineReportSync (integration harness)', () => {
    let createMock;
    let successSpy;
    let storage = null;
    let online = true;

    const setOnline = (value) => {
        online = value;
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
        window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    };

    beforeEach(() => {
        storage = installIndexedDbStub();
        createMock = vi.fn(async () => ({ data: { success: true } }));
        reportsAPI.create = createMock;
        successSpy = vi.fn();
        appToast.success = (message, options = { id: 'app-notification' }) => successSpy(message, options);
        setOnline(true);
    });

    afterEach(() => {
        vi.useRealTimers();
        setOnline(true);
        if (storage) { storage.restore(); storage = null; }
    });

    test('delivers an unleased report left on the device when the hook mounts', async () => {
        await enqueueReport({ clientReportId: 'queued-1', fields: { address: 'Poblacion' } });

        const { result } = renderHook(() => useOfflineReportSync());

        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        expect(createMock.mock.calls[0][0].get('clientReportId')).toBe('queued-1');
        await waitFor(() => expect(storage.storeData.size).toBe(0));
        await waitFor(() => expect(result.current.pendingCount).toBe(0));
        expect(successSpy).toHaveBeenCalledWith('1 offline report submitted.', expect.anything());
    });

    test('never races a report a live submit attempt currently holds', async () => {
        await enqueueReport({ clientReportId: 'leased-1', fields: { address: 'In flight' }, leased: true });

        renderHook(() => useOfflineReportSync());
        await act(async () => { await Promise.resolve(); });

        expect(createMock).not.toHaveBeenCalled();
        expect(storage.storeData.size).toBe(1);
        expect((await listQueuedReports())[0].sendingSince).toEqual(expect.any(Number));
    });

    test('retries on its own while the signal is gone and no connection event fires', async () => {
        // Enqueue with real timers: the IndexedDB stub completes transactions
        // via setTimeout(0), which must not be frozen yet.
        await enqueueReport({ clientReportId: 'retry-1', fields: { address: 'Weak signal' } });
        vi.useFakeTimers();
        createMock.mockRejectedValue(networkError());

        renderHook(() => useOfflineReportSync());

        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        const afterMount = createMock.mock.calls.length;
        expect(afterMount).toBeGreaterThanOrEqual(1);
        // Transient failure: the report stays on the device.
        expect(storage.storeData.size).toBe(1);

        // Only the backoff timer can bring it back — no `online` event is fired.
        await act(async () => { await vi.advanceTimersByTimeAsync(OFFLINE_SYNC_RETRY_MAX_MS); });
        expect(createMock.mock.calls.length).toBeGreaterThan(afterMount);
    });

    test('delivers again when the app regains focus', async () => {
        await enqueueReport({ clientReportId: 'focus-1', fields: { address: 'Backgrounded' } });
        createMock.mockRejectedValueOnce(networkError());

        renderHook(() => useOfflineReportSync());
        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        const afterMount = createMock.mock.calls.length;

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            await Promise.resolve();
        });

        await waitFor(() => expect(createMock.mock.calls.length).toBeGreaterThan(afterMount));
        await waitFor(() => expect(storage.storeData.size).toBe(0));
    });

    test('stays quiet while offline and delivers when the connection returns', async () => {
        setOnline(false);
        await enqueueReport({ clientReportId: 'offline-1', fields: { address: 'No signal' } });

        renderHook(() => useOfflineReportSync());
        await act(async () => { await Promise.resolve(); });

        expect(createMock).not.toHaveBeenCalled();

        setOnline(true);

        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        expect(createMock.mock.calls[0][0].get('clientReportId')).toBe('offline-1');
        await waitFor(() => expect(storage.storeData.size).toBe(0));
    });
});
