import { beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import reportRouter from '../routes/reports.js';
import Report from '../models/Report.js';

const mockReporter = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'Citizen Reporter',
    email: 'citizen@example.com',
    role: 'reporter',
};

const mockOtherUser = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439022'),
    name: 'Other Citizen',
    email: 'other@example.com',
    role: 'reporter',
};

const mockInScopeAdmin = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439033'),
    name: 'Admin Cajidiocan',
    email: 'admin.caj@example.com',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
};

const mockOutScopeAdmin = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439044'),
    name: 'Admin Magdiwang',
    email: 'admin.mag@example.com',
    role: 'municipal_admin',
    assignedMunicipality: 'Magdiwang',
};

const mockInScopeResponder = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439055'),
    name: 'Responder Cajidiocan',
    email: 'responder.caj@example.com',
    role: 'responder',
    assignedMunicipality: 'Cajidiocan',
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

const createMockQuery = (result) => {
    const query = Promise.resolve(result);
    query.populate = () => query;
    return query;
};

describe('GET /api/reports/:id (Report by ID Endpoint)', () => {
    const reportId = new mongoose.Types.ObjectId('607f1f77bcf86cd799439011');

    const baseReport = {
        _id: reportId,
        title: 'Road accident at Poblacion',
        description: 'Two motorcycles collided on highway.',
        incidentCategory: 'accident',
        incidentType: 'motorcycle',
        status: 'verified',
        severity: 'moderate',
        municipalityName: 'Cajidiocan',
        barangay: 'Poblacion',
        address: 'National Highway',
        coordinates: { lat: 12.45, lng: 122.55 },
        incidentTime: new Date('2026-08-01T08:00:00Z'),
        reporter: {
            _id: mockReporter._id,
            name: mockReporter.name,
            email: mockReporter.email,
        },
        images: ['/api/files/607f1f77bcf86cd799439099/photo.jpg'],
        evidenceMetadata: [],
        viewCount: 10,
        casualties: { injured: 1, fatalities: 0, missing: 0 },
        toObject() {
            return {
                ...this,
                reporter: { ...this.reporter },
                coordinates: { ...this.coordinates },
                casualties: { ...this.casualties },
            };
        },
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('1. Guest / Public user receives sanitized report and atomic viewCount update', async () => {
        const updateSpy = vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(baseReport));

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data._id).toBe(reportId.toString());
        expect(res.body.data.detailAccess).toBe('public');
        expect(res.body.data.detailCompleteness).toBe('full');
        expect(res.body.data.isOwnedByCurrentUser).toBe(false);

        // Security / Sanitization: No raw private reporter data or original images exposed to guest
        expect(res.body.data.reporter).toBeUndefined();
        expect(res.body.data.images).toBeUndefined();
        expect(res.body.data.evidence).toBeDefined();
        expect(res.body.data.evidence.viewerAccess).toBe('redacted');
        expect(res.body.data.evidence.items[0].redactedPreviewUrl).toContain('/preview?rv=3.4');

        // View count was incremented atomically
        expect(updateSpy).toHaveBeenCalledWith(
            { _id: reportId },
            { $inc: { viewCount: 1 } }
        );
    });

    test('2. Report owner receives full report with original evidence and owner capability', async () => {
        vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(baseReport));

        const app = createTestApp(mockReporter);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.isOwnedByCurrentUser).toBe(true);
        expect(res.body.data.detailAccess).toBe('owner');
        expect(res.body.data.detailCompleteness).toBe('full');
        expect(res.body.data.evidence.viewerAccess).toBe('original');
        expect(res.body.data.evidence.items[0].originalUrl).toBe('/api/files/607f1f77bcf86cd799439099/photo.jpg');
    });

    test('3. In-scope municipal admin receives full operational report and original evidence', async () => {
        vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(baseReport));

        const app = createTestApp(mockInScopeAdmin);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.detailAccess).toBe('operational');
        expect(res.body.data.detailCompleteness).toBe('full');
        expect(res.body.data.evidence.viewerAccess).toBe('original');
    });

    test('4. In-scope responder receives full operational report and original evidence', async () => {
        vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(baseReport));

        const app = createTestApp(mockInScopeResponder);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.detailAccess).toBe('operational');
    });

    test('5. Out-of-scope municipal admin gets sanitized public view for verified reports', async () => {
        vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(baseReport));

        const app = createTestApp(mockOutScopeAdmin);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.detailAccess).toBe('public');
        expect(res.body.data.reporter).toBeUndefined();
        expect(res.body.data.images).toBeUndefined();
        expect(res.body.data.evidence.viewerAccess).toBe('redacted');
    });

    test('6. Unverified pending report returns 403 for unauthorized users and out-of-scope admins', async () => {
        const pendingReport = {
            ...baseReport,
            status: 'pending',
        };
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(pendingReport));

        // Guest viewer -> 403
        const guestApp = createTestApp(null);
        const guestRes = await request(guestApp).get(`/api/reports/${reportId.toString()}`);
        expect(guestRes.status).toBe(403);
        expect(guestRes.body.success).toBe(false);
        expect(guestRes.body.message).toMatch(/not authorized/i);

        // Out-of-scope admin -> 403
        const outScopeApp = createTestApp(mockOutScopeAdmin);
        const outScopeRes = await request(outScopeApp).get(`/api/reports/${reportId.toString()}`);
        expect(outScopeRes.status).toBe(403);
        expect(outScopeRes.body.success).toBe(false);

        // Other citizen reporter -> 403
        const otherCitizenApp = createTestApp(mockOtherUser);
        const otherCitizenRes = await request(otherCitizenApp).get(`/api/reports/${reportId.toString()}`);
        expect(otherCitizenRes.status).toBe(403);
    });

    test('7. Unverified pending report returns 200 for report owner and in-scope municipal admin', async () => {
        const pendingReport = {
            ...baseReport,
            status: 'pending',
        };
        vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(pendingReport));

        // Report owner -> 200
        const ownerApp = createTestApp(mockReporter);
        const ownerRes = await request(ownerApp).get(`/api/reports/${reportId.toString()}`);
        expect(ownerRes.status).toBe(200);
        expect(ownerRes.body.data.status).toBe('pending');
        expect(ownerRes.body.data.detailAccess).toBe('owner');

        // In-scope municipal admin -> 200
        const inScopeApp = createTestApp(mockInScopeAdmin);
        const inScopeRes = await request(inScopeApp).get(`/api/reports/${reportId.toString()}`);
        expect(inScopeRes.status).toBe(200);
        expect(inScopeRes.body.data.status).toBe('pending');
        expect(inScopeRes.body.data.detailAccess).toBe('operational');
    });

    test('8. Invalid ObjectId returns 400 Bad Request', async () => {
        const app = createTestApp(null);
        const res = await request(app).get('/api/reports/invalid-object-id-123');

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/invalid incident report identifier/i);
    });

    test('9. Missing report returns 404 Not Found', async () => {
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(null));

        const nonExistentId = new mongoose.Types.ObjectId('607f1f77bcf86cd799439099');
        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${nonExistentId.toString()}`);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/report not found/i);
    });

    test('10. Legacy / incomplete report succeeds without triggering full-document Mongoose validation failure', async () => {
        // A legacy report missing fields that would cause `report.save()` to fail
        const legacyReport = {
            _id: reportId,
            status: 'verified',
            municipalityName: 'Cajidiocan',
            title: 'Legacy Title',
            description: null,
            reporter: mockReporter._id,
            images: [],
            viewCount: 5,
            toObject() {
                return { ...this };
            },
        };
        const updateSpy = vi.spyOn(Report, 'updateOne').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(legacyReport));

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe('Legacy Title');
        expect(updateSpy).toHaveBeenCalledWith(
            { _id: reportId },
            { $inc: { viewCount: 1 } }
        );
    });

    test('11. Failed viewCount atomic update is non-blocking and still returns valid report data', async () => {
        // Mock atomic update failure
        vi.spyOn(Report, 'updateOne').mockReturnValue({
            catch(cb) {
                cb(new Error('Mongo connection glitch'));
                return Promise.resolve();
            },
        });
        vi.spyOn(Report, 'findById').mockReturnValue(createMockQuery(baseReport));

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        // The request MUST NOT fail with 500 just because viewCount update had an issue
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe('Road accident at Poblacion');
    });

    test('12. Database query failure safely returns 500 error without leaking stack or database details', async () => {
        vi.spyOn(Report, 'findById').mockImplementation(() => {
            throw new Error('Database disk error');
        });

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}`);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Failed to get report');
        expect(res.body.stack).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain('Database disk error');
    });
});
