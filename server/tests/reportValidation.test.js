import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { validateCreateReport, validateMongoIdParam } from '../middleware/validate.js';

const validReport = {
    incidentCategory: 'accident',
    incidentType: 'vehicular',
    incidentTime: '2026-08-11T04:00:00.000Z',
    address: 'Poblacion, Cajidiocan',
    casualties: { injured: 1, fatalities: 0, missing: 0 },
};

const createApp = () => {
    const app = express();
    app.use(express.json());
    app.post('/reports', validateCreateReport, (_req, res) => res.sendStatus(204));
    app.put('/zones/:id', validateMongoIdParam, (_req, res) => res.sendStatus(204));
    return app;
};

describe('report request validation', () => {
    test('accepts a supported, well-formed report', async () => {
        await request(createApp()).post('/reports').send(validReport).expect(204);
    });

    test('accepts an incident time within the clock-skew grace period', async () => {
        await request(createApp())
            .post('/reports')
            .send({ ...validReport, incidentTime: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
            .expect(204);
    });

    test.each([
        [{ incidentTime: 'not-a-date' }, 'Incident time must be a valid date'],
        [{ incidentTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }, 'Incident time cannot be in the future'],
        [{ incidentType: 'invented-type' }, 'Invalid incident type'],
        [{ casualties: { injured: -1 } }, 'injured must be a non-negative whole number'],
        [{ casualties: { fatalities: 1.5 } }, 'fatalities must be a non-negative whole number'],
    ])('rejects invalid report input %#', async (override, expectedMessage) => {
        const response = await request(createApp())
            .post('/reports')
            .send({ ...validReport, ...override })
            .expect(400);

        expect(response.body.errors).toContainEqual({
            field: '',
            message: expectedMessage,
        });
    });

    test('rejects malformed resource identifiers before controller execution', async () => {
        const response = await request(createApp()).put('/zones/not-an-object-id').expect(400);
        expect(response.body.errors).toContainEqual({
            field: 'id',
            message: 'Invalid resource ID',
        });
    });
});
