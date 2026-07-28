import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ThemeProvider } from '../context/ThemeContext';

const mocks = vi.hoisted(() => ({
    getPublic: vi.fn(),
    getStats: vi.fn(),
    getMunicipalities: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: false, user: null }),
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
    <ThemeProvider>
        <MemoryRouter>
            <HomePage />
        </MemoryRouter>
    </ThemeProvider>
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

        expect(screen.getByRole('heading', { name: /Accident reports/i })).toBeInTheDocument();
        const mapAction = screen.getByRole('link', { name: 'View live map' });
        const reporterAction = screen.getByRole('link', { name: 'Become a reporter' });
        expect(mapAction).toHaveAttribute('href', '/dashboard?view=map');
        expect(reporterAction).toHaveAttribute('href', '/register');
        expect(mapAction).toHaveClass('min-h-10', 'sm:min-h-12');
        expect(reporterAction).toHaveClass('min-h-10', 'sm:min-h-12');
        expect(mapAction).not.toHaveClass('flex-1');
        expect(reporterAction).not.toHaveClass('flex-1');
        expect(screen.getAllByAltText(/Mountain ridges of Mount Guiting-Guiting/i)).toHaveLength(1);
        expect(await screen.findByText('Verified in Jul 2026')).toBeInTheDocument();
        expect(screen.getByText('Municipalities covered')).toBeInTheDocument();
        expect(screen.getByText('14 barangays')).toBeInTheDocument();
        expect(screen.getByText('12 barangays')).toBeInTheDocument();

        expect(screen.getByText('Active risk zones')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Active risk zones/i })).not.toBeInTheDocument();
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
