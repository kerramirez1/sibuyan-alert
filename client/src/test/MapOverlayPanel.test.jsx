import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import MapOverlayPanel from '../components/map/MapOverlayPanel';

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
        expect(scrollRegion).not.toHaveClass('overscroll-contain', 'overscroll-none');

        const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
        scrollRegion.dispatchEvent(wheelEvent);
        expect(wheelEvent.defaultPrevented).toBe(false);
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
});
