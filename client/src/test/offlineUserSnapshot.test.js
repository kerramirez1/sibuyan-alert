import { beforeEach, describe, expect, test } from 'vitest';
import {
    OFFLINE_SNAPSHOT_TTL_MS,
    OFFLINE_USER_KEY,
    clearOfflineSnapshot,
    readOfflineSnapshot,
    writeOfflineSnapshot,
} from '../utils/offlineUserSnapshot';

const reporter = {
    id: 'reporter-1',
    role: 'reporter',
    name: 'Juan Dela Cruz',
    verificationStatus: 'approved',
};

describe('offlineUserSnapshot', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('round-trips a reporter snapshot with identity claims only', () => {
        writeOfflineSnapshot(reporter);

        const snapshot = readOfflineSnapshot();
        expect(snapshot).toMatchObject({
            id: 'reporter-1',
            role: 'reporter',
            name: 'Juan Dela Cruz',
            reporterVerificationStatus: 'approved',
        });
        expect(Object.keys(snapshot).sort()).toEqual(
            ['id', 'name', 'reporterVerificationStatus', 'role', 'savedAt'],
        );
    });

    test('does not store a snapshot for non-reporter roles', () => {
        writeOfflineSnapshot({ ...reporter, role: 'municipal_admin' });

        expect(window.localStorage.getItem(OFFLINE_USER_KEY)).toBeNull();
        expect(readOfflineSnapshot()).toBeNull();
    });

    test('writing a non-reporter clears a stale reporter snapshot', () => {
        writeOfflineSnapshot(reporter);
        writeOfflineSnapshot({ ...reporter, role: 'responder' });

        expect(readOfflineSnapshot()).toBeNull();
    });

    test('rejects snapshots older than the TTL', () => {
        writeOfflineSnapshot(reporter);
        const raw = JSON.parse(window.localStorage.getItem(OFFLINE_USER_KEY));
        raw.savedAt = Date.now() - OFFLINE_SNAPSHOT_TTL_MS - 1000;
        window.localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(raw));

        expect(readOfflineSnapshot()).toBeNull();
    });

    test('rejects corrupt or malformed snapshots', () => {
        window.localStorage.setItem(OFFLINE_USER_KEY, '{not-json');
        expect(readOfflineSnapshot()).toBeNull();

        window.localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({ role: 'reporter' }));
        expect(readOfflineSnapshot()).toBeNull();

        window.localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({ id: 'x', role: 'reporter' }));
        expect(readOfflineSnapshot()).toBeNull();
    });

    test('clearOfflineSnapshot removes the snapshot', () => {
        writeOfflineSnapshot(reporter);
        clearOfflineSnapshot();

        expect(window.localStorage.getItem(OFFLINE_USER_KEY)).toBeNull();
    });
});
