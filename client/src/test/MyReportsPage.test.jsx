import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    callbacks: {},
    getMyReports: vi.fn(),
    addUpdate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    offlineSync: {
        pendingCount: 0,
        deliverableCount: 0,
        blockedReports: [],
        isSyncing: false,
        sync: vi.fn(),
        resolveBlockedReport: vi.fn(),
        discardReport: vi.fn(),
    },
}));

vi.mock('../hooks/useOfflineReportSync', () => ({
    useOfflineReportSync: () => mocks.offlineSync,
    default: () => mocks.offlineSync,
}));

// The page's own connectivity read: the real hook's /api/health probe has no
// server to answer in jsdom and would flip these suites offline mid-test.
vi.mock('../hooks/useConnectivity', () => ({
    useConnectivity: () => ({
        isOnline: true,
        isOffline: false,
        lastChangedAt: null,
        probeNow: async () => true,
    }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: (event, callback) => {
            mocks.callbacks[event] = callback;
            return vi.fn();
        },
    }),
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        getMyReports: mocks.getMyReports,
        addUpdate: mocks.addUpdate,
    },
}));

vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

vi.mock('../components/ui/ImageViewer', () => ({
    default: () => null,
}));

import MyReportsPage from '../pages/MyReportsPage';

const initialReport = {
    _id: 'report-1',
    address: 'Poblacion coastal road',
    municipalityName: 'Cajidiocan',
    description: 'A motorcycle is blocking one lane.',
    incidentType: 'vehicular',
    incidentTime: '2026-07-17T08:00:00.000Z',
    createdAt: '2026-07-17T08:05:00.000Z',
    updatedAt: '2026-07-17T08:05:00.000Z',
    severity: 'moderate',
    status: 'verified',
    coordinates: { lat: 12.367, lng: 122.684 },
    images: [],
    reportUpdates: [],
    transferHistory: [],
    responders: [],
};

const renderPage = (entry = '/my-reports') => render(
    <MemoryRouter initialEntries={[entry]}>
        <MyReportsPage />
    </MemoryRouter>
);

const expandReport = async () => {
    const location = await screen.findByText(initialReport.address);
    fireEvent.click(location);
    return screen.findByRole('button', { name: 'Send situation update' });
};

describe('reporter situation update flow', () => {
    beforeEach(() => {
        mocks.callbacks = {};
        mocks.getMyReports.mockReset();
        mocks.addUpdate.mockReset();
        mocks.toast.success.mockReset();
        mocks.toast.error.mockReset();
        mocks.getMyReports.mockResolvedValue({ data: { data: [initialReport] } });
    });

    test('opens the requested owned report from a protected map deep link', async () => {
        renderPage('/my-reports?report=report-1');

        expect(await screen.findByRole('button', { name: 'Send situation update' }, { timeout: 3000 })).toBeInTheDocument();
        expect(screen.getByText('A motorcycle is blocking one lane.')).toBeInTheDocument();
    });

    test('confirms a sensitive update and immediately adds the server result to activity', async () => {
        const latestUpdate = {
            _id: 'update-1',
            tag: 'need_help',
            message: 'The patient needs another medical response unit.',
            createdAt: '2026-07-17T08:12:00.000Z',
        };
        mocks.addUpdate.mockResolvedValue({
            data: {
                data: {
                    report: { ...initialReport, reportUpdates: [latestUpdate] },
                    latestUpdate,
                },
            },
        });

        renderPage();
        fireEvent.click(await expandReport());

        expect(await screen.findByRole('dialog', { name: 'Send situation update' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: /Need urgent help/ }));
        fireEvent.change(screen.getByLabelText('What is happening now?'), {
            target: { value: latestUpdate.message },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send update' }));

        expect(await screen.findByText('Confirm need urgent help')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));

        await waitFor(() => {
            expect(mocks.addUpdate).toHaveBeenCalledWith('report-1', {
                message: latestUpdate.message,
                tag: 'need_help',
            });
        });
        expect(await screen.findByText(latestUpdate.message)).toBeInTheDocument();
        expect(screen.getByText('Sent successfully')).toBeInTheDocument();
        expect(mocks.toast.success).toHaveBeenCalledWith(
            'Situation update sent',
            expect.objectContaining({ id: 'app-notification', duration: 2500 }),
        );
        expect(screen.queryByRole('dialog', { name: 'Send situation update' })).not.toBeInTheDocument();
    });

    test('keeps the draft and shows an inline retryable error when sending fails', async () => {
        mocks.addUpdate.mockRejectedValue({
            response: { data: { message: 'The server is temporarily unavailable' } },
        });

        renderPage();
        fireEvent.click(await expandReport());

        const message = 'Traffic remains blocked in both directions.';
        fireEvent.change(await screen.findByLabelText('What is happening now?'), {
            target: { value: message },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send update' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('The server is temporarily unavailable');
        expect(screen.getByLabelText('What is happening now?')).toHaveValue(message);
        expect(screen.getByRole('dialog', { name: 'Send situation update' })).toBeInTheDocument();
    });

    test('synchronizes reporter updates received from another signed-in device', async () => {
        renderPage();
        await expandReport();

        const remoteUpdate = {
            _id: 'update-remote',
            tag: 'transported',
            message: 'The patient has arrived at the hospital.',
            createdAt: '2026-07-17T08:20:00.000Z',
        };
        act(() => {
            mocks.callbacks.reportUpdatedByReporter({
                id: 'report-1',
                status: 'verified',
                report: { status: 'verified', reportUpdates: [remoteUpdate] },
            });
        });

        expect(await screen.findByText(remoteUpdate.message)).toBeInTheDocument();
        expect(screen.getByText('Patient transported')).toBeInTheDocument();
    });

    test('renders stat strip metrics and allows filtering by status', async () => {
        const resolvedReport = {
            ...initialReport,
            _id: 'report-2',
            address: 'Magdiwang bridge area',
            status: 'resolved',
        };
        mocks.getMyReports.mockResolvedValue({ data: { data: [initialReport, resolvedReport] } });

        renderPage();

        expect(await screen.findByText('Poblacion coastal road')).toBeInTheDocument();
        expect(screen.getByText('Magdiwang bridge area')).toBeInTheDocument();

        // Stat strip
        expect(screen.getByText('Total reports')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();

        // Filter by resolved via the stat-strip KPI card (aria-label "Resolved: <n>, ...")
        const resolvedFilterBtn = screen.getByRole('button', { name: /^Resolved: \d/i });
        fireEvent.click(resolvedFilterBtn);

        expect(screen.queryByText('Poblacion coastal road')).not.toBeInTheDocument();
        expect(screen.getByText('Magdiwang bridge area')).toBeInTheDocument();

        // Filter back to all
        fireEvent.click(screen.getByRole('button', { name: /^All records/i }));
        expect(screen.getByText('Poblacion coastal road')).toBeInTheDocument();
        expect(screen.getByText('Magdiwang bridge area')).toBeInTheDocument();
    });

    test('collapses expanded report when clicked again', async () => {
        renderPage();

        const locationBtn = await screen.findByText(initialReport.address);
        fireEvent.click(locationBtn);

        expect(await screen.findByText('Incident details')).toBeInTheDocument();
        expect(screen.getByText('A motorcycle is blocking one lane.')).toBeInTheDocument();

        // Click again to collapse
        fireEvent.click(locationBtn);
        await waitFor(() => {
            expect(screen.queryByText('Incident details')).not.toBeInTheDocument();
        });
    });

    test('switches expanded state and active styling cleanly when clicking a different report', async () => {
        const secondReport = {
            ...initialReport,
            _id: 'report-2',
            address: 'San Fernando bypass road',
            description: 'Two tricycles collided near the intersection.',
        };
        mocks.getMyReports.mockResolvedValue({ data: { data: [initialReport, secondReport] } });

        const { container } = renderPage();

        const firstReportBtn = await screen.findByText(initialReport.address);
        const secondReportBtn = screen.getByText(secondReport.address);
        const articles = container.querySelectorAll('article');
        expect(articles).toHaveLength(2);
        // The expanded-state accent lives on the header button; the dossier stays neutral
        const headerBtns = container.querySelectorAll('article > button');
        expect(headerBtns).toHaveLength(2);

        // Initially both collapsed / neutral
        expect(headerBtns[0].className).toContain('border-l-transparent');
        expect(headerBtns[1].className).toContain('border-l-transparent');

        // Expand first report: header 0 accented, header 1 neutral
        fireEvent.click(firstReportBtn);
        expect(await screen.findByText('A motorcycle is blocking one lane.')).toBeInTheDocument();
        expect(screen.queryByText('Two tricycles collided near the intersection.')).not.toBeInTheDocument();
        expect(headerBtns[0].className).toContain('border-l-brand-600');
        expect(headerBtns[1].className).toContain('border-l-transparent');

        // Switch and expand second report: header 1 accented, header 0 returns to neutral
        fireEvent.click(secondReportBtn);
        expect(await screen.findByText('Two tricycles collided near the intersection.')).toBeInTheDocument();
        expect(screen.queryByText('A motorcycle is blocking one lane.')).not.toBeInTheDocument();
        expect(headerBtns[0].className).toContain('border-l-transparent');
        expect(headerBtns[1].className).toContain('border-l-brand-600');

        // Click second report again to collapse: both neutral
        fireEvent.click(secondReportBtn);
        await waitFor(() => {
            expect(screen.queryByText('Two tricycles collided near the intersection.')).not.toBeInTheDocument();
        });
        expect(headerBtns[0].className).toContain('border-l-transparent');
        expect(headerBtns[1].className).toContain('border-l-transparent');
    });

    test('opens mobile filter modal and applies filter cleanly', async () => {
        const resolvedReport = {
            ...initialReport,
            _id: 'report-2',
            address: 'Magdiwang bridge area',
            status: 'resolved',
        };
        mocks.getMyReports.mockResolvedValue({ data: { data: [initialReport, resolvedReport] } });

        renderPage();

        expect(await screen.findByText('Poblacion coastal road')).toBeInTheDocument();
        const mobileFilterBtn = screen.getByRole('button', { name: /Filter reports/i });
        fireEvent.click(mobileFilterBtn);

        const dialog = await screen.findByRole('dialog', { name: 'Filter reports by status' });
        expect(dialog).toBeInTheDocument();
        
        // Select Resolved in modal
        const modalResolvedButtons = screen.getAllByRole('button', { name: /Resolved/i });
        // The one inside dialog
        const modalBtn = modalResolvedButtons.find((btn) => dialog.contains(btn));
        fireEvent.click(modalBtn);

        // Apply filters
        const applyBtn = screen.getByRole('button', { name: 'Apply filters' });
        fireEvent.click(applyBtn);

        expect(await screen.findByText('Magdiwang bridge area')).toBeInTheDocument();
        expect(screen.queryByText('Poblacion coastal road')).not.toBeInTheDocument();
    });

    test('renders empty state when reporter has no submissions', async () => {
        mocks.getMyReports.mockResolvedValueOnce({ data: { data: [] } });

        renderPage();

        expect(await screen.findByText('You have not submitted an incident report yet.')).toBeInTheDocument();
        const submitLinks = screen.getAllByRole('link', { name: /Submit incident report/i });
        expect(submitLinks.length).toBeGreaterThanOrEqual(1);
        expect(submitLinks[0]).toHaveAttribute('href', '/report');
    });

    test('renders error state and retries fetching reports on click', async () => {
        mocks.getMyReports.mockRejectedValueOnce(new Error('Network failure'));

        renderPage();

        expect(await screen.findByText('Unable to load your submitted reports.')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: /Retry/i });
        expect(retryBtn).toBeInTheDocument();

        mocks.getMyReports.mockResolvedValueOnce({ data: { data: [initialReport] } });
        fireEvent.click(retryBtn);

        expect(await screen.findByText('Poblacion coastal road')).toBeInTheDocument();
    });

    test('renders offline queued reports banner and allows manual sync', async () => {
        mocks.offlineSync = {
            pendingCount: 2,
            deliverableCount: 2,
            blockedReports: [],
            isSyncing: false,
            sync: vi.fn().mockResolvedValue({ sent: 2, failed: 0, blocked: 0 }),
            resolveBlockedReport: vi.fn(),
            discardReport: vi.fn(),
        };

        renderPage();

        expect(await screen.findByText(/2 incident reports are queued on this device/i)).toBeInTheDocument();
        const syncBtn = screen.getByRole('button', { name: /Sync now/i });
        fireEvent.click(syncBtn);

        expect(mocks.offlineSync.sync).toHaveBeenCalled();

        mocks.offlineSync = {
            pendingCount: 0,
            deliverableCount: 0,
            blockedReports: [],
            isSyncing: false,
            sync: vi.fn(),
            resolveBlockedReport: vi.fn(),
            discardReport: vi.fn(),
        };
    });

    test('shows a queued report the server refused, with the reason and the fix', async () => {
        const resolveBlockedReport = vi.fn().mockResolvedValue(true);
        const discardReport = vi.fn().mockResolvedValue(true);
        mocks.offlineSync = {
            pendingCount: 1,
            deliverableCount: 0,
            blockedReports: [{
                clientReportId: 'rep-queued',
                blockedCode: 'duplicate',
                blockedReason: 'A similar incident was already reported nearby.',
                queuedAt: Date.now(),
                label: 'Poblacion coastal road',
            }],
            isSyncing: false,
            sync: vi.fn(),
            resolveBlockedReport,
            discardReport,
        };

        renderPage();

        // The banner must not promise a retry that cannot happen.
        expect(await screen.findByText(/Nothing can be sent automatically/i)).toBeInTheDocument();
        expect(screen.getByText('A similar incident was already reported nearby.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sync now/i })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /This is a different incident/i }));
        await waitFor(() => expect(resolveBlockedReport)
            .toHaveBeenCalledWith('rep-queued', { confirmDistinct: true }));

        fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
        await waitFor(() => expect(discardReport).toHaveBeenCalledWith('rep-queued'));

        mocks.offlineSync = {
            pendingCount: 0,
            deliverableCount: 0,
            blockedReports: [],
            isSyncing: false,
            sync: vi.fn(),
            resolveBlockedReport: vi.fn(),
            discardReport: vi.fn(),
        };
    });

    test('opens the location correction for a GPS-accuracy block', async () => {
        mocks.offlineSync = {
            pendingCount: 1,
            deliverableCount: 0,
            blockedReports: [{
                clientReportId: 'rep-gps',
                blockedCode: 'rejected',
                blockedReason: 'GPS accuracy must be 100 meters or better. Please retry GPS or pin the incident on the map.',
                queuedAt: Date.now(),
                label: 'Cajidiocan Port',
                coordinates: { lat: 12.3, lng: 122.1 },
            }],
            isSyncing: false,
            sync: vi.fn(),
            resolveBlockedReport: vi.fn(),
            discardReport: vi.fn(),
        };

        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: /Fix location: Cajidiocan Port/i }));

        const dialog = await screen.findByRole('dialog', { name: 'Fix report location' });
        expect(within(dialog).getByText(/GPS accuracy must be 100 meters or better/i)).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /Capture GPS position/i })).toBeInTheDocument();

        mocks.offlineSync = {
            pendingCount: 0,
            deliverableCount: 0,
            blockedReports: [],
            isSyncing: false,
            sync: vi.fn(),
            resolveBlockedReport: vi.fn(),
            discardReport: vi.fn(),
        };
    });
});
