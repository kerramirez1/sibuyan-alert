import { fireEvent, render, screen } from '@testing-library/react';
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
        expect(tabs.map((tab) => tab.textContent)).toEqual(RESPONDER_TAB_LABELS);

        // Only the active tab carries aria-current.
        const activeTab = screen.getByRole('button', { name: 'Municipal active' });
        expect(activeTab).toHaveAttribute('aria-current', 'page');
        tabs.filter((tab) => tab !== activeTab).forEach((tab) => {
            expect(tab).not.toHaveAttribute('aria-current');
        });

        fireEvent.click(screen.getByRole('button', { name: 'History' }));
        expect(onResponderViewChange).toHaveBeenCalledWith('history');
    });

    test('keeps the default view active without aria-current elsewhere', () => {
        renderResponderControls({ responderView: 'available' });

        expect(screen.getByRole('button', { name: 'Available' })).toHaveAttribute('aria-current', 'page');
    });
});
