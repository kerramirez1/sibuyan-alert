import { describe, expect, test, vi } from 'vitest';
import {
    POSSIBLE_DUPLICATE_CODE,
    QUEUE_BLOCKED_CODES,
    buildQueuedFormData,
    clearOfflineReportQueue,
    clearQueuedReportSending,
    classifySubmitFailure,
    createClientReportId,
    describeSubmitFailure,
    enqueueReport,
    flushQueuedReports,
    isOfflineQueueSupported,
    isTransientSubmitFailure,
    listQueuedReports,
    partitionQueuedReports,
    removeQueuedReport,
    resolveBlockedQueuedReport,
    subscribeToQueueChanges,
} from '../utils/offlineReportQueue';

/**
 * Minimal in-memory IndexedDB stand-in: just enough of the object-store surface
 * for this queue (put/get/getAll/delete/count/clear inside one transaction).
 */
const createIndexedDbStub = () => {
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

    const mockStore = {
        put: vi.fn((entry) => {
            storeData.set(entry.clientReportId, entry);
            return createRequest(entry.clientReportId);
        }),
        get: vi.fn((key) => createRequest(storeData.get(key))),
        getAll: vi.fn(() => createRequest(Array.from(storeData.values()))),
        delete: vi.fn((key) => {
            storeData.delete(key);
            return createRequest(undefined);
        }),
        count: vi.fn(() => createRequest(storeData.size)),
        clear: vi.fn(() => {
            storeData.clear();
            return createRequest(undefined);
        }),
    };

    globalThis.indexedDB = {
        open: vi.fn(() => createRequest({
            objectStoreNames: { contains: () => true },
            transaction: () => {
                const transaction = {
                    objectStore: () => mockStore,
                    oncomplete: null,
                    onerror: null,
                    onabort: null,
                };
                setTimeout(() => transaction.oncomplete?.(), 0);
                return transaction;
            },
        })),
    };

    return {
        storeData,
        restore: () => {
            if (originalIndexedDB !== undefined) {
                globalThis.indexedDB = originalIndexedDB;
            } else {
                delete globalThis.indexedDB;
            }
        },
    };
};

describe('offline report queue', () => {
    test('issues a distinct idempotency key for every report', () => {
        const first = createClientReportId();
        const second = createClientReportId();

        expect(first).toBeTruthy();
        expect(first).not.toBe(second);
    });

    test('rebuilds the multipart body, idempotency key included', () => {
        const formData = buildQueuedFormData({
            clientReportId: 'key-1',
            fields: {
                incidentCategory: 'accident',
                incidentType: 'motorcycle',
                'casualties[injured]': 2,
                lat: 12.4,
                address: '',
                description: null,
            },
            images: [new File(['evidence'], 'scene.jpg', { type: 'image/jpeg' })],
        });

        expect(formData.get('clientReportId')).toBe('key-1');
        expect(formData.get('incidentCategory')).toBe('accident');
        expect(formData.get('casualties[injured]')).toBe('2');
        expect(formData.get('lat')).toBe('12.4');
        expect(formData.getAll('images')).toHaveLength(1);

        // Blank and null fields are omitted rather than sent as empty strings,
        // which would trip the server's required-field validation.
        expect(formData.has('address')).toBe(false);
        expect(formData.has('description')).toBe(false);
    });

    test('survives a device with no usable storage and preserves clientReportId when supported', async () => {
        // jsdom has no IndexedDB, so this exercises the degradation path: the
        // queue must never throw and must never claim a report was saved.
        const supported = isOfflineQueueSupported();
        const entry = await enqueueReport({
            fields: { address: 'Poblacion' },
            clientReportId: '  custom-idempotency-key  ',
        });

        if (supported) {
            expect(entry).toMatchObject({ clientReportId: 'custom-idempotency-key' });
        } else {
            expect(entry).toBeNull();
        }

        await expect(listQueuedReports()).resolves.toBeInstanceOf(Array);
    });

    test('flushes queued reports sequentially and computes remaining count correctly on mixed results', async () => {
        const originalIndexedDB = globalThis.indexedDB;
        const storeData = new Map();

        const createRequest = (result) => {
            const req = {
                result,
                _onsuccess: null,
                get onsuccess() {
                    return this._onsuccess;
                },
                set onsuccess(fn) {
                    this._onsuccess = fn;
                    if (typeof fn === 'function') {
                        fn();
                    }
                },
            };
            return req;
        };

        const mockStore = {
            put: vi.fn((entry) => {
                storeData.set(entry.clientReportId, entry);
                return createRequest(entry.clientReportId);
            }),
            get: vi.fn((key) => createRequest(storeData.get(key))),
            getAll: vi.fn(() => createRequest(Array.from(storeData.values()))),
            delete: vi.fn((key) => {
                storeData.delete(key);
                return createRequest(undefined);
            }),
            count: vi.fn(() => createRequest(storeData.size)),
            clear: vi.fn(() => {
                storeData.clear();
                return createRequest(undefined);
            }),
        };

        const createTx = () => {
            const tx = {
                objectStore: () => mockStore,
                oncomplete: null,
                onerror: null,
                onabort: null,
            };
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
        };

        const mockDb = {
            objectStoreNames: { contains: () => true },
            transaction: () => createTx(),
        };

        globalThis.indexedDB = {
            open: vi.fn(() => createRequest(mockDb)),
        };

        try {
            await enqueueReport({
                clientReportId: 'rep-success',
                fields: { address: 'Cajidiocan Port' },
            });
            await enqueueReport({
                clientReportId: 'rep-blocked',
                fields: { address: 'Invalid Address' },
            });

            const sendMock = vi.fn(async (formData) => {
                const id = formData.get('clientReportId');
                if (id === 'rep-blocked') {
                    const err = new Error('Bad request');
                    err.response = { status: 400, data: { message: 'Rejected by validation' } };
                    throw err;
                }
                return { success: true };
            });

            const flushResult = await flushQueuedReports(sendMock);

            expect(flushResult.sent).toBe(1);
            expect(flushResult.blocked).toBe(1);
            expect(flushResult.remaining).toBe(1); // Exactly 1 item remains in queue
            expect(storeData.has('rep-success')).toBe(false); // Successfully removed
            expect(storeData.has('rep-blocked')).toBe(true); // Retained for user inspection
            expect(storeData.get('rep-blocked').blockedReason).toBe('Rejected by validation');
        } finally {
            if (originalIndexedDB !== undefined) {
                globalThis.indexedDB = originalIndexedDB;
            } else {
                delete globalThis.indexedDB;
            }
        }
    });

    test('buildQueuedFormData flattens nested object fields and handles empty/null entry safely', () => {
        // Safe when given null or empty
        const emptyFormData = buildQueuedFormData(null);
        expect(emptyFormData).toBeInstanceOf(FormData);
        expect(emptyFormData.has('clientReportId')).toBe(false);

        // Flattens nested objects (like casualties) instead of stringifying to "[object Object]"
        const nestedData = buildQueuedFormData({
            clientReportId: 'rep-nested',
            fields: {
                incidentCategory: 'accident',
                casualties: {
                    injured: 3,
                    fatalities: 1,
                    missing: 0,
                },
            },
        });

        expect(nestedData.get('clientReportId')).toBe('rep-nested');
        expect(nestedData.get('incidentCategory')).toBe('accident');
        expect(nestedData.get('casualties[injured]')).toBe('3');
        expect(nestedData.get('casualties[fatalities]')).toBe('1');
        expect(nestedData.get('casualties[missing]')).toBe('0');
        expect(nestedData.has('casualties')).toBe(false);
    });

    test('supports listQueuedReports, removeQueuedReport, and clearOfflineReportQueue with storage mock', async () => {
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

        const mockStore = {
            put: vi.fn((entry) => {
                storeData.set(entry.clientReportId, entry);
                return createRequest(entry.clientReportId);
            }),
            get: vi.fn((key) => createRequest(storeData.get(key))),
            getAll: vi.fn(() => createRequest(Array.from(storeData.values()))),
            delete: vi.fn((key) => {
                storeData.delete(key);
                return createRequest(undefined);
            }),
            count: vi.fn(() => createRequest(storeData.size)),
            clear: vi.fn(() => {
                storeData.clear();
                return createRequest(undefined);
            }),
        };

        const createTx = () => {
            const tx = {
                objectStore: () => mockStore,
                oncomplete: null,
                onerror: null,
                onabort: null,
            };
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
        };

        globalThis.indexedDB = {
            open: vi.fn(() => createRequest({
                objectStoreNames: { contains: () => true },
                transaction: () => createTx(),
            })),
        };

        try {
            expect(await listQueuedReports()).toEqual([]);

            await enqueueReport({ clientReportId: 'rep-1', fields: { address: 'Site A' } });
            await enqueueReport({ clientReportId: 'rep-2', fields: { address: 'Site B' } });

            expect(await listQueuedReports()).toHaveLength(2);

            const removed = await removeQueuedReport('rep-1');
            expect(removed).toBe(true);
            expect((await listQueuedReports()).map((entry) => entry.clientReportId)).toEqual(['rep-2']);

            const cleared = await clearOfflineReportQueue();
            expect(cleared).toBe(true);
            expect(await listQueuedReports()).toEqual([]);
        } finally {
            if (originalIndexedDB !== undefined) {
                globalThis.indexedDB = originalIndexedDB;
            } else {
                delete globalThis.indexedDB;
            }
        }
    });

    test('flushQueuedReports keeps transient 500 failures in queue and guards against invalid send function', async () => {
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

        const mockStore = {
            put: vi.fn((entry) => {
                storeData.set(entry.clientReportId, entry);
                return createRequest(entry.clientReportId);
            }),
            get: vi.fn((key) => createRequest(storeData.get(key))),
            getAll: vi.fn(() => createRequest(Array.from(storeData.values()))),
            delete: vi.fn((key) => {
                storeData.delete(key);
                return createRequest(undefined);
            }),
            count: vi.fn(() => createRequest(storeData.size)),
            clear: vi.fn(() => {
                storeData.clear();
                return createRequest(undefined);
            }),
        };

        const createTx = () => {
            const tx = {
                objectStore: () => mockStore,
                oncomplete: null,
                onerror: null,
                onabort: null,
            };
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
        };

        globalThis.indexedDB = {
            open: vi.fn(() => createRequest({
                objectStoreNames: { contains: () => true },
                transaction: () => createTx(),
            })),
        };

        try {
            await enqueueReport({ clientReportId: 'rep-transient', fields: { address: 'Transient site' } });

            // Guard against invalid send function
            const noSendResult = await flushQueuedReports(null);
            expect(noSendResult.sent).toBe(0);
            expect(noSendResult.remaining).toBe(1);

            // Transient server 500 error
            const failingSend = vi.fn(async () => {
                const err = new Error('Database temporary connection failure');
                err.response = { status: 500, data: { message: 'Internal Server Error' } };
                throw err;
            });

            const result = await flushQueuedReports(failingSend);
            expect(result.sent).toBe(0);
            expect(result.failed).toBe(1);
            expect(result.blocked).toBe(0);
            expect(result.remaining).toBe(1);

            // Item remains in queue with attempts recorded and blockedReason null
            const item = storeData.get('rep-transient');
            expect(item).toBeDefined();
            expect(item.attempts).toBe(1);
            expect(item.blockedReason).toBeNull();
        } finally {
            if (originalIndexedDB !== undefined) {
                globalThis.indexedDB = originalIndexedDB;
            } else {
                delete globalThis.indexedDB;
            }
        }
    });

    describe('durability of an interrupted submission', () => {
        test('classifies dropped uploads and intermediary answers as retryable', () => {
            // No response at all: the request never left the device.
            expect(classifySubmitFailure(new Error('Network Error'))).toBe('transient');
            // Axios gives up on a stalled upload.
            expect(classifySubmitFailure({ code: 'ECONNABORTED' })).toBe('transient');
            // A router or gateway answering after the upload died.
            expect(classifySubmitFailure({ response: { status: 502 } })).toBe('transient');
            expect(classifySubmitFailure({ response: { status: 503 } })).toBe('transient');
            expect(classifySubmitFailure({ response: { status: 504 } })).toBe('transient');
            expect(classifySubmitFailure({ response: { status: 408 } })).toBe('transient');
            expect(classifySubmitFailure({ response: { status: 429 } })).toBe('transient');
            // An expired session is recoverable; the incident must not be parked.
            expect(classifySubmitFailure({ response: { status: 401 } })).toBe('transient');
            expect(isTransientSubmitFailure({ response: { status: 500 } })).toBe(true);
        });

        test('classifies a content rejection as permanent so it stops retrying', () => {
            expect(classifySubmitFailure({ response: { status: 400 } })).toBe('permanent');
            expect(classifySubmitFailure({ response: { status: 403 } })).toBe('permanent');
            expect(classifySubmitFailure({ response: { status: 413 } })).toBe('permanent');
            expect(classifySubmitFailure({ response: { status: 422 } })).toBe('permanent');
            expect(isTransientSubmitFailure({ response: { status: 422 } })).toBe(false);
        });

        test('defers a report a live submit attempt is still sending, then reclaims it once the lease is stale', async () => {
            const storage = createIndexedDbStub();

            try {
                await enqueueReport({
                    clientReportId: 'rep-inflight',
                    fields: { address: 'Upload in progress' },
                    leased: true,
                });

                const send = vi.fn(async () => ({ success: true }));

                // The queue must not race the request that is already running.
                const duringAttempt = await flushQueuedReports(send);
                expect(send).not.toHaveBeenCalled();
                expect(duringAttempt.deferred).toBe(1);
                expect(duringAttempt.remaining).toBe(1);
                expect(storage.storeData.get('rep-inflight').sendingSince).toEqual(expect.any(Number));

                // The app died mid-upload: the lease ages out and the report is
                // picked up again on a later pass.
                storage.storeData.get('rep-inflight').sendingSince = Date.now() - 130000;

                const afterCrash = await flushQueuedReports(send);
                expect(send).toHaveBeenCalledTimes(1);
                expect(afterCrash.sent).toBe(1);
                expect(afterCrash.deferred).toBe(0);
                expect(storage.storeData.has('rep-inflight')).toBe(false);
            } finally {
                storage.restore();
            }
        });

        test('releases the lease after an interrupted attempt so the report can be retried', async () => {
            const storage = createIndexedDbStub();

            try {
                await enqueueReport({
                    clientReportId: 'rep-release',
                    fields: { address: 'Upload was cut' },
                    leased: true,
                });

                expect(await clearQueuedReportSending('rep-release')).toBe(true);

                const send = vi.fn(async () => ({ success: true }));
                const result = await flushQueuedReports(send);

                expect(result.sent).toBe(1);
                expect(storage.storeData.size).toBe(0);
            } finally {
                storage.restore();
            }
        });

        test('collapses concurrent flushes so a report is uploaded only once', async () => {
            const storage = createIndexedDbStub();

            try {
                await enqueueReport({ clientReportId: 'rep-once', fields: { address: 'Only once' } });

                let releaseSend = null;
                const send = vi.fn(() => new Promise((resolve) => { releaseSend = resolve; }));

                const first = flushQueuedReports(send);
                const second = flushQueuedReports(send);

                // The pass lists the queue before it uploads, so wait for the
                // upload to actually start before letting it finish.
                await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
                releaseSend({ success: true });

                const [firstResult, secondResult] = await Promise.all([first, second]);

                expect(send).toHaveBeenCalledTimes(1);
                expect(secondResult).toEqual(firstResult);
                expect(firstResult.sent).toBe(1);
            } finally {
                storage.restore();
            }
        });

        test('notifies subscribers on queue changes but never on a failed attempt counter', async () => {
            const storage = createIndexedDbStub();
            const listener = vi.fn();
            const unsubscribe = subscribeToQueueChanges(listener);

            try {
                await enqueueReport({ clientReportId: 'rep-notify', fields: { address: 'Notify me' } });
                expect(listener).toHaveBeenCalledTimes(1);

                const failingSend = vi.fn(async () => {
                    throw new Error('Network Error');
                });
                await flushQueuedReports(failingSend);

                // Waking the hook here would start another upload immediately,
                // which is how a weak link turns into a retry storm.
                expect(listener).toHaveBeenCalledTimes(1);

                await removeQueuedReport('rep-notify');
                expect(listener).toHaveBeenCalledTimes(2);
            } finally {
                unsubscribe();
                storage.restore();
            }
        });
    });

    describe('queue ownership', () => {
        test('records the filing reporter and refuses to deliver for anyone else', async () => {
            const storage = createIndexedDbStub();

            try {
                await enqueueReport({
                    clientReportId: 'rep-owned',
                    fields: { address: 'Owned' },
                    reporterId: 'reporter-a',
                });

                const send = vi.fn(async () => ({ success: true }));

                // A different account signed in on this device (an admin, say):
                // sending would collect a 403 and park the report as blocked.
                const otherSession = await flushQueuedReports(send, { reporterId: 'admin-b' });
                expect(send).not.toHaveBeenCalled();
                expect(otherSession.foreign).toBe(1);
                expect(otherSession.remaining).toBe(0);
                expect(otherSession.deliverableRemaining).toBe(0);
                expect(storage.storeData.has('rep-owned')).toBe(true);

                const ownerSession = await flushQueuedReports(send, { reporterId: 'reporter-a' });
                expect(send).toHaveBeenCalledTimes(1);
                expect(ownerSession.sent).toBe(1);
                expect(storage.storeData.has('rep-owned')).toBe(false);
            } finally {
                storage.restore();
            }
        });

        test('adopts an entry stored by an older build rather than stranding it', async () => {
            const storage = createIndexedDbStub();

            try {
                // No reporterId: staged before owner binding existed.
                await enqueueReport({ clientReportId: 'rep-legacy', fields: { address: 'Legacy' } });

                const send = vi.fn(async () => ({ success: true }));
                const result = await flushQueuedReports(send, { reporterId: 'reporter-a' });

                expect(result.sent).toBe(1);
                expect(result.foreign).toBe(0);
            } finally {
                storage.restore();
            }
        });

        test('partitions entries by what this session can act on, without returning foreign ones', () => {
            const partition = partitionQueuedReports([
                { clientReportId: 'mine', reporterId: 'reporter-a', fields: {} },
                { clientReportId: 'blocked', reporterId: 'reporter-a', blockedReason: 'Nope' },
                { clientReportId: 'held', reporterId: 'reporter-a', sendingSince: Date.now() },
                { clientReportId: 'theirs', reporterId: 'reporter-b', fields: { address: 'Secret' } },
                null,
            ], { reporterId: 'reporter-a' });

            expect(partition.deliverable.map((entry) => entry.clientReportId)).toEqual(['mine']);
            expect(partition.blocked.map((entry) => entry.clientReportId)).toEqual(['blocked']);
            expect(partition.deferred.map((entry) => entry.clientReportId)).toEqual(['held']);
            expect(partition.foreignCount).toBe(1);
        });
    });

    describe('a report the queue cannot deliver on its own', () => {
        test('marks a possible duplicate as needing the reporter, and stops the retry loop', async () => {
            const storage = createIndexedDbStub();

            try {
                await enqueueReport({
                    clientReportId: 'rep-dupe',
                    fields: { address: 'Same corner' },
                    reporterId: 'reporter-a',
                });

                const send = vi.fn(async () => {
                    const error = new Error('Possible duplicate');
                    error.response = {
                        status: 409,
                        data: {
                            code: POSSIBLE_DUPLICATE_CODE,
                            message: 'A similar incident was already reported nearby.',
                        },
                    };
                    throw error;
                });

                const result = await flushQueuedReports(send, { reporterId: 'reporter-a' });

                expect(result.blocked).toBe(1);
                expect(result.remaining).toBe(1);
                // Nothing left that a later pass could deliver, so the hook must
                // not keep waking up for it.
                expect(result.deliverableRemaining).toBe(0);

                const [stored] = await listQueuedReports();
                expect(stored.blockedCode).toBe(QUEUE_BLOCKED_CODES.duplicate);
                expect(stored.blockedReason).toBe('A similar incident was already reported nearby.');

                // The reporter answers the question the queue could not.
                const listener = vi.fn();
                const unsubscribe = subscribeToQueueChanges(listener);
                expect(await resolveBlockedQueuedReport('rep-dupe', { confirmDistinct: true })).toBe(true);
                expect(listener).toHaveBeenCalledTimes(1);
                unsubscribe();

                const [cleared] = await listQueuedReports();
                expect(cleared.blockedReason).toBeNull();
                expect(cleared.blockedCode).toBeNull();
                expect(cleared.fields.confirmDistinct).toBe('true');

                // And the resend then goes out on the next pass.
                const sending = vi.fn(async () => ({ success: true }));
                const afterResolve = await flushQueuedReports(sending, { reporterId: 'reporter-a' });
                expect(afterResolve.sent).toBe(1);
            } finally {
                storage.restore();
            }
        });

        test('reports a rejection without a body in words the reporter can read', () => {
            expect(describeSubmitFailure({ response: { status: 400, data: {} } })).toEqual({
                blockedReason: 'Rejected by the server',
                blockedCode: QUEUE_BLOCKED_CODES.rejected,
            });
            expect(describeSubmitFailure({ response: { status: 403, data: { message: 'Access denied' } } })).toEqual({
                blockedReason: 'Access denied',
                blockedCode: QUEUE_BLOCKED_CODES.rejected,
            });
        });

        test('leaves a report that is gone from the queue alone', async () => {
            const storage = createIndexedDbStub();

            try {
                expect(await resolveBlockedQueuedReport('never-stored')).toBe(false);
            } finally {
                storage.restore();
            }
        });
    });
});
