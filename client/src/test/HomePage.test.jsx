import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getPublic: vi.fn(),
    getStats: vi.fn(),
    getMunicipalities: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: false, user: null, canSubmitReports: () => false }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock('../services/api', () => ({
    analyticsAPI: { getPublic: mocks.getPublic },
    reportsAPI: {
        getStats: mocks.getStats,
        getMunicipalities: mocks.getMunicipalities,
    },
}));

import HomePage from '../pages/HomePage';

const renderPage = () => render(
    <MemoryRouter>
        <HomePage />
    </MemoryRouter>
);

describe('HomePage operational landing page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.subscribe.mockImplementation(() => vi.fn());
        mocks.getPublic.mockResolvedValue({
            data: {
                success: true,
                data: {
                    verifiedReportsThisMonth: 4,
                    activeHighRiskZones: 1,
                    totalReportsAllTime: 12,
                    systemStatus: 'Operational',
                    period: {
                        type: 'calendar_month',
                        timezone: 'Asia/Manila',
                        startAt: '2026-06-30T16:00:00.000Z',
                        endAt: '2026-07-31T16:00:00.000Z',
                    },
                },
            },
        });
        mocks.getMunicipalities.mockResolvedValue({
            data: {
                success: true,
                data: [
                    { name: 'Cajidiocan', code: 'CAJ', barangays: [] },
                    { name: 'Magdiwang', code: 'MAG', barangays: [] },
                    { name: 'San Fernando', code: 'SAF', barangays: [] },
                ],
            },
        });
    });

    test('shows responsive hero actions and keeps the risk-zone metric non-interactive', async () => {
        renderPage();

        expect(await screen.findByText('Verified in Jul 2026')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Report.*Verify.*Respond/i })).toBeInTheDocument();
        const mapAction = screen.getByRole('link', { name: 'View live map' });
        const reportAction = screen.getByRole('link', { name: 'Report an Incident' });
        const registrationAction = screen.getByRole('link', { name: 'Register as a reporter' });
        expect(mapAction).toHaveAttribute('href', '/dashboard?view=map');
        expect(reportAction).toHaveAttribute('href', '/login');
        expect(registrationAction).toHaveAttribute('href', '/register');
        expect(mapAction).toHaveClass('min-h-11', 'sm:min-h-12');
        expect(reportAction).toHaveClass('min-h-11', 'sm:min-h-12');
        expect(mapAction).not.toHaveClass('flex-1');
        expect(reportAction).not.toHaveClass('flex-1');
        expect(screen.getByRole('img', { name: /Map of Sibuyan Island showing Cajidiocan/i })).toBeInTheDocument();
        expect(screen.getByText('Municipalities covered')).toBeInTheDocument();
        expect(screen.getByText('14 barangays')).toBeInTheDocument();
        expect(screen.getByText('12 barangays')).toBeInTheDocument();

        expect(screen.getAllByText('Active risk zones').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /Active risk zones/i })).not.toBeInTheDocument();

        const copy = screen.getByTestId('landing-hero-copy');
        const mapPreview = screen.getByTestId('sibuyan-island-map');
        const staticMapPreview = mapPreview.querySelector('img[src="/icons/Municipality.png"]');
        const actions = screen.getByTestId('landing-hero-actions');
        const benefits = screen.getByTestId('landing-hero-benefits');
        const metrics = screen.getByTestId('landing-hero-metrics');
        expect(copy.compareDocumentPosition(mapPreview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(staticMapPreview).toBeInTheDocument();
        expect(mapPreview.querySelector('.maplibregl-map')).not.toBeInTheDocument();
        expect(mapPreview.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(actions.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(benefits.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('does not claim the live system is operational when both analytics requests fail', async () => {
        mocks.getPublic.mockRejectedValueOnce(new Error('Unavailable'));
        mocks.getStats.mockRejectedValueOnce(new Error('Unavailable'));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Live data temporarily unavailable')).toBeInTheDocument();
        });
        expect(screen.queryByText('Live across Sibuyan Island')).not.toBeInTheDocument();
        expect(mocks.getStats).not.toHaveBeenCalled();
    });
});
