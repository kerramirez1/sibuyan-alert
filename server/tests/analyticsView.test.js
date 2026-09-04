import { describe, expect, test, vi as jest } from 'vitest';
import {
    ANALYTICS_VIEW_NAME,
    ANALYTICS_VIEW_SOURCE,
    ANALYTICS_VIEW_STATUSES,
    buildAnalyticsViewPipeline,
    ensureAnalyticsView,
} from '../services/analyticsViewService.js';

describe('D7 analytics_view (derived store on reports)', () => {
    test('targets the reports collection with published lifecycle states only', () => {
        expect(ANALYTICS_VIEW_NAME).toBe('analytics_view');
        expect(ANALYTICS_VIEW_SOURCE).toBe('reports');
        expect([...ANALYTICS_VIEW_STATUSES].sort()).toEqual(
            ['resolved', 'responding', 'transferred', 'verified'].sort()
        );

        const [match] = buildAnalyticsViewPipeline();
        expect(match.$match.status.$in.sort()).toEqual(
            ['resolved', 'responding', 'transferred', 'verified'].sort()
        );
    });

    test('projection is privacy-safe: no dossier PII, with analytics measures', () => {
        const pipeline = buildAnalyticsViewPipeline();
        const project = pipeline.find((stage) => stage.$project).$project;
        const serialized = JSON.stringify(project);

        // Operational dossier details stay in D2 under RBAC — never in D7.
        expect(serialized).not.toContain('rejectionReason');
        expect(serialized).not.toContain('resolutionNotes');
        expect(serialized).not.toContain('reportUpdates.message');

        // Analytics dimensions must exist.
        const addFields = pipeline.find((stage) => stage.$addFields).$addFields;
        expect(addFields.casualtyTotal).toBeDefined();
        expect(addFields.incidentDate).toBeDefined();
        expect(addFields.respondersCount).toBeDefined();
        // Computed fields must survive the $project allowlist.
        expect(project.casualtyTotal).toBe(1);
        expect(project.incidentDate).toBe(1);
        expect(project.respondersCount).toBe(1);
        expect(project.municipalityName).toBe(1);
        expect(project.barangay).toBe(1);
        expect(project.severity).toBe(1);
    });

    test('ensureAnalyticsView creates the view when missing', async () => {
        const toArray = jest.fn().mockResolvedValue([]);
        const createCollection = jest.fn().mockResolvedValue({});
        const db = { listCollections: jest.fn().mockReturnValue({ toArray }), createCollection };

        const result = await ensureAnalyticsView(db);

        expect(db.listCollections).toHaveBeenCalledWith({ name: 'analytics_view' });
        expect(createCollection).toHaveBeenCalledWith(
            'analytics_view',
            expect.objectContaining({ viewOn: 'reports', pipeline: expect.any(Array) })
        );
        expect(result).toEqual({ name: 'analytics_view', action: 'created' });
    });

    test('ensureAnalyticsView updates the view when it already exists', async () => {
        const toArray = jest.fn().mockResolvedValue([{ name: 'analytics_view', type: 'view' }]);
        const runCommand = jest.fn().mockResolvedValue({ ok: 1 });
        const db = { listCollections: jest.fn().mockReturnValue({ toArray }), runCommand };

        const result = await ensureAnalyticsView(db);

        expect(runCommand).toHaveBeenCalledWith(
            expect.objectContaining({ collMod: 'analytics_view', viewOn: 'reports' })
        );
        expect(result).toEqual({ name: 'analytics_view', action: 'updated' });
    });

    test('ensureAnalyticsView refuses to overwrite a regular collection', async () => {
        const toArray = jest.fn().mockResolvedValue([{ name: 'analytics_view', type: 'collection' }]);
        const db = { listCollections: jest.fn().mockReturnValue({ toArray }) };

        await expect(ensureAnalyticsView(db)).rejects.toThrow('regular collection');
    });
});
