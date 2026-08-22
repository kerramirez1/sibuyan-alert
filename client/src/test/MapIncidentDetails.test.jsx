import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MapIncidentDetails from '../components/map/MapIncidentDetails';

const mocks = vi.hoisted(() => ({
    getReportById: vi.fn(),
    getPublicReportById: vi.fn(),
    getProtected: vi.fn(),
}));

vi.mock('../services/api', () => ({
    adminAPI: { getReportById: mocks.getReportById },
    reportsAPI: { getById: mocks.getPublicReportById },
    filesAPI: { getProtected: mocks.getProtected },
}));

const sampleReport = {
    _id: 'report-1',
    title: 'Accident at J. Rizal Street',
    incidentType: 'motorcycle',
    status: 'verified',
    severity: 'moderate',
    address: 'J. Rizal Street',
    barangay: 'Poblacion',
    municipalityName: 'Cajidiocan',
    incidentTime: '2026-08-01T02:00:00Z',
    createdAt: '2026-08-01T02:05:00Z',
    updatedAt: '2026-08-01T03:00:00Z',
    description: 'Motorcycle collision on road curve.',
    coordinates: { lat: 12.4044, lng: 122.6897 },
    fireInvolved: true,
    casualties: { injured: 2, fatalities: 0, missing: 0 },
    respondingAgencies: ['MDRRMO'],
    reporter: { name: 'Private Reporter', email: 'private@example.com' },
    evidenceCount: 1,
    evidence: {
        accessLevel: 'blurred',
        count: 1,
        items: [
            {
                id: '0',
                index: 0,
                previewUrl: '/api/reports/report-1/evidence/0/preview',
                alt: 'Blurred evidence preview',
                accessLevel: 'blurred',
            },
        ],
    },
    images: ['/api/reports/report-1/evidence/0/preview'],
};

const renderDetails = (props = {}) => render(
    <MemoryRouter initialEntries={['/dashboard?view=map']}>
        <MapIncidentDetails report={sampleReport} {...props} />
    </MemoryRouter>,
);

describe('MapIncidentDetails Component in Map Dashboard', () => {
    beforeEach(() => {
        mocks.getReportById.mockReset();
        mocks.getPublicReportById.mockReset();
        mocks.getProtected.mockReset();
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...sampleReport,
                    images: ['/operational-evidence.jpg'],
                    evidence: {
                        accessLevel: 'original',
                        count: 1,
                        items: [{ id: '0', previewUrl: '/operational-evidence.jpg', accessLevel: 'original' }],
                    },
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                },
            },
        });
        mocks.getPublicReportById.mockResolvedValue({
            data: {
                data: {
                    ...sampleReport,
                    detailCompleteness: 'full',
                },
            },
        });
    });

    test('1. Renders canonical structure and blurred evidence for guest users', async () => {
        const onLocate = vi.fn();
        renderDetails({ viewerRole: 'guest', onLocate });

        // Incident Header
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(/moderate/i)).toBeInTheDocument();
        expect(screen.getAllByText(/verified/i).length).toBeGreaterThanOrEqual(1);

        // Location & Timing
        expect(screen.getByText('Poblacion')).toBeInTheDocument();
        expect(screen.getByText('Cajidiocan')).toBeInTheDocument();
        expect(screen.getByText(/GPS: 12.4044, 122.6897/i)).toBeInTheDocument();

        // Description & Indicators
        expect(screen.getByText('Motorcycle collision on road curve.')).toBeInTheDocument();
        expect(screen.getByText(/Fire or explosion involved/i)).toBeInTheDocument();

        // Response Info
        expect(screen.getByText('MDRRMO')).toBeInTheDocument();

        // Casualties
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        // Evidence: Blurred for privacy
        expect(screen.getByRole('heading', { name: /Evidence preview · 1/i })).toBeInTheDocument();
        expect(screen.getByText(/Blurred for privacy/i)).toBeInTheDocument();
        expect(screen.getByText(/Original evidence is available only to the report owner and authorized municipal personnel/i)).toBeInTheDocument();

        // Privacy Notice
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are not displayed/i)).toBeInTheDocument();

        // Sensitive details hidden
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();

        // Locate action
        fireEvent.click(screen.getByRole('button', { name: /view on map/i }));
        expect(onLocate).toHaveBeenCalledWith(sampleReport);
    });

    test('2. Renders original evidence and full-report deep link for report owner', async () => {
        const ownerReport = {
            ...sampleReport,
            isOwnedByCurrentUser: true,
            images: ['/api/files/my-evidence.jpg'],
            evidence: {
                accessLevel: 'original',
                count: 1,
                items: [{ id: '0', previewUrl: '/api/files/my-evidence.jpg', accessLevel: 'original', isOwner: true }],
            },
        };
        mocks.getPublicReportById.mockResolvedValue({
            data: {
                data: {
                    ...ownerReport,
                    detailAccess: 'owner',
                    detailCompleteness: 'full',
                },
            },
        });

        renderDetails({
            viewerRole: 'reporter',
            report: ownerReport,
        });

        expect(screen.getByRole('link', { name: /open my full report/i }))
            .toHaveAttribute('href', '/my-reports?report=report-1');
        expect(screen.getByRole('heading', { name: /Your evidence photos · 1/i })).toBeInTheDocument();
        expect(screen.getByText(/This owner view keeps responder identities and internal coordination details private/i)).toBeInTheDocument();
    });

    test('3. Renders blurred evidence for non-owner authenticated reporter', async () => {
        renderDetails({
            viewerRole: 'reporter',
            report: { ...sampleReport, isOwnedByCurrentUser: false },
        });

        expect(screen.getByRole('heading', { name: /Evidence preview · 1/i })).toBeInTheDocument();
        expect(screen.getByText(/Blurred for privacy/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
    });

    test('4. Renders operational unblurred evidence and capability-based actions for responder', async () => {
        const onRespond = vi.fn();
        const fullReport = { ...sampleReport, detailAccess: 'operational', detailCompleteness: 'full' };
        renderDetails({
            report: fullReport,
            viewerRole: 'responder',
            canRespond: true,
            onRespond,
        });

        expect(screen.getByRole('heading', { name: /Evidence photos · 1/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /respond to incident/i }));
        expect(onRespond).toHaveBeenCalledWith(fullReport);
    });

    test('5. Renders clear empty state when report has no evidence', () => {
        const noEvidenceReport = {
            ...sampleReport,
            evidenceCount: 0,
            evidence: { count: 0, items: [] },
            images: [],
        };
        renderDetails({ report: noEvidenceReport, viewerRole: 'guest' });

        expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
    });

    test('6. Renders clear empty state when no casualties or impacts are recorded', () => {
        const noCasualtiesReport = {
            ...sampleReport,
            casualties: { injured: 0, fatalities: 0, missing: 0 },
            affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
        };
        renderDetails({ report: noCasualtiesReport, viewerRole: 'guest' });

        expect(screen.getByText('No casualties or affected-area impacts recorded.')).toBeInTheDocument();
    });

    test('7. Renders error alert with retry button when loading fails', async () => {
        mocks.getPublicReportById.mockRejectedValue(new Error('Network disconnected'));

        renderDetails({
            report: { _id: 'report-fail', detailCompleteness: 'summary' },
            viewerRole: 'guest',
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(/Unable to load incident details/i);
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    test('8. Renders populated casualties and affected area metrics correctly', () => {
        const fullImpactReport = {
            ...sampleReport,
            casualties: { injured: 3, fatalities: 1, missing: 2 },
            affectedArea: { householdsAffected: 15, evacuees: 45, radius: 250 },
        };
        renderDetails({ report: fullImpactReport, viewerRole: 'guest' });

        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText('45')).toBeInTheDocument();
        expect(screen.getByText('250 meters')).toBeInTheDocument();
    });

    test('9. Handles long incident titles and missing descriptions gracefully', () => {
        const longReport = {
            ...sampleReport,
            title: 'Very Long Incident Title Involving Multiple Vehicles Along Provincial Road In Cajidiocan Romblon Island',
            description: '',
        };
        renderDetails({ report: longReport, viewerRole: 'guest' });

        expect(screen.getByText('Very Long Incident Title Involving Multiple Vehicles Along Provincial Road In Cajidiocan Romblon Island')).toBeInTheDocument();
        expect(screen.getByText(/No (incident )?description provided/i)).toBeInTheDocument();
    });

    test('10. Renders operational incident brief header for municipal responders', () => {
        renderDetails({
            report: { ...sampleReport, detailAccess: 'operational', detailCompleteness: 'full' },
            viewerRole: 'responder',
        });

        expect(screen.getByText('Operational incident brief')).toBeInTheDocument();
        expect(screen.getByText('Critical incident indicators')).toBeInTheDocument();
    });
});
