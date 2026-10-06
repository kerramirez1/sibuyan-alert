import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';

const mocks = vi.hoisted(() => ({
    // Swappable per test: the page reads mocks.authUser through the Auth mock.
    authUser: { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Magdiwang' },
    getReports: vi.fn(),
    getAll: vi.fn(),
    getMunicipalities: vi.fn(),
    recordViewEvent: vi.fn(),
    subscribe: vi.fn(() => () => {}),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        user: mocks.authUser,
    }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock('../services/api', () => ({
    adminAPI: { getReports: mocks.getReports },
    reportsAPI: {
        getAll: mocks.getAll,
        getMunicipalities: mocks.getMunicipalities,
    },
    // View recording lives on its own export now — one home for the reach
    // contract, shared with the map panels, so neither surface can call a method
    // the module does not define.
    viewsAPI: { recordViewEvent: mocks.recordViewEvent },
}));

vi.mock('../components/ui/ImageViewer', () => ({ default: () => null }));
vi.mock('../utils/appToast', () => ({ default: { error: vi.fn() } }));

const { default: AccidentHistoryPage } = await import('../pages/AccidentHistoryPage');

describe('AccidentHistoryPage features and filters', () => {
    const now = new Date();
    const older = new Date(now.getTime() - (48 * 60 * 60 * 1000));

    beforeEach(() => {
        vi.clearAllMocks();
        // mockReset (not just clear): drops any mockRejectedValueOnce queue
        // left by an earlier test, e.g. the cached-archive offline case.
        mocks.getReports.mockReset();
        mocks.getAll.mockReset();
        mocks.authUser = { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Magdiwang' };
        mocks.recordViewEvent.mockResolvedValue({ data: { data: { viewCount: 9, counted: true } } });
        // Default island-wide public projection: empty, so the pre-existing
        // tests keep their merged list of 3 admin-endpoint reports.
        mocks.getAll.mockResolvedValue({ data: { data: { reports: [] } } });
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
        expect(mocks.getReports).toHaveBeenCalledWith({ limit: 250, page: 1, status: 'resolved' });
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

        // Expand the own-municipality (Magdiwang) card: full operational
        // details render only for the user's own municipality.
        const magdiwangCard = screen.getByText('Tampayan, Magdiwang').closest('article');
        fireEvent.click(within(magdiwangCard).getByRole('button', { name: /Expand details/i }));

        await waitFor(() => expect(mocks.recordViewEvent).toHaveBeenCalledTimes(1));
        expect(mocks.recordViewEvent).toHaveBeenCalledWith({ targetType: 'report', targetId: 'magdiwang-report' });

        // The expand is still recorded, but the archive no longer prints a
        // per-record count: reach is read on the Analytics dashboard's reach
        // panels. The operational facts around where it used to sit stay.
        expect(screen.queryByText('Views')).not.toBeInTheDocument();
        expect(screen.getByText('Reported by')).toBeInTheDocument();

        // Collapse and re-expand must not inflate the count.
        fireEvent.click(within(magdiwangCard).getByRole('button', { name: /Collapse details/i }));
        fireEvent.click((await within(magdiwangCard).findAllByRole('button', { name: /Expand details/i }))[0]);
        await waitFor(() => expect(within(magdiwangCard).getByRole('button', { name: /Collapse details/i })).toBeInTheDocument());
        expect(mocks.recordViewEvent).toHaveBeenCalledTimes(1);
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

    test('admin sees merged island-wide resolved reports from both endpoints', async () => {
        mocks.authUser = { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Magdiwang' };

        const magdiwangFull = {
            _id: 'mdg-full-1',
            status: 'resolved',
            municipalityName: 'Magdiwang',
            barangay: 'Tampayan',
            severity: 'critical',
            resolvedAt: older.toISOString(),
            createdAt: older.toISOString(),
            reporter: { name: 'Juan Dela Cruz' },
            coordinates: { lat: 12.1234, lng: 122.5678 },
            respondedBy: { name: 'Responder One', agency: 'MDRRMO' },
            resolutionNotes: 'Area cleared',
            images: [],
        };
        // Own municipality: full operational details from the admin endpoint.
        mocks.getReports.mockResolvedValue({ data: { data: { reports: [magdiwangFull] } } });
        // Island-wide public projection, including a second copy of the
        // Magdiwang report that must be deduped away.
        mocks.getAll.mockResolvedValue({ data: { data: { reports: [
            {
                _id: 'caj-pub-1',
                status: 'resolved',
                municipalityName: 'Cajidiocan',
                barangay: 'Poblacion',
                severity: 'moderate',
                resolvedAt: now.toISOString(),
                createdAt: now.toISOString(),
            },
            {
                _id: 'sf-pub-1',
                status: 'resolved',
                municipalityName: 'San Fernando',
                barangay: 'Cambajao',
                severity: 'severe',
                resolvedAt: older.toISOString(),
                createdAt: older.toISOString(),
            },
            { ...magdiwangFull, reporter: undefined, coordinates: undefined, respondedBy: undefined },
        ] } } });

        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByText('Poblacion, Cajidiocan');
        expect(screen.getByText('Cambajao, San Fernando')).toBeInTheDocument();
        // Deduplicated: the Magdiwang report appears once, as the full copy.
        expect(screen.getAllByText('Tampayan, Magdiwang')).toHaveLength(1);

        expect(mocks.getReports).toHaveBeenCalledWith({ limit: 250, page: 1, status: 'resolved' });
        expect(mocks.getAll).toHaveBeenCalledWith({ limit: 250, page: 1, status: 'resolved' });
    });

    test("dossier gates full details to the admin's own municipality", async () => {
        mocks.authUser = { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Magdiwang' };

        const magdiwangFull = {
            _id: 'mdg-full-1',
            status: 'resolved',
            municipalityName: 'Magdiwang',
            barangay: 'Tampayan',
            severity: 'critical',
            resolvedAt: older.toISOString(),
            createdAt: older.toISOString(),
            reporter: { name: 'Juan Dela Cruz' },
            coordinates: { lat: 12.1234, lng: 122.5678 },
            respondedBy: { name: 'Responder One', agency: 'MDRRMO' },
            resolutionNotes: 'Area cleared',
            images: [],
        };
        mocks.getReports.mockResolvedValue({ data: { data: { reports: [magdiwangFull] } } });
        mocks.getAll.mockResolvedValue({ data: { data: { reports: [
            {
                _id: 'caj-pub-1',
                status: 'resolved',
                municipalityName: 'Cajidiocan',
                barangay: 'Poblacion',
                severity: 'moderate',
                resolvedAt: now.toISOString(),
                createdAt: now.toISOString(),
            },
        ] } } });

        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        // Own municipality: coordinates, reporter, and responder identity render.
        await screen.findByText('Tampayan, Magdiwang');
        const magdiwangCard = screen.getByText('Tampayan, Magdiwang').closest('article');
        fireEvent.click(within(magdiwangCard).getByRole('button', { name: /Expand details/i }));
        await waitFor(() => expect(within(magdiwangCard).getByText('Reported by')).toBeInTheDocument());
        expect(within(magdiwangCard).getByText('Coordinates')).toBeInTheDocument();
        expect(within(magdiwangCard).getByText(/Juan Dela Cruz/)).toBeInTheDocument();
        expect(within(magdiwangCard).getByText(/Responder One/)).toBeInTheDocument();
        expect(within(magdiwangCard).queryByText(/Protected details restricted/)).not.toBeInTheDocument();

        // Cross-municipality: public projection — no coordinates, no reporter
        // name, no responder identity; the lock message renders instead.
        const cajidiocanCard = screen.getByText('Poblacion, Cajidiocan').closest('article');
        fireEvent.click(within(cajidiocanCard).getByRole('button', { name: /Expand details/i }));
        await waitFor(() => expect(within(cajidiocanCard).getByText(/Protected details restricted/)).toBeInTheDocument());
        expect(within(cajidiocanCard).queryByText('Coordinates')).not.toBeInTheDocument();
        expect(within(cajidiocanCard).queryByText('Reported by')).not.toBeInTheDocument();
        expect(within(cajidiocanCard).queryByText(/Juan Dela Cruz/)).not.toBeInTheDocument();
        expect(within(cajidiocanCard).queryByText(/Responder One/)).not.toBeInTheDocument();
    });

    test('municipality filter narrows the merged list to one municipality', async () => {
        mocks.authUser = { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Magdiwang' };

        mocks.getReports.mockResolvedValue({ data: { data: { reports: [
            {
                _id: 'mdg-full-1',
                status: 'resolved',
                municipalityName: 'Magdiwang',
                barangay: 'Tampayan',
                severity: 'critical',
                resolvedAt: older.toISOString(),
                createdAt: older.toISOString(),
            },
        ] } } });
        mocks.getAll.mockResolvedValue({ data: { data: { reports: [
            {
                _id: 'caj-pub-1',
                status: 'resolved',
                municipalityName: 'Cajidiocan',
                barangay: 'Poblacion',
                severity: 'moderate',
                resolvedAt: now.toISOString(),
                createdAt: now.toISOString(),
            },
            {
                _id: 'sf-pub-1',
                status: 'resolved',
                municipalityName: 'San Fernando',
                barangay: 'Cambajao',
                severity: 'severe',
                resolvedAt: older.toISOString(),
                createdAt: older.toISOString(),
            },
        ] } } });

        render(
            <MemoryRouter>
                <AccidentHistoryPage />
            </MemoryRouter>
        );

        await screen.findByText('Poblacion, Cajidiocan');
        expect(screen.getByText('Cambajao, San Fernando')).toBeInTheDocument();
        expect(screen.getByText('Tampayan, Magdiwang')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Filter by municipality'), { target: { value: 'Cajidiocan' } });

        await waitFor(() => expect(screen.queryByText('Tampayan, Magdiwang')).not.toBeInTheDocument());
        expect(screen.getByText('Poblacion, Cajidiocan')).toBeInTheDocument();
        expect(screen.queryByText('Cambajao, San Fernando')).not.toBeInTheDocument();
    });
});
