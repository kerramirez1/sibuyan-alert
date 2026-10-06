import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * P1-4 (graceful shutdown) and P1-5 (crash policy).
 *
 * server.js only auto-registers these when NODE_ENV !== 'test', so the tests
 * import the module (no boot, no handlers) and drive the exported
 * registration functions directly. process.exit is stubbed so the assertions
 * observe the exit code without killing the runner.
 */

const withIsolatedProcessListeners = async (event, run) => {
    // Vitest installs its own uncaughtException/unhandledRejection listeners;
    // stash them so a deliberate emit does not fail the run, then restore.
    const stashed = process.listeners(event).slice();
    for (const listener of stashed) process.removeListener(event, listener);
    try {
        await run();
    } finally {
        for (const listener of process.listeners(event).slice()) {
            process.removeListener(event, listener);
        }
        for (const listener of stashed) process.on(event, listener);
    }
};

describe('process lifecycle: graceful shutdown (P1-4) and crash policy (P1-5)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('SIGTERM triggers graceful shutdown ending in exit(0)', async () => {
        const { registerShutdownHandlers } = await import('../server.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
        const before = process.listeners('SIGTERM').slice();
        try {
            registerShutdownHandlers();
            process.emit('SIGTERM');

            const deadline = Date.now() + 10000;
            while (!exitSpy.mock.calls.length && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            expect(exitSpy).toHaveBeenCalledWith(0);
        } finally {
            for (const listener of process.listeners('SIGTERM').slice()) {
                if (!before.includes(listener)) process.removeListener('SIGTERM', listener);
            }
            for (const listener of process.listeners('SIGINT').slice()) {
                process.removeListener('SIGINT', listener);
            }
            exitSpy.mockRestore();
        }
    }, 15000);

    test('uncaughtException logs and exits 1 (no serving from corrupted state)', async () => {
        const { registerCrashHandlers } = await import('../server.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
        try {
            await withIsolatedProcessListeners('uncaughtException', async () => {
                registerCrashHandlers();
                process.emit('uncaughtException', new Error('boom'));
                expect(exitSpy).toHaveBeenCalledWith(1);
            });
        } finally {
            exitSpy.mockRestore();
        }
    });

    test('unhandledRejection logs and exits 1', async () => {
        const { registerCrashHandlers } = await import('../server.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
        try {
            await withIsolatedProcessListeners('unhandledRejection', async () => {
                registerCrashHandlers();
                process.emit('unhandledRejection', new Error('rejected-boom'));
                expect(exitSpy).toHaveBeenCalledWith(1);
            });
        } finally {
            exitSpy.mockRestore();
        }
    });
});
