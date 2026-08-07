import { describe, expect, test } from 'vitest';
import {
    canViewOperationalReport,
    canViewReporterContact,
    canViewReportEvidence,
} from '../utils/reportAccess.js';
import { toOperationalReport, toOperationalReportSummary } from '../utils/operationalReport.js';

const verifiedReport = {
    _id: 'report-1',
    status: 'verified',
    municipalityName: 'Cajidiocan',
    originalMunicipalityName: 'Cajidiocan',
    reporter: { _id: 'reporter-1', name: 'Reporter', email: 'private@example.com', isVerified: true },
    images: ['/api/files/evidence-1/photo.jpg'],
    reportUpdates: [{ _id: 'update-1', message: 'Road is blocked', author: { _id: 'reporter-1', name: 'Reporter' } }],
    transferHistory: [{ _id: 'transfer-1', reason: 'Boundary correction' }],
    responders: [],
};

describe('operational report authorization', () => {
    test('allows an eligible responder only within the current municipal scope', () => {
        expect(canViewOperationalReport({
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        }, verifiedReport)).toBe(true);

        expect(canViewOperationalReport({
            _id: 'responder-2',
            role: 'responder',
            assignedMunicipality: 'Magdiwang',
        }, verifiedReport)).toBe(false);
    });

    test('keeps pending reports private from unassigned responders', () => {
        expect(canViewOperationalReport({
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        }, { ...verifiedReport, status: 'pending' })).toBe(false);
    });

    test('allows an assigned responder after transfer while limiting reporter contact to assigned responders', () => {
        const transferredReport = {
            ...verifiedReport,
            status: 'transferred',
            municipalityName: 'Magdiwang',
            responders: [{ user: 'responder-1' }],
        };
        const responder = {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        const unassignedResponder = {
            _id: 'responder-2',
            role: 'responder',
            assignedMunicipality: 'Magdiwang',
        };

        expect(canViewOperationalReport(responder, transferredReport)).toBe(true);
        expect(canViewReporterContact(responder, transferredReport)).toBe(true);
        expect(canViewReporterContact(unassignedResponder, transferredReport)).toBe(false);
        expect(canViewReportEvidence(responder, transferredReport)).toBe(true);
    });

    test('allows municipal administrators in the current or original municipality', () => {
        const transferredReport = { ...verifiedReport, municipalityName: 'Magdiwang' };
        expect(canViewOperationalReport({ role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' }, transferredReport)).toBe(true);
        expect(canViewOperationalReport({ role: 'municipal_admin', assignedMunicipality: 'Magdiwang' }, transferredReport)).toBe(true);
        expect(canViewOperationalReport({ role: 'municipal_admin', assignedMunicipality: 'San Fernando' }, transferredReport)).toBe(false);
    });
});

describe('operational report DTOs', () => {
    test('keeps bulk summaries small and excludes evidence, updates, reasons, and reporter contact', () => {
        const summary = toOperationalReportSummary(verifiedReport);
        expect(summary.detailCompleteness).toBe('summary');
        expect(summary.evidenceCount).toBe(1);
        expect(summary.updateCount).toBe(1);
        expect(summary.reporter.email).toBeUndefined();
        expect(summary.images).toBeUndefined();
        expect(summary.reportUpdates).toBeUndefined();
        expect(summary.transferHistory).toBeUndefined();
    });

    test('returns allowlisted full details and conditionally exposes contact and admin-only reasons', () => {
        const responderView = toOperationalReport(verifiedReport);
        expect(responderView.detailCompleteness).toBe('full');
        expect(responderView.evidenceCount).toBe(1);
        expect(responderView.images).toHaveLength(1);
        expect(responderView.reportUpdates).toHaveLength(1);
        expect(responderView.reporter.email).toBeUndefined();
        expect(responderView.transferHistory[0].reason).toBeUndefined();

        const assignedView = toOperationalReport(verifiedReport, { includeReporterContact: true });
        expect(assignedView.reporter.email).toBe('private@example.com');

        const adminView = toOperationalReport(verifiedReport, { includeAdministrative: true });
        expect(adminView.transferHistory[0].reason).toBe('Boundary correction');
    });
});
