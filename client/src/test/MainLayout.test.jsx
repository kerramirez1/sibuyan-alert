import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    logout: vi.fn(),
    isAuthenticated: true,
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
        canSubmitReports: () => false,
        isAuthenticated: mocks.isAuthenticated,
        updateUser: vi.fn(),
    }),
}));

vi.mock('../components/ui/NotificationBell', () => ({
    default: () => <button type="button" aria-label="Notifications" />,
}));

import MainLayout from '../components/layout/MainLayout';

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
        expect(activeLink).toHaveClass('min-h-10', 'bg-white/[0.08]', 'text-white', 'border-red-500');
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

    test('shows one clear active analytics destination on the administrative dashboard', () => {
        renderLayout('/dashboard');

        expect(screen.getByRole('link', { name: 'Analytics Dashboard' })).toHaveClass('bg-white/[0.08]');
        expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
        const activeLinks = screen.getAllByRole('link').filter((link) => link.className.split(/\s+/).includes('bg-white/[0.08]'));
        expect(activeLinks).toHaveLength(1);
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

    test('labels the reporter operational home route as Reporter Dashboard', () => {
        mocks.user = {
            _id: 'reporter-1',
            name: 'Juan Reporter',
            role: 'reporter',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/reporter');

        const reporterDashboardLink = screen.getByRole('link', { name: 'Reporter Dashboard' });
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

    test('removes visible section headings (Operations, Mapping, History) for municipal admin and retains all admin links', () => {
        renderLayout('/admin');

        // Section labels must not be in the document
        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.queryByText('Mapping')).not.toBeInTheDocument();
        expect(screen.queryByText('History')).not.toBeInTheDocument();

        // All authorized admin navigation items remain present
        expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Incident Reports' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Risk Zones' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Analytics Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Accident History' })).toBeInTheDocument();

        // Unauthorized items remain hidden
        expect(screen.queryByRole('link', { name: 'Submit Report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'My Reports' })).not.toBeInTheDocument();
    });

    test('removes visible section headings for guest and only renders authorized guest navigation', () => {
        mocks.isAuthenticated = false;
        mocks.user = null;

        renderLayout('/');

        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.queryByText('Mapping')).not.toBeInTheDocument();
        expect(screen.queryByText('History')).not.toBeInTheDocument();

        const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' });
        expect(within(sidebar).getByRole('link', { name: 'Overview' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: 'Accident History' })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: /Sign in/i })).toBeInTheDocument();
        expect(within(sidebar).getByRole('link', { name: /Become a Reporter/i })).toBeInTheDocument();

        expect(within(sidebar).queryByRole('link', { name: 'Incident Reports' })).not.toBeInTheDocument();
        expect(within(sidebar).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
        expect(within(sidebar).queryByRole('link', { name: 'Risk Zones' })).not.toBeInTheDocument();
        expect(within(sidebar).queryByRole('link', { name: 'Analytics Dashboard' })).not.toBeInTheDocument();
    });

    test('removes visible section headings for reporter and only renders authorized reporter navigation', () => {
        mocks.user = {
            _id: 'reporter-1',
            name: 'Juan Reporter',
            role: 'reporter',
            assignedMunicipality: 'Cajidiocan',
        };

        renderLayout('/reporter');

        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.queryByText('Mapping')).not.toBeInTheDocument();
        expect(screen.queryByText('History')).not.toBeInTheDocument();

        expect(screen.getByRole('link', { name: 'Reporter Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'My Reports' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Accident History' })).toBeInTheDocument();

        expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Risk Zones' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Analytics Dashboard' })).not.toBeInTheDocument();
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

        expect(screen.getByRole('link', { name: 'Responder Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Incident Reports' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Accident History' })).toBeInTheDocument();

        expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Risk Zones' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Analytics Dashboard' })).not.toBeInTheDocument();
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
});
