import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MapIncidentDetails from '../components/map/MapIncidentDetails';

const mocks = vi.hoisted(() => ({
    getReportById: vi.fn(),
    getOwnerReportById: vi.fn(),
    getProtected: vi.fn(),
}));

vi.mock('../services/api', () => ({
    adminAPI: { getReportById: mocks.getReportById },
    reportsAPI: { getById: mocks.getOwnerReportById },
    filesAPI: { getProtected: mocks.getProtected },
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
        mocks.getOwnerReportById.mockReset();
        mocks.getProtected.mockReset();
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
        mocks.getOwnerReportById.mockResolvedValue({
            data: {
                data: {
                    ...report,
                    evidenceCount: 1,
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

    test('shows the protected full-report action and owner evidence only to the report owner', async () => {
        renderDetails({
            viewerRole: 'reporter',
            report: { ...report, isOwnedByCurrentUser: true },
        });

        expect(screen.getByRole('link', { name: /open my full report/i }))
            .toHaveAttribute('href', '/my-reports?report=report-1');
        expect(await screen.findByRole('heading', { name: 'Your evidence photos (1)' })).toBeInTheDocument();
        expect(await screen.findByRole('img', { name: 'Incident evidence 1' })).toHaveAttribute('src', '/api/private-evidence.jpg');
        expect(mocks.getOwnerReportById).toHaveBeenCalledWith('report-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(mocks.getReportById).not.toHaveBeenCalled();
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

        const operationalHeading = await screen.findByRole('heading', { name: 'Operational details' });
        expect(operationalHeading.closest('details')).toHaveAttribute('open');
        expect(screen.getByText('Private Reporter')).toBeInTheDocument();
        expect(screen.getByText(/Contact details become available after you join/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Reporter information' }).closest('details')).not.toHaveAttribute('open');
        expect(screen.getByRole('heading', { name: 'Evidence photos (0)' })).toBeInTheDocument();
        expect(screen.getByText('No evidence photos were submitted.')).toBeInTheDocument();
        expect(mocks.getReportById).toHaveBeenCalledWith('report-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    test('renders evidence returned by the protected operational endpoint', async () => {
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...report,
                    evidenceCount: 1,
                    images: ['/operational-evidence.jpg'],
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    reportUpdates: [],
                    transferHistory: [],
                    responders: [],
                },
            },
        });

        renderDetails({ viewerRole: 'municipal_admin' });

        expect(await screen.findByRole('heading', { name: 'Evidence photos (1)' })).toBeInTheDocument();
        expect(await screen.findByRole('img', { name: 'Incident evidence 1' })).toHaveAttribute('src', '/api/operational-evidence.jpg');
    });

    test('shows a recoverable warning when evidence metadata and secure references disagree', async () => {
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...report,
                    evidenceCount: 1,
                    images: [],
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    reportUpdates: [],
                    transferHistory: [],
                    responders: [],
                },
            },
        });

        renderDetails({
            viewerRole: 'responder',
            report: { ...report, images: undefined, evidenceCount: 1, detailCompleteness: 'summary' },
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(/evidence references are temporarily unavailable/i);
        expect(screen.getByRole('button', { name: 'Retry evidence' })).toBeInTheDocument();
    });

    test('summarizes empty impact data instead of rendering six zero-value cards', async () => {
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...report,
                    casualties: { injured: 0, fatalities: 0, missing: 0 },
                    affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
                    reporter: { name: 'Private Reporter', isVerified: true },
                    images: [],
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    reportUpdates: [],
                    transferHistory: [],
                    responders: [],
                },
            },
        });

        renderDetails({ viewerRole: 'responder' });

        expect(await screen.findByText('No casualties or affected-area impacts recorded')).toBeInTheDocument();
        expect(screen.queryByText('Households affected')).not.toBeInTheDocument();
    });

    test('falls back to public-safe content when operational access is denied', async () => {
        mocks.getReportById.mockRejectedValue({ response: { status: 403 } });
        renderDetails({ viewerRole: 'responder' });

        expect(await screen.findByRole('alert')).toHaveTextContent(/protected operational details are unavailable/i);
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are not displayed/i)).toBeInTheDocument();
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
    });
});
