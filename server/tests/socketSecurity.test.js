import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { io as clientIO } from 'socket.io-client';

/**
 * P2-1 (helmet) and P2-2 (socket handshake auth).
 *
 * server.js does not auto-listen under NODE_ENV=test, so the suite binds the
 * real httpServer (with the real middleware chain and io instance) to an
 * ephemeral port.
 */

const { default: app, httpServer } = await import('../server.js');

let port;

beforeAll(async () => {
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
});

afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
});

describe('P2-1 helmet security headers', () => {
    test('helmet defaults are present and manual choices win conflicts', async () => {
        const res = await request(app).get('/api/health');

        // From helmet (CSP-less defaults).
        expect(res.headers['x-powered-by']).toBeUndefined();
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
        expect(res.headers['x-download-options']).toBe('noopen');
        expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
        // Helmet would set no-referrer / SAMEORIGIN / its own HSTS, but the
        // pre-existing manual middleware (registered after helmet) wins:
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
        // HSTS stays production-only, exactly as before.
        if (process.env.NODE_ENV === 'production') {
            expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
        } else {
            expect(res.headers['strict-transport-security']).toBeUndefined();
        }
        // No CSP: excluded deliberately (Vite inline chunks, map workers).
        expect(res.headers['content-security-policy']).toBeUndefined();
    });
});

describe('P2-2 socket handshake auth', () => {
    test('unauthenticated socket connect is rejected immediately', async () => {
        const socket = clientIO(`http://localhost:${port}`, {
            reconnection: false,
            timeout: 5000,
            transports: ['websocket'],
        });

        const outcome = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve('timeout'), 8000);
            socket.on('connect', () => {
                clearTimeout(timer);
                resolve('connected');
            });
            socket.on('connect_error', (error) => {
                clearTimeout(timer);
                resolve(`rejected:${error?.message || 'unknown'}`);
            });
        });
        socket.disconnect();

        expect(outcome).toMatch(/^rejected:/);
        expect(outcome).not.toBe('connected');
    }, 15000);
});
