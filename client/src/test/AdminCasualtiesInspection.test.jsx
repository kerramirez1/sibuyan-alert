import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import IncidentDetailsContent from '../components/incidentDetails/IncidentDetailsContent';
import IncidentDetailsCasualtiesSection from '../components/incidentDetails/IncidentDetailsCasualtiesSection';

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="mock-map-view" />,
}));

vi.mock('../components/report/ProtectedEvidenceGallery', () => ({
    default: ({ images }) => <div data-testid="mock-evidence-gallery">{images?.length || 0} photos</div>,
}));

describe('Admin and Responder Casualty and Affected-Area Inspection Flow', () => {
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
            householdsAffected: 6,
            evacuees: 15,
            radius: 250,
        },
        reporter: { name: 'Maria Santos', email: 'maria@example.com', isVerified: true },
        images: ['/blob-1.jpg'],
        evidenceCount: 1,
    };

    test('1. Renders all three casualty metrics (Injured, Fatalities, Missing) with correct values and ordering', () => {
        render(
            <IncidentDetailsCasualtiesSection
                report={baseReport}
            />
        );

        // Section heading
        expect(screen.getByRole('heading', { level: 3, name: /Casualties and affected area/i })).toBeInTheDocument();

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
            affectedArea: {
                householdsAffected: 0,
                evacuees: 0,
                radius: 0,
            },
        };

        render(
            <IncidentDetailsCasualtiesSection
                report={zeroCasualtyReport}
            />
        );

        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBe(3); // Injured, Fatalities, Missing all display 0

        expect(screen.getByText('No casualties or affected-area impacts recorded.')).toBeInTheDocument();
        expect(screen.queryByText(/Reported people affected:/i)).not.toBeInTheDocument();
    });

    test('3. Removes duplicate casualty summaries from Overview and Safety Indicators for operational viewers', () => {
        render(
            <IncidentDetailsContent
                report={baseReport}
                viewerRole="municipal_admin"
                user={{ role: 'municipal_admin' }}
            />
        );

        // Overview region does not contain duplicate Casualties dt/dd
        const overviewSection = screen.getByRole('region', { name: /Overview/i });
        expect(overviewSection).not.toHaveTextContent(/Casualties/i);
        expect(overviewSection).not.toHaveTextContent(/4 injured/i);

        // Description does not contain duplicated casualty safety indicators
        expect(screen.queryByLabelText(/Critical safety indicators/i)).not.toBeInTheDocument();

        // The single authoritative "Casualties and affected area" section is present
        const casualtiesSection = screen.getByRole('region', { name: /Casualties and affected area/i });
        expect(casualtiesSection).toBeInTheDocument();
        expect(casualtiesSection).toHaveTextContent('Injured');
        expect(casualtiesSection).toHaveTextContent('Fatalities');
        expect(casualtiesSection).toHaveTextContent('Missing');
    });

    test('4. Renders populated affected-area metrics under the dedicated subsection', () => {
        render(
            <IncidentDetailsCasualtiesSection
                report={baseReport}
            />
        );

        expect(screen.getByRole('heading', { level: 4, name: /Affected area/i })).toBeInTheDocument();
        expect(screen.getByText('Households')).toBeInTheDocument();
        expect(screen.getByText('6')).toBeInTheDocument();

        expect(screen.getByText('Evacuees')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();

        expect(screen.getByText('Affected radius')).toBeInTheDocument();
        expect(screen.getByText('250 meters')).toBeInTheDocument();
    });

    test('5. Renders concise affected-area empty state when casualties exist but affected-area is zero', () => {
        const noAffectedAreaReport = {
            ...baseReport,
            affectedArea: {
                householdsAffected: 0,
                evacuees: 0,
                radius: 0,
            },
        };

        render(
            <IncidentDetailsCasualtiesSection
                report={noAffectedAreaReport}
            />
        );

        expect(screen.getByRole('heading', { level: 4, name: /Affected area/i })).toBeInTheDocument();
        expect(screen.getByText('No affected-area impact recorded.')).toBeInTheDocument();
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
        expect(screen.queryByText(/4 injured/i)).not.toBeInTheDocument();
    });

    test('8. Pending report with { injured: 0, fatalities: 2, missing: 4 } renders exact numbers with section note (screenshot scenario)', () => {
        const pendingReport = {
            ...baseReport,
            status: 'pending',
            casualties: {
                injured: 0,
                fatalities: 2,
                missing: 4,
            },
            affectedArea: {
                householdsAffected: 0,
                evacuees: 0,
                radius: 0,
            },
        };

        render(
            <IncidentDetailsCasualtiesSection
                report={pendingReport}
            />
        );

        // Section-level verification note is present
        expect(screen.getByText('Report pending verification')).toBeInTheDocument();

        // Total reported people affected is 6 (0 + 2 + 4)
        expect(screen.getByText(/Reported people affected:/i)).toBeInTheDocument();
        expect(screen.getByText('6')).toBeInTheDocument();

        // Individual metric values: 0 is preserved as 0, never converted to "Pending verification"
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument();
        expect(screen.queryByText('Pending verification')).not.toBeInTheDocument();

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
            <IncidentDetailsCasualtiesSection
                report={emptyCasualtiesReport}
            />
        );

        // Section-level verification note is present
        expect(screen.getByText('Report pending verification')).toBeInTheDocument();

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
            <IncidentDetailsCasualtiesSection
                report={invalidCasualtiesReport}
            />
        );

        const notRecordedCards = screen.getAllByText('Not recorded');
        expect(notRecordedCards.length).toBe(3);
    });

    test('11. Verified report does not render the "Report pending verification" section note', () => {
        const verifiedReport = {
            ...baseReport,
            status: 'verified',
            casualties: {
                injured: 1,
                fatalities: 0,
                missing: 0,
            },
            affectedArea: {
                householdsAffected: 0,
                evacuees: 0,
                radius: 0,
            },
        };

        render(
            <IncidentDetailsCasualtiesSection
                report={verifiedReport}
            />
        );

        expect(screen.queryByText('Report pending verification')).not.toBeInTheDocument();
        // Injured is 1 (card and header total)
        expect(screen.getAllByText('1').length).toBe(2);
        // Fatalities and missing are 0
        expect(screen.getAllByText('0').length).toBe(2);
    });
});

