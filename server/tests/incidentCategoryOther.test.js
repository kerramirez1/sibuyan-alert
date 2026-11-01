import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { describe, expect, test } from 'vitest';
import {
    INCIDENT_CATEGORY_NAMES,
    isSupportedIncidentType,
} from '../config/incidentCategories.js';
import { validateCreateReport } from '../middleware/validate.js';
import Report from '../models/Report.js';
import { getReportIncidentTypeLabel } from '../utils/incidentTypeLabel.js';
import { toOperationalReport } from '../utils/operationalReport.js';
import { toPublicReport } from '../utils/publicReport.js';

const validReport = {
    incidentCategory: 'other',
    incidentType: 'other',
    incidentCategoryDetail: 'Fallen wire on the bridge',
    incidentTime: '2026-08-11T04:00:00.000Z',
    address: 'Poblacion, Cajidiocan',
    casualties: { injured: 0, fatalities: 0, missing: 0 },
};

// The handler echoes the body back, so the test can see what validation
// left behind (trimmed detail for 'other', blanked detail for the rest).
const createApp = () => {
    const app = express();
    app.use(express.json());
    app.post('/reports', validateCreateReport, (req, res) => res.status(200).json({
        incidentCategoryDetail: req.body.incidentCategoryDetail ?? null,
    }));
    return app;
};

describe("incident category 'other' — config", () => {
    test('is a supported category whose only type is other', () => {
        expect(INCIDENT_CATEGORY_NAMES).toContain('other');
        expect(isSupportedIncidentType('other', 'other')).toBe(true);
        expect(isSupportedIncidentType('other', 'vehicular')).toBe(false);
        expect(isSupportedIncidentType('other', 'other_fire')).toBe(false);
        expect(isSupportedIncidentType('other', 'other_hazard')).toBe(false);
    });
});

describe("incident category 'other' — create validation", () => {
    test('(a) other with a detail passes validation', async () => {
        const response = await request(createApp()).post('/reports').send(validReport).expect(200);
        expect(response.body.incidentCategoryDetail).toBe('Fallen wire on the bridge');
    });

    test('a detail of exactly 60 characters is accepted', async () => {
        await request(createApp())
            .post('/reports')
            .send({ ...validReport, incidentCategoryDetail: 'x'.repeat(60) })
            .expect(200);
    });

    test('a detail of 61 characters is rejected', async () => {
        const response = await request(createApp())
            .post('/reports')
            .send({ ...validReport, incidentCategoryDetail: 'x'.repeat(61) })
            .expect(400);
        expect(response.body.errors).toContainEqual({
            field: '',
            message: 'Incident detail cannot exceed 60 characters',
        });
    });

    test('(b) other with a blank or missing detail is rejected', async () => {
        for (const incidentCategoryDetail of ['   ', '']) {
            const response = await request(createApp())
                .post('/reports')
                .send({ ...validReport, incidentCategoryDetail })
                .expect(400);
            expect(response.body.errors).toContainEqual({
                field: '',
                message: 'Please specify the incident',
            });
        }
        const { incidentCategoryDetail: _omitted, ...withoutDetail } = validReport;
        const response = await request(createApp()).post('/reports').send(withoutDetail).expect(400);
        expect(response.body.errors).toContainEqual({
            field: '',
            message: 'Please specify the incident',
        });
    });

    test('other with a real-category type is rejected', async () => {
        const response = await request(createApp())
            .post('/reports')
            .send({ ...validReport, incidentType: 'vehicular' })
            .expect(400);
        expect(response.body.errors).toContainEqual({
            field: '',
            message: 'Invalid incident type',
        });
    });

    test('(c) a detail sent with a real category is stripped by validation', async () => {
        const response = await request(createApp())
            .post('/reports')
            .send({
                ...validReport,
                incidentCategory: 'fire',
                incidentType: 'structural',
                incidentCategoryDetail: 'Stale text from a category switch',
            })
            .expect(200);
        expect(response.body.incidentCategoryDetail).toBe('');
    });
});

describe("incident category 'other' — model", () => {
    const baseDoc = {
        reporter: new mongoose.Types.ObjectId(),
        incidentCategory: 'other',
        incidentType: 'other',
        incidentCategoryDetail: 'Fallen wire on the bridge',
        address: 'Poblacion, Cajidiocan',
        incidentTime: new Date('2026-08-11T04:00:00.000Z'),
        coordinates: { lat: 12.4, lng: 122.55 },
    };

    test('the schema accepts the other category and stores the detail', async () => {
        const report = new Report(baseDoc);
        await expect(report.validate()).resolves.toBeUndefined();
        expect(report.incidentCategoryDetail).toBe('Fallen wire on the bridge');
    });

    test('the schema rejects a detail longer than 60 characters', async () => {
        const report = new Report({ ...baseDoc, incidentCategoryDetail: 'x'.repeat(61) });
        await expect(report.validate()).rejects.toThrow(/cannot exceed 60 characters/);
    });
});

describe("incident category 'other' — labels and serializers", () => {
    const storedReport = {
        _id: new mongoose.Types.ObjectId(),
        reporter: new mongoose.Types.ObjectId(),
        incidentCategory: 'other',
        incidentType: 'other',
        incidentCategoryDetail: 'Fallen wire on the bridge',
        address: 'Poblacion, Cajidiocan',
        status: 'verified',
        severity: 'moderate',
        images: [],
    };

    test('(a) the operational label carries the detail', () => {
        expect(getReportIncidentTypeLabel(storedReport)).toBe('Other — Fallen wire on the bridge');
        const operational = toOperationalReport(storedReport);
        expect(operational.incidentTypeLabel).toBe('Other — Fallen wire on the bridge');
        expect(operational.incidentCategoryDetail).toBe('Fallen wire on the bridge');
    });

    test('(a) the public label hides the detail', () => {
        expect(getReportIncidentTypeLabel(storedReport, { publicView: true })).toBe('Other incident');
        const strangerView = toPublicReport(storedReport, { viewerId: new mongoose.Types.ObjectId() });
        expect(strangerView.incidentTypeLabel).toBe('Other incident');
        expect(strangerView).not.toHaveProperty('incidentCategoryDetail');
    });

    test('(a) the owner still sees the detail through the public serializer', () => {
        const ownerView = toPublicReport(storedReport, { viewerId: storedReport.reporter });
        expect(ownerView.incidentTypeLabel).toBe('Other — Fallen wire on the bridge');
        expect(ownerView.incidentCategoryDetail).toBe('Fallen wire on the bridge');
    });

    test("the accident category's own other type keeps its flat label", () => {
        expect(getReportIncidentTypeLabel({
            incidentCategory: 'accident',
            incidentType: 'other',
        })).toBe('Other road incident');
    });
});
