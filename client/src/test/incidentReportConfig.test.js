import { describe, expect, test } from 'vitest';
import {
    getIncidentCapabilities,
    isWithinMunicipalAdminScope,
    isWithinResponderScope,
} from '../components/adminReports/incidentReportConfig';

describe('incidentReportConfig capabilities and jurisdiction', () => {
    const transferredReport = {
        _id: 'report-1',
        status: 'transferred',
        municipalityName: 'Magdiwang',
        originalMunicipalityName: 'Cajidiocan',
        transferHistory: [
            {
                fromMunicipalityName: 'Cajidiocan',
                toMunicipalityName: 'Magdiwang',
                reason: 'Mutual aid',
                transferredAt: '2026-08-16T12:00:00.000Z',
            },
        ],
    };

    const pendingReport = {
        _id: 'report-2',
        status: 'pending',
        municipalityName: 'Cajidiocan',
    };

    test('restricts municipal admin actions to reports in their assigned municipality', () => {
        const cajidiocanAdmin = { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };
        const magdiwangAdmin = { role: 'municipal_admin', assignedMunicipality: 'Magdiwang' };

        // Pending report in Cajidiocan: Cajidiocan admin can verify/reject, Magdiwang cannot
        expect(isWithinMunicipalAdminScope(cajidiocanAdmin, pendingReport)).toBe(true);
        expect(isWithinMunicipalAdminScope(magdiwangAdmin, pendingReport)).toBe(false);

        const cajidiocanPendingCaps = getIncidentCapabilities(cajidiocanAdmin, pendingReport);
        expect(cajidiocanPendingCaps.canVerify).toBe(true);
        expect(cajidiocanPendingCaps.canReject).toBe(true);
        expect(cajidiocanPendingCaps.canDelete).toBe(true);

        const magdiwangPendingCaps = getIncidentCapabilities(magdiwangAdmin, pendingReport);
        expect(magdiwangPendingCaps.canVerify).toBe(false);
        expect(magdiwangPendingCaps.canReject).toBe(false);
        expect(magdiwangPendingCaps.canDelete).toBe(false);
    });

    test('disables mutation actions for originating admin on transferred reports', () => {
        const cajidiocanAdmin = { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };
        const magdiwangAdmin = { role: 'municipal_admin', assignedMunicipality: 'Magdiwang' };

        // Transferred report (now in Magdiwang): Cajidiocan admin has read-only access
        expect(isWithinMunicipalAdminScope(cajidiocanAdmin, transferredReport)).toBe(false);
        expect(isWithinMunicipalAdminScope(magdiwangAdmin, transferredReport)).toBe(true);

        const cajidiocanCaps = getIncidentCapabilities(cajidiocanAdmin, transferredReport);
        expect(cajidiocanCaps.canInspect).toBe(true);
        expect(cajidiocanCaps.canVerify).toBe(false);
        expect(cajidiocanCaps.canTransfer).toBe(false);
        expect(cajidiocanCaps.canDelete).toBe(false);
        expect(cajidiocanCaps.canAcknowledgeTransfer).toBe(false);
        // Origin admin may dismiss the read-only copy from their own queue
        expect(cajidiocanCaps.canDismiss).toBe(true);

        // Magdiwang admin has operational authority
        const magdiwangCaps = getIncidentCapabilities(magdiwangAdmin, transferredReport);
        expect(magdiwangCaps.canInspect).toBe(true);
        expect(magdiwangCaps.canTransfer).toBe(true);
        expect(magdiwangCaps.canAcknowledgeTransfer).toBe(true);
        expect(magdiwangCaps.canDelete).toBe(true);
        expect(magdiwangCaps.canDismiss).toBe(false);
    });

    test('grants dismiss from the names-only summary trail (no full history needed)', () => {
        const cajidiocanAdmin = { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };
        const summaryShaped = {
            _id: 'report-9',
            status: 'responding',
            municipalityName: 'San Fernando',
            originalMunicipalityName: 'Cajidiocan',
            transferTrail: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'San Fernando' }],
        };
        const caps = getIncidentCapabilities(cajidiocanAdmin, summaryShaped);
        expect(caps.canDelete).toBe(false);
        expect(caps.canDismiss).toBe(true);
    });

    test('disables respond action for originating responders on transferred reports', () => {
        const cajidiocanResponder = { _id: 'resp-1', role: 'responder', assignedMunicipality: 'Cajidiocan' };
        const magdiwangResponder = { _id: 'resp-2', role: 'responder', assignedMunicipality: 'Magdiwang' };

        expect(isWithinResponderScope(cajidiocanResponder, transferredReport)).toBe(false);
        expect(isWithinResponderScope(magdiwangResponder, transferredReport)).toBe(true);

        const cajidiocanCaps = getIncidentCapabilities(cajidiocanResponder, transferredReport);
        expect(cajidiocanCaps.canRespond).toBe(false);

        const magdiwangCaps = getIncidentCapabilities(magdiwangResponder, transferredReport);
        expect(magdiwangCaps.canRespond).toBe(true);
    });

    test('allows responders to inspect pending reports in their municipality without admin verification powers', () => {
        const localResponder = { _id: 'resp-1', role: 'responder', assignedMunicipality: 'Cajidiocan' };
        const otherResponder = { _id: 'resp-2', role: 'responder', assignedMunicipality: 'Magdiwang' };

        const localCaps = getIncidentCapabilities(localResponder, pendingReport);
        expect(localCaps.canInspect).toBe(true);
        expect(localCaps.canVerify).toBe(false);
        expect(localCaps.canReject).toBe(false);
        expect(localCaps.canTransfer).toBe(false);
        expect(localCaps.canDelete).toBe(false);

        const otherCaps = getIncidentCapabilities(otherResponder, pendingReport);
        expect(otherCaps.canInspect).toBe(true);
        expect(otherCaps.canRespond).toBe(false);
        expect(otherCaps.canVerify).toBe(false);
        expect(otherCaps.canReject).toBe(false);
        expect(otherCaps.canTransfer).toBe(false);
        expect(otherCaps.canDelete).toBe(false);
    });

    test('disallows transferring incidents with an ongoing response', () => {
        const cajidiocanAdmin = { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

        // 1. Responding report
        const respondingReport = {
            _id: 'report-resp-1',
            status: 'responding',
            municipalityName: 'Cajidiocan',
            responders: [{ user: 'resp-user-1', unitName: 'MDRRMO Rescue' }],
        };
        const respondingCaps = getIncidentCapabilities(cajidiocanAdmin, respondingReport);
        expect(respondingCaps.canTransfer).toBe(false);

        // 2. Verified report with active responders (ongoing response guard)
        const verifiedWithResponders = {
            _id: 'report-resp-2',
            status: 'verified',
            municipalityName: 'Cajidiocan',
            responders: [{ user: 'resp-user-1' }],
        };
        const verifiedRespondersCaps = getIncidentCapabilities(cajidiocanAdmin, verifiedWithResponders);
        expect(verifiedRespondersCaps.canTransfer).toBe(false);

        // 3. Clean verified report without responders is transferable
        const verifiedClean = {
            _id: 'report-resp-3',
            status: 'verified',
            municipalityName: 'Cajidiocan',
            responders: [],
        };
        const verifiedCleanCaps = getIncidentCapabilities(cajidiocanAdmin, verifiedClean);
        expect(verifiedCleanCaps.canTransfer).toBe(true);
    });
});
