import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import IncidentDetailsContent from '../components/incidentDetails/IncidentDetailsContent';
import IncidentDetailsCoreSection from '../components/incidentDetails/IncidentDetailsCoreSection';
import ResponderIncidentInspector from '../components/adminReports/ResponderIncidentInspector';

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="mock-map-view" />,
}));

vi.mock('../components/report/ProtectedEvidenceGallery', () => ({
    default: ({ images }) => <div data-testid="mock-evidence-gallery">{images?.length || 0} photos</div>,
}));

describe('Admin and Responder Casualty and Non-Duplicated Overview Inspection Flow', () => {
    const baseReport = {
        _id: 'report-c-101',
        address: 'Barangay Poblacion, San Fernando',
        barangay: 'Poblacion',
        municipalityName: 'San Fernando',
        incidentType: 'vehicular',
        severity: 'severe',
        status: 'verified',
        incidentTime: '2026-08-20T08:00:00.000Z',
        createdAt: '2026-08-20T08:15:00.000Z',
        description: 'Multi-vehicle collision on national road.',
        fireInvolved: false,
        coordinates: { lat: 12.3812, lng: 122.5614 },
        casualties: {
            injured: 4,
            fatalities: 1,
            missing: 2,
        },
        affectedArea: {
            householdsAffected: 0,
            evacuees: 0,
            radius: 0,
        },
        reporter: { name: 'Maria Santos', email: 'maria@example.com', isVerified: true },
        images: ['/blob-1.jpg'],
        evidenceCount: 1,
    };

    test('1. Renders all three casualty metrics (Injured, Fatalities, Missing) inside Overview with correct values and ordering', () => {
        render(
            <IncidentDetailsCoreSection
                report={baseReport}
                showCasualties
            />
        );

        // Section heading
        expect(screen.getByRole('heading', { level: 3, name: /Overview/i })).toBeInTheDocument();
        expect(screen.getByText('Casualty summary')).toBeInTheDocument();

        // Reported total
        expect(screen.getByText(/Reported people affected:/i)).toBeInTheDocument();
        expect(screen.getByText('7')).toBeInTheDocument(); // 4 + 1 + 2

        // Metric breakdown
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();

        expect(screen.getByText('Fatalities')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();

        expect(screen.getByText('Missing')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    test('2. Preserves and renders zero casualty values clearly', () => {
        const zeroCasualtyReport = {
            ...baseReport,
            casualties: {
                injured: 0,
                fatalities: 0,
                missing: 0,
            },
        };

        render(
            <IncidentDetailsCoreSection
                report={zeroCasualtyReport}
                showCasualties
            />
        );

        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBe(3); // Injured, Fatalities, Missing all display 0
        expect(screen.queryByText(/Reported people affected:/i)).not.toBeInTheDocument();
    });

    test('3. Municipal Admin Overview contains Casualty summary and unified Reporter info, with NO duplicate affected area or reporter section', () => {
        render(
            <IncidentDetailsContent
                report={baseReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        // Overview region contains Casualty Summary
        const overviewSection = screen.getByRole('region', { name: /Overview/i });
        expect(overviewSection).toHaveTextContent('Casualty summary');
        expect(overviewSection).toHaveTextContent('Injured');
        expect(overviewSection).toHaveTextContent('4');
        expect(overviewSection).toHaveTextContent('Fatalities');
        expect(overviewSection).toHaveTextContent('1');
        expect(overviewSection).toHaveTextContent('Missing');
        expect(overviewSection).toHaveTextContent('2');

        // Reporter name and email are rendered inside Overview only ONCE
        expect(overviewSection).toHaveTextContent('Maria Santos');
        expect(overviewSection).toHaveTextContent('maria@example.com');
        expect(overviewSection).toHaveTextContent('Reporter account status');
        expect(overviewSection).toHaveTextContent('Verified');
        expect(screen.getAllByText('Maria Santos').length).toBe(1);

        // No separate "Affected area" section is rendered
        expect(screen.queryByRole('heading', { level: 3, name: /Affected area/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: /Affected area/i })).not.toBeInTheDocument();

        // No separate "Reporter information" section is rendered
        expect(screen.queryByRole('heading', { level: 3, name: /Reporter information/i })).not.toBeInTheDocument();
    });

    test('4. Responder Overview contains Casualty summary and hides reporter email by default with NO duplicate sections', () => {
        render(
            <IncidentDetailsContent
                report={baseReport}
                viewerRole="responder"
                user={{ role: 'responder' }}
            />
        );

        const overviewSection = screen.getByRole('region', { name: /Overview/i });
        expect(overviewSection).toHaveTextContent('Casualty summary');
        expect(overviewSection).toHaveTextContent('Injured');
        expect(overviewSection).toHaveTextContent('4');

        // Responder sees reporter name only once and does NOT see email
        expect(overviewSection).toHaveTextContent('Maria Santos');
        expect(overviewSection).not.toHaveTextContent('maria@example.com');
        expect(screen.getAllByText('Maria Santos').length).toBe(1);

        // No duplicate sections
        expect(screen.queryByRole('heading', { level: 3, name: /Affected area/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 3, name: /Reporter information/i })).not.toBeInTheDocument();
    });

    test('5. No empty affected-area placeholder text is rendered in the UI', () => {
        render(
            <IncidentDetailsContent
                report={baseReport}
                viewerRole="responder"
                user={{ role: 'responder' }}
            />
        );

        expect(screen.queryByText(/No casualties or affected-area impacts recorded/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/No affected-area impacts recorded/i)).not.toBeInTheDocument();
    });

    test('6. Overview casualty summary uses consistent 3-part format for guest/public viewers without operational details', () => {
        render(
            <IncidentDetailsContent
                report={baseReport}
                viewerRole="guest"
            />
        );

        const overviewSection = screen.getByRole('region', { name: /Overview/i });
        expect(overviewSection).toHaveTextContent(/4 injured · 1 fatalities · 2 missing/i);
    });

    test('7. Renders non-casualty hazard indicators in safety indicators when fire is involved', () => {
        const fireReport = {
            ...baseReport,
            fireInvolved: true,
            fireType: 'structural_fire',
        };

        render(
            <IncidentDetailsContent
                report={fireReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        // Fire is listed in safety indicators without repeating casualty counts
        expect(screen.getByLabelText(/Critical safety indicators/i)).toBeInTheDocument();
        expect(screen.getByText('Fire or explosion involved')).toBeInTheDocument();
    });

    test('8. Pending report with { injured: 0, fatalities: 2, missing: 4 } renders exact numbers inside Overview without duplicate pending verification in casualty heading', () => {
        const pendingReport = {
            ...baseReport,
            status: 'pending',
            casualties: {
                injured: 0,
                fatalities: 2,
                missing: 4,
            },
        };

        render(
            <IncidentDetailsCoreSection
                report={pendingReport}
                showCasualties
            />
        );

        // Heading is clean without duplicate pending verification note
        expect(screen.getByText('Casualty summary')).toBeInTheDocument();
        expect(screen.queryByText('Report pending verification')).not.toBeInTheDocument();

        // Total reported people affected is 6 (0 + 2 + 4)
        expect(screen.getByText(/Reported people affected:/i)).toBeInTheDocument();
        expect(screen.getByText('6')).toBeInTheDocument();

        // Individual metric values: 0 is preserved as 0, never converted to "Pending verification"
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument();

        expect(screen.getByText('Fatalities')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        expect(screen.getByText('Missing')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
    });

    test('9. Missing or null casualty fields render "Not recorded" consistently without crashing', () => {
        const emptyCasualtiesReport = {
            ...baseReport,
            status: 'pending',
            casualties: {
                injured: null,
                fatalities: undefined,
                missing: '',
            },
        };

        render(
            <IncidentDetailsCoreSection
                report={emptyCasualtiesReport}
                showCasualties
            />
        );

        const notRecordedCards = screen.getAllByText('Not recorded');
        expect(notRecordedCards.length).toBe(3); // Injured, Fatalities, Missing
    });

    test('10. Invalid non-numeric strings or negative numbers normalize to "Not recorded"', () => {
        const invalidCasualtiesReport = {
            ...baseReport,
            casualties: {
                injured: 'Pending verification',
                fatalities: -2,
                missing: 'N/A',
            },
        };

        render(
            <IncidentDetailsCoreSection
                report={invalidCasualtiesReport}
                showCasualties
            />
        );

        const notRecordedCards = screen.getAllByText('Not recorded');
        expect(notRecordedCards.length).toBe(3);
    });

    test('11. Verified report renders normalized numbers cleanly', () => {
        const verifiedReport = {
            ...baseReport,
            status: 'verified',
            casualties: {
                injured: 1,
                fatalities: 0,
                missing: 0,
            },
        };

        render(
            <IncidentDetailsCoreSection
                report={verifiedReport}
                showCasualties
            />
        );

        expect(screen.queryByText('Report pending verification')).not.toBeInTheDocument();
        // Injured is 1 (card and header total)
        expect(screen.getAllByText('1').length).toBe(2);
        // Fatalities and missing are 0
        expect(screen.getAllByText('0').length).toBe(2);
    });

    test('12. Responder cannot see admin-only Verify/Reject actions in inspector drawer, while Municipal Admin retains them', () => {
        const pendingReport = {
            ...baseReport,
            status: 'pending',
            municipality: { _id: 'muni-1', name: 'San Fernando' },
            municipalityName: 'San Fernando',
        };

        // Responder view: no verify or reject buttons
        const { unmount } = render(
            <ResponderIncidentInspector
                open
                report={pendingReport}
                user={{ _id: 'user-resp', role: 'responder', assignedMunicipality: 'San Fernando' }}
                onClose={vi.fn()}
            />
        );

        expect(screen.queryByRole('button', { name: /Verify report/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Reject report/i })).not.toBeInTheDocument();
        unmount();

        // Municipal Admin view: verify and reject buttons are available for pending report
        render(
            <ResponderIncidentInspector
                open
                report={pendingReport}
                user={{ _id: 'user-admin', role: 'municipal_admin', assignedMunicipality: 'San Fernando' }}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: /Verify report/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reject report/i })).toBeInTheDocument();
    });
});

