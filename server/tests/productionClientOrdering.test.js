/**
 * Regression test for the production-only routing bug.
 *
 * server.js used to call configureProductionClient(app) inside startServer(),
 * i.e. AFTER the terminal 404 handler had already been registered at module
 * scope. Express matches layers in registration order and that 404 never calls
 * next(), so express.static and the SPA fallback were unreachable: every page
 * load in production answered with {"message":"Route not found"} instead of the
 * SPA shell.
 *
 * The app below is assembled in the exact order server.js now uses — client
 * layers first, then the API 404, then the terminal 404 — because the ordering
 * IS the behaviour under test. The contract of registerProductionClient() is
 * already covered by clientApp.test.js; this file covers the call-site order
 * that no unit test of that function alone can prove.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import { registerProductionClient } from '../config/clientApp.js';

describe('production middleware ordering', () => {
    let distPath;

    const buildApp = () => {
        const app = express();
        // Registration first — at module scope in the real server.
        registerProductionClient(app, { nodeEnv: 'production', distPath });
        app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));
        // Terminal 404, exactly as server.js registers it.
        app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
        return app;
    };

    beforeAll(async () => {
        distPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sibuyan-client-order-'));
        await fs.mkdir(path.join(distPath, 'assets'));
        await fs.writeFile(
            path.join(distPath, 'index.html'),
            '<!doctype html><html><body><div id="root">Sibuyan Alert</div></body></html>'
        );
        await fs.writeFile(path.join(distPath, 'assets', 'app-abc123.js'), 'console.log("ready")');
    });

    afterAll(async () => {
        await fs.rm(distPath, { recursive: true, force: true });
    });

    test('client routes reach the SPA instead of the terminal 404', async () => {
        const response = await request(buildApp())
            .get('/login')
            .set('Accept', 'text/html');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Sibuyan Alert');
        expect(response.headers['cache-control']).toBe('no-store');
    });

    test('hashed assets are still served statically', async () => {
        const response = await request(buildApp()).get('/assets/app-abc123.js');

        expect(response.status).toBe(200);
    });

    test('unknown API paths stay JSON and never fall through to the SPA', async () => {
        const response = await request(buildApp())
            .get('/api/not-real')
            .set('Accept', 'text/html');

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('API route not found');
    });
});
