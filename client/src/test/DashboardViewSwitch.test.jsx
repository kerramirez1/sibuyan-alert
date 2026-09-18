import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from '../router';
import DashboardViewSwitch from '../components/dashboard/DashboardViewSwitch';

const renderSwitch = (active) => render(
    <MemoryRouter>
        <DashboardViewSwitch active={active} />
    </MemoryRouter>,
);

describe('DashboardViewSwitch', () => {
    test('offers both dashboard views as real URLs', () => {
        renderSwitch('map');

        const group = screen.getByRole('group', { name: 'Dashboard view' });
        // Links, not buttons: each view is deep-linkable, openable in a new tab,
        // and reachable with the browser's back button.
        expect(within(group).getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/dashboard');
        expect(within(group).getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/dashboard?view=analytics');
    });

    test('marks exactly one view as current, whichever one is active', () => {
        const { unmount } = renderSwitch('map');
        const mapGroup = screen.getByRole('group', { name: 'Dashboard view' });
        expect(within(mapGroup).getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
        expect(within(mapGroup).getByRole('link', { name: 'Analytics' })).not.toHaveAttribute('aria-current');

        unmount();

        renderSwitch('analytics');
        const analyticsGroup = screen.getByRole('group', { name: 'Dashboard view' });
        expect(within(analyticsGroup).getByRole('link', { name: 'Analytics' })).toHaveAttribute('aria-current', 'page');
        expect(within(analyticsGroup).getByRole('link', { name: 'Map' })).not.toHaveAttribute('aria-current');
    });

    test('is a switch, not a decoration: the two options differ', () => {
        // A control with one distinct destination is not a switch, which is why
        // callers render this only for the role that has both views.
        renderSwitch('map');

        const links = within(screen.getByRole('group', { name: 'Dashboard view' })).getAllByRole('link');
        expect(links).toHaveLength(2);
        expect(new Set(links.map((link) => link.getAttribute('href'))).size).toBe(2);
    });
});
