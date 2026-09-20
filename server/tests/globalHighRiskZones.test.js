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

    test('revalidates on every read instead of handing out a freshness window', async () => {
        const response = await request(createApp()).get('/high-risk-zones').expect(200);

        // A `max-age` here is a promise this route cannot keep: the browser
        // answers the next GET itself for that long, and a delete cannot reach
        // into a browser cache. An administrator deleting a hazard then watched
        // the zone come straight back, because the refetch never left the page.
        expect(response.headers['cache-control']).toContain('max-age=0, must-revalidate');

        // Still cheap: an unchanged list is a body-less 304, not a full payload.
        const revalidated = await request(createApp())
            .get('/high-risk-zones')
            .set('If-None-Match', response.headers.etag)
            .expect(304);
        expect(revalidated.text).toBeFalsy();
    });

    test('changes the validator when a zone is deleted, so the row cannot be served stale', async () => {
        const before = await request(createApp()).get('/high-risk-zones').expect(200);
        expect(before.body.data).toHaveLength(2);

        // The delete committed, and the module-level list cache has expired.
        leanMock.mockResolvedValue([
            { _id: 'zone-magdiwang', municipality: 'Magdiwang', severity: 'medium' },
        ]);
        __resetCacheForTests();

        const after = await request(createApp())
            .get('/high-risk-zones')
            .set('If-None-Match', before.headers.etag);

        // 304 here would tell the client its two-zone copy is still current.
        expect(after.status).toBe(200);
        expect(after.body.data.map((zone) => zone._id)).toEqual(['zone-magdiwang']);
    });

    test('changes the validator when a zone is edited in place', async () => {
        // The list is sorted by severity, so the ends are the most and least
        // severe zones — not the oldest and newest. The edit below lands in the
        // middle and keeps the count identical, which is exactly the case the old
        // fingerprint could not see: it hashed the two ends, answered 304, and
        // the client kept rendering the pre-edit zone.
        const sortBySeverity = [
            { _id: 'zone-critical', severity: 'critical', updatedAt: '2026-01-01T00:00:00.000Z' },
            { _id: 'zone-medium', severity: 'medium', updatedAt: '2026-01-02T00:00:00.000Z' },
            { _id: 'zone-low', severity: 'low', updatedAt: '2026-01-03T00:00:00.000Z' },
        ];
        leanMock.mockResolvedValue(sortBySeverity);
        __resetCacheForTests();

        const before = await request(createApp()).get('/high-risk-zones').expect(200);

        leanMock.mockResolvedValue([
            sortBySeverity[0],
            { ...sortBySeverity[1], name: 'Renamed hazard', updatedAt: '2026-06-09T00:00:00.000Z' },
            sortBySeverity[2],
        ]);
        __resetCacheForTests();

        const after = await request(createApp())
            .get('/high-risk-zones')
            .set('If-None-Match', before.headers.etag);

        expect(after.status).toBe(200);
        expect(after.body.data.find((zone) => zone._id === 'zone-medium').name).toBe('Renamed hazard');
    });
});
