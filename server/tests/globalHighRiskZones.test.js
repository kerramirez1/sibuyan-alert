import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

const findMock = jest.fn();
const populateMock = jest.fn();
const sortMock = jest.fn();

jest.mock('../models/HighRiskZone.js', () => ({
    default: { find: findMock },
}));

const { default: highRiskZoneRoutes } = await import('../routes/highRiskZones.js');

const createApp = () => {
    const app = express();
    app.use('/high-risk-zones', highRiskZoneRoutes);
    return app;
};

describe('island-wide high-risk-zone visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        sortMock.mockResolvedValue([
            { _id: 'zone-cajidiocan', municipality: 'Cajidiocan', severity: 'high' },
            { _id: 'zone-magdiwang', municipality: 'Magdiwang', severity: 'medium' },
        ]);
        populateMock.mockReturnValue({ sort: sortMock });
        findMock.mockReturnValue({ populate: populateMock });
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
