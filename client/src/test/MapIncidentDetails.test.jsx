import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MapIncidentDetails from '../components/map/MapIncidentDetails';

const mocks = vi.hoisted(() => ({ getReportById: vi.fn() }));

vi.mock('../services/api', () => ({
    adminAPI: { getReportById: mocks.getReportById },
    filesAPI: { getProtected: vi.fn() },
}));

const report = {
    _id: 'report-1',
    title: 'Accident at J. Rizal Street',
    incidentType: 'motorcycle',
    status: 'verified',
    severity: 'moderate',
    address: 'J. Rizal Street',
    barangay: 'Poblacion',
    municipalityName: 'Cajidiocan',
    incidentTime: '2026-08-01T02:00:00Z',
    updatedAt: '2026-08-01T03:00:00Z',
    description: '',
    fireInvolved: true,
    casualties: { injured: 2, fatalities: 0, missing: 0 },
    respondingAgencies: ['MDRRMO'],
    reporter: { name: 'Private Reporter', email: 'private@example.com' },
    images: ['/private-evidence.jpg'],
    resolutionNotes: 'Private notes',
};

const renderDetails = (props = {}) => render(
    <MemoryRouter initialEntries={['/dashboard?view=map']}>
        <MapIncidentDetails report={report} {...props} />
    </MemoryRouter>,
);

describe('MapIncidentDetails', () => {
    beforeEach(() => {
        mocks.getReportById.mockReset();
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...report,
                    reporter: { name: 'Private Reporter', isVerified: true },
                    images: [],
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    locationCapture: { source: 'map_pin', accuracyMeters: 12 },
                    reportUpdates: [],
                    transferHistory: [],
                    responders: [],
                },
            },
        });
    });

    test('renders a useful sanitized public incident summary for guests', () => {
        const onLocate = vi.fn();
        renderDetails({ onLocate });

        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(/No description provided/i)).toBeInTheDocument();
        expect(screen.getByText('2 injured')).toBeInTheDocument();
        expect(screen.getByText('Fire or explosion involved')).toBeInTheDocument();
        expect(screen.getByText('MDRRMO')).toBeInTheDocument();
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
        expect(screen.queryByText('Private notes')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /view on map/i }));
        expect(onLocate).toHaveBeenCalledWith(report);
    });

    test('shows the protected full-report action only to the report owner', () => {
        renderDetails({
            viewerRole: 'reporter',
            report: { ...report, isOwnedByCurrentUser: true },
        });

        expect(screen.getByRole('link', { name: /open my full report/i }))
            .toHaveAttribute('href', '/my-reports?report=report-1');
    });

    test('keeps responder actions capability-based', () => {
        const onRespond = vi.fn();
        const fullReport = { ...report, detailAccess: 'operational', detailCompleteness: 'full' };
        renderDetails({ report: fullReport, viewerRole: 'responder', canRespond: true, onRespond });

        fireEvent.click(screen.getByRole('button', { name: /respond to incident/i }));
        expect(onRespond).toHaveBeenCalledWith(fullReport);
        expect(screen.queryByRole('button', { name: /review resolution/i })).not.toBeInTheDocument();
    });

    test('loads protected operational details for eligible responders', async () => {
        renderDetails({ viewerRole: 'responder' });

        expect(await screen.findByRole('heading', { name: 'Operational details' })).toBeInTheDocument();
        expect(screen.getByText('Private Reporter')).toBeInTheDocument();
        expect(screen.getByText(/Contact details become available after you join/i)).toBeInTheDocument();
        expect(mocks.getReportById).toHaveBeenCalledWith('report-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    test('falls back to public-safe content when operational access is denied', async () => {
        mocks.getReportById.mockRejectedValue({ response: { status: 403 } });
        renderDetails({ viewerRole: 'responder' });

        expect(await screen.findByRole('alert')).toHaveTextContent(/protected operational details are unavailable/i);
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are not displayed/i)).toBeInTheDocument();
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
    });
});
