/**
 * Behaviour this file protects: the production client-build check must run
 * inside startServer()'s error path, not at module scope.
 *
 * configureProductionClient() throws when client/dist/index.html is missing.
 * Called at module scope that throw surfaced as a raw uncaught exception
 * before registerCrashHandlers() ran, with no clear boot message. Inside
 * startServer() the same throw reaches the normal boot error handling
 * ("Failed to start server: ...").
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const configureProductionClientMock = vi.fn(() => false);

vi.mock('../config/clientApp.js', () => ({
    configureProductionClient: configureProductionClientMock,
    defaultClientDistPath: '/nonexistent-client-dist',
    default: configureProductionClientMock,
}));

describe('server boot: production client check placement', () => {
    beforeEach(() => {
        vi.resetModules();
        configureProductionClientMock.mockClear();
    });

    test('importing server.js does not run the client-build check at module scope', async () => {
        // NODE_ENV=test keeps the auto-start guard off; the import must be
        // side-effect free with respect to the client check either way.
        await import('../server.js');

        expect(configureProductionClientMock).not.toHaveBeenCalled();
    });
});
