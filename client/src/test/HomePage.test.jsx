import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

        const metricsStrip = screen.getByTestId('landing-hero-metrics');
        expect(await within(metricsStrip).findByText(/Verified reports/i)).toBeInTheDocument();
        expect(await within(metricsStrip).findByText('July 2026')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Report.*Verify.*Respond/i })).toBeInTheDocument();
        const mapAction = screen.getByRole('link', { name: 'View map' });
        const landingNav = screen.getByRole('navigation', { name: 'Landing page' });
        const navMapLink = within(landingNav).getByRole('link', { name: 'Map' });
        const reportAction = screen.getByRole('link', { name: /Report an Incident/ });
        const registrationAction = screen.getByRole('link', { name: 'Register as a reporter' });
        expect(mapAction).toHaveAttribute('href', '/dashboard?view=map');
        expect(navMapLink).toHaveAttribute('href', '/dashboard?view=map');
        expect(reportAction).toHaveAttribute('href', '/login');
        expect(registrationAction).toHaveAttribute('href', '/register');
        expect(mapAction).toHaveClass('min-h-11', 'sm:min-h-12');
        expect(reportAction).toHaveClass('min-h-11', 'sm:min-h-12');
        expect(mapAction).not.toHaveClass('border-emerald-700');
        expect(mapAction).toHaveClass('bg-[var(--surface)]', 'text-[var(--text-primary)]');
        expect(reportAction).toHaveClass('bg-red-600', 'text-white');
        expect(mapAction).toHaveClass('min-w-0', 'flex-1', 'sm:flex-none');
        expect(reportAction).toHaveClass('min-w-0', 'flex-1', 'sm:flex-none');
        expect(screen.getByRole('img', { name: /Map of Sibuyan Island showing Cajidiocan/i })).toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Municipalities covered' })).toBeInTheDocument();
        expect(screen.getByText('14 barangays')).toBeInTheDocument();
        expect(screen.getByText('12 barangays')).toBeInTheDocument();
        const municipalityCoverage = screen.getByTestId('municipality-coverage-list');
        const guarantees = screen.getByTestId('system-guarantees');
        expect(screen.queryByTestId('coverage-metrics')).not.toBeInTheDocument();
        expect(municipalityCoverage.tagName).toBe('UL');
        expect(municipalityCoverage).toHaveClass('flex', 'flex-col');
        Array.from(municipalityCoverage.children).forEach((municipalityRow) => {
            // Municipal-grade flat ledger rows: hairline bottom divider, no card chrome.
            expect(municipalityRow).toHaveClass('border-b', 'border-white/15');
            expect(municipalityRow).not.toHaveClass('rounded');
        });
        expect(screen.getByRole('img', { name: 'Cajidiocan seal' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Magdiwang seal' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'San Fernando seal' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Covered')).not.toBeInTheDocument();
        expect(guarantees).toHaveClass('lg:border-l');
        expect(guarantees).not.toHaveClass('rounded-3xl', 'bg-white/[0.05]');
        expect(screen.getByText('GPS-based incident location')).toBeInTheDocument();
        expect(screen.queryByText('GPS-based incident location with barangay verification')).not.toBeInTheDocument();
        const emergencyNoticeLabel = screen.queryByText('Important Notice');
        expect(emergencyNoticeLabel).not.toBeInTheDocument();
        expect(screen.queryByTestId('coverage-emergency-notice')).not.toBeInTheDocument();
        expect(screen.queryByText('Live across Sibuyan Island')).not.toBeInTheDocument();
        expect(screen.queryByText(/Coordinated with BFP/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Built around real municipal workflows.' })).not.toBeInTheDocument();
        expect(screen.queryByText('Data Privacy Notice')).not.toBeInTheDocument();
        expect(screen.queryByText(/Data handled in compliance with RA 10173/i)).not.toBeInTheDocument();

        // The "Typical incident journey" strip was removed from the landing page.
        expect(screen.queryByText('Typical incident journey')).not.toBeInTheDocument();
        expect(screen.queryByText('Full incident lifecycle')).not.toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Incident status stages in order' })).not.toBeInTheDocument();

        expect((await screen.findAllByText(/Active risk zones/i)).length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /Active risk zones/i })).not.toBeInTheDocument();

        const copy = screen.getByTestId('landing-hero-copy');
        const mapPreview = screen.getByTestId('sibuyan-island-map');
        const staticMapPreview = mapPreview.querySelector('img[src="/icons/Municipality.png"]');
        const staticMapFrame = staticMapPreview.parentElement;
        const heroLayout = screen.getByTestId('landing-hero-layout');
        const mapContainer = screen.getByTestId('landing-hero-map');
        const eyebrow = screen.getByTestId('landing-hero-eyebrow');
        const description = screen.getByTestId('landing-hero-description');
        const actions = screen.getByTestId('landing-hero-actions');
        const primaryActions = screen.getByTestId('landing-hero-primary-actions');
        const footerGrid = screen.getByTestId('landing-footer-grid');
        expect(heroLayout).toHaveClass('flex', 'flex-wrap', 'items-stretch', 'lg:flex-nowrap');
        expect(copy).toHaveClass('self-stretch', 'flex-col', 'justify-between');
        expect(mapContainer).toHaveClass('self-stretch', 'lg:self-start');
        expect(mapContainer).not.toHaveClass('lg:pt-10');
        expect(mapPreview).toHaveClass('max-w-[210px]', 'sm:max-w-[360px]', 'lg:max-w-[450px]', 'xl:max-w-[500px]');
        expect(staticMapFrame).toHaveClass('relative', 'border', 'p-2');
        expect(staticMapPreview).toHaveClass('h-auto', 'w-full', 'object-contain');
        expect(staticMapPreview).toHaveAttribute('width', '640');
        expect(staticMapPreview).toHaveAttribute('height', '530');
        expect(eyebrow).toHaveTextContent('Island-wide incident coordination');
        // One line at every mobile width: nowrap plus a stepped size ramp that
        // mirrors the location line below it (8px → 9px → 10px → 11px at sm+).
        expect(eyebrow).toHaveClass(
            'whitespace-nowrap',
            'text-[8px]',
            'min-[360px]:text-[9px]',
            'min-[400px]:text-[10px]',
            'sm:text-[11px]',
        );
        expect(eyebrow).not.toHaveClass('hidden');
        expect(copy).toContainElement(eyebrow);
        expect(description).toHaveClass('order-3', 'basis-full', 'lg:basis-auto');
        expect(actions).toHaveClass('order-4', 'basis-full', 'flex-col', 'lg:basis-auto');
        expect(primaryActions).toHaveClass('w-full', 'flex-nowrap', 'items-center');
        expect(footerGrid).toHaveClass('grid-cols-2', 'lg:grid-cols-[1.6fr_1fr_1fr]');
        expect(screen.getByText('Quick Links').parentElement).toHaveClass('min-w-0');
        expect(screen.getByText('Legal Information').parentElement).toHaveClass('min-w-0');
        const benefits = screen.getByTestId('landing-hero-benefits');
        expect(benefits).toHaveClass('lg:self-start');
        expect(benefits).not.toHaveClass('lg:pt-10');
        const benefitList = within(benefits).getByRole('list');
        const benefitRows = within(benefitList).getAllByRole('listitem');
        expect(benefitRows).toHaveLength(5);
        expect(benefitRows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
            'Verified reports',
            'Real-time alerts',
            'Municipality coordination',
            'High-risk areas',
            'Responder dispatch',
        ]);
        expect(within(benefitList).getByText('View mapped high-risk areas and monitored hazard zones on the live map.')).toBeInTheDocument();
        expect(benefitList).toHaveClass('flex', 'flex-col', 'gap-5', 'lg:mt-2');
        expect(benefitList).not.toHaveClass('overflow-y-auto', 'overflow-hidden', 'max-h-full');
        benefitRows.forEach((row) => {
            expect(row).toHaveClass('flex', 'items-start', 'gap-4');
        });
        const metrics = screen.getByTestId('landing-hero-metrics');
        expect(copy.compareDocumentPosition(mapPreview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(staticMapPreview).toBeInTheDocument();
        expect(mapPreview.querySelector('.maplibregl-map')).not.toBeInTheDocument();
        expect(actions.compareDocumentPosition(mapPreview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(actions.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(benefits.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }, 15000);

    test('uses safe metric fallbacks when public analytics are unavailable', async () => {
        mocks.getPublic.mockRejectedValueOnce(new Error('Unavailable'));
        mocks.getStats.mockRejectedValueOnce(new Error('Unavailable'));

        renderPage();

        await waitFor(() => {
            expect(screen.getAllByText('—')).toHaveLength(2);
        });
        expect(screen.queryByText('Live data temporarily unavailable')).not.toBeInTheDocument();
        expect(screen.queryByText('Live across Sibuyan Island')).not.toBeInTheDocument();
        expect(mocks.getStats).not.toHaveBeenCalled();
    });

    test('opens accessible privacy and terms modals from the footer', async () => {
        renderPage();

        const privacyTrigger = screen.getByRole('button', { name: 'Privacy Policy' });
        privacyTrigger.focus();
        fireEvent.click(privacyTrigger);

        const privacyDialog = screen.getByRole('dialog', { name: 'Privacy Policy' });
        expect(within(privacyDialog).getByText('2. Personal data we process')).toBeInTheDocument();
        expect(within(privacyDialog).getByRole('link', {
            name: /National Privacy Commission: Data Subject Rights/i,
        })).toHaveAttribute('href', 'https://privacy.gov.ph/data-subject-rights/');
        expect(document.body.style.overflow).toBe('hidden');

        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Privacy Policy' })).not.toBeInTheDocument();
        });
        expect(document.body.style.overflow).toBe('');
        expect(privacyTrigger).toHaveFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Terms of Use' }));
        const termsDialog = screen.getByRole('dialog', { name: 'Terms of Use' });
        expect(within(termsDialog).getByText('5. Prohibited conduct')).toBeInTheDocument();
        expect(within(termsDialog).getByText('13. Governing law and contact')).toBeInTheDocument();

        fireEvent.click(within(termsDialog).getByRole('button', { name: 'Close modal' }));
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Terms of Use' })).not.toBeInTheDocument();
        });
    });
});

describe('HomePage landing polling fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPublic.mockResolvedValue({
            data: { success: true, data: { verifiedReportsThisMonth: 4 } },
        });
        mocks.getMunicipalities.mockResolvedValue({ data: { success: true, data: [] } });
    });

    test('polls public stats every 45 seconds instead of subscribing to a socket', async () => {
        vi.useFakeTimers();
        try {
            renderPage();
            // Mount fetch.
            await act(async () => {});
            expect(mocks.getPublic).toHaveBeenCalledTimes(1);

            // No socket subscription is used for live updates anymore.
            expect(mocks.subscribe).not.toHaveBeenCalled();

            // One interval fires scheduleRefresh, whose 400ms debounce then
            // runs the fetch.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(45000 + 400);
            });
            await act(async () => {});
            expect(mocks.getPublic).toHaveBeenCalledTimes(2);

            // And again on the next interval.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(45000 + 400);
            });
            await act(async () => {});
            expect(mocks.getPublic).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });
});
