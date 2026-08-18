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
            expect(canViewEvidence('reporter', true, false)).toBe(false); // No evidence
            expect(canViewEvidence('responder', false, true)).toBe(true);
            expect(canViewEvidence('municipal_admin', false, true)).toBe(true);
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
    });
});
