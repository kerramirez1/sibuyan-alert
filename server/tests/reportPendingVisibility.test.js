import { beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import reportRouter from '../routes/reports.js';
import Report from '../models/Report.js';

const reporterId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const otherReporterId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');

const reporterUser = { _id: reporterId, role: 'reporter', assignedMunicipality: null };

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

const stubReportList = (docs = []) => {
    const lean = vi.fn().mockResolvedValue(docs);
    const chain = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        maxTimeMS: vi.fn().mockReturnValue({ lean }),
    };
    const countChain = { maxTimeMS: vi.fn().mockResolvedValue(docs.length) };
    vi.spyOn(Report, 'find').mockReturnValue(chain);
    vi.spyOn(Report, 'countDocuments').mockReturnValue(countChain);
    return chain;
};

const pendingDoc = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    reporter: otherReporterId,
    title: 'Unverified crash at junction',
    description: 'A car allegedly hit a post.',
    incidentCategory: 'accident',
    incidentType: 'vehicular',
    status: 'pending',
    severity: 'moderate',
    address: 'National Highway',
    barangay: 'Poblacion',
    municipalityName: 'Cajidiocan',
    coordinates: { lat: 12.45, lng: 122.55 },
    incidentTime: new Date('2026-08-01T08:00:00Z'),
    createdAt: new Date('2026-08-01T09:00:00Z'),
    images: ['/api/files/secret.jpg'],
    ...overrides,
});

describe('Member-visible pending reports', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('GET /api/reports?status=all includes pending for reporters, not guests', async () => {
        stubReportList([pendingDoc()]);
        const reporterApp = createTestApp(reporterUser);
        const reporterRes = await request(reporterApp).get('/api/reports?status=all');
        expect(reporterRes.status).toBe(200);
        const statuses = reporterRes.body.data.reports.map((r) => r.status);
        expect(statuses).toContain('pending');

        stubReportList([pendingDoc()]);
        const guestApp = createTestApp(null);
        const guestRes = await request(guestApp).get('/api/reports?status=all');
        expect(guestRes.status).toBe(200);
        // Guest projection path is unchanged; server query excludes pending.
        expect(Report.find).toHaveBeenCalled();
        const guestCalls = Report.find.mock.calls;
        const guestFilter = guestCalls[guestCalls.length - 1][0];
        expect(JSON.stringify(guestFilter)).not.toContain('pending');
    });

    test('GET /api/reports?status=pending is 400 for guests, 200 redacted for reporters', async () => {
        const guestApp = createTestApp(null);
        const guestRes = await request(guestApp).get('/api/reports?status=pending');
        expect(guestRes.status).toBe(400);

        stubReportList([pendingDoc()]);
        const reporterApp = createTestApp(reporterUser);
        const reporterRes = await request(reporterApp).get('/api/reports?status=pending');
        expect(reporterRes.status).toBe(200);
        const [row] = reporterRes.body.data.reports;
        expect(row.status).toBe('pending');
        // Redaction boundary holds for unverified rows
        expect(row).not.toHaveProperty('images');
        expect(JSON.stringify(row)).not.toContain('secret.jpg');
    });

    test("GET /api/reports/:id pending is public-projection for reporters, 403 for guests, rejected stays restricted", async () => {
        const pendingReport = {
            ...pendingDoc(),
            reporter: { _id: otherReporterId, name: 'Other', avatar: null },
            toObject() {
                return { ...this };
            },
        };
        const findByIdChain = (result) => {
            const query = Promise.resolve(result);
            query.populate = () => query;
            return query;
        };
        vi.spyOn(Report, 'findById').mockReturnValue(findByIdChain(pendingReport));
        vi.spyOn(Report, 'updateOne').mockResolvedValue({});

        const reporterRes = await request(createTestApp(reporterUser)).get(
            `/api/reports/${pendingReport._id}`
        );
        expect(reporterRes.status).toBe(200);
        expect(reporterRes.body.data.detailAccess).toBe('public');
        expect(reporterRes.body.data.images).toBeUndefined();
        expect(JSON.stringify(reporterRes.body.data)).not.toContain('secret.jpg');

        const guestRes = await request(createTestApp(null)).get(`/api/reports/${pendingReport._id}`);
        expect(guestRes.status).toBe(403);

        const rejectedReport = {
            ...pendingDoc({ status: 'rejected' }),
            reporter: { _id: otherReporterId, name: 'Other', avatar: null },
            toObject() {
                return { ...this };
            },
        };
        vi.spyOn(Report, 'findById').mockReturnValue(findByIdChain(rejectedReport));
        const rejectedRes = await request(createTestApp(reporterUser)).get(
            `/api/reports/${rejectedReport._id}`
        );
        expect(rejectedRes.status).toBe(403);
    });
});
