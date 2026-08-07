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

        expect(dialog).toHaveClass('max-h-[calc(100dvh-1rem)]', 'sm:max-h-[90dvh]', 'sm:max-w-2xl');
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
});
