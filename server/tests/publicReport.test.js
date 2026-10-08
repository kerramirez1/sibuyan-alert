import { describe, expect, test } from 'vitest';
import { toPublicReport } from '../utils/publicReport.js';

describe('public report representation', () => {
    const report = {
        _id: 'report-1',
        reporter: { _id: 'reporter-1', name: 'Private Reporter', email: 'private@example.com' },
        incidentCategory: 'accident',
        incidentType: 'motorcycle',
        title: 'Road incident',
        description: 'A verified public description',
        address: 'J. Rizal Street',
        barangay: 'Poblacion',
        municipality: { _id: 'municipality-1', name: 'Cajidiocan', code: 'CAJ', emergencyContacts: ['private'] },
        municipalityName: 'Cajidiocan',
        coordinates: { lat: 12.4, lng: 122.6 },
        incidentTime: new Date('2026-08-01T02:00:00Z'),
        status: 'responding',
        severity: 'moderate',
        casualties: { injured: 2, fatalities: 0, missing: 0 },
        images: ['/api/files/private-image'],
        resolutionImages: ['/api/files/private-resolution-image'],
        reportUpdates: [{ message: 'Private situation update' }],
        transferHistory: [{ reason: 'Private transfer reason' }],
        rejectionReason: 'Private rejection reason',
        resolutionNotes: 'Private resolution notes',
        responders: [{ user: { _id: 'responder-1', name: 'Private Responder' }, unitName: 'MDRRMO Alpha', unitType: 'MDRRMO' }],
        responderAgency: 'MDRRMO',
    };

    test('exposes only approved public fields and agency-level response data', () => {
        const result = toPublicReport(report);

        expect(result).toEqual(expect.objectContaining({
            _id: 'report-1',
            status: 'responding',
            respondingAgencies: ['MDRRMO'],
            casualties: { injured: 2, fatalities: 0, missing: 0 },
            isOwnedByCurrentUser: false,
        }));
        expect(result.municipality).toEqual({ name: 'Cajidiocan', code: 'CAJ' });
        expect(result.physicalMunicipalityName).toBe('Cajidiocan');
        expect(result).not.toHaveProperty('reporter');
        expect(result).not.toHaveProperty('images');
        // Resolution photos are public proof of resolution: every viewer,
        // including guests, sees them unblurred.
        expect(result.resolutionImages).toEqual(['/api/files/private-resolution-image']);
        expect(result).not.toHaveProperty('reportUpdates');
        expect(result).not.toHaveProperty('transferHistory');
        expect(result).not.toHaveProperty('rejectionReason');
        expect(result).not.toHaveProperty('resolutionNotes');
        expect(result).not.toHaveProperty('responders');

        // Evidence descriptor isolation: guest receives ONLY redactedPreviewUrl and never originalUrl or GridFS IDs
        expect(result.evidence).toBeDefined();
        expect(result.evidence.viewerAccess).toBe('redacted');
        expect(result.evidence.items).toHaveLength(1);
        expect(result.evidence.items[0].redactedPreviewUrl).toBe('/api/reports/report-1/evidence/0/preview?rv=3.4');
        expect(result.evidence.items[0]).not.toHaveProperty('originalUrl');
        expect(JSON.stringify(result.evidence)).not.toContain('private-image');
    });

    test('adds an ownership capability flag without exposing the reporter identifier', () => {
        const result = toPublicReport(report, { viewerId: 'reporter-1' });

        expect(result.isOwnedByCurrentUser).toBe(true);
        expect(JSON.stringify(result)).not.toContain('reporter-1');
        expect(JSON.stringify(result)).not.toContain('private@example.com');
        expect(result.evidence.viewerAccess).toBe('original');
        expect(result.evidence.items[0].originalUrl).toBe('/api/files/private-image');
    });

    test('always points public evidence at the current redaction contract when stored metadata is stale', () => {
        const result = toPublicReport({
            ...report,
            evidenceMetadata: [{
                index: 0,
                detectionStatus: 'faces_detected',
                redactionType: 'face_blur',
                redactionVersion: '2.0',
                detectorVersion: 'picojs-facefinder-2.0',
            }],
        });

        expect(result.evidence.items[0].redactedPreviewUrl).toBe('/api/reports/report-1/evidence/0/preview?rv=3.4');
    });

    test('exposes resolutionImages to the owner alongside evidence', () => {
        const result = toPublicReport(report, { viewerId: 'reporter-1' });

        expect(result.resolutionImages).toEqual(['/api/files/private-resolution-image']);
        expect(result.images).toEqual(['/api/files/private-image']);
    });

    test('exposes resolutionImages to operational viewers alongside evidence', () => {
        const result = toPublicReport(report, { isOperational: true });

        expect(result.resolutionImages).toEqual(['/api/files/private-resolution-image']);
        expect(result.images).toEqual(['/api/files/private-image']);
    });

    test('exposes resolutionImages to guests as public proof of resolution', () => {
        const result = toPublicReport(report);

        expect(result.resolutionImages).toEqual(['/api/files/private-resolution-image']);
        expect(result).not.toHaveProperty('images');
    });
});
