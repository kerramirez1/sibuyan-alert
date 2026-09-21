import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

const createZoneMock = jest.fn();
const findByIdMock = jest.fn();
const uploadFilesToGridFSMock = jest.fn();
const resolveRiskZoneJurisdictionMock = jest.fn();

jest.mock('../models/HighRiskZone.js', () => ({
    default: {
        create: createZoneMock,
        findById: findByIdMock,
        find: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
        }),
    },
}));

jest.mock('../services/gridFsService.js', () => ({
    uploadFilesToGridFS: uploadFilesToGridFSMock,
    deleteGridFsFilesByUrls: jest.fn().mockResolvedValue([]),
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

const ZONE_ID = '507f1f77bcf86cd799439012';

const createApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/high-risk-zones', highRiskZoneRoutes);
    return app;
};

/**
 * A zone as it exists in the database: the flood type and the low severity were
 * withdrawn from the form, but documents saved before that still carry them.
 */
const savedZone = (overrides = {}) => ({
    _id: ZONE_ID,
    name: 'Sibuyan River Flooding',
    description: '',
    type: 'flood_prone',
    severity: 'low',
    radius: 200,
    municipality: 'Cajidiocan',
    barangay: 'Cambajao',
    coordinates: { lat: 12.3712, lng: 122.5301 },
    photos: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
});

const createRequest = () => request(createApp())
    .post('/high-risk-zones')
    .field('name', 'Riverside hazard')
    .field('coordinates', JSON.stringify({ lat: 12.3785, lng: 122.5432 }));

describe('retired zone types and severities at the API boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = {
            _id: '507f1f77bcf86cd799439011',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        resolveRiskZoneJurisdictionMock.mockResolvedValue({
            valid: true,
            value: {
                municipality: 'Cajidiocan',
                barangay: 'Cambajao',
                coordinates: { lat: 12.3785, lng: 122.5432 },
            },
        });
        createZoneMock.mockImplementation((data) => Promise.resolve({ _id: 'zone-101', ...data }));
        findByIdMock.mockResolvedValue(savedZone());
    });

    test('refuses to create a flood-prone zone the form no longer offers', async () => {
        const response = await createRequest()
            .field('type', 'flood_prone')
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/Zone type must be one of: landslide_prone, accident_prone, other/);
        expect(createZoneMock).not.toHaveBeenCalled();
        expect(uploadFilesToGridFSMock).not.toHaveBeenCalled();
    });

    test('refuses the withdrawn severities on creation', async () => {
        for (const retired of ['low', 'critical']) {
            const response = await createRequest()
                .field('type', 'accident_prone')
                .field('severity', retired)
                .expect(400);

            expect(response.body.message).toMatch(/Severity must be one of: medium, high/);
        }

        expect(createZoneMock).not.toHaveBeenCalled();
    });

    test('still creates every type and severity the form does offer', async () => {
        for (const [type, severity] of [
            ['landslide_prone', 'medium'],
            ['accident_prone', 'high'],
            ['other', 'medium'],
        ]) {
            await createRequest()
                .field('type', type)
                .field('severity', severity)
                .expect(201);
        }

        expect(createZoneMock).toHaveBeenCalledTimes(3);
    });

    test('lets a stored flood zone be edited without reclassifying it', async () => {
        const zone = savedZone();
        findByIdMock.mockResolvedValue(zone);

        // Re-sending the value the zone already carries is not a choice — an
        // administrator renaming a legacy zone must not be forced to reclassify
        // it, or a form change becomes a reason they cannot touch their data.
        await request(createApp())
            .put(`/high-risk-zones/${ZONE_ID}`)
            .send({ name: 'Sibuyan River Flooding (renamed)', type: 'flood_prone', severity: 'low' })
            .expect(200);

        expect(zone.name).toBe('Sibuyan River Flooding (renamed)');
        expect(zone.save).toHaveBeenCalled();
    });

    test('refuses to move a zone onto a retired type or severity', async () => {
        const zone = savedZone({ type: 'accident_prone', severity: 'medium' });
        findByIdMock.mockResolvedValue(zone);

        const byType = await request(createApp())
            .put(`/high-risk-zones/${ZONE_ID}`)
            .send({ type: 'flood_prone' })
            .expect(400);
        expect(byType.body.message).toMatch(/Zone type must be one of/);

        const bySeverity = await request(createApp())
            .put(`/high-risk-zones/${ZONE_ID}`)
            .send({ severity: 'critical' })
            .expect(400);
        expect(bySeverity.body.message).toMatch(/Severity must be one of/);

        expect(zone.type).toBe('accident_prone');
        expect(zone.severity).toBe('medium');
        expect(zone.save).not.toHaveBeenCalled();
    });
});
