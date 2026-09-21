import { describe, expect, test } from 'vitest';
import {
    canViewExactCoordinates,
    canViewEvidence,
    canViewOperationalDetails,
    canViewReporterContact,
    canViewReporterIdentity,
    canViewResponseCoordination,
    canViewTransferHistory,
    getIncidentVisibilityRules,
    isAdminRole,
    isOperationalRole,
} from '../utils/incidentDetailsVisibility';

describe('incidentDetailsVisibility utility', () => {
    describe('role categorization', () => {
        test('identifies operational roles', () => {
            expect(isOperationalRole('responder')).toBe(true);
            expect(isOperationalRole('municipal_admin')).toBe(true);
            expect(isOperationalRole('admin')).toBe(true);
            expect(isOperationalRole('system_admin')).toBe(true);
            expect(isOperationalRole('reporter')).toBe(false);
            expect(isOperationalRole('guest')).toBe(false);
            expect(isOperationalRole(undefined)).toBe(false);
        });

        test('identifies admin roles', () => {
            expect(isAdminRole('municipal_admin')).toBe(true);
            expect(isAdminRole('admin')).toBe(true);
            expect(isAdminRole('system_admin')).toBe(true);
            expect(isAdminRole('responder')).toBe(false);
            expect(isAdminRole('reporter')).toBe(false);
            expect(isAdminRole('guest')).toBe(false);
        });
    });

    describe('capability checks', () => {
        test('exact coordinates permission', () => {
            expect(canViewExactCoordinates('guest')).toBe(false);
            expect(canViewExactCoordinates('reporter', false)).toBe(false);
            expect(canViewExactCoordinates('reporter', true)).toBe(true); // Owner can see coordinates
            expect(canViewExactCoordinates('responder')).toBe(true);
            expect(canViewExactCoordinates('municipal_admin')).toBe(true);
        });

        test('reporter identity permission', () => {
            expect(canViewReporterIdentity('guest')).toBe(false);
            expect(canViewReporterIdentity('reporter', false)).toBe(false);
            expect(canViewReporterIdentity('reporter', true)).toBe(true);
            expect(canViewReporterIdentity('responder')).toBe(true);
            expect(canViewReporterIdentity('municipal_admin')).toBe(true);
        });

        test('reporter contact email permission', () => {
            expect(canViewReporterContact('guest')).toBe(false);
            expect(canViewReporterContact('reporter', false)).toBe(false);
            expect(canViewReporterContact('reporter', true)).toBe(true);
            expect(canViewReporterContact('responder', false, false)).toBe(false);
            expect(canViewReporterContact('responder', false, true)).toBe(true); // Assigned responder can view
            expect(canViewReporterContact('municipal_admin')).toBe(true);
        });

        test('evidence photos permission', () => {
            expect(canViewEvidence('guest', false, true)).toBe(false);
            expect(canViewEvidence('reporter', false, true)).toBe(false);
            expect(canViewEvidence('reporter', true, true)).toBe(true);
            expect(canViewEvidence('responder', false, true)).toBe(true);
            expect(canViewEvidence('municipal_admin', false, true)).toBe(true);
        });

        test('evidence section is granted to entitled viewers even with nothing attached', () => {
            // The section is the only place the evidence count is printed, so
            // withholding it when the count is zero left an operator unable to tell
            // "no photos were attached" from "the gallery did not load". Who may see
            // evidence at all is a role question; whether there is any is not.
            expect(canViewEvidence('municipal_admin', false)).toBe(true);
            expect(canViewEvidence('responder', false)).toBe(true);
            expect(canViewEvidence('reporter', true)).toBe(true);

            // Public viewers are not entitled to the evidence view at all: they get
            // the restricted notice instead of an empty state describing a record
            // they cannot see.
            expect(canViewEvidence('guest', false)).toBe(false);
            expect(canViewEvidence('reporter', false)).toBe(false);
        });

        test('transfer history and operational details permission', () => {
            expect(canViewTransferHistory('guest')).toBe(false);
            expect(canViewTransferHistory('reporter')).toBe(false);
            expect(canViewTransferHistory('responder')).toBe(true);
            expect(canViewTransferHistory('municipal_admin')).toBe(true);

            expect(canViewOperationalDetails('guest')).toBe(false);
            expect(canViewOperationalDetails('reporter')).toBe(false);
            expect(canViewOperationalDetails('responder')).toBe(true);

            expect(canViewResponseCoordination('guest')).toBe(false);
            expect(canViewResponseCoordination('reporter', false)).toBe(false);
            expect(canViewResponseCoordination('reporter', true)).toBe(true);
            expect(canViewResponseCoordination('responder')).toBe(true);
        });
    });

    describe('getIncidentVisibilityRules aggregated descriptor', () => {
        test('guest viewer descriptor', () => {
            const rules = getIncidentVisibilityRules({ viewerRole: 'guest', report: { images: ['/img.jpg'] } });
            expect(rules.isOperational).toBe(false);
            expect(rules.isOwner).toBe(false);
            expect(rules.showCoordinates).toBe(false);
            expect(rules.showReporterInfo).toBe(false);
            expect(rules.showReporterContact).toBe(false);
            expect(rules.showEvidence).toBe(false);
            expect(rules.showOperationalDetails).toBe(false);
            expect(rules.showResponseCoordination).toBe(false);
            expect(rules.showTransferHistory).toBe(false);
            expect(rules.showRestrictedNotice).toBe(true);
        });

        test('reporter (owner) descriptor', () => {
            const rules = getIncidentVisibilityRules({
                viewerRole: 'reporter',
                isOwner: true,
                report: { images: ['/img.jpg'], evidenceCount: 1 },
            });
            expect(rules.isOwner).toBe(true);
            expect(rules.showCoordinates).toBe(true);
            expect(rules.showReporterInfo).toBe(true);
            expect(rules.showReporterContact).toBe(true);
            expect(rules.showEvidence).toBe(true);
            expect(rules.showOperationalDetails).toBe(false);
            expect(rules.showRestrictedNotice).toBe(false);
        });

        test('municipal admin descriptor for a report with no evidence attached', () => {
            const rules = getIncidentVisibilityRules({
                viewerRole: 'municipal_admin',
                report: { evidenceCount: 0 },
            });
            // Exactly what the inspector needs to be able to print the absence.
            expect(rules.showEvidence).toBe(true);
            expect(rules.viewerAccess).toBe('none');
            expect(rules.showRestrictedNotice).toBe(false);
        });

        test('municipal admin descriptor', () => {
            const rules = getIncidentVisibilityRules({
                viewerRole: 'municipal_admin',
                report: { images: ['/img.jpg'] },
            });
            expect(rules.isOperational).toBe(true);
            expect(rules.isAdmin).toBe(true);
            expect(rules.showCoordinates).toBe(true);
            expect(rules.showReporterInfo).toBe(true);
            expect(rules.showReporterContact).toBe(true);
            expect(rules.showEvidence).toBe(true);
            expect(rules.showOperationalDetails).toBe(true);
            expect(rules.showResponseCoordination).toBe(true);
            expect(rules.showTransferHistory).toBe(true);
            expect(rules.showRestrictedNotice).toBe(false);
        });

        test('a server-declared redacted payload is never upgraded to original by role', () => {
            // The public projection — the shape every island-wide map pin and
            // every cross-municipality incident arrives in — carries redacted
            // evidence descriptors as its `items`. Inferring "original" from the
            // operator's role would have labelled the section as unprotected
            // evidence the server had already withheld from this viewer.
            const rules = getIncidentVisibilityRules({
                viewerRole: 'municipal_admin',
                report: {
                    evidence: {
                        viewerAccess: 'redacted',
                        evidenceCount: 1,
                        items: [{ index: 0, redactedPreviewUrl: '/api/reports/r1/evidence/0/preview?rv=3.4' }],
                    },
                },
            });

            expect(rules.viewerAccess).toBe('redacted');
            // The rest of the operational descriptor is untouched: role still
            // governs which sections exist, only the evidence boundary is the
            // payload's to declare.
            expect(rules.isOperational).toBe(true);
            expect(rules.showCoordinates).toBe(true);
        });

        test('an operational payload that declares original keeps original access', () => {
            const rules = getIncidentVisibilityRules({
                viewerRole: 'municipal_admin',
                report: { evidence: { viewerAccess: 'original', evidenceCount: 1, items: [{ index: 0, originalUrl: '/api/files/x' }] } },
            });

            expect(rules.viewerAccess).toBe('original');
        });

        test('a guest is never given original access by a payload that claims it', () => {
            const rules = getIncidentVisibilityRules({
                viewerRole: 'guest',
                report: { evidence: { viewerAccess: 'none', evidenceCount: 0, items: [] } },
            });

            expect(rules.viewerAccess).toBe('none');
            expect(rules.showCoordinates).toBe(false);
        });
    });
});
