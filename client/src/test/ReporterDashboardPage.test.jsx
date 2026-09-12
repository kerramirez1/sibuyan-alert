import { render, screen, waitFor, act, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';

const mocks = vi.hoisted(() => ({
    callbacks: {},
    getMyReports: vi.fn(),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: (eventName, callback) => {
            mocks.callbacks[eventName] = callback;
            return () => {
                delete mocks.callbacks[eventName];
            };
        },
    }),
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        getMyReports: mocks.getMyReports,
    },
}));

const { default: ReporterDashboardPage } = await import('../pages/ReporterDashboardPage');

const sampleReports = [
    {
        _id: 'report-1',
        title: 'Motorcycle collision near bridge',
        incidentType: 'vehicular_accident',
        status: 'pending',
        severity: 'severe',
        address: 'Poblacion, San Fernando',
        createdAt: '2026-08-16T08:00:00.000Z',
    },
    {
        _id: 'report-2',
        title: 'Brush fire along road',
        incidentType: 'fire',
        status: 'responding',
        severity: 'moderate',
        address: 'España, San Fernando',
        createdAt: '2026-08-16T07:30:00.000Z',
    },
    {
        _id: 'report-3',
        title: 'Medical emergency at wharf',
        incidentType: 'medical_emergency',
        status: 'resolved',
        severity: 'minor',
        address: 'Ambulong, Magdiwang',
        createdAt: '2026-08-15T14:00:00.000Z',
    },
];

describe('ReporterDashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.callbacks = {};
        mocks.getMyReports.mockResolvedValue({
            data: { data: sampleReports },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders single title block, flat stat row, and recent reports', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
        // Live subline replaces the static tagline
        expect(screen.getByText('3 reports · 1 awaiting review · 1 in response')).toBeInTheDocument();

        // Stat strip metrics (canonical vocabulary, links into the full list)
        expect(screen.getByText('Total reports')).toBeInTheDocument();
        expect(screen.getAllByText('Pending review').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('3')).toBeInTheDocument(); // Total

        // Quick actions live in the mobile bottom nav + sidebar, not the header
        expect(screen.queryByRole('link', { name: /Live incident map/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /^Submit incident report$/i })).not.toBeInTheDocument();

        // Recent report rows are the links (no Action column)
        expect(screen.getByText('Poblacion, San Fernando')).toBeInTheDocument();
        expect(screen.getByText('España, San Fernando')).toBeInTheDocument();
        expect(screen.getByText('Ambulong, Magdiwang')).toBeInTheDocument();

        const openLinks = screen.getAllByRole('link', { name: /Open report: /i });
        expect(openLinks).toHaveLength(3);
        expect(openLinks[0]).toHaveAttribute('href', '/my-reports?report=report-1');
        expect(screen.getByRole('link', { name: /Open all reports/i })).toHaveAttribute('href', '/my-reports');
    }, 12000);

    test('updates status dynamically upon socket events', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

        act(() => {
            mocks.callbacks.reportResolved?.({ id: 'report-1' });
        });

        await waitFor(() => {
            // report-1 was pending, now resolved
            // total resolved count becomes 2 (report-3 and now report-1)
            expect(screen.getByText('2')).toBeInTheDocument();
        });
    });

    test('renders empty state when no reports are found', async () => {
        mocks.getMyReports.mockResolvedValueOnce({
            data: { data: [] },
        });

        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('No activity logged')).toBeInTheDocument();
        expect(screen.getByText(/There are currently no reports linked to your profile/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Submit new incident/i })).toHaveAttribute('href', '/report');
    });

    test('renders single lifecycle stepper with canonical step names', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Latest update')).toBeInTheDocument();
        // Canonical vocabulary: Pending review (not Under review), Responding (not Response active)
        expect(screen.getAllByText('Pending review').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Responding').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Under review')).not.toBeInTheDocument();
        expect(screen.queryByText('Response active')).not.toBeInTheDocument();
        // Merged status line carries the guidance text
        expect(screen.getByText(/Awaiting municipal verification/i)).toBeInTheDocument();
    });

    test('handles report loading error with retry button', async () => {
        mocks.getMyReports.mockRejectedValueOnce(new Error('Network error'));

        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Unable to load your report overview.')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: /Retry/i });
        expect(retryBtn).toBeInTheDocument();

        // Successful retry
        mocks.getMyReports.mockResolvedValueOnce({
            data: { data: sampleReports },
        });
        act(() => {
            retryBtn.click();
        });

        expect(await screen.findByText('Total reports')).toBeInTheDocument();
    });

    test('renders plain-text status and severity without colliding encodings', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

        const recentSection = screen.getByRole('region', { name: 'Recent reports' });
        const scope = within(recentSection);

        // Status indicators (canonical names)
        expect(scope.getAllByText('Pending review').length).toBeGreaterThanOrEqual(1);
        expect(scope.getAllByText('Responding').length).toBeGreaterThanOrEqual(1);
        expect(scope.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);

        // Severity indicators
        expect(scope.getByText('Severe')).toBeInTheDocument();
        expect(scope.getByText('Moderate')).toBeInTheDocument();
        expect(scope.getByText('Minor')).toBeInTheDocument();
    });
});
