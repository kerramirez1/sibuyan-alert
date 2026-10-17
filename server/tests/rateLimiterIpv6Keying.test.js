import { describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { reportCreationLimiter } = await import('../middleware/rateLimiter.js');

/**
 * express-rate-limit validates a custom keyGenerator by inspecting its source
 * text. `report-ip:${req.ip}` tripped ERR_ERL_KEY_GEN_IPV6: besides the log
 * noise (two stack traces per boot), the fallback keyed IPv6 clients by full
 * address, so a client controlling a /64 could rotate addresses inside it and
 * get a fresh budget per address.
 *
 * These tests exercise the unauthenticated fallback directly — in production
 * both limiters sit behind `protect`, so this path is defensive, but it is the
 * path the validation error was about.
 *
 * NOTE: reportCreationLimiter is a module singleton with one in-memory store,
 * so the tests below deliberately use disjoint address blocks — otherwise each
 * test would spend the previous test's budget.
 */
describe('reportCreationLimiter IPv6 keying', () => {
    const buildApp = () => {
        const app = express();
        // Production sets `app.set('trust proxy', 1)` in server.js (Heroku
        // terminates TLS at its router), so X-Forwarded-For is honoured.
        app.set('trust proxy', 1);
        app.post('/reports', reportCreationLimiter, (_req, res) => res.json({ ok: true }));
        return app;
    };

    test('IPv6 addresses in the same /56 share one budget', async () => {
        const app = buildApp();

        for (let i = 0; i < 10; i++) {
            const res = await request(app)
                .post('/reports')
                .set('X-Forwarded-For', '2001:db8:abcd:1234::1');
            expect(res.status).toBe(200);
        }

        // Same /56, different host — before the fix this had its own key and
        // was accepted; now it must hit the same budget.
        const limited = await request(app)
            .post('/reports')
            .set('X-Forwarded-For', '2001:db8:abcd:1234::9999');
        expect(limited.status).toBe(429);
    });

    test('a different /56 keeps its own budget', async () => {
        const app = buildApp();

        const res = await request(app)
            .post('/reports')
            .set('X-Forwarded-For', '2001:db8:abcd:9900::1');
        expect(res.status).toBe(200);
    });

    test('IPv4-mapped IPv6 shares the IPv4 budget', async () => {
        const app = buildApp();

        for (let i = 0; i < 10; i++) {
            const res = await request(app)
                .post('/reports')
                .set('X-Forwarded-For', '198.51.100.23');
            expect(res.status).toBe(200);
        }

        // ipKeyGenerator unwraps ::ffff: to the plain IPv4 address, so this is
        // the same key as the ten requests above.
        const limited = await request(app)
            .post('/reports')
            .set('X-Forwarded-For', '::ffff:198.51.100.23');
        expect(limited.status).toBe(429);
    });
});

describe('rateLimiter module import', () => {
    test('does not emit ERR_ERL_KEY_GEN_IPV6 at import', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // The top-level import in this file already ran before the spy was
        // installed, so the module has to re-execute against it.
        vi.resetModules();
        await import('../middleware/rateLimiter.js');

        const hasViolation = errorSpy.mock.calls.flat().some((arg) => {
            if (arg?.code === 'ERR_ERL_KEY_GEN_IPV6') return true;
            return String(arg?.message ?? arg).includes('ERR_ERL_KEY_GEN_IPV6');
        });
        expect(hasViolation).toBe(false);
        errorSpy.mockRestore();
    });
});
