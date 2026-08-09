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
        expect(activeLink).toHaveClass('min-h-11', 'bg-brand-50', 'text-brand-800');
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
        expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass('min-h-11', 'w-full');
        const main = screen.getByRole('main');
        expect(main).toHaveClass('min-h-0', 'overscroll-contain', 'pt-3', 'sm:pt-4', 'lg:pt-5');
        expect(main.parentElement).toHaveClass('min-h-0', 'overflow-hidden');
        expect(main.parentElement?.parentElement).toHaveClass('fixed', 'inset-0', 'overflow-hidden');
        expect(document.body.style.overflow).toBe('hidden');
    });

    test('shows one clear active analytics destination on the administrative dashboard', () => {
        renderLayout('/dashboard');

        expect(screen.getByRole('link', { name: 'Analytics Dashboard' })).toHaveClass('bg-brand-50');
        expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
        const activeLinks = screen.getAllByRole('link').filter((link) => link.className.includes('bg-brand-50'));
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

        fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
        expect(sidebar).toHaveClass('translate-x-0');

        fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation menu' })[0]);
        expect(sidebar).toHaveClass('-translate-x-full');
    });

    test('shows a guest-only active incidents destination with one clear active state', () => {
        mocks.isAuthenticated = false;
        mocks.user = null;
        renderLayout('/dashboard?view=map&panel=incidents');

        const activeIncidentsLink = screen.getByRole('link', { name: 'Active Incidents' });
        expect(activeIncidentsLink).toHaveAttribute('href', '/dashboard?view=map&panel=incidents');
        expect(activeIncidentsLink).toHaveClass('bg-brand-50', 'text-brand-800');
        expect(screen.getByRole('link', { name: 'Map' })).not.toHaveClass('bg-brand-50');
        expect(screen.queryByRole('link', { name: 'Incident Reports' })).not.toBeInTheDocument();
    });
});
