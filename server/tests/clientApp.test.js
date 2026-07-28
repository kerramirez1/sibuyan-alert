import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { configureProductionClient } from '../config/clientApp.js';

describe('combined production client hosting', () => {
    let distPath;

    beforeAll(async () => {
        distPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sibuyan-client-dist-'));
        await fs.mkdir(path.join(distPath, 'assets'));
        await fs.writeFile(
            path.join(distPath, 'index.html'),
            '<!doctype html><html><body><div id="root">Sibuyan Alert</div></body></html>'
        );
        await fs.writeFile(path.join(distPath, 'assets', 'app-abc123.js'), 'console.log("ready")');
        await fs.writeFile(path.join(distPath, 'sw.js'), 'self.addEventListener("push", () => {})');
    });

    afterAll(async () => {
        await fs.rm(distPath, { recursive: true, force: true });
    });

    test('is disabled outside production', () => {
        const app = express();
        expect(configureProductionClient(app, {
            nodeEnv: 'development',
            distPath: 'does-not-exist',
        })).toBe(false);
    });

    test('fails fast when the production client build is missing', () => {
        const app = express();
        expect(() => configureProductionClient(app, {
            nodeEnv: 'production',
            distPath: path.join(distPath, 'missing'),
        })).toThrow('Production client build is missing');
    });

    test('serves the SPA shell for client routes without caching the HTML', async () => {
        const app = express();
        configureProductionClient(app, { nodeEnv: 'production', distPath });

        const response = await request(app)
            .get('/admin/reports?status=pending')
            .set('Accept', 'text/html');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Sibuyan Alert');
        expect(response.headers['cache-control']).toBe('no-store');
    });

    test('serves hashed assets with immutable caching', async () => {
        const app = express();
        configureProductionClient(app, { nodeEnv: 'production', distPath });

        const response = await request(app).get('/assets/app-abc123.js');

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('immutable');
    });

    test('serves the service worker with revalidation instead of long-lived caching', async () => {
        const app = express();
        configureProductionClient(app, { nodeEnv: 'production', distPath });

        const response = await request(app).get('/sw.js');

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-cache');
    });

    test('does not route unknown API requests through the SPA', async () => {
        const app = express();
        configureProductionClient(app, { nodeEnv: 'production', distPath });
        app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));

        const response = await request(app)
            .get('/api/not-real')
            .set('Accept', 'text/html');

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('API route not found');
    });
});
