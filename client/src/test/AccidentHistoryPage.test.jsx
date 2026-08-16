import { fireEvent, render, screen, within } from '@testing-library/react';
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

    test('renders stat strip metrics and expands record details on click', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        expect(await screen.findByRole('heading', { level: 1, name: 'Accident history' })).toBeInTheDocument();
        expect(screen.getByText('Records')).toBeInTheDocument();

        // Stat strip metrics
        const summary = screen.getByRole('region', { name: 'History summary' });
        expect(within(summary).getByText('Total resolved')).toBeInTheDocument();
        expect(within(summary).getByText('Last 7 days')).toBeInTheDocument();
        expect(within(summary).getByText('Last 30 days')).toBeInTheDocument();
        expect(within(summary).getByText('Most incidents')).toBeInTheDocument();

        // Expand record
        const expandButtons = screen.getAllByRole('button', { name: /Expand details/i });
        expect(expandButtons[0]).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(expandButtons[0]);

        expect(screen.getByRole('button', { name: /Collapse details/i })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Incident summary')).toBeInTheDocument();
        expect(screen.getByText('Incident date')).toBeInTheDocument();
    });

    test('filters records by search query and allows clearing filters', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const searchInput = screen.getByPlaceholderText('Search location, barangay, or incident type');
        fireEvent.change(searchInput, { target: { value: 'Today' } });

        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 2 records'
        ))).toBeInTheDocument();

        const clearBtn = screen.getByRole('button', { name: /Clear filters/i });
        fireEvent.click(clearBtn);

        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 2 of 2 records'
        ))).toBeInTheDocument();
    });

    test('switches expanded state cleanly when clicking another accident record', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const expandButtons = screen.getAllByRole('button', { name: /Expand details/i });
        expect(expandButtons).toHaveLength(2);

        // Expand first record
        fireEvent.click(expandButtons[0]);
        expect(screen.getByRole('button', { name: /Collapse details for/i })).toBeInTheDocument();

        // Switch to second record
        const remainingExpandButtons = screen.getAllByRole('button', { name: /Expand details/i });
        fireEvent.click(remainingExpandButtons[0]);

        // Still exactly one collapsed/expanded toggle open
        expect(screen.getAllByRole('button', { name: /Collapse details for/i })).toHaveLength(1);
    });
});
