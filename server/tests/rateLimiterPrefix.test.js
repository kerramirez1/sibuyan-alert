import { Module } from 'node:module';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * The middleware loads its optional packages via createRequire, which
 * bypasses vitest's mock registry — so this suite hooks Module._load
 * instead. The REAL RedisStore class is used (subclassed only to capture
 * instances), so express-rate-limit's own unsharedStore validation runs
 * for real against the module's wiring.
 */
const createdStores = [];
const issuedCommands = [];
let RealRedisStore = null;

const installRequireHook = ({ redisAvailable = true } = {}) => {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'redis') {
            if (!redisAvailable) throw new Error("Cannot find module 'redis'");
            return {
                createClient: () => ({
                    on: () => {},
                    // Resolved: the fire-and-forget connect() must never hang
                    // the test process on a reconnect loop.
                    connect: () => Promise.resolve(),
                    // RedisStore's constructor fires two un-awaited SCRIPT LOAD
                    // calls and requires a string SHA in reply; anything else
                    // rejects with "unexpected reply from redis client" and
                    // surfaces as an unhandled rejection. Reply with the shapes
                    // the real client returns:
                    //   SCRIPT LOAD -> SHA string
                    //   EVALSHA     -> [hits, ttlMs] (parsed by parseScriptResponse)
                    // The wrapper in rateLimiter.js passes the command as ONE
                    // array arg: (...args) => client.sendCommand(args).
                    sendCommand: (commandArgs) => {
                        issuedCommands.push(commandArgs);
                        const [command] = Array.isArray(commandArgs) ? commandArgs : [];
                        if (command === 'SCRIPT') return Promise.resolve('a'.repeat(40));
                        if (command === 'EVALSHA') return Promise.resolve([1, 60_000]);
                        return Promise.resolve(null);
                    },
                }),
            };
        }
        if (request === 'rate-limit-redis') {
            if (!redisAvailable) throw new Error("Cannot find module 'rate-limit-redis'");
            if (!RealRedisStore) {
                RealRedisStore = originalLoad.call(this, request, parent, isMain).RedisStore;
            }
            const CapturingRedisStore = class extends RealRedisStore {
                constructor(options) {
                    super(options);
                    createdStores.push(this);
                }
            };
            return { RedisStore: CapturingRedisStore, default: CapturingRedisStore };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    return () => {
        Module._load = originalLoad;
    };
};

const LIMITER_NAMES = [
    'authLimiter',
    'passwordResetLimiter',
    'reportCreationLimiter',
    'reportEvidenceLimiter',
    'locationLookupLimiter',
    'viewLimiter',
    'searchLimiter',
    'analyticsLimiter',
    'pushSubscriptionLimiter',
];

const EXPECTED_PREFIXES = [
    'rl:auth:',
    'rl:pwreset:',
    'rl:report:',
    'rl:evidence:',
    'rl:geocode:',
    'rl:view:',
    'rl:search:',
    'rl:analytics:',
    'rl:pushsub:',
];

describe('rate limiter Redis store isolation', () => {
    let restoreHook = null;

    beforeEach(() => {
        vi.resetModules();
        createdStores.length = 0;
        issuedCommands.length = 0;
        restoreHook = installRequireHook();
    });

    afterEach(() => {
        if (restoreHook) restoreHook();
        restoreHook = null;
        delete process.env.REDIS_URL;
    });

    test('each limiter gets its own RedisStore with a unique prefix when REDIS_URL is set', async () => {
        process.env.REDIS_URL = 'redis://localhost:6379';

        // The import itself would throw ERR_ERL_STORE_REUSE if any store
        // instance were shared between limiters.
        const limiters = await import('../middleware/rateLimiter.js');

        for (const name of LIMITER_NAMES) {
            expect(typeof limiters[name], name).toBe('function');
        }
        expect(createdStores).toHaveLength(9);
        const prefixes = createdStores.map((store) => store.prefix);
        expect(new Set(prefixes).size).toBe(9);
        expect([...prefixes].sort()).toEqual([...EXPECTED_PREFIXES].sort());
    });

    test('the fake client answers SCRIPT LOAD so RedisStore settles', async () => {
        process.env.REDIS_URL = 'redis://localhost:6379';

        await import('../middleware/rateLimiter.js');

        const scriptLoads = issuedCommands.filter(
            (args) => Array.isArray(args) && args[0] === 'SCRIPT' && args[1] === 'LOAD'
        );
        // Two per store: the increment script and the get script.
        expect(scriptLoads).toHaveLength(createdStores.length * 2);
    });

    test('no store is constructed when REDIS_URL is unset (in-memory limiters)', async () => {
        const limiters = await import('../middleware/rateLimiter.js');

        for (const name of LIMITER_NAMES) {
            expect(typeof limiters[name], name).toBe('function');
        }
        expect(createdStores).toHaveLength(0);
    });

    test('throws a clear error when REDIS_URL is set but the packages are missing', async () => {
        restoreHook();
        restoreHook = installRequireHook({ redisAvailable: false });
        vi.resetModules();
        process.env.REDIS_URL = 'redis://localhost:6379';

        await expect(import('../middleware/rateLimiter.js')).rejects.toThrow(
            'REDIS_URL is set but optional packages are missing'
        );
    });
});
