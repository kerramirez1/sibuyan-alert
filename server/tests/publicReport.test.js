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
        fireInvolved: true,
        casualties: { injured: 2, fatalities: 0, missing: 0 },
        images: ['/api/files/private-image'],
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
        expect(result).not.toHaveProperty('reporter');
        expect(result).not.toHaveProperty('images');
        expect(result).not.toHaveProperty('reportUpdates');
        expect(result).not.toHaveProperty('transferHistory');
        expect(result).not.toHaveProperty('rejectionReason');
        expect(result).not.toHaveProperty('resolutionNotes');
        expect(result).not.toHaveProperty('responders');
    });

    test('adds an ownership capability flag without exposing the reporter identifier', () => {
        const result = toPublicReport(report, { viewerId: 'reporter-1' });

        expect(result.isOwnedByCurrentUser).toBe(true);
        expect(JSON.stringify(result)).not.toContain('reporter-1');
        expect(JSON.stringify(result)).not.toContain('private@example.com');
    });
});

