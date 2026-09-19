import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import MapOverlayPanel from '../components/map/MapOverlayPanel';

const mockMobileViewport = () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(max-width: 639px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));

    return () => {
        window.matchMedia = originalMatchMedia;
    };
};

describe('MapOverlayPanel', () => {
    test('renders a viewport-safe centered dialog with one internal scroll region', () => {
        render(
            <MapOverlayPanel title="Incident details" size="lg" onClose={vi.fn()}>
                <p>Protected incident content</p>
            </MapOverlayPanel>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Incident details' });
        const scrollRegion = screen.getByTestId('map-overlay-scroll-region');

        expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]', 'sm:max-h-[calc(100dvh-2rem)]', 'sm:max-w-2xl');
        expect(dialog.parentElement?.parentElement).toBe(document.body);
        expect(scrollRegion).toHaveClass('min-h-0', 'overflow-y-auto', 'overscroll-contain');
        expect(screen.getByRole('button', { name: 'Close incident panel' })).toHaveFocus();
    });

    test('closes with Escape and restores body scrolling', () => {
        const onClose = vi.fn();
        const { unmount } = render(
            <MapOverlayPanel title="Incident details" onClose={onClose}>
                <button type="button">Action</button>
            </MapOverlayPanel>,
        );

        expect(document.body.style.overflow).toBe('hidden');
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();
        expect(document.body.style.overflow).toBe('');
    });

    test('closes only when the backdrop itself is selected', () => {
        const onClose = vi.fn();
        render(
            <MapOverlayPanel title="Incident details" onClose={onClose}>
                <p>Content</p>
            </MapOverlayPanel>,
        );

        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('uses the latest close callback without resetting scroll lock on rerender', () => {
        const initialClose = vi.fn();
        const latestClose = vi.fn();
        const { rerender } = render(
            <MapOverlayPanel title="Active incidents" onClose={initialClose}>
                <button type="button">View details</button>
            </MapOverlayPanel>,
        );

        rerender(
            <MapOverlayPanel title="Incident details" onClose={latestClose}>
                <p>Incident content</p>
            </MapOverlayPanel>,
        );

        expect(document.body.style.overflow).toBe('hidden');
        expect(screen.getByRole('button', { name: 'Close incident panel' })).toHaveFocus();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(initialClose).not.toHaveBeenCalled();
        expect(latestClose).toHaveBeenCalledTimes(1);
    });

    test('renders a non-blocking contextual panel inside its map container', () => {
        const { container } = render(
            <div className="relative">
                <MapOverlayPanel
                    id="map-context-panel"
                    title="Risk-zone details"
                    description="1 monitored zone"
                    closeLabel="Close risk zones panel"
                    presentation="contextual"
                    onClose={vi.fn()}
                >
                    <p>Mapped hazard</p>
                </MapOverlayPanel>
            </div>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Risk-zone details' });
        expect(dialog).toHaveAttribute('id', 'map-context-panel');
        expect(dialog).toHaveAccessibleDescription('1 monitored zone');
        expect(dialog).toHaveClass('pointer-events-auto', 'sm:max-h-[calc(100%-2rem)]', 'sm:w-[min(24rem,42%)]');
        expect(dialog).not.toHaveClass('sm:h-full', 'sm:max-h-none');
        expect(dialog.parentElement).toHaveClass('items-end', 'sm:items-start');
        expect(dialog.parentElement).not.toHaveClass('sm:items-stretch');
        expect(dialog.parentElement).toBe(container.firstElementChild?.firstElementChild);
        expect(screen.getByRole('button', { name: 'Close risk zones panel' })).toBeInTheDocument();
        expect(document.body.style.overflow).toBe('');

        const scrollRegion = screen.getByTestId('map-overlay-scroll-region');
        expect(scrollRegion).toHaveClass('overflow-y-auto');
        expect(scrollRegion).toHaveClass('min-w-0', 'overflow-x-hidden', 'overscroll-contain');

        const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
        scrollRegion.dispatchEvent(wheelEvent);
        expect(wheelEvent.defaultPrevented).toBe(false);
    });

    describe('docked presentation', () => {
        const renderDocked = (props = {}) => {
            const dock = document.createElement('div');
            dock.setAttribute('data-testid', 'dock');
            document.body.appendChild(dock);

            const view = render(
                <MapOverlayPanel
                    id="map-context-panel"
                    title="Pending review"
                    description="1 report awaiting municipal review."
                    closeLabel="Close pending review panel"
                    presentation="contextual"
                    dockTarget={dock}
                    accentClassName="bg-amber-500"
                    onClose={vi.fn()}
                    {...props}
                >
                    <p>Records</p>
                </MapOverlayPanel>,
            );

            return { ...view, dock };
        };

        test('fills the column it was given, and is not modal', () => {
            const { dock } = renderDocked();

            const dialog = screen.getByRole('dialog', { name: 'Pending review' });
            // The pane stands in the slot it was handed and fills it: one box,
            // no overshoot past the column and no shrinking inside it.
            expect(dock).toContainElement(dialog);
            expect(dialog).toHaveClass('pane-enter', 'flex-1', 'w-full', 'min-h-0', 'rounded-xl');
            expect(dialog.parentElement).toBe(dock);
            expect(dialog.className).not.toContain('fixed');

            // Not modal: no scrim, no scroll lock, and the page beside it — the
            // map above all — keeps every event it was listening for.
            expect(dialog).not.toHaveAttribute('aria-modal');
            expect(document.body.style.overflow).toBe('');

            // No sheet affordances: there is nothing to drag or expand here.
            expect(screen.queryByRole('button', { name: /Expand incident details/i })).not.toBeInTheDocument();

            // The tone of the card that opened it, on the pane's leading edge.
            expect(dialog.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-amber-500', 'h-[2px]');

            expect(screen.getByTestId('map-overlay-scroll-region')).toHaveClass('overflow-y-auto');
        });

        test('docks at a phone viewport too, instead of becoming the bottom sheet', () => {
            const restoreMatchMedia = mockMobileViewport();
            const { dock } = renderDocked();

            const dialog = screen.getByRole('dialog', { name: 'Pending review' });
            // A box was handed over, so the pane stands in it at every width: no
            // sheet pinned to the bottom of the viewport — which is what would put
            // the records below the map they describe — and nothing to drag.
            expect(dock).toContainElement(dialog);
            expect(dialog.className).not.toContain('max-sm:h-[38dvh]');
            expect(dialog.className).not.toContain('max-sm:fixed');
            expect(screen.queryByRole('button', { name: /Expand incident details/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close pending review panel' })).toBeInTheDocument();

            restoreMatchMedia();
        });

        test('omits the accent rule when the caller has no tone to carry', () => {
            renderDocked({ accentClassName: '' });

            const dialog = screen.getByRole('dialog', { name: 'Pending review' });
            expect(dialog.querySelector('span[aria-hidden="true"]')).toBeNull();
        });

        test('closes on Escape from inside it, and never from the page at large', () => {
            const onClose = vi.fn();
            renderDocked({ onClose });

            const dialog = screen.getByRole('dialog', { name: 'Pending review' });
            // Escape pressed while the reader is elsewhere — the map, a card — is
            // not this pane's to take, because the pane never had their focus.
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(onClose).not.toHaveBeenCalled();

            fireEvent.keyDown(dialog, { key: 'Escape' });
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    test('resets the shared panel body scroll when its content changes', () => {
        const { rerender } = render(
            <div className="relative">
                <MapOverlayPanel
                    title="Pending incidents"
                    contentKey="overview:pending:list"
                    presentation="contextual"
                    onClose={vi.fn()}
                >
                    <p>Pending content</p>
                </MapOverlayPanel>
            </div>,
        );
        const scrollRegion = screen.getByTestId('map-overlay-scroll-region');
        scrollRegion.scrollTop = 180;

        rerender(
            <div className="relative">
                <MapOverlayPanel
                    title="Responding incidents"
                    contentKey="overview:responding:list"
                    presentation="contextual"
                    onClose={vi.fn()}
                >
                    <p>Responding content</p>
                </MapOverlayPanel>
            </div>,
        );

        expect(screen.getByTestId('map-overlay-scroll-region')).toBe(scrollRegion);
        expect(scrollRegion.scrollTop).toBe(0);
    });

    test('gives the description its own full-width row beneath the title and its controls', () => {
        render(
            <MapOverlayPanel
                title="Active incidents"
                description="3 active: 1 responding, 2 waiting (1 transferred). Pending is counted separately."
                onClose={vi.fn()}
            >
                <p>Records</p>
            </MapOverlayPanel>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Active incidents' });
        const header = dialog.querySelector('header');
        const description = screen.getByText(/^3 active:/);

        // The header stacks: the subject and its controls take the first row, the
        // description takes the second. As a cell of the title's column the
        // description was held one control's width short of the pane's own
        // padding — a third of a line of text given up on every row of the
        // sentence, which on this card was the difference between two lines and
        // three. It is a row of the header itself instead, at the full width of
        // that header's content box, with the padding on the header rather than
        // on the line.
        expect(dialog).toHaveAccessibleDescription(/^3 active:/);
        expect(header).toHaveClass('flex-col', 'px-4', 'py-3', 'sm:px-5');
        expect(header.children).toHaveLength(2);
        expect(header.children[1]).toBe(description);
        expect(description).toHaveClass('w-full', 'mt-1');

        const [titleRow] = header.children;
        expect(titleRow).toHaveClass('items-start', 'justify-between');
        expect(titleRow.querySelector('h2')).toHaveTextContent('Active incidents');
        expect(titleRow.querySelector('h2').parentElement).toHaveClass('min-w-0', 'flex-1');
        // The controls stay in that first row, so the description passing under
        // them never means passing under the close button.
        expect(screen.getByRole('button', { name: 'Close incident panel' }).closest('header > div')).toBe(titleRow);
    });

    test('supports mobile expand and collapse toggling in contextual presentation', () => {
        render(
            <div className="relative">
                <MapOverlayPanel
                    title="Incident details"
                    presentation="contextual"
                    onClose={vi.fn()}
                >
                    <p>Brief content</p>
                </MapOverlayPanel>
            </div>,
        );

        const expandBtn = screen.getByRole('button', { name: /Expand incident details/i });
        expect(expandBtn).toBeInTheDocument();
        expect(expandBtn).toHaveAttribute('aria-expanded', 'false');

        // Toggle to expand
        fireEvent.click(expandBtn);
        const collapseBtn = screen.getByRole('button', { name: /Collapse incident details/i });
        expect(collapseBtn).toBeInTheDocument();
        expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');

        // Toggle to collapse
        fireEvent.click(collapseBtn);
        expect(screen.getByRole('button', { name: /Expand incident details/i })).toBeInTheDocument();
    });

    test('keeps the user-chosen sheet height when drilling from list to details', () => {
        const restoreMatchMedia = mockMobileViewport();
        const { rerender } = render(
            <div className="relative">
                <MapOverlayPanel
                    title="Active incidents"
                    contentKey="overview:active:list"
                    presentation="contextual"
                    onClose={vi.fn()}
                >
                    <p>Incident list</p>
                </MapOverlayPanel>
            </div>,
        );

        // User expands the list sheet, then taps View details on a report
        fireEvent.click(screen.getByRole('button', { name: /Expand incident details/i }));
        expect(screen.getByRole('button', { name: /Collapse incident details/i })).toHaveAttribute('aria-expanded', 'true');

        rerender(
            <div className="relative">
                <MapOverlayPanel
                    title="Incident details"
                    contentKey="overview:active:incident-1"
                    presentation="contextual"
                    onClose={vi.fn()}
                >
                    <p>Incident brief</p>
                </MapOverlayPanel>
            </div>,
        );

        // Sheet must stay expanded: details content is longer, not shorter
        const dialog = screen.getByRole('dialog', { name: 'Incident details' });
        expect(dialog).toHaveClass('max-sm:h-[88dvh]');
        expect(screen.getByRole('button', { name: /Collapse incident details/i })).toHaveAttribute('aria-expanded', 'true');

        restoreMatchMedia();
    });

    test('keeps mobile panels compact while preserving one scrollable content region', () => {
        const restoreMatchMedia = mockMobileViewport();
        const { unmount } = render(
            <MapOverlayPanel
                title="Incident details"
                contentKey="overview:active:incident-1"
                presentation="contextual"
                onClose={vi.fn()}
            >
                <p>Overview</p>
                <p>Evidence photos</p>
            </MapOverlayPanel>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Incident details' });
        expect(screen.getByRole('button', { name: /Expand incident details/i })).toHaveAttribute('aria-expanded', 'false');
        expect(dialog).toHaveClass('max-sm:h-[38dvh]');
        expect(dialog).not.toHaveClass('max-sm:translate-y-[calc(88dvh-38dvh)]');
        expect(screen.getByTestId('map-overlay-scroll-region')).toHaveClass('min-h-0', 'overflow-y-auto', 'overscroll-contain');

        unmount();
        restoreMatchMedia();
    });

    test('supports touch swipe up to expand and swipe down to collapse/close', () => {
        const onClose = vi.fn();
        render(
            <div className="relative">
                <MapOverlayPanel
                    title="Incident details"
                    presentation="contextual"
                    onClose={onClose}
                >
                    <p>Brief content</p>
                </MapOverlayPanel>
            </div>,
        );

        const header = screen.getByRole('dialog').querySelector('header');
        expect(header).toBeInTheDocument();

        // Swipe up (deltaY = -60) -> expands
        fireEvent.touchStart(header, { touches: [{ clientY: 200 }] });
        fireEvent.touchEnd(header, { changedTouches: [{ clientY: 140 }] });
        expect(screen.getByRole('button', { name: /Collapse incident details/i })).toBeInTheDocument();

        // Swipe down while expanded (deltaY = +60) -> collapses to peek
        fireEvent.touchStart(header, { touches: [{ clientY: 140 }] });
        fireEvent.touchEnd(header, { changedTouches: [{ clientY: 200 }] });
        expect(screen.getByRole('button', { name: /Expand incident details/i })).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();

        // Swipe down while in peek (deltaY = +60) -> closes
        fireEvent.touchStart(header, { touches: [{ clientY: 200 }] });
        fireEvent.touchEnd(header, { changedTouches: [{ clientY: 260 }] });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('collapses expanded mobile sheet on Escape before closing', () => {
        const restoreMatchMedia = mockMobileViewport();
        const onClose = vi.fn();
        const { unmount } = render(
            <div className="relative">
                <MapOverlayPanel
                    title="Incident details"
                    presentation="contextual"
                    onClose={onClose}
                >
                    <p>Brief content</p>
                </MapOverlayPanel>
            </div>,
        );

        // Expand sheet
        fireEvent.click(screen.getByRole('button', { name: /Expand incident details/i }));
        expect(screen.getByRole('button', { name: /Collapse incident details/i })).toBeInTheDocument();

        // First Escape collapses to peek
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.getByRole('button', { name: /Expand incident details/i })).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();

        // Second Escape closes the panel
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();
        restoreMatchMedia();
    });

    test('collapses expanded mobile sheet when tapping the backdrop overlay', () => {
        const restoreMatchMedia = mockMobileViewport();
        const onClose = vi.fn();
        const { unmount } = render(
            <div className="relative">
                <MapOverlayPanel
                    title="Incident details"
                    presentation="contextual"
                    onClose={onClose}
                >
                    <p>Brief content</p>
                </MapOverlayPanel>
            </div>,
        );

        // Expand sheet
        fireEvent.click(screen.getByRole('button', { name: /Expand incident details/i }));
        expect(screen.getByRole('button', { name: /Collapse incident details/i })).toBeInTheDocument();

        // Backdrop overlay should be rendered and have pointer-events-auto
        const backdrop = document.body.querySelector('.bg-black\\/35');
        expect(backdrop).toBeInTheDocument();
        expect(backdrop).toHaveClass('pointer-events-auto');

        // Clicking the backdrop collapses the sheet back to peek
        fireEvent.click(backdrop);
        expect(screen.getByRole('button', { name: /Expand incident details/i })).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();

        unmount();
        restoreMatchMedia();
    });

    test('portals to document.body when on mobile viewport', () => {
        const restoreMatchMedia = mockMobileViewport();

        const onClose = vi.fn();
        render(
            <div id="map-parent-container" className="relative">
                <MapOverlayPanel
                    title="Mobile Incident"
                    presentation="contextual"
                    onClose={onClose}
                >
                    <p>Mobile details</p>
                </MapOverlayPanel>
            </div>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Mobile Incident' });
        expect(dialog.closest('#map-parent-container')).toBeNull();
        expect(document.body.contains(dialog)).toBe(true);
        expect(dialog).toHaveClass('max-sm:h-[38dvh]');
        expect(dialog).not.toHaveClass('max-sm:translate-y-[calc(88dvh-38dvh)]');

        restoreMatchMedia();
    });
});
