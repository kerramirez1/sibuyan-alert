import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: {
        button: ({ children, initial: _initial, animate: _animate, exit: _exit, ...props }) => <button {...props}>{children}</button>,
        div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }) => <div {...props}>{children}</div>,
    },
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
        expect(activeLink).toHaveClass('min-h-10', 'bg-brand-900/40', 'text-brand-100');
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

        expect(screen.getByRole('link', { name: 'Analytics Dashboard' })).toHaveClass('bg-brand-900/40');
        expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
        const activeLinks = screen.getAllByRole('link').filter((link) => link.className.split(/\s+/).includes('bg-brand-900/40'));
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

});
