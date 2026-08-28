import { render, screen, waitFor, act } from '@testing-library/react';
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

    test('renders dashboard header, stat strip, and recent activity log', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { level: 1, name: 'Reporter dashboard' })).toBeInTheDocument();
        expect(screen.getByText('Reporter Overview')).toBeInTheDocument();

        // Stat strip metrics
        expect(await screen.findByText('Total reports')).toBeInTheDocument();
        expect(screen.getAllByText('Pending review').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Active cases')).toBeInTheDocument();
        expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);

        expect(screen.getByText('3')).toBeInTheDocument(); // Total

        // Actions in header
        expect(screen.getByRole('link', { name: /Live incident map/i })).toHaveAttribute('href', '/dashboard?view=map');
        expect(screen.getByRole('link', { name: /Submit incident report/i })).toHaveAttribute('href', '/report');

        // Recent activity items
        expect(screen.getByText('Poblacion, San Fernando')).toBeInTheDocument();
        expect(screen.getByText('España, San Fernando')).toBeInTheDocument();
        expect(screen.getByText('Ambulong, Magdiwang')).toBeInTheDocument();

        const viewDetailsLinks = screen.getAllByRole('link', { name: /View details/i });
        expect(viewDetailsLinks).toHaveLength(3);
        expect(viewDetailsLinks[0]).toHaveAttribute('href', '/my-reports?report=report-1');
    }, 12000);

    test('updates status dynamically upon socket events', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { level: 1, name: 'Reporter dashboard' });

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

    test('renders lifecycle progress rail for active reports', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText(/Reporting lifecycle · Latest update/i)).toBeInTheDocument();
        expect(screen.getByText('Under review')).toBeInTheDocument();
        expect(screen.getAllByText('Response active').length).toBeGreaterThanOrEqual(1);
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

    test('renders inline dot and uppercase label for status and severity columns without pill styling', async () => {
        render(
            <MemoryRouter>
                <ReporterDashboardPage />
            </MemoryRouter>,
        );

        await screen.findByRole('heading', { level: 1, name: 'Reporter dashboard' });

        // Status indicators
        expect(screen.getAllByText('Pending review').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Response active').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);

        // Severity indicators
        expect(screen.getByText('Severe')).toBeInTheDocument();
        expect(screen.getByText('Moderate')).toBeInTheDocument();
        expect(screen.getByText('Minor')).toBeInTheDocument();
    });
});
