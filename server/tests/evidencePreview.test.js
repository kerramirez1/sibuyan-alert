import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import reportRouter from '../routes/reports.js';
import Report from '../models/Report.js';
import * as gridFsService from '../services/gridFsService.js';

vi.mock('../services/gridFsService.js', () => ({
    findGridFsFile: vi.fn(),
    getGridFsBucket: vi.fn(),
    deleteGridFsFilesByUrls: vi.fn(),
    uploadFilesToGridFS: vi.fn(),
}));

const mockUser = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    role: 'reporter',
};

const otherUser = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439022'),
    role: 'reporter',
};

const adminUser = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439033'),
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
};

const otherAdminUser = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439044'),
    role: 'municipal_admin',
    assignedMunicipality: 'Magdiwang',
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

describe('Evidence Preview Endpoint (GET /api/reports/:id/evidence/:index/preview)', () => {
    const reportId = new mongoose.Types.ObjectId('607f1f77bcf86cd799439011');
    const fileId = new mongoose.Types.ObjectId('707f1f77bcf86cd799439011');

    const sampleReport = {
        _id: reportId,
        reporter: mockUser._id,
        status: 'verified',
        municipalityName: 'Cajidiocan',
        images: [`/api/files/${fileId.toString()}/photo.jpg`],
        save: vi.fn().mockResolvedValue(true),
    };

    const mockGridFsFile = {
        _id: fileId,
        metadata: {
            resourceId: reportId,
            category: 'report_evidence',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        gridFsService.findGridFsFile.mockResolvedValue(mockGridFsFile);
        gridFsService.getGridFsBucket.mockReturnValue({
            openDownloadStream: vi.fn().mockReturnValue((async function* () {
                yield Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
            })()),
        });
    });

    test('1. Allows guest to access blurred SVG preview for verified reports', async () => {
        vi.spyOn(Report, 'findById').mockResolvedValue(sampleReport);

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
        expect(res.headers['etag']).toBeDefined();
        const content = res.text || res.body?.toString('utf-8') || '';
        expect(content).toContain('<svg');
        expect(content).toContain('privacyBlurFilter');
    });

    test('2. Allows non-owner reporter to view blurred SVG preview for verified reports', async () => {
        vi.spyOn(Report, 'findById').mockResolvedValue(sampleReport);

        const app = createTestApp(otherUser);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
    });

    test('3. Allows report owner to view preview even for pending reports', async () => {
        const pendingReport = { ...sampleReport, status: 'pending' };
        vi.spyOn(Report, 'findById').mockResolvedValue(pendingReport);

        const app = createTestApp(mockUser);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
    });

    test('4. Denies guest access to evidence preview for unverified/pending reports', async () => {
        const pendingReport = { ...sampleReport, status: 'pending' };
        vi.spyOn(Report, 'findById').mockResolvedValue(pendingReport);

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test('5. Allows in-scope municipal admin to view preview for pending reports', async () => {
        const pendingReport = { ...sampleReport, status: 'pending' };
        vi.spyOn(Report, 'findById').mockResolvedValue(pendingReport);

        const app = createTestApp(adminUser);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(200);
    });

    test('6. Denies out-of-scope municipal admin from viewing pending report evidence', async () => {
        const pendingReport = { ...sampleReport, status: 'pending' };
        vi.spyOn(Report, 'findById').mockResolvedValue(pendingReport);

        const app = createTestApp(otherAdminUser);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(403);
    });

    test('7. Returns 404 for invalid report ID or non-existent report', async () => {
        vi.spyOn(Report, 'findById').mockResolvedValue(null);

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(404);
    });

    test('8. Returns 400 or 404 for out-of-range evidence index', async () => {
        vi.spyOn(Report, 'findById').mockResolvedValue(sampleReport);

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/5/preview`);

        expect(res.status).toBe(404);
    });

    test('9. Returns 403 on resource integrity violation (file belongs to different report)', async () => {
        vi.spyOn(Report, 'findById').mockResolvedValue(sampleReport);
        gridFsService.findGridFsFile.mockResolvedValue({
            _id: fileId,
            metadata: {
                resourceId: new mongoose.Types.ObjectId('807f1f77bcf86cd799439099'),
            },
        });

        const app = createTestApp(null);
        const res = await request(app).get(`/api/reports/${reportId.toString()}/evidence/0/preview`);

        expect(res.status).toBe(403);
    });

    test('10. Returns 304 Not Modified when ETag matches If-None-Match header', async () => {
        vi.spyOn(Report, 'findById').mockResolvedValue(sampleReport);

        const app = createTestApp(null);
        const res = await request(app)
            .get(`/api/reports/${reportId.toString()}/evidence/0/preview`)
            .set('If-None-Match', `W/"evidence-preview-${reportId.toString()}-0"`);

        expect(res.status).toBe(304);
    });
});
