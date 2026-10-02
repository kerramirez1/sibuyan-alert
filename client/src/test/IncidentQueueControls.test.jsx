import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import IncidentQueueControls from '../components/adminReports/IncidentQueueControls';
import { getMapStatusDot } from '../config/mapVisuals';

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

    test('shows the dotted operational totals in the dispatch-queue view', () => {
        // The reported case: the dispatch-queue view used to show just
        // "0 incidents". The breakdown now always renders with the admin's
        // dotted structure, while the headline stays view-specific.
        renderResponderControls({
            responderView: 'available',
            resultCount: 0,
            stats: { pending: 2, responding: 1, resolved: 3 },
        });

        const totals = screen.getByLabelText('Operational totals');
        expect(totals).toBeInTheDocument();
        // View-specific headline, not a stats total.
        expect(totals).toHaveTextContent('0 incidents');
        expect(screen.getByText('2 pending review')).toBeInTheDocument();
        expect(screen.getByText('1 responding')).toBeInTheDocument();
        expect(screen.getByText('3 resolved')).toBeInTheDocument();

        // The dots match the admin's via getMapStatusDot.
        const dots = totals.querySelectorAll('span.h-1\\.5.w-1\\.5.rounded-full');
        expect(dots).toHaveLength(3);
        expect(dots[0].className).toContain(getMapStatusDot('pending'));
        expect(dots[1].className).toContain(getMapStatusDot('responding'));
        expect(dots[2].className).toContain(getMapStatusDot('resolved'));
    });
});
