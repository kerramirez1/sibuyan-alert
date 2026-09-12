import { beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import reportRouter from '../routes/reports.js';
import Report from '../models/Report.js';
import HighRiskZone from '../models/HighRiskZone.js';

const reporterId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const otherId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');

const stubZoneFind = (docs = []) => {
    const lean = vi.fn().mockResolvedValue(docs);
    const chain = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnValue({ maxTimeMS: vi.fn().mockReturnValue({ lean }) }),
    };
    return vi.spyOn(HighRiskZone, 'find').mockReturnValue(chain);
};

const createTestApp = (user = null) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = user;
        next();
    });
    app.use('/api/reports', reportRouter);
    return app;
};

describe('GET /api/reports/search (MVP RBAC search)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('returns empty results for queries shorter than 2 chars without hitting the database', async () => {
        const findSpy = vi.spyOn(Report, 'find');
        const zoneFindSpy = vi.spyOn(HighRiskZone, 'find');
        const app = createTestApp(null);
        const response = await request(app).get('/api/reports/search?q=a');
        expect(response.status).toBe(200);
        expect(response.body.data.results).toEqual([]);
        expect(response.body.data.zones).toEqual([]);
        expect(findSpy).not.toHaveBeenCalled();
        expect(zoneFindSpy).not.toHaveBeenCalled();
    });

    test('guest only matches publishable statuses and returns redacted rows', async () => {
        const docs = [
            {
                _id: new mongoose.Types.ObjectId(),
                reporter: otherId,
                title: 'Road accident at Poblacion',
                incidentType: 'motorcycle',
                incidentCategory: 'accident',
                status: 'verified',
                severity: 'moderate',
                address: 'National Highway',
                barangay: 'Poblacion',
                municipalityName: 'Cajidiocan',
                incidentTime: new Date('2026-08-01T08:00:00Z'),
                createdAt: new Date('2026-08-01T09:00:00Z'),
            },
        ];
        const lean = vi.fn().mockResolvedValue(docs);
        const chain = {
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnValue({ maxTimeMS: vi.fn().mockReturnValue({ lean }) }),
        };
        const findSpy = vi.spyOn(Report, 'find').mockReturnValue(chain);
        stubZoneFind();

        const app = createTestApp(null);
        const response = await request(app).get('/api/reports/search?q=accident');

        expect(response.status).toBe(200);
        expect(findSpy).toHaveBeenCalledTimes(1);
        const filter = findSpy.mock.calls[0][0];
        // Visibility clause keeps pending out for guests
        expect(JSON.stringify(filter)).toContain('verified');
        expect(JSON.stringify(filter)).not.toContain('pending.*reporter');

        const [row] = response.body.data.results;
        expect(row.title).toBe('Road accident at Poblacion');
        expect(row.isOwnedByCurrentUser).toBe(false);
        // Redaction boundary: no identity, contacts, coordinates, images
        expect(row).not.toHaveProperty('reporter');
        expect(row).not.toHaveProperty('coordinates');
        expect(row).not.toHaveProperty('images');
    });

    test('reporter matches own pending report by address text', async () => {
        const lean = vi.fn().mockResolvedValue([
            {
                _id: new mongoose.Types.ObjectId(),
                reporter: reporterId,
                title: 'Untitled report',
                incidentType: 'vehicular',
                incidentCategory: 'accident',
                status: 'pending',
                severity: 'minor',
                address: 'Near Cambijang bridge',
                barangay: 'Cambijang',
                municipalityName: 'Cajidiocan',
                incidentTime: new Date('2026-08-02T08:00:00Z'),
                createdAt: new Date('2026-08-02T09:00:00Z'),
            },
        ]);
        const chain = {
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnValue({ maxTimeMS: vi.fn().mockReturnValue({ lean }) }),
        };
        const findSpy = vi.spyOn(Report, 'find').mockReturnValue(chain);
        stubZoneFind();

        const app = createTestApp({ _id: reporterId, role: 'reporter' });
        const response = await request(app).get('/api/reports/search?q=cambijang');

        expect(response.status).toBe(200);
        expect(findSpy).toHaveBeenCalledTimes(1);
        // Owner clause present so own pending rows are reachable
        expect(JSON.stringify(findSpy.mock.calls[0][0])).toContain(String(reporterId));
        expect(response.body.data.results).toHaveLength(1);
        expect(response.body.data.results[0].isOwnedByCurrentUser).toBe(true);
    });

    test('caps limit at 20', async () => {
        const lean = vi.fn().mockResolvedValue([]);
        const limitFn = vi.fn().mockReturnValue({ maxTimeMS: vi.fn().mockReturnValue({ lean }) });
        const chain = { select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: limitFn };
        vi.spyOn(Report, 'find').mockReturnValue(chain);
        stubZoneFind();

        const app = createTestApp(null);
        await request(app).get('/api/reports/search?q=accident&limit=500');
        expect(limitFn).toHaveBeenCalledWith(20);
    });

    test('returns active high-risk zones with map-ready coordinates and no photos', async () => {
        const reportLean = vi.fn().mockResolvedValue([]);
        const reportChain = {
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnValue({ maxTimeMS: vi.fn().mockReturnValue({ lean: reportLean }) }),
        };
        vi.spyOn(Report, 'find').mockReturnValue(reportChain);
        const zoneFindSpy = stubZoneFind([
            {
                _id: new mongoose.Types.ObjectId(),
                name: 'Cambijang Curve',
                description: 'Sharp curve with frequent overshoot',
                type: 'accident_prone',
                severity: 'high',
                municipality: 'Cajidiocan',
                barangay: 'Cambijang',
                coordinates: { lat: 12.4044, lng: 122.6897 },
                radius: 150,
                createdAt: new Date('2026-07-01T08:00:00Z'),
                photos: [{ url: '/api/files/secret', filename: 'secret.jpg' }],
            },
        ]);

        const app = createTestApp(null);
        const response = await request(app).get('/api/reports/search?q=cambijang');

        expect(response.status).toBe(200);
        // Active-only zone filter, identical for every role
        expect(JSON.stringify(zoneFindSpy.mock.calls[0][0])).toContain('isActive');
        const [zone] = response.body.data.zones;
        expect(zone.kind).toBe('zone');
        expect(zone.title).toBe('Cambijang Curve');
        expect(zone.coordinates).toEqual({ lat: 12.4044, lng: 122.6897 });
        // Photos never leave the server in search payloads
        expect(zone).not.toHaveProperty('photos');
    });
});
