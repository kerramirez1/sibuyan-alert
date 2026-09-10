import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

const findMock = jest.fn();
const populateMock = jest.fn();
const sortMock = jest.fn();
const limitMock = jest.fn();
const maxTimeMSMock = jest.fn();
const leanMock = jest.fn();

jest.mock('../models/HighRiskZone.js', () => ({
    default: { find: findMock },
}));

const { default: highRiskZoneRoutes } = await import('../routes/highRiskZones.js');
const { __resetCacheForTests } = await import('../utils/apiCache.js');

const createApp = () => {
    const app = express();
    app.use('/high-risk-zones', highRiskZoneRoutes);
    return app;
};

describe('island-wide high-risk-zone visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // The zone list is cached module-globally, so each case must start cold.
        __resetCacheForTests();

        const chain = {
            populate: populateMock,
            sort: sortMock,
            limit: limitMock,
            maxTimeMS: maxTimeMSMock,
            lean: leanMock,
        };
        populateMock.mockReturnValue(chain);
        sortMock.mockReturnValue(chain);
        limitMock.mockReturnValue(chain);
        maxTimeMSMock.mockReturnValue(chain);
        leanMock.mockResolvedValue([
            { _id: 'zone-cajidiocan', municipality: 'Cajidiocan', severity: 'high' },
            { _id: 'zone-magdiwang', municipality: 'Magdiwang', severity: 'medium' },
        ]);
        findMock.mockReturnValue(chain);
    });

    test('returns all active zones even when a client sends a municipality query', async () => {
        const response = await request(createApp())
            .get('/high-risk-zones?municipality=Magdiwang')
            .expect(200);

        expect(findMock).toHaveBeenCalledWith({ isActive: true });
        expect(response.body.data.map((zone) => zone.municipality)).toEqual([
            'Cajidiocan',
            'Magdiwang',
        ]);
    });
});
