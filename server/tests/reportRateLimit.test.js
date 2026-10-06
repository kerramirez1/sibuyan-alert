import { describe, expect, test } from 'vitest';
import express from 'express';
import request from 'supertest';

const { reportCreationLimiter } = await import('../middleware/rateLimiter.js');

/**
 * P2-3: the report creation limiter is keyed by authenticated user id, not
 * by IP — field reporters share carrier NAT IPs, so an IP-keyed budget
 * would let one heavy user starve everyone else behind the same address.
 */
describe('reportCreationLimiter user keying (P2-3)', () => {
    const buildApp = () => {
        const app = express();
        // Stand-in for the `protect` middleware: the user id under test rides
        // on a header so each request can impersonate a different account.
        app.use((req, _res, next) => {
            const userId = req.headers['x-test-user-id'];
            if (userId) req.user = { _id: userId };
            next();
        });
        app.post('/reports', reportCreationLimiter, (_req, res) => res.json({ ok: true }));
        return app;
    };

    test('caps a single user at 10 reports per 10 minutes', async () => {
        const app = buildApp();
        for (let i = 0; i < 10; i++) {
            const res = await request(app).post('/reports').set('x-test-user-id', 'user-A');
            expect(res.status).toBe(200);
        }
        const limited = await request(app).post('/reports').set('x-test-user-id', 'user-A');
        expect(limited.status).toBe(429);
    });

    test('20 users behind one NAT IP are each accepted (no cross-user starvation)', async () => {
        const app = buildApp();
        // All supertest requests share 127.0.0.1 — the NAT scenario.
        for (let u = 0; u < 20; u++) {
            const res = await request(app).post('/reports').set('x-test-user-id', `nat-user-${u}`);
            expect(res.status).toBe(200);
        }
    });

    test('unauthenticated callers still get an IP-keyed budget', async () => {
        const app = buildApp();
        for (let i = 0; i < 10; i++) {
            const res = await request(app).post('/reports');
            expect(res.status).toBe(200);
        }
        const limited = await request(app).post('/reports');
        expect(limited.status).toBe(429);
    });
});
