import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';

const mocks = vi.hoisted(() => ({
    getReports: vi.fn(),
    subscribe: vi.fn(() => () => {}),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        user: { _id: 'responder-1', role: 'responder' },
    }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock('../services/api', () => ({
    adminAPI: { getReports: mocks.getReports },
    reportsAPI: { getAll: vi.fn() },
}));

vi.mock('../components/ui/ImageViewer', () => ({ default: () => null }));
vi.mock('../utils/appToast', () => ({ default: { error: vi.fn() } }));

const { default: AccidentHistoryPage } = await import('../pages/AccidentHistoryPage');

describe('AccidentHistoryPage date deep links', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const now = new Date();
        const older = new Date(now.getTime() - (48 * 60 * 60 * 1000));
        mocks.getReports.mockResolvedValue({
            data: {
                data: {
                    reports: [
                        {
                            _id: 'today-report',
                            status: 'resolved',
                            address: 'Today incident',
                            municipalityName: 'Cajidiocan',
                            severity: 'moderate',
                            resolvedAt: now.toISOString(),
                            createdAt: now.toISOString(),
                        },
                        {
                            _id: 'older-report',
                            status: 'resolved',
                            address: 'Older incident',
                            municipalityName: 'Cajidiocan',
                            severity: 'minor',
                            resolvedAt: older.toISOString(),
                            createdAt: older.toISOString(),
                        },
                    ],
                },
            },
        });
    });

    test('opens the responder KPI deep link with the Philippine today filter applied', async () => {
        render(
            <MemoryRouter initialEntries={['/accident-history?date=today']}>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        expect(await screen.findByDisplayValue('Today')).toBeInTheDocument();
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 2 records'
        ))).toBeInTheDocument();
        expect(mocks.getReports).toHaveBeenCalledWith({ limit: 500, status: 'resolved' });
    });
});
