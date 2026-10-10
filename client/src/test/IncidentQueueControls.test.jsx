import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import IncidentQueueControls from '../components/adminReports/IncidentQueueControls';

const RESPONDER_TAB_LABELS = ['Available', 'Municipal active', 'My active', 'History', 'All incidents'];

const renderResponderControls = (overrides = {}) => render(
    <IncidentQueueControls
        role="responder"
        responderView="available"
        onResponderViewChange={vi.fn()}
        stats={null}
        resultCount={0}
        lastUpdatedAt={null}
        status=""
        setStatus={vi.fn()}
        searchDraft=""
        setSearchDraft={vi.fn()}
        appliedSearch=""
        applySearch={vi.fn()}
        clearFilters={vi.fn()}
        onRefresh={vi.fn()}
        loading={false}
        {...overrides}
    />,
);

describe('IncidentQueueControls responder tab row', () => {
    test('renders all five tabs in a single scrollable row with the active tab marked', () => {
        // jsdom has no scrollIntoView; the effect must degrade silently.
        const onResponderViewChange = vi.fn();
        renderResponderControls({ responderView: 'municipalActive', onResponderViewChange });

        const nav = screen.getByRole('navigation', { name: 'Responder incident views' });
        // Keyboard users can move focus into the row to scroll it when the
        // tabs overflow on narrow screens.
        expect(nav).toHaveAttribute('tabindex', '0');

        const tabs = screen.getAllByRole('button', { name: /available|municipal active|my active|history|all incidents/i });
        expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(
            RESPONDER_TAB_LABELS.map((label) => `${label}, 0 incidents`),
        );

        // Only the active tab carries aria-current.
        const activeTab = screen.getByRole('button', { name: 'Municipal active, 0 incidents' });
        expect(activeTab).toHaveAttribute('aria-current', 'page');
        tabs.filter((tab) => tab !== activeTab).forEach((tab) => {
            expect(tab).not.toHaveAttribute('aria-current');
        });

        fireEvent.click(screen.getByRole('button', { name: 'History, 0 incidents' }));
        expect(onResponderViewChange).toHaveBeenCalledWith('history');
    });

    test('keeps the default view active without aria-current elsewhere', () => {
        renderResponderControls({ responderView: 'available' });

        expect(screen.getByRole('button', { name: 'Available, 0 incidents' })).toHaveAttribute('aria-current', 'page');
    });

    test('renders view-count pills from stats.viewCounts, zero included', () => {
        renderResponderControls({
            responderView: 'available',
            stats: {
                viewCounts: { available: 3, municipalActive: 7, active: 0, history: 1, all: 12 },
            },
        });

        // The pill is aria-hidden; the button's aria-label carries the count.
        expect(screen.getByRole('button', { name: 'Available, 3 incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Municipal active, 7 incidents' })).toBeInTheDocument();
        // The zero is the point ("walang laman"): the pill still renders.
        const myActive = screen.getByRole('button', { name: 'My active, 0 incidents' });
        expect(myActive).toBeInTheDocument();
        const zeroPill = myActive.querySelector('span[aria-hidden="true"]');
        expect(zeroPill).toHaveTextContent('0');
        expect(screen.getByRole('button', { name: 'History, 1 incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'All incidents, 12 incidents' })).toBeInTheDocument();
    });

    test('shows status counts in the all-view filter tabs', () => {
        renderResponderControls({
            responderView: 'all',
            stats: { pending: 2, verified: 1, transferred: 0, responding: 3, resolved: 4, total: 10 },
        });

        expect(screen.getByRole('button', { name: 'All statuses, 10 incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Pending, 2 incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Verified, 1 incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Active response, 3 incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Resolved, 4 incidents' })).toBeInTheDocument();

        // Single-line horizontal scroll: the row never wraps, and keyboard
        // users can move focus into it to scroll when the chips overflow.
        const statusRow = screen.getByLabelText('Filter by status');
        expect(statusRow).toHaveClass('flex-nowrap', 'overflow-x-auto', 'no-scrollbar');
        expect(statusRow).not.toHaveClass('flex-wrap');
        expect(statusRow).toHaveAttribute('tabindex', '0');
        within(statusRow).getAllByRole('button').forEach((button) => {
            expect(button).toHaveClass('shrink-0', 'whitespace-nowrap');
        });
    });
});

describe('IncidentQueueControls category filter', () => {
    test('category is an icon button at the end of the status row, not a separate row', () => {
        renderResponderControls({ responderView: 'all', category: '', setCategory: vi.fn() });

        const iconButton = screen.getByRole('button', { name: 'Filter by category' });
        expect(iconButton).toBeInTheDocument();
        expect(iconButton).toHaveAttribute('aria-haspopup', 'menu');
        expect(iconButton).toHaveAttribute('aria-expanded', 'false');
        // The standalone category row is gone; only the menu (closed) carries that label.
        expect(screen.queryByLabelText('Filter by category', { selector: '[role="menu"]' })).not.toBeInTheDocument();
    });

    test('dropdown opens, selects an option, and closes', () => {
        const setCategory = vi.fn();
        renderResponderControls({ responderView: 'all', category: '', setCategory });

        fireEvent.click(screen.getByRole('button', { name: 'Filter by category' }));
        const menu = screen.getByRole('menu', { name: 'Filter by category' });
        expect(menu).toBeInTheDocument();

        const items = within(menu).getAllByRole('menuitemradio');
        expect(items.map((item) => item.textContent)).toEqual(['All categories', 'Accident', 'Fire', 'Road Hazard']);

        fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fire' }));
        expect(setCategory).toHaveBeenCalledWith('fire');
        expect(screen.queryByRole('menu', { name: 'Filter by category' })).not.toBeInTheDocument();
    });

    test('active category shows on the button; "All categories" clears', () => {
        const setCategory = vi.fn();
        renderResponderControls({ responderView: 'all', category: 'fire', setCategory });

        const iconButton = screen.getByRole('button', { name: 'Category: Fire, change filter' });
        expect(iconButton).toHaveTextContent('Fire');

        fireEvent.click(iconButton);
        const menu = screen.getByRole('menu', { name: 'Filter by category' });
        expect(within(menu).getByRole('menuitemradio', { name: 'Fire' })).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'All categories' }));
        expect(setCategory).toHaveBeenCalledWith('');
    });

    test('Escape and outside click close the dropdown', () => {
        renderResponderControls({ responderView: 'all', category: '', setCategory: vi.fn() });

        fireEvent.click(screen.getByRole('button', { name: 'Filter by category' }));
        expect(screen.getByRole('menu', { name: 'Filter by category' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('menu', { name: 'Filter by category' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Filter by category' }));
        expect(screen.getByRole('menu', { name: 'Filter by category' })).toBeInTheDocument();
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu', { name: 'Filter by category' })).not.toBeInTheDocument();
    });

    test('dropdown works in the responder non-all view too', () => {
        const setCategory = vi.fn();
        renderResponderControls({ responderView: 'available', category: '', setCategory });

        fireEvent.click(screen.getByRole('button', { name: 'Filter by category' }));
        const menu = screen.getByRole('menu', { name: 'Filter by category' });
        fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Road Hazard' }));
        expect(setCategory).toHaveBeenCalledWith('hazard');
    });
});
