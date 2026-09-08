import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';

const mocks = vi.hoisted(() => ({
    getReports: vi.fn(),
    getMunicipalities: vi.fn(),
    recordView: vi.fn(),
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
    reportsAPI: {
        getAll: vi.fn(),
        getMunicipalities: mocks.getMunicipalities,
        recordView: mocks.recordView,
    },
}));

vi.mock('../components/ui/ImageViewer', () => ({ default: () => null }));
vi.mock('../utils/appToast', () => ({ default: { error: vi.fn() } }));

const { default: AccidentHistoryPage } = await import('../pages/AccidentHistoryPage');

describe('AccidentHistoryPage features and filters', () => {
    const now = new Date();
    const older = new Date(now.getTime() - (48 * 60 * 60 * 1000));

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.recordView.mockResolvedValue({ data: { data: { viewCount: 9, counted: true } } });
        mocks.getMunicipalities.mockResolvedValue({
            data: {
                success: true,
                data: [
                    {
                        name: 'Cajidiocan',
                        barangays: [{ name: 'Alibagon' }, { name: 'Gutivan' }, { name: 'Poblacion' }, { name: 'Taguilos' }],
                    },
                    {
                        name: 'Magdiwang',
                        barangays: [{ name: 'Agsao' }, { name: 'Ambulong' }, { name: 'Poblacion' }, { name: 'Tampayan' }],
                    },
                    {
                        name: 'San Fernando',
                        barangays: [{ name: 'Agtiwa' }, { name: 'Azarga' }, { name: 'Poblacion' }, { name: 'Taclobo' }],
                    },
                ],
            },
        });

        mocks.getReports.mockResolvedValue({
            data: {
                data: {
                    reports: [
                        {
                            _id: 'today-report',
                            status: 'resolved',
                            address: 'Today incident',
                            municipalityName: 'Cajidiocan',
                            barangay: 'Poblacion',
                            severity: 'moderate',
                            resolvedAt: now.toISOString(),
                            createdAt: now.toISOString(),
                        },
                        {
                            _id: 'older-report',
                            status: 'resolved',
                            address: 'Older incident',
                            municipalityName: 'Cajidiocan',
                            barangay: 'Taguilos',
                            severity: 'minor',
                            resolvedAt: older.toISOString(),
                            createdAt: older.toISOString(),
                        },
                        {
                            _id: 'magdiwang-report',
                            status: 'resolved',
                            address: 'Magdiwang incident',
                            municipalityName: 'Magdiwang',
                            barangay: 'Tampayan',
                            severity: 'critical',
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
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 3 records'
        ))).toBeInTheDocument();
        expect(mocks.getReports).toHaveBeenCalledWith({ limit: 500, status: 'resolved' });
    });

    test('renders stat strip metrics including Top Barangay and expands record details on click', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        expect(await screen.findByRole('heading', { level: 1, name: 'Accident history' })).toBeInTheDocument();
        expect(screen.getByText(/Public Archive/i)).toBeInTheDocument();

        // Stat strip metrics
        const summary = screen.getByRole('region', { name: 'History summary' });
        expect(within(summary).getByText('Total resolved')).toBeInTheDocument();
        expect(within(summary).getByText('Last 7 days')).toBeInTheDocument();
        expect(within(summary).getByText('Last 30 days')).toBeInTheDocument();
        expect(within(summary).getByText('Top Barangay')).toBeInTheDocument();

        // Expand record
        const expandButtons = screen.getAllByRole('button', { name: /Expand details/i });
        expect(expandButtons[0]).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(expandButtons[0]);

        expect(screen.getByRole('button', { name: /Collapse details/i })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Incident summary')).toBeInTheDocument();
        expect(screen.getByText('Incident date')).toBeInTheDocument();
    });

    test('records a view once when a dossier is expanded', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const expandButtons = screen.getAllByRole('button', { name: /Expand details/i });
        fireEvent.click(expandButtons[0]);

        await waitFor(() => expect(mocks.recordView).toHaveBeenCalledTimes(1));
        expect(mocks.recordView).toHaveBeenCalledWith('today-report');

        // Collapse and re-expand must not inflate the count.
        fireEvent.click(screen.getByRole('button', { name: /Collapse details/i }));
        fireEvent.click((await screen.findAllByRole('button', { name: /Expand details/i }))[0]);
        await waitFor(() => expect(screen.getByRole('button', { name: /Collapse details/i })).toBeInTheDocument());
        expect(mocks.recordView).toHaveBeenCalledTimes(1);
    });

    test('filters records by search query and allows clearing filters', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const searchInput = screen.getByPlaceholderText(/Search (location|archive)/i);
        fireEvent.change(searchInput, { target: { value: 'Today' } });

        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 3 records'
        ))).toBeInTheDocument();

        const clearBtn = screen.getByRole('button', { name: /Clear filters/i });
        fireEvent.click(clearBtn);

        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 3 of 3 records'
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
        expect(expandButtons.length).toBeGreaterThanOrEqual(2);

        // Expand first record
        fireEvent.click(expandButtons[0]);
        expect(screen.getByRole('button', { name: /Collapse details for/i })).toBeInTheDocument();

        // Switch to second record
        const remainingExpandButtons = screen.getAllByRole('button', { name: /Expand details/i });
        fireEvent.click(remainingExpandButtons[0]);

        // Still exactly one collapsed/expanded toggle open
        expect(screen.getAllByRole('button', { name: /Collapse details for/i })).toHaveLength(1);
    });

    test('provides context-aware barangay filter and safely resets on municipality switch', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const municipalitySelect = screen.getByLabelText('Filter by municipality');
        const barangaySelect = screen.getByLabelText('Filter by barangay');

        // Initially with All municipalities, barangay dropdown shows all unique barangays
        expect(within(barangaySelect).getByRole('option', { name: 'All barangays' })).toBeInTheDocument();
        expect(within(barangaySelect).getByRole('option', { name: 'Taguilos' })).toBeInTheDocument();
        expect(within(barangaySelect).getByRole('option', { name: 'Tampayan' })).toBeInTheDocument();

        // Switch to Cajidiocan: only Cajidiocan barangays should be listed
        fireEvent.change(municipalitySelect, { target: { value: 'Cajidiocan' } });
        expect(within(barangaySelect).getByRole('option', { name: 'Taguilos' })).toBeInTheDocument();
        expect(within(barangaySelect).queryByRole('option', { name: 'Tampayan' })).not.toBeInTheDocument();

        // Select Taguilos in Cajidiocan
        fireEvent.change(barangaySelect, { target: { value: 'Taguilos' } });
        expect(barangaySelect).toHaveValue('Taguilos');
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 3 records'
        ))).toBeInTheDocument();

        // Switch to Magdiwang: Taguilos is not in Magdiwang, so it must safely reset to 'all'
        fireEvent.change(municipalitySelect, { target: { value: 'Magdiwang' } });
        expect(barangaySelect).toHaveValue('all');
        expect(within(barangaySelect).getByRole('option', { name: 'Tampayan' })).toBeInTheDocument();
        expect(within(barangaySelect).queryByRole('option', { name: 'Taguilos' })).not.toBeInTheDocument();
    });

    test('combines search, date, severity, municipality, and barangay filters', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const severitySelect = screen.getByLabelText('Filter by severity');
        const municipalitySelect = screen.getByLabelText('Filter by municipality');
        const barangaySelect = screen.getByLabelText('Filter by barangay');

        fireEvent.change(municipalitySelect, { target: { value: 'Cajidiocan' } });
        fireEvent.change(barangaySelect, { target: { value: 'Poblacion' } });
        fireEvent.change(severitySelect, { target: { value: 'moderate' } });

        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 3 records'
        ))).toBeInTheDocument();
    });

    test('calculates Top Barangay accurately with ties and maintains scope when barangay is selected', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const summary = screen.getByRole('region', { name: 'History summary' });
        // With 1 in Poblacion, 1 in Taguilos, 1 in Tampayan: 3-way tie
        // Alphabetical winner: Poblacion, helper text indicates Tied (3 barangays)
        expect(within(summary).getByText('Poblacion')).toBeInTheDocument();
        expect(within(summary).getByText(/Tied \(3 barangays\)/i)).toBeInTheDocument();

        // Select Cajidiocan: scope narrows to Cajidiocan (Poblacion and Taguilos tied with 1)
        const municipalitySelect = screen.getByLabelText('Filter by municipality');
        fireEvent.change(municipalitySelect, { target: { value: 'Cajidiocan' } });
        expect(within(summary).getByText('Poblacion')).toBeInTheDocument();
        expect(within(summary).getByText(/Tied \(2 barangays\)/i)).toBeInTheDocument();

        // Selecting a specific barangay still preserves Top Barangay metric calculation for that municipality
        const barangaySelect = screen.getByLabelText('Filter by barangay');
        fireEvent.change(barangaySelect, { target: { value: 'Taguilos' } });
        expect(within(summary).getByText('Poblacion')).toBeInTheDocument();
    });

    test('renders clean empty state with Clear filters action when no records match', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const searchInput = screen.getByPlaceholderText(/Search (location|archive)/i);
        fireEvent.change(searchInput, { target: { value: 'NonExistentPlace' } });

        expect(screen.getByRole('heading', { level: 2, name: 'No accident records found' })).toBeInTheDocument();
        expect(screen.getByText('Try adjusting the selected filters.')).toBeInTheDocument();

        const clearBtn = screen.getAllByRole('button', { name: /Clear filters/i })[0];
        fireEvent.click(clearBtn);

        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 3 of 3 records'
        ))).toBeInTheDocument();
    });

    test('opens mobile filter bottom sheet and applies filters cleanly', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        // Open mobile filter sheet
        const mobileFilterBtn = screen.getByRole('button', { name: /Filters/i });
        fireEvent.click(mobileFilterBtn);

        expect(screen.getByRole('heading', { name: 'Archive filters' })).toBeInTheDocument();

        // Change severity inside bottom sheet
        const severitySelects = screen.getAllByLabelText('Filter by severity');
        fireEvent.change(severitySelects[severitySelects.length - 1], { target: { value: 'critical' } });

        // Close bottom sheet via Apply action
        const showBtn = screen.getByRole('button', { name: /Show 1 record/i });
        fireEvent.click(showBtn);

        expect(screen.queryByRole('heading', { name: 'Archive filters' })).not.toBeInTheDocument();
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 3 records'
        ))).toBeInTheDocument();
    });

    test('removes individual filter when clicking removable filter chip', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const municipalitySelect = screen.getAllByLabelText('Filter by municipality')[0];
        fireEvent.change(municipalitySelect, { target: { value: 'Cajidiocan' } });

        expect(screen.getByText('Municipality: Cajidiocan')).toBeInTheDocument();
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 2 of 3 records'
        ))).toBeInTheDocument();

        // Remove municipality filter via chip
        const removeChipBtn = screen.getByRole('button', { name: 'Remove municipality filter' });
        fireEvent.click(removeChipBtn);

        expect(screen.queryByText('Municipality: Cajidiocan')).not.toBeInTheDocument();
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 3 of 3 records'
        ))).toBeInTheDocument();
    });

    test('supports keyboard activation on Top Barangay insight card', async () => {
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });

        const summary = screen.getByRole('region', { name: 'History summary' });
        const topBarangayBtn = within(summary).getByRole('button');

        // Press Enter to activate Top Barangay filter
        fireEvent.keyDown(topBarangayBtn, { key: 'Enter' });

        expect(screen.getByText('Barangay: Poblacion')).toBeInTheDocument();
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 1 of 3 records'
        ))).toBeInTheDocument();

        // Press Enter again to toggle off
        fireEvent.keyDown(topBarangayBtn, { key: 'Enter' });
        expect(screen.queryByText('Barangay: Poblacion')).not.toBeInTheDocument();
        expect(screen.getByText((_, element) => (
            element?.tagName === 'P' && element.textContent === 'Showing 3 of 3 records'
        ))).toBeInTheDocument();
    });

    test('shows the physical municipality for transferred incidents, not the handling office', async () => {
        mocks.getReports.mockResolvedValueOnce({
            data: {
                data: {
                    reports: [
                        {
                            _id: 'transferred-1',
                            status: 'resolved',
                            incidentType: 'vehicular',
                            address: '',
                            barangay: 'Cambajao',
                            municipalityName: 'San Fernando',
                            originalMunicipalityName: 'Cajidiocan',
                            transferHistory: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'San Fernando' }],
                            severity: 'moderate',
                            resolvedAt: new Date().toISOString(),
                            createdAt: new Date().toISOString(),
                        },
                    ],
                },
            },
        });

        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });
        expect(await screen.findByText('Cambajao, Cajidiocan')).toBeInTheDocument();
        expect(screen.queryByText('Cambajao, San Fernando')).not.toBeInTheDocument();
    });

    test('renders cached archive instantly on revisit without skeleton or refetch', async () => {
        const first = render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { level: 1, name: 'Accident history' });
        // List rows render barangay + municipality (addresses stay in dossiers).
        expect(await screen.findByText('Poblacion, Cajidiocan')).toBeInTheDocument();
        expect(mocks.getReports).toHaveBeenCalledTimes(1);
        first.unmount();

        // Revisit with the API down: cached snapshot must render, no skeleton.
        mocks.getReports.mockRejectedValueOnce(new Error('offline'));
        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { level: 1, name: 'Accident history' })).toBeInTheDocument();
        expect(screen.getByText('Poblacion, Cajidiocan')).toBeInTheDocument();
        expect(screen.queryByLabelText('Loading accident archive')).not.toBeInTheDocument();
        expect(mocks.getReports).toHaveBeenCalledTimes(1);
    });
});
