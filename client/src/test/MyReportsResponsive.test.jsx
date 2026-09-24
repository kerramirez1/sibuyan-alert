import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MyReportsPage from '../pages/MyReportsPage';

const mocks = vi.hoisted(() => ({
    getMyReports: vi.fn(),
    addUpdate: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
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

vi.mock('../services/api', () => ({
    reportsAPI: {
        getMyReports: mocks.getMyReports,
        addUpdate: mocks.addUpdate,
    },
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: mocks.subscribe,
    }),
}));

vi.mock('../hooks/useConnectivity', () => ({
    useConnectivity: () => ({ isOnline: true }),
}));

vi.mock('../hooks/useOfflineReportSync', () => ({
    useOfflineReportSync: () => mocks.offlineSync,
}));

vi.mock('../utils/appToast', () => ({
    default: mocks.toast,
}));

const longReport = {
    _id: 'report-long-1',
    address: 'Sibuyan Circumferential Road, Cambao, Cajidiocan, Romblon, Philippines (Near Municipal Boundary)',
    incidentType: 'vehicular',
    status: 'pending',
    severity: 'moderate',
    description: 'A large cargo delivery truck and a motorcycle collided on the curve section of the circumferential road.',
    createdAt: '2026-09-20T10:00:00.000Z',
    reportUpdates: [],
    transferHistory: [],
    responders: [],
};

const renderPage = (entry = '/my-reports') => render(
    <MemoryRouter initialEntries={[entry]}>
        <MyReportsPage />
    </MemoryRouter>
);

describe('MyReportsPage responsive text layout refinements', () => {
    beforeEach(() => {
        mocks.getMyReports.mockReset();
        mocks.getMyReports.mockResolvedValue({ data: { data: [longReport] } });
    });

    test('1. Location title in collapsed row is truncated to a single line with accessible title', async () => {
        renderPage();

        const titleEl = await screen.findByRole('heading', { level: 3, name: /Sibuyan Circumferential Road/i });
        expect(titleEl).toBeInTheDocument();
        expect(titleEl.className).toContain('truncate');
        expect(titleEl.className).not.toContain('break-words');
        expect(titleEl).toHaveAttribute('title', longReport.address);
    });

    test('2. Metadata beneath title is truncated to a single line with full title attribute', async () => {
        const { container } = renderPage();

        await screen.findByText(/Sibuyan Circumferential Road/i);
        const metadataEl = container.querySelector('article button p.truncate');
        expect(metadataEl).toBeInTheDocument();
        expect(metadataEl.className).toContain('truncate');
        expect(metadataEl).toHaveAttribute('title', expect.stringContaining('Vehicular collision'));
    });

    test('3. Mobile status and severity indicators are formatted on one line with status dot', async () => {
        const { container } = renderPage();

        await screen.findByText(/Sibuyan Circumferential Road/i);
        const mobileStatusEl = container.querySelector('article button p.sm\\:hidden');
        expect(mobileStatusEl).toBeInTheDocument();
        expect(mobileStatusEl.className).toContain('truncate');
        expect(mobileStatusEl.className).toContain('flex');
        expect(mobileStatusEl).toHaveTextContent(/Pending review/i);
        expect(mobileStatusEl).toHaveTextContent(/Moderate/i);
        expect(mobileStatusEl).toHaveAttribute('title', 'Status: Pending review · Severity: Moderate');

        // Check for colored status indicator dot
        const statusDot = mobileStatusEl.querySelector('span.rounded-full');
        expect(statusDot).toBeInTheDocument();
    });

    test('4. Card header "Submitted reports" and "Filter reports" are protected from wrapping and collision', async () => {
        renderPage();

        const headerTitle = await screen.findByRole('heading', { level: 2, name: /Submitted reports/i });
        expect(headerTitle).toBeInTheDocument();
        expect(headerTitle.className).toContain('truncate');
        expect(headerTitle.className).toContain('min-w-0');

        const filterBtn = screen.getByRole('button', { name: /Filter reports/i });
        expect(filterBtn).toBeInTheDocument();
        expect(filterBtn.className).toContain('shrink-0');
        expect(filterBtn.className).toContain('whitespace-nowrap');
    });

    test('5. KPI summary cards truncate cleanly on narrow viewports while preserving accessible info', async () => {
        renderPage();

        expect(await screen.findByText('Total reports')).toBeInTheDocument();
        const pendingLabel = screen.getByText('Pending review', { selector: '.metric-label' });
        expect(pendingLabel.className).toContain('truncate');
        expect(pendingLabel).toHaveAttribute('title', 'Pending review');

        const waitingHelper = screen.getByText('Waiting for verification', { selector: '.metric-helper' });
        expect(waitingHelper.className).toContain('truncate');
        expect(waitingHelper).toHaveAttribute('title', 'Waiting for verification');
    });

    test('6. Tablet and desktop status and severity columns remain intact', async () => {
        const { container } = renderPage();

        await screen.findByText(/Sibuyan Circumferential Road/i);
        const desktopStatus = container.querySelector('article button > span.hidden.sm\\:block');
        expect(desktopStatus).toBeInTheDocument();
        expect(desktopStatus).toHaveTextContent('Pending review');

        const desktopSeverity = container.querySelector('article button > span.hidden.sm\\:inline-flex');
        expect(desktopSeverity).toBeInTheDocument();
        expect(desktopSeverity).toHaveTextContent('Moderate');
    });

    test('7. Expanded report description allows natural multi-line wrapping for complete readability', async () => {
        renderPage();

        const expandBtn = await screen.findByRole('button', { name: /details for report at/i });
        expandBtn.click();

        const descriptionEl = await screen.findByText(longReport.description);
        expect(descriptionEl).toBeInTheDocument();
        expect(descriptionEl.className).toContain('leading-relaxed');
        expect(descriptionEl.className).not.toContain('truncate');
        expect(descriptionEl.className).not.toContain('whitespace-nowrap');
    });
});
