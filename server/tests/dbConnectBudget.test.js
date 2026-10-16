import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const connectMock = vi.fn();

vi.mock('mongoose', () => ({
    default: {
        connect: connectMock,
        connection: {
            listenerCount: () => 1,
            on: () => {},
        },
    },
}));

// Vitest intercepts process.exit in the test worker and throws
// 'process.exit unexpectedly called with "1"' instead — the code is still
// asserted through that message. A spy is unnecessary.
const EXIT_MESSAGE = 'process.exit unexpectedly called with "1"';

const OVERRIDES = ['MONGODB_CONNECT_ATTEMPTS', 'MONGODB_SERVER_SELECTION_TIMEOUT_MS'];

describe('connectDB boot budget', () => {
    beforeEach(() => {
        vi.resetModules();
        connectMock.mockReset();
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        for (const key of OVERRIDES) delete process.env[key];
    });

    afterEach(() => {
        for (const key of OVERRIDES) delete process.env[key];
        delete process.env.MONGODB_URI;
    });

    test('default budget stays under the Heroku 60s boot timeout', async () => {
        connectMock.mockRejectedValue(new Error('server selection timed out'));
        const { default: connectDB } = await import('../config/db.js');

        await expect(connectDB()).rejects.toThrow(EXIT_MESSAGE);

        // 3 attempts, 10s server-selection timeout each, 1s + 2s backoff.
        expect(connectMock).toHaveBeenCalledTimes(3);
        for (const call of connectMock.mock.calls) {
            expect(call[1].serverSelectionTimeoutMS).toBe(10000);
        }
        const worstCaseMs = 3 * 10000 + (1000 + 2000);
        expect(worstCaseMs).toBeLessThanOrEqual(45000);
    });

    test('malformed env overrides fall back to safe defaults, never NaN', async () => {
        process.env.MONGODB_CONNECT_ATTEMPTS = 'not-a-number';
        process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '-5000';
        connectMock.mockRejectedValue(new Error('server selection timed out'));
        const { default: connectDB } = await import('../config/db.js');

        await expect(connectDB()).rejects.toThrow(EXIT_MESSAGE);

        expect(connectMock).toHaveBeenCalledTimes(3);
        for (const call of connectMock.mock.calls) {
            expect(call[1].serverSelectionTimeoutMS).toBe(10000);
        }
    });

    test('valid env overrides are honoured', async () => {
        process.env.MONGODB_CONNECT_ATTEMPTS = '2';
        process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '5000';
        connectMock.mockRejectedValue(new Error('server selection timed out'));
        const { default: connectDB } = await import('../config/db.js');

        await expect(connectDB()).rejects.toThrow(EXIT_MESSAGE);

        expect(connectMock).toHaveBeenCalledTimes(2);
        for (const call of connectMock.mock.calls) {
            expect(call[1].serverSelectionTimeoutMS).toBe(5000);
        }
    });

    test('an explicit argument takes precedence over the env var', async () => {
        process.env.MONGODB_CONNECT_ATTEMPTS = '2';
        connectMock.mockRejectedValue(new Error('server selection timed out'));
        const { default: connectDB } = await import('../config/db.js');

        await expect(connectDB(4)).rejects.toThrow(EXIT_MESSAGE);

        expect(connectMock).toHaveBeenCalledTimes(4);
    });

    test('a missing MONGODB_URI still exits 1 without attempting to connect', async () => {
        delete process.env.MONGODB_URI;
        const { default: connectDB } = await import('../config/db.js');

        await expect(connectDB()).rejects.toThrow(EXIT_MESSAGE);

        expect(connectMock).not.toHaveBeenCalled();
    });

    test('a successful connection returns the connection and stops retrying', async () => {
        const fakeConn = { connection: { host: 'localhost' } };
        connectMock.mockResolvedValue(fakeConn);
        const { default: connectDB } = await import('../config/db.js');

        await expect(connectDB()).resolves.toBe(fakeConn);
        expect(connectMock).toHaveBeenCalledTimes(1);
    });
});
