import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    logout: vi.fn(),
    isAuthenticated: true,
    canSubmitReports: () => false,
    user: {
        _id: 'admin-1',
        name: 'Cajidiocan Municipal Admin',
        role: 'municipal_admin',
        assignedMunicipality: 'Cajidiocan',
    },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: mocks.user,
        logout: mocks.logout,
        canSubmitReports: () => (typeof mocks.canSubmitReports === 'function' ? mocks.canSubmitReports() : !!mocks.canSubmitReports),
        isAuthenticated: mocks.isAuthenticated,
        updateUser: vi.fn(),
    }),
}));

vi.mock('../components/ui/NotificationBell', () => ({
    default: () => <button type="button" aria-label="Notifications" />,
}));

import MainLayout from '../components/layout/MainLayout';

/**
 * The desktop sidebar. Scoped lookups matter now that the operational roles
 * also render a mobile bottom nav: `Map` is a real destination in both, and a
 * document-wide query would be ambiguous rather than meaningful.
 */
const getSidebar = () => screen.getByRole('complementary', { name: 'Primary navigation' });

const renderLayout = (entry = '/accident-history') => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes>
            <Route element={<MainLayout><div>Page content</div></MainLayout>} />
        </Routes>
    </MemoryRouter>
);

describe('MainLayout responsive navigation', () => {
    beforeEach(() => {
        mocks.isAuthenticated = true;
        mocks.canSubmitReports = () => false;
        mocks.user = {
            _id: 'admin-1',
            name: 'Cajidiocan Municipal Admin',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
    });

    test('uses consistent navigation styling and a readable municipal account label', () => {
        renderLayout();

        const activeLink = screen.getByRole('link', { name: 'Accident History' });
        expect(activeLink).toHaveClass('min-h-10', 'bg-white/[0.08]', 'text-white', 'border-sky-300');
        expect(activeLink.className).not.toContain('gradient');
        expect(activeLink.className).not.toContain('shadow');
        expect(activeLink.className).not.toContain('focus:ring');
        expect(activeLink.className).toContain('focus-visible:ring');
        expect(screen.getByText('Municipal admin · Cajidiocan')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Risk Zones' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open profile settings' })).toBeInTheDocument();

        const reportsLink = screen.getByRole('link', { name: 'Incident Reports' });
        expect(reportsLink.querySelector('svg')).toBeInTheDocument();
        expect(reportsLink.querySelector('img')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass('min-h-9', 'w-full');
        const main = screen.getByRole('main');
        expect(main).toHaveClass('min-h-0', 'overscroll-contain', 'pt-3', 'sm:pt-4', 'lg:pt-5');
        expect(main.parentElement).toHaveClass('min-h-0', 'overflow-hidden');
        expect(main.parentElement?.parentElement).toHaveClass('fixed', 'inset-0', 'overflow-hidden');
        expect(document.body.style.overflow).toBe('hidden');
    });

    test('activates exactly one dashboard destination for each dashboard URL', () => {
        const { unmount } = renderLayout('/dashboard');

        // /dashboard is the incident map for every role, the municipal admin
        // included. Analytics is the opt-in half now, not the default.
        const mapPathSidebar = getSidebar();
        expect(within(mapPathSidebar).getByRole('link', { name: 'Map' })).toHaveClass('bg-white/[0.08]');
        expect(within(mapPathSidebar).getByRole('link', { name: 'Analytics' })).not.toHaveClass('bg-white/[0.08]');
        expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
        const activeLinks = screen.getAllByRole('link').filter((link) => link.className.split(/\s+/).includes('bg-white/[0.08]'));
        expect(activeLinks).toHaveLength(1);

        unmount();

        // Analytics keeps a URL of its own, reachable from the sidebar.
        renderLayout('/dashboard?view=analytics');
        const analyticsSidebar = getSidebar();
        expect(within(analyticsSidebar).getByRole('link', { name: 'Analytics' })).toHaveClass('bg-white/[0.08]');
        expect(within(analyticsSidebar).getByRole('link', { name: 'Map' })).not.toHaveClass('bg-white/[0.08]');
    });

    test('labels the responder operational route as Incident Reports', () => {
        mocks.user = {
            _id: 'responder-1',
            name: 'MDRRMO Cajidiocan',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/admin/reports?view=dispatch-queue');

        const reportsLink = screen.getByRole('link', { name: 'Incident Reports' });
        expect(reportsLink).toHaveAttribute('href', '/admin/reports?view=dispatch-queue');
        expect(screen.queryByRole('link', { name: 'Response Queue' })).not.toBeInTheDocument();
    });

    test('labels the reporter operational home route as Dashboard', () => {
        mocks.user = {
            _id: 'reporter-1',
            name: 'Juan Reporter',
            role: 'reporter',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/reporter');

        const reporterDashboardLink = screen.getByRole('link', { name: 'Dashboard' });
        expect(reporterDashboardLink).toHaveAttribute('href', '/reporter');
        expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    });

    test('opens and closes the fluid mobile navigation drawer accessibly', () => {
        renderLayout();
        const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' });
        expect(sidebar).toHaveClass('-translate-x-full');

        const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(menuButton);
        expect(sidebar).toHaveClass('translate-x-0');
        expect(menuButton).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation menu' })[0]);
        expect(sidebar).toHaveClass('-translate-x-full');
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('closes the drawer when Escape key is pressed', () => {
        renderLayout();
        const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' });

        fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
        expect(sidebar).toHaveClass('translate-x-0');

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(sidebar).toHaveClass('-translate-x-full');
    });

    test('uses a predictable drawer width with prefers-reduced-motion support', () => {
        renderLayout();
        const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' });
        expect(sidebar.className).toContain('w-[min(80vw,320px)]');
        expect(sidebar.className).toContain('motion-safe:transition-transform');
        expect(sidebar.className).toContain('motion-safe:duration-200');
    });

    test('expands the sidebar with visible labels at lg and keeps the icon rail below it', () => {
        renderLayout();
        const sidebar = getSidebar();

        // Width contract: 76px icon rail from md, full 260px sidebar from lg —
        // no xl breakpoint remains anywhere in the sidebar.
        expect(sidebar).toHaveClass('md:w-[76px]', 'lg:w-[260px]');
        expect(sidebar.className).not.toContain('xl:');

        // Navigation labels are icon-only (sr-only) between md and lg, visible at lg+.
        expect(within(sidebar).getByText('Map')).toHaveClass('md:sr-only', 'lg:not-sr-only');
        expect(within(sidebar).getByText('Island Operations')).toHaveClass('md:sr-only', 'lg:not-sr-only');
        expect(within(sidebar).getByRole('link', { name: 'Accident History' }))
            .toHaveClass('md:justify-center', 'md:px-2', 'lg:justify-start', 'lg:px-3');

        // Account details and sign-out text follow the same breakpoint.
        expect(screen.getByText('Municipal admin · Cajidiocan').parentElement)
            .toHaveClass('md:sr-only', 'lg:not-sr-only');
        expect(screen.getByRole('button', { name: 'Sign out' }).querySelector('span'))
            .toHaveClass('md:sr-only', 'lg:not-sr-only');
    });

    test('removes visible section headings (Operations, Mapping, History) for municipal admin and retains all admin links', () => {
        renderLayout('/admin');

        // Section labels must not be in the document
        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.queryByText('Mapping')).not.toBeInTheDocument();
        expect(screen.queryByText('History')).not.toBeInTheDocument();

        // All authorized admin navigation items remain present
        const sidebar = getSidebar();
        expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Incident Reports' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Users' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/dashboard');
        expect(within(sidebar).getByRole('link', { name: 'Risk Zones' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/dashboard?view=analytics');
        expect(within(sidebar).getByRole('link', { name: 'Accident History' })).toBeInTheDocument();

        // Unauthorized items remain hidden
        expect(screen.queryByRole('link', { name: 'Submit Report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'My Reports' })).not.toBeInTheDocument();
    });

    test('gives municipal admin a thumb-reach bottom nav and keeps the drawer for the rest', () => {
        renderLayout('/admin');

        const bottomNav = screen.getByRole('navigation', { name: 'Operational quick navigation' });
        // Four destinations, none of them a fabricated centre action: the
        // reporter bar's FAB exists because submitting a report is that role's
        // reason to exist, and neither operational role has a create action.
        expect(within(bottomNav).getAllByRole('link')).toHaveLength(4);
        expect(within(bottomNav).getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/admin/reports');
        expect(within(bottomNav).getByRole('link', { name: 'Zones' })).toHaveAttribute('href', '/admin/zones');
    });

    test('sends a responder to the dispatch queue and the hazard layer, not the admin zones page', () => {
        mocks.user = {
            _id: 'responder-1',
            name: 'MDRRMO Cajidiocan',
            role: 'responder',
            agency: 'LGU',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/admin');

        const bottomNav = screen.getByRole('navigation', { name: 'Operational quick navigation' });
        // Same word, the right destination per role: a responder reads hazards
        // on the map, they do not manage the admin zones page.
        expect(within(bottomNav).getByRole('link', { name: 'Dispatch' })).toHaveAttribute('href', '/admin/reports?view=dispatch-queue');
        expect(within(bottomNav).getByRole('link', { name: 'Hazards' })).toHaveAttribute('href', '/dashboard?panel=zones');
        expect(within(bottomNav).queryByRole('link', { name: 'Zones' })).not.toBeInTheDocument();
    });

    test('hands the current-page mark to the hazard panel, not to the map behind it', () => {
        mocks.user = {
            _id: 'responder-1',
            name: 'MDRRMO Cajidiocan',
            role: 'responder',
            agency: 'LGU',
            assignedMunicipality: 'Cajidiocan',
        };

        // `?panel=zones` is the map with the hazard list already open, so two
        // bottom-nav items address the same page. Only one may be current.
        renderLayout('/dashboard?panel=zones');

        const bottomNav = screen.getByRole('navigation', { name: 'Operational quick navigation' });
        expect(within(bottomNav).getByRole('link', { name: 'Hazards' })).toHaveAttribute('aria-current', 'page');
        expect(within(bottomNav).getByRole('link', { name: 'Map' })).not.toHaveAttribute('aria-current');
    });

    test('keeps guest map sign-in and registration routes alongside authorized public navigation', () => {
        mocks.isAuthenticated = false;
        mocks.user = null;

        renderLayout('/dashboard?view=map');

        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.queryByText('Mapping')).not.toBeInTheDocument();
        expect(screen.queryByText('History')).not.toBeInTheDocument();

        const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' });
        expect(within(sidebar).getByRole('link', { name: 'Overview' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Accident History' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/login');
        expect(within(sidebar).getByRole('link', { name: /Become a Reporter/i })).toHaveAttribute('href', '/register');

        expect(within(sidebar).queryByRole('link', { name: 'Incident Reports' })).not.toBeInTheDocument();
        expect(within(sidebar).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
        expect(within(sidebar).queryByRole('link', { name: 'Risk Zones' })).not.toBeInTheDocument();
        expect(within(sidebar).queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    });

    test('removes visible section headings for reporter and only renders authorized reporter navigation', () => {
        mocks.user = {
            _id: 'reporter-1',
            name: 'Juan Reporter',
            role: 'reporter',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/reporter');

        const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' });
        expect(within(sidebar).queryByText('Operations')).not.toBeInTheDocument();
        expect(within(sidebar).queryByText('Mapping')).not.toBeInTheDocument();
        expect(within(sidebar).queryByText('History')).not.toBeInTheDocument();

        expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'My Reports' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Accident History' })).toBeInTheDocument();
        // Reporter bottom nav mirrors Accident History for thumb reach
        expect(screen.getByRole('navigation', { name: 'Reporter quick navigation' })).toBeInTheDocument();
        // The operational bar is for the operational roles only.
        expect(screen.queryByRole('navigation', { name: 'Operational quick navigation' })).not.toBeInTheDocument();

        expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Risk Zones' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    });

    test('applies unified navigation styling, distinct inactive action state for Submit Report, and active-state parity across destinations', () => {
        mocks.user = {
            _id: 'reporter-1',
            name: 'Juan Reporter',
            role: 'reporter',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.canSubmitReports = () => true;

        // 1. When on /reporter: Dashboard is active, Submit Report is prominent but inactive
        const { unmount: unmountReporter } = renderLayout('/reporter');
        const reporterSidebar = getSidebar();

        const dashboardLink = within(reporterSidebar).getByRole('link', { name: 'Dashboard' });
        const submitReportLink = within(reporterSidebar).getByRole('link', { name: 'Submit Report' });
        const myReportsLink = within(reporterSidebar).getByRole('link', { name: 'My Reports' });
        const mapLink = within(reporterSidebar).getByRole('link', { name: 'Map' });
        const historyLink = within(reporterSidebar).getByRole('link', { name: 'Accident History' });

        // Shared dimensions & ergonomics across all items
        [dashboardLink, submitReportLink, myReportsLink, mapLink, historyLink].forEach((link) => {
            expect(link).toHaveClass('min-h-10', 'px-3', 'rounded-md', 'gap-3');
            expect(link.querySelector('svg')).toHaveClass('h-[18px]', 'w-[18px]', 'shrink-0');
        });

        // Dashboard is active destination
        expect(dashboardLink).toHaveClass('border-sky-300', 'bg-white/[0.08]', 'text-white');
        expect(dashboardLink).toHaveAttribute('aria-current', 'page');
        expect(dashboardLink).toHaveClass('focus-visible:ring-sky-400');

        // Submit Report shares the standard inactive treatment — clearly NOT selected/active
        expect(submitReportLink).toHaveClass('border-transparent', 'text-slate-300/70');
        expect(submitReportLink).not.toHaveClass('border-sky-300');
        expect(submitReportLink).not.toHaveAttribute('aria-current');
        expect(submitReportLink).toHaveClass('focus-visible:ring-sky-400');

        // Remaining destinations are inactive
        expect(myReportsLink).toHaveClass('border-transparent', 'text-slate-300/70');
        expect(myReportsLink).not.toHaveClass('bg-white/[0.08]');
        expect(myReportsLink).not.toHaveAttribute('aria-current');
        expect(myReportsLink).toHaveClass('focus-visible:ring-sky-400');

        unmountReporter();

        // 2. When on /report: Submit Report is active destination
        const { unmount: unmountReport } = renderLayout('/report');
        const reportSidebar = getSidebar();
        const activeSubmitReportLink = within(reportSidebar).getByRole('link', { name: 'Submit Report' });
        const inactiveDashboardLink = within(reportSidebar).getByRole('link', { name: 'Dashboard' });

        expect(activeSubmitReportLink).toHaveClass('border-sky-300', 'bg-white/[0.08]', 'text-white');
        expect(activeSubmitReportLink).toHaveAttribute('aria-current', 'page');
        expect(activeSubmitReportLink).toHaveClass('focus-visible:ring-sky-400');

        expect(inactiveDashboardLink).toHaveClass('border-transparent');
        expect(inactiveDashboardLink).not.toHaveClass('border-sky-300');
        expect(inactiveDashboardLink).not.toHaveAttribute('aria-current');

        unmountReport();

        // 3. When on /my-reports: My Reports uses standard active-state pattern
        renderLayout('/my-reports');
        const myReportsSidebar = getSidebar();
        const activeMyReportsLink = within(myReportsSidebar).getByRole('link', { name: 'My Reports' });
        const inactiveSubmitLink = within(myReportsSidebar).getByRole('link', { name: 'Submit Report' });

        expect(activeMyReportsLink).toHaveClass('border-sky-300', 'bg-white/[0.08]', 'text-white');
        expect(activeMyReportsLink).toHaveAttribute('aria-current', 'page');

        expect(inactiveSubmitLink).toHaveClass('border-transparent', 'text-slate-300/70');
        expect(inactiveSubmitLink).not.toHaveAttribute('aria-current');
    });

    test('removes visible section headings for responder and only renders authorized responder navigation', () => {
        mocks.user = {
            _id: 'responder-1',
            name: 'MDRRMO Cajidiocan',
            role: 'responder',
            agency: 'LGU',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/admin');

        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.queryByText('Mapping')).not.toBeInTheDocument();
        expect(screen.queryByText('History')).not.toBeInTheDocument();

        const sidebar = getSidebar();
        expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Incident Reports' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Accident History' })).toBeInTheDocument();

        expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Risk Zones' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    });

    test('promotes layout stacking context and applies mobile-sidebar-open class on body when drawer opens', () => {
        renderLayout();

        const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
        const main = screen.getByRole('main');
        const rootContainer = main.parentElement?.parentElement;

        expect(document.body.classList.contains('mobile-sidebar-open')).toBe(false);
        expect(rootContainer?.className).not.toContain('z-[95]');

        // Open drawer
        fireEvent.click(menuButton);
        expect(document.body.classList.contains('mobile-sidebar-open')).toBe(true);
        expect(rootContainer?.className).toContain('z-[95]');

        // Close drawer
        fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation menu' })[0]);
        expect(document.body.classList.contains('mobile-sidebar-open')).toBe(false);
        expect(rootContainer?.className).not.toContain('z-[95]');
    });

    test('a fit-to-window page is handed a definite height to size itself against', () => {
        const { unmount } = render(
            <MemoryRouter initialEntries={['/admin/zones']}>
                <Routes>
                    <Route element={<MainLayout fitWindow><div>Fitted page</div></MainLayout>} />
                </Routes>
            </MemoryRouter>
        );

        // The zones workspace is map + list and both halves scroll inside
        // themselves, so the page must fill the window instead of scrolling. A
        // percentage height only resolves against a parent with a height of its
        // own, which is what this wrapper provides — the page can then never be
        // taller than the space it was given.
        expect(screen.getByText('Fitted page').parentElement).toHaveClass('page-enter', 'lg:h-full');
        // ...and the scroller behind it steps out of the way at lg, so an
        // overshoot is clipped rather than turning the workspace into a scroller.
        expect(screen.getByRole('main')).toHaveClass('lg:overflow-y-hidden');
        unmount();

        // Every other page keeps the wrapper's natural height: block flow and
        // normal page scrolling are unchanged where they are what we want.
        renderLayout();
        expect(screen.getByText('Page content').parentElement).not.toHaveClass('lg:h-full');
        expect(screen.getByRole('main')).not.toHaveClass('lg:overflow-y-hidden');
    });

    test('renders verified reporter badge in sidebar for approved verified reporter', () => {
        mocks.user = {
            _id: 'reporter-1',
            name: 'Juan Verified Reporter',
            role: 'reporter',
            verificationStatus: 'approved',
            isVerified: true,
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout();
        const sidebar = getSidebar();
        expect(within(sidebar).getByText('Juan Verified Reporter')).toBeInTheDocument();
        const badge = within(sidebar).getByRole('status', { name: 'Verified reporter' });
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('title', 'Verified reporter');
    });

    test.each([
        ['reporter', 'pending', false],
        ['reporter', 'rejected', false],
        ['reporter', 'approved', false],
        ['ordinary', 'approved', true],
        ['responder', 'approved', true],
        ['municipal_admin', 'approved', true],
    ])('does not render verified reporter badge in sidebar for %s with status %s and isVerified %s', (role, verificationStatus, isVerified) => {
        mocks.user = {
            _id: 'user-test',
            name: 'Sidebar Test User',
            role,
            verificationStatus,
            isVerified,
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout();
        const sidebar = getSidebar();
        expect(within(sidebar).queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });
});

/**
 * The application-wide search belongs to the Dashboard and nowhere else.
 *
 * `ReportSearch` renders its input with `role="combobox"`, which is the handle
 * used here. jsdom applies no stylesheet, so the desktop bar's `md:flex` does
 * not hide it — present in the DOM means present on the page.
 *
 * The Dashboard is `/admin` for municipal admins and responders and `/reporter`
 * for reporters — the sidebar's own "Dashboard" target. `/dashboard` is the Map.
 */
describe('MainLayout global header search placement', () => {
    beforeEach(() => {
        mocks.isAuthenticated = true;
        mocks.canSubmitReports = () => false;
        mocks.user = {
            _id: 'admin-1',
            name: 'Cajidiocan Municipal Admin',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
    });

    test('the admin dashboard carries it', () => {
        renderLayout('/admin');

        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    test('the reporter dashboard carries it', () => {
        mocks.user = { ...mocks.user, role: 'reporter' };
        renderLayout('/reporter');

        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    test.each([
        ['incident reports', '/admin/reports'],
        ['users', '/admin/users'],
        ['risk zones', '/admin/zones'],
        ['accident history', '/accident-history'],
        ['the map', '/dashboard'],
        ['the profile page', '/profile'],
    ])('%s does not carry it', (_label, path) => {
        renderLayout(path);

        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    test('the mobile search toggle goes with it', () => {
        renderLayout('/admin/reports');

        // Leaving the icon behind would open a row that renders nothing.
        expect(screen.queryByRole('button', { name: 'Search incident reports' })).not.toBeInTheDocument();
    });

    test('the mobile search toggle is still there on the dashboard', () => {
        renderLayout('/admin');

        expect(screen.getByRole('button', { name: 'Search incident reports' })).toBeInTheDocument();
    });

    test('notifications survive the search being removed', () => {
        renderLayout('/admin/reports');

        // The header is brand + notifications there, not brand alone.
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    });
});

/**
 * The header brand block used to carry `md:hidden`, so "Sibuyan Island
 * Operations" vanished at desktop widths, and its subtitle's `md:block`
 * sat inside that hidden parent and could never apply. jsdom applies no
 * stylesheet, so these tests assert the responsive contract through the
 * classes themselves: no `md:hidden` on the block or its ancestors, a
 * capped truncating width at md+, and the municipality line gated to lg+.
 */
describe('MainLayout header brand responsive visibility', () => {
    beforeEach(() => {
        mocks.isAuthenticated = true;
        mocks.canSubmitReports = () => false;
        mocks.user = {
            _id: 'admin-1',
            name: 'Cajidiocan Municipal Admin',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
    });

    test('keeps the brand block in the DOM at desktop widths with a capped, truncating width', () => {
        renderLayout('/admin');

        const brand = screen.getByText('Sibuyan Island Operations');
        const brandBlock = brand.parentElement;
        // The regression: `md:hidden` removed the entire brand block at md+.
        expect(brandBlock.className).not.toContain('md:hidden');
        // Capped so it cannot collide with the search field or utilities,
        // while lg+ is wide enough for the full municipality subtitle.
        expect(brandBlock).toHaveClass('md:max-w-48', 'lg:max-w-96');
        expect(brand).toHaveClass('truncate');
        // Mobile behavior is unchanged: it still fills the row beside the hamburger.
        expect(brandBlock).toHaveClass('flex-1', 'min-w-0');
    });

    test('shows the municipality subtitle only where it fits', () => {
        renderLayout('/admin');

        const subtitle = screen.getByText(/San Fernando Municipal Alert System/);
        // The old `md:block` lived inside an `md:hidden` parent and never applied.
        expect(subtitle.className).not.toContain('md:block');
        expect(subtitle).toHaveClass('hidden', 'lg:block', 'truncate');
        // No ancestor hides the block at desktop widths.
        let node = subtitle.parentElement;
        while (node && node !== document.body) {
            expect(node.className ?? '').not.toContain('md:hidden');
            node = node.parentElement;
        }
    });

    test('keeps desktop utilities alongside the restored brand', () => {
        renderLayout('/admin');

        // Brand, search, and notifications share one header row.
        const header = screen.getByText('Sibuyan Island Operations').closest('header');
        expect(header).toBeInTheDocument();
        expect(within(header).getByRole('combobox')).toBeInTheDocument();
        expect(within(header).getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    });

    test('keeps the mobile header composition unchanged', () => {
        renderLayout('/admin');

        // Hamburger stays mobile-only; the brand title still fills the row.
        expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveClass('md:hidden');
        const brand = screen.getByText('Sibuyan Island Operations');
        expect(brand.parentElement).toHaveClass('flex-1', 'px-1');
    });
});
