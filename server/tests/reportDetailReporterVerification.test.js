import { beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import reportRouter from '../routes/reports.js';
import Report from '../models/Report.js';

const ownerId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const operationalAdminId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');

const ownerUser = { _id: ownerId, role: 'reporter', assignedMunicipality: null };
const operationalAdminUser = { _id: operationalAdminId, role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

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

const createQueryChain = (result, mockPopulate) => {
    const query = Promise.resolve(result);
    query.populate = mockPopulate;
    return query;
};

describe('Report detail reporter verification projection', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('populates isVerified on reporter for authorized owner and operational access', async () => {
        const reportId = new mongoose.Types.ObjectId();
        const mockPopulate = vi.fn();
        const reportDoc = {
            _id: reportId,
            status: 'verified',
            municipalityName: 'Cajidiocan',
            title: 'Verified incident',
            description: 'Incident report description',
            reporter: {
                _id: ownerId,
                name: 'Verified Reporter',
                avatar: '/avatar.jpg',
                isVerified: true,
            },
            viewCount: 5,
            toObject() {
                return { ...this };
            },
        };

        const query = createQueryChain(reportDoc, mockPopulate);
        mockPopulate.mockReturnValue(query);

        vi.spyOn(Report, 'findById').mockReturnValue(query);
        vi.spyOn(Report, 'updateOne').mockResolvedValue({});

        // Authorized Owner request
        const ownerRes = await request(createTestApp(ownerUser)).get(`/api/reports/${reportId}`);
        expect(ownerRes.status).toBe(200);

        // Verify that populate was called with 'name avatar isVerified' for reporter
        const reporterPopulateCall = mockPopulate.mock.calls.find((call) => call[0] === 'reporter');
        expect(reporterPopulateCall).toBeDefined();
        expect(reporterPopulateCall[1]).toBe('name avatar isVerified');

        // Owner receives the populated reporter object including isVerified
        expect(ownerRes.body.data.reporter).toEqual(expect.objectContaining({
            name: 'Verified Reporter',
            avatar: '/avatar.jpg',
            isVerified: true,
        }));
        expect(ownerRes.body.data.detailAccess).toBe('owner');

        // Authorized Operational Admin request
        const adminRes = await request(createTestApp(operationalAdminUser)).get(`/api/reports/${reportId}`);
        expect(adminRes.status).toBe(200);
        expect(adminRes.body.data.reporter).toEqual(expect.objectContaining({
            name: 'Verified Reporter',
            avatar: '/avatar.jpg',
            isVerified: true,
        }));
        expect(adminRes.body.data.detailAccess).toBe('operational');
    });

    test('public detail view strictly omits reporter identity and verification state', async () => {
        const reportId = new mongoose.Types.ObjectId();
        const mockPopulate = vi.fn();
        const reportDoc = {
            _id: reportId,
            status: 'verified',
            municipalityName: 'Cajidiocan',
            title: 'Publicly visible incident',
            description: 'Public incident description',
            incidentCategory: 'accident',
            incidentType: 'vehicular',
            coordinates: { lat: 12.4, lng: 122.5 },
            incidentTime: new Date(),
            reporter: {
                _id: ownerId,
                name: 'Secret Reporter',
                email: 'secret@example.com',
                avatar: '/avatar.jpg',
                isVerified: true,
            },
            viewCount: 10,
            toObject() {
                return { ...this };
            },
        };

        const query = createQueryChain(reportDoc, mockPopulate);
        mockPopulate.mockReturnValue(query);

        vi.spyOn(Report, 'findById').mockReturnValue(query);
        vi.spyOn(Report, 'updateOne').mockResolvedValue({});

        // Public/Guest viewer request
        const guestRes = await request(createTestApp(null)).get(`/api/reports/${reportId}`);
        expect(guestRes.status).toBe(200);
        expect(guestRes.body.data.detailAccess).toBe('public');

        // Reporter object must NOT be present in public response
        expect(guestRes.body.data).not.toHaveProperty('reporter');
        expect(JSON.stringify(guestRes.body.data)).not.toContain('Secret Reporter');
        expect(JSON.stringify(guestRes.body.data)).not.toContain('secret@example.com');
    });
});
