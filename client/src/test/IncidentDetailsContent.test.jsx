import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import IncidentDetailsContent from '../components/incidentDetails/IncidentDetailsContent';

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="mock-map-view" />,
}));

vi.mock('../components/report/ProtectedEvidenceGallery', () => ({
    default: ({ images }) => <div data-testid="mock-evidence-gallery">{images.length} photos</div>,
}));

describe('IncidentDetailsContent', () => {
    const sampleReport = {
        _id: 'report-999',
        address: 'Crossing Poblacion, Cajidiocan',
        barangay: 'Poblacion',
        municipalityName: 'Cajidiocan',
        incidentType: 'vehicular',
        severity: 'severe',
        status: 'verified',
        incidentTime: '2026-08-16T12:00:00.000Z',
        createdAt: '2026-08-16T12:10:00.000Z',
        description: 'Two motorcycles collided at the intersection.',
        coordinates: { lat: 12.4044, lng: 122.6897 },
        casualties: { injured: 2, fatalities: 0, missing: 0 },
        reporter: { name: 'Juan Dela Cruz', email: 'juan@example.com', isVerified: true },
        images: ['/image1.jpg'],
        evidenceCount: 1,
        respondedBy: { name: 'Officer Santos', agency: 'pnp' },
        respondedAt: '2026-08-16T12:15:00.000Z',
    };

    test('renders sanitized public summary for guest viewer without reporter identity or evidence', () => {
        render(
            <IncidentDetailsContent
                report={sampleReport}
                viewerRole="guest"
            />
        );

        expect(screen.getByText('Two motorcycles collided at the intersection.')).toBeInTheDocument();
        expect(screen.getByText('Crossing Poblacion, Cajidiocan')).toBeInTheDocument();
        expect(screen.getByText(/2 injured · 0 fatalities · 0 missing/i)).toBeInTheDocument();

        // Coordinates, evidence, reporter name, contact should NOT be shown to guests
        expect(screen.queryByText('12.404400, 122.689700')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-evidence-gallery')).not.toBeInTheDocument();
        expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
        expect(screen.queryByText('juan@example.com')).not.toBeInTheDocument();
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are protected/i)).toBeInTheDocument();
    });

    test('states that no evidence is attached for an operator, instead of dropping the section', () => {
        render(
            <IncidentDetailsContent
                report={{ ...sampleReport, images: [], evidenceCount: 0 }}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        // The section used to be withheld from everyone when the count was zero,
        // which left the inspector unable to answer "were any photos attached?" for
        // a record it was inviting an operator to act on. Stated, not dropped.
        expect(screen.getByText('Evidence photos (0)')).toBeInTheDocument();
        expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
        expect(screen.queryByTestId('mock-evidence-gallery')).not.toBeInTheDocument();
    });

    test('renders full operational details for municipal admin including coordinates, evidence, and reporter', () => {
        render(
            <IncidentDetailsContent
                report={sampleReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        expect(screen.getByTestId('mock-evidence-gallery')).toBeInTheDocument();
        expect(screen.getAllByText('Juan Dela Cruz').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('status', { name: 'Verified reporter' })).toBeInTheDocument();
        expect(screen.getByText('juan@example.com')).toBeInTheDocument();
        expect(screen.getAllByText('Philippine National Police').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(/Personal identities, evidence, and internal coordination details are protected/i)).not.toBeInTheDocument();
    });

    test('does not render verified badge when reporter is not verified', () => {
        const unverifiedReport = {
            ...sampleReport,
            reporter: { name: 'Unverified Pedro', email: 'pedro@example.com', isVerified: false },
        };
        render(
            <IncidentDetailsContent
                report={unverifiedReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        expect(screen.getByText('Unverified Pedro')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });

    test('does not render verified reporter badge when reporter role is non-reporter even if isVerified is true', () => {
        const responderReport = {
            ...sampleReport,
            reporter: { name: 'Responder Santos', email: 'santos@example.com', role: 'responder', isVerified: true },
        };
        render(
            <IncidentDetailsContent
                report={responderReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        expect(screen.getByText('Responder Santos')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });

    test('renders owner details for reporter viewing their own report', () => {
        render(
            <IncidentDetailsContent
                report={{ ...sampleReport, isOwnedByCurrentUser: true }}
                viewerRole="reporter"
                user={{ _id: 'user-reporter', role: 'reporter' }}
            />
        );

        expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        expect(screen.getByTestId('mock-evidence-gallery')).toBeInTheDocument();
        expect(screen.queryByText(/Personal identities, evidence, and internal coordination details are protected/i)).not.toBeInTheDocument();
    });

    test('renders transferred jurisdiction banner for originating municipal admin', () => {
        const transferredReport = {
            ...sampleReport,
            municipalityName: 'San Fernando',
            originalMunicipalityName: 'Cajidiocan',
            transferHistory: [
                {
                    fromMunicipalityName: 'Cajidiocan',
                    toMunicipalityName: 'San Fernando',
                    transferredAt: '2026-08-16T12:30:00.000Z',
                },
            ],
        };

        render(
            <IncidentDetailsContent
                report={transferredReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' }}
            />
        );

        expect(screen.getByText('Jurisdiction Transferred')).toBeInTheDocument();
        // Banner + viewer-aware location line both address the origin admin.
        expect(screen.getAllByText(/transferred to/i)).toHaveLength(2);
        // Physical location stays with the origin despite the handling change.
        expect(screen.getByText('Poblacion, Cajidiocan')).toBeInTheDocument();
        expect(screen.queryByText('Poblacion, San Fernando')).not.toBeInTheDocument();
    });

    test('renders pending verification review banner for pending status', () => {
        const pendingReport = {
            ...sampleReport,
            status: 'pending',
        };

        render(
            <IncidentDetailsContent
                report={pendingReport}
                viewerRole="responder"
                user={{ role: 'responder', assignedMunicipality: 'Cajidiocan' }}
            />
        );

        expect(screen.getByText('Awaiting Admin Verification')).toBeInTheDocument();
        expect(screen.getByText(/pending formal verification by a municipal administrator/i)).toBeInTheDocument();
    });

    test('renders internal casualty summary inside Overview and no separate reporter section for operational viewers', () => {
        const multiCasualtyReport = {
            ...sampleReport,
            casualties: { injured: 3, fatalities: 1, missing: 2 },
        };

        render(
            <IncidentDetailsContent
                report={multiCasualtyReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        // Overview heading exists and contains Casualty Summary
        const overviewSection = screen.getByRole('region', { name: /Overview/i });
        expect(overviewSection).toBeInTheDocument();
        expect(overviewSection).toHaveTextContent('Casualty summary');
        expect(overviewSection).toHaveTextContent(/Reported people affected:/i);
        expect(overviewSection).toHaveTextContent('6'); // 3 + 1 + 2

        // Casualty metrics render inside Overview
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('Fatalities')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('Missing')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        // Reporter name appears only once
        expect(screen.getAllByText('Juan Dela Cruz').length).toBe(1);

        // No separate affected area or reporter section
        expect(screen.queryByRole('heading', { level: 3, name: /Affected area/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 3, name: /Reporter information/i })).not.toBeInTheDocument();
    });

    test('does not render stale affected-area placeholder text', () => {
        const casualtiesOnlyReport = {
            ...sampleReport,
            casualties: { injured: 0, fatalities: 0, missing: 0 },
        };

        render(
            <IncidentDetailsContent
                report={casualtiesOnlyReport}
                viewerRole="responder"
                user={{ role: 'responder' }}
            />
        );

        expect(screen.queryByText(/No casualties or affected-area impacts recorded/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/No affected-area impacts recorded/i)).not.toBeInTheDocument();
    });
});

describe('IncidentDetailsContent — resolution photos section gating', () => {
    const operatorReport = {
        _id: 'report-999',
        address: 'Crossing Poblacion, Cajidiocan',
        barangay: 'Poblacion',
        municipalityName: 'Cajidiocan',
        incidentType: 'vehicular',
        severity: 'severe',
        incidentTime: '2026-08-16T12:00:00.000Z',
        description: 'Two motorcycles collided at the intersection.',
        coordinates: { lat: 12.4044, lng: 122.6897 },
        reporter: { name: 'Juan Dela Cruz', email: 'juan@example.com', isVerified: true },
        images: ['/image1.jpg'],
        evidenceCount: 1,
    };

    const renderAsOperator = (report) => render(
        <IncidentDetailsContent
            report={report}
            viewerRole="municipal_admin"
            user={{ role: 'municipal_admin' }}
        />
    );

    test('hides the resolution photos section for a responding incident', () => {
        renderAsOperator({ ...operatorReport, status: 'responding' });

        // The evidence section still renders; the resolution one does not.
        expect(screen.queryByText(/Resolution photos/)).not.toBeInTheDocument();
    });

    test('shows the resolution photos section with the empty note for a resolved incident without photos', () => {
        renderAsOperator({ ...operatorReport, status: 'resolved', resolutionImages: [] });

        expect(screen.getByText('Resolution photos (0)')).toBeInTheDocument();
        expect(screen.getByText('No resolution photos attached.')).toBeInTheDocument();
    });

    test('shows the resolution photos section with photos for a resolved incident', () => {
        renderAsOperator({
            ...operatorReport,
            status: 'resolved',
            resolutionImages: ['/res1.jpg', '/res2.jpg'],
        });

        expect(screen.getByText('Resolution photos (2)')).toBeInTheDocument();
    });
});
