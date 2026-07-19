import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getPublic: vi.fn(),
    getStats: vi.fn(),
    getMunicipalities: vi.fn(),
    getHighRiskZones: vi.fn(),
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
    highRiskZonesAPI: { getAll: mocks.getHighRiskZones },
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
        mocks.getHighRiskZones.mockResolvedValue({
            data: {
                success: true,
                data: [{
                    _id: 'zone-1',
                    name: 'Landslide-prone road',
                    description: 'Use caution during heavy rain.',
                    municipality: 'Cajidiocan',
                    severity: 'high',
                    type: 'landslide',
                    radius: 250,
                }],
            },
        });
    });

    test('shows the responsive hero actions and opens live risk-zone details', async () => {
        renderPage();

        expect(screen.getByRole('heading', { name: /Accident reports/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View live map' })).toHaveAttribute('href', '/dashboard?view=map');
        expect(screen.getByRole('link', { name: 'Become a reporter' })).toHaveAttribute('href', '/register');
        expect(screen.getAllByAltText(/Mountain ridges of Mount Guiting-Guiting/i)).toHaveLength(2);
        expect(await screen.findByText('Verified in Jul 2026')).toBeInTheDocument();
        expect(screen.getByText('Municipalities covered')).toBeInTheDocument();
        expect(screen.getByText('15 barangays')).toBeInTheDocument();
        expect(screen.getByText('12 barangays')).toBeInTheDocument();

        fireEvent.click(await screen.findByRole('button', { name: /Active risk zones/i }));

        expect(await screen.findByText('Landslide-prone road')).toBeInTheDocument();
        expect(mocks.getHighRiskZones).toHaveBeenCalled();
    });

    test('does not claim the live system is operational when both analytics requests fail', async () => {
        mocks.getPublic.mockRejectedValueOnce(new Error('Unavailable'));
        mocks.getStats.mockRejectedValueOnce(new Error('Unavailable'));
        mocks.getHighRiskZones.mockRejectedValueOnce(new Error('Unavailable'));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Live data temporarily unavailable')).toBeInTheDocument();
        });
        expect(screen.queryByText('Live across Sibuyan Island')).not.toBeInTheDocument();
        expect(mocks.getStats).not.toHaveBeenCalled();
    });
});
