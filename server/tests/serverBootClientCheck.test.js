/**
 * Behaviour this file protects: the production client-build check must run
 * inside startServer()'s error path, not at module scope — while registration
 * of the static layer and SPA fallback must happen at module scope, before the
 * terminal 404 handler.
 *
 * assertProductionClientBuild() throws when client/dist/index.html is missing.
 * Called at module scope that throw would surface as a raw uncaught exception
 * before registerCrashHandlers() ran, with no clear boot message. Inside
 * startServer() the same throw reaches the normal boot error handling
 * ("Failed to start server: ...").
 *
 * registerProductionClient() is the opposite half: it never throws, and it has
 * to be registered before the 404 handler or Express answers every page load
 * with JSON 404 in production.
 *
 * Two constraints shape how this file imports server.js:
 *
 * 1. The import loads the whole route/model graph and takes several seconds
 *    under Vitest, past the 10s default, so it gets an explicit timeout.
 * 2. server.js can only be evaluated once per module registry: `mongoose` is
 *    externalized, so vi.resetModules() gives the models a fresh module but
 *    NOT a fresh mongoose instance — a second import re-registers `User` and
 *    throws OverwriteModelError. The import therefore happens once, in
 *    beforeAll.
 *
 * Because vitest.config.js sets `clearMocks: true`, call records are wiped
 * before every test, so the module-scope call counts are captured immediately
 * after the import and asserted from the snapshot.
 */
import { beforeAll, describe, expect, test, vi } from 'vitest';

const configureProductionClientMock = vi.fn(() => false);
const registerProductionClientMock = vi.fn(() => false);
const assertProductionClientBuildMock = vi.fn(() => false);

vi.mock('../config/clientApp.js', () => ({
    configureProductionClient: configureProductionClientMock,
    registerProductionClient: registerProductionClientMock,
    assertProductionClientBuild: assertProductionClientBuildMock,
    defaultClientDistPath: '/nonexistent-client-dist',
    default: configureProductionClientMock,
}));

describe('server boot: production client check placement', () => {
    const moduleScopeCalls = { register: 0, assert: 0, configure: 0 };

    beforeAll(async () => {
        await import('../server.js');
        moduleScopeCalls.register = registerProductionClientMock.mock.calls.length;
        moduleScopeCalls.assert = assertProductionClientBuildMock.mock.calls.length;
        moduleScopeCalls.configure = configureProductionClientMock.mock.calls.length;
    }, 60_000);

    test('importing server.js does not run the client-build check at module scope', () => {
        // NODE_ENV=test keeps the auto-start guard off; the import must be
        // side-effect free with respect to the client check either way.
        expect(moduleScopeCalls.configure).toBe(0);
        // The throwing half must not run at module scope either — this is the
        // invariant that keeps a missing build on the boot error path.
        expect(moduleScopeCalls.assert).toBe(0);
    });

    test('registers the production client layers at module scope', () => {
        expect(moduleScopeCalls.register).toBeGreaterThan(0);
    });
});
