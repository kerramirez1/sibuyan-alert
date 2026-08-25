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
        affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
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
        expect(screen.getByText('juan@example.com')).toBeInTheDocument();
        expect(screen.getByText('Philippine National Police')).toBeInTheDocument();
        expect(screen.queryByText(/Personal identities, evidence, and internal coordination details are protected/i)).not.toBeInTheDocument();
    });

    test('renders owner details for reporter viewing their own report', () => {
        render(
            <IncidentDetailsContent
                report={{ ...sampleReport, isOwnedByCurrentUser: true }}
                viewerRole="reporter"
                user={{ _id: 'reporter-1', role: 'reporter' }}
            />
        );

        expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        expect(screen.getByTestId('mock-evidence-gallery')).toBeInTheDocument();
        expect(screen.getAllByText('Juan Dela Cruz').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(/Personal identities, evidence, and internal coordination details are protected/i)).not.toBeInTheDocument();
    });

    test('renders transferred jurisdiction banner when viewed by originating municipality user', () => {
        const transferredReport = {
            ...sampleReport,
            status: 'transferred',
            municipalityName: 'Magdiwang',
            originalMunicipalityName: 'Cajidiocan',
            transferHistory: [
                { fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'Magdiwang', reason: 'Cross boundary' },
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
        expect(screen.getByText(/This incident was transferred to/i)).toBeInTheDocument();
        expect(screen.getByText(/for active response coordination/i)).toBeInTheDocument();
    });

    test('does not render transferred jurisdiction banner when viewed by receiving municipality user', () => {
        const transferredReport = {
            ...sampleReport,
            status: 'transferred',
            municipalityName: 'Magdiwang',
            originalMunicipalityName: 'Cajidiocan',
            transferHistory: [
                { fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'Magdiwang', reason: 'Cross boundary' },
            ],
        };

        render(
            <IncidentDetailsContent
                report={transferredReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin', assignedMunicipality: 'Magdiwang' }}
            />
        );

        expect(screen.queryByText('Jurisdiction Transferred')).not.toBeInTheDocument();
    });

    test('renders Awaiting Admin Verification banner when report is pending', () => {
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

    test('renders single authoritative casualty section and removes duplicate overview row for operational viewers', () => {
        const multiCasualtyReport = {
            ...sampleReport,
            casualties: { injured: 3, fatalities: 1, missing: 2 },
            affectedArea: { householdsAffected: 5, evacuees: 12, radius: 100 },
        };

        render(
            <IncidentDetailsContent
                report={multiCasualtyReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        // Heading exists
        expect(screen.getByText('Casualties and affected area')).toBeInTheDocument();
        expect(screen.getByText(/Reported people affected:/i)).toBeInTheDocument();
        expect(screen.getByText('6')).toBeInTheDocument(); // 3 + 1 + 2

        // Casualty metrics render
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('Fatalities')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('Missing')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        // Affected area fields render
        expect(screen.getByText('Households')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('Evacuees')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('Affected radius')).toBeInTheDocument();
        expect(screen.getByText('100 meters')).toBeInTheDocument();

        // Overview does NOT contain duplicate casualties summary row
        const overviewSection = screen.getByRole('region', { name: /Overview/i });
        expect(overviewSection).not.toHaveTextContent(/Casualties/i);
    });

    test('renders empty affected-area state cleanly when affected area is zero', () => {
        const casualtiesOnlyReport = {
            ...sampleReport,
            casualties: { injured: 0, fatalities: 0, missing: 0 },
            affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
        };

        render(
            <IncidentDetailsContent
                report={casualtiesOnlyReport}
                viewerRole="responder"
                user={{ role: 'responder' }}
            />
        );

        expect(screen.getByText('No casualties or affected-area impacts recorded.')).toBeInTheDocument();
    });
});
