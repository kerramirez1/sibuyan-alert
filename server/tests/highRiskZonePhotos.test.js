import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

const createZoneMock = jest.fn();
const findByIdMock = jest.fn();
const uploadFilesToGridFSMock = jest.fn();
const deleteGridFsFilesByUrlsMock = jest.fn();
const resolveRiskZoneJurisdictionMock = jest.fn();

jest.mock('../models/HighRiskZone.js', () => ({
    default: {
        create: createZoneMock,
        findById: findByIdMock,
        find: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }) }),
    },
}));

jest.mock('../services/gridFsService.js', () => ({
    uploadFilesToGridFS: uploadFilesToGridFSMock,
    deleteGridFsFilesByUrls: deleteGridFsFilesByUrlsMock,
}));

jest.mock('../services/riskZoneJurisdictionService.js', () => ({
    resolveRiskZoneJurisdiction: resolveRiskZoneJurisdictionMock,
}));

let mockUser = {
    _id: '507f1f77bcf86cd799439011',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
};

jest.mock('../middleware/auth.js', () => ({
    protect: (req, res, next) => {
        req.user = mockUser;
        next();
    },
}));

const { default: highRiskZoneRoutes } = await import('../routes/highRiskZones.js');

const createApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/high-risk-zones', highRiskZoneRoutes);
    return app;
};

const createPngBuffer = () => {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(800, 16);
    buffer.writeUInt32BE(600, 20);
    return buffer;
};

describe('High-Risk Zone Reference Photo Uploads & Persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = {
            _id: '507f1f77bcf86cd799439011',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        deleteGridFsFilesByUrlsMock.mockResolvedValue([]);
        resolveRiskZoneJurisdictionMock.mockResolvedValue({
            valid: true,
            value: {
                municipality: 'Cajidiocan',
                barangay: 'Cambajao',
                coordinates: { lat: 12.3785, lng: 122.5432 },
            },
        });
        uploadFilesToGridFSMock.mockResolvedValue([
            {
                id: '607f1f77bcf86cd799439012',
                url: '/api/files/607f1f77bcf86cd799439012/hazard1.png',
                filename: 'hazard1.png',
                mimeType: 'image/png',
            },
        ]);
        createZoneMock.mockImplementation((data) => Promise.resolve({ _id: 'zone-101', ...data }));
    });

    test('successfully creates a high-risk zone with attached reference photos', async () => {
        const response = await request(createApp())
            .post('/high-risk-zones')
            .field('name', 'Cambajao River Flood Zone')
            .field('description', 'High water flow during monsoons')
            .field('type', 'landslide_prone')
            .field('severity', 'high')
            .field('radius', '150')
            .field('coordinates', JSON.stringify({ lat: 12.3785, lng: 122.5432 }))
            .attach('photos', createPngBuffer(), 'hazard1.png')
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Cambajao River Flood Zone');
        expect(uploadFilesToGridFSMock).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                category: 'risk_zone_reference',
                visibility: 'public',
                municipalityName: 'Cajidiocan',
            })
        );
        expect(createZoneMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Cambajao River Flood Zone',
                municipality: 'Cajidiocan',
                barangay: 'Cambajao',
                photos: expect.arrayContaining([
                    expect.objectContaining({
                        url: '/api/files/607f1f77bcf86cd799439012/hazard1.png',
                        filename: 'hazard1.png',
                        displayOrder: 0,
                    }),
                ]),
            })
        );
    });

    test('rejects non-image files for reference photos with 400 Bad Request', async () => {
        const response = await request(createApp())
            .post('/high-risk-zones')
            .field('name', 'Cambajao Hazard')
            .field('coordinates', JSON.stringify({ lat: 12.3785, lng: 122.5432 }))
            .attach('photos', Buffer.from('non-image-data-here'), 'document.txt')
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/must be JPEG, PNG, or WebP|declared file type/i);
        expect(uploadFilesToGridFSMock).not.toHaveBeenCalled();
        expect(createZoneMock).not.toHaveBeenCalled();
    });

    test('rejects zone creation when administrator has no assigned municipality', async () => {
        mockUser = {
            _id: '507f1f77bcf86cd799439011',
            role: 'municipal_admin',
            assignedMunicipality: null,
        };

        const response = await request(createApp())
            .post('/high-risk-zones')
            .field('name', 'Unassigned Admin Zone')
            .field('coordinates', JSON.stringify({ lat: 12.3785, lng: 122.5432 }))
            .attach('photos', createPngBuffer(), 'hazard1.png')
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/Municipality is not assigned/i);
        expect(uploadFilesToGridFSMock).not.toHaveBeenCalled();
    });

    test('cleans up stored GridFS files if database creation fails', async () => {
        createZoneMock.mockRejectedValueOnce(new Error('Database unique constraint failed'));

        const response = await request(createApp())
            .post('/high-risk-zones')
            .field('name', 'Failing Zone')
            .field('coordinates', JSON.stringify({ lat: 12.3785, lng: 122.5432 }))
            .attach('photos', createPngBuffer(), 'hazard1.png')
            .expect(500);

        expect(response.body.success).toBe(false);
        expect(deleteGridFsFilesByUrlsMock).toHaveBeenCalledWith([
            '/api/files/607f1f77bcf86cd799439012/hazard1.png',
        ]);
    });

    test('deleting a high-risk zone cleans up its associated reference photos in GridFS', async () => {
        const deleteOneMock = jest.fn().mockResolvedValue({});
        findByIdMock.mockResolvedValue({
            _id: 'zone-101',
            municipality: 'Cajidiocan',
            photos: [
                { url: '/api/files/607f1f77bcf86cd799439012/hazard1.png' },
                { url: '/api/files/607f1f77bcf86cd799439013/hazard2.png' },
            ],
            deleteOne: deleteOneMock,
        });

        const response = await request(createApp())
            .delete('/high-risk-zones/507f1f77bcf86cd799439011')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(deleteGridFsFilesByUrlsMock).toHaveBeenCalledWith([
            '/api/files/607f1f77bcf86cd799439012/hazard1.png',
            '/api/files/607f1f77bcf86cd799439013/hazard2.png',
        ]);
        expect(deleteOneMock).toHaveBeenCalled();
    });
});
