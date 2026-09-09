/**
 * Horizontal-scaling guards and shared-store wiring.
 *
 * MVP runs on a single web dyno with in-process rate limits and Socket.IO
 * rooms. When REDIS_URL is set, rate limiting uses a shared Redis store and
 * Socket.IO uses the Redis adapter so multiple dynos/processes stay
 * consistent. Without REDIS_URL, multi-process mode fails fast instead of
 * silently diverging.
 */

export const getWebConcurrency = (env = process.env) => {
    const value = Number.parseInt(env.WEB_CONCURRENCY, 10);
    return Number.isInteger(value) && value > 0 ? value : 1;
};

export const hasSharedStore = (env = process.env) => Boolean(env.REDIS_URL?.trim());

export const requiresSharedStore = (env = process.env) => getWebConcurrency(env) > 1;

/** Throws in production when scaling out without a shared store. */
export const assertScalingConfig = (env = process.env) => {
    if (env.NODE_ENV === 'production' && requiresSharedStore(env) && !hasSharedStore(env)) {
        throw new Error('WEB_CONCURRENCY > 1 requires REDIS_URL for shared rate-limit/socket state');
    }
};

/**
 * Attach the Socket.IO Redis adapter when REDIS_URL is configured.
 * Uses dynamic imports so memory mode works without the optional
 * `redis` / `@socket.io/redis-adapter` packages installed.
 */
export const attachSocketRedisAdapter = async (io, env = process.env) => {
    if (!hasSharedStore(env)) return { attached: false, mode: 'memory' };
    let createAdapter;
    let createClient;
    try {
        ({ createAdapter } = await import('@socket.io/redis-adapter'));
        ({ createClient } = await import('redis'));
    } catch {
        throw new Error('REDIS_URL is set but optional packages are missing: npm install redis @socket.io/redis-adapter --workspace=sibuyan-accident-alert-server');
    }
    const pubClient = createClient({ url: env.REDIS_URL.trim() });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (error) => console.error('❌ Redis pub client error:', error.message));
    subClient.on('error', (error) => console.error('❌ Redis sub client error:', error.message));
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔗 Socket.IO Redis adapter attached (multi-dyno realtime enabled)');
    return { attached: true, mode: 'redis' };
};

export default { getWebConcurrency, hasSharedStore, requiresSharedStore, assertScalingConfig, attachSocketRedisAdapter };
