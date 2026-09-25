import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MapView from '../components/map/MapView';

// Mock maplibregl minimally
vi.mock('maplibre-gl', () => {
    class MockMap {
        constructor() {
            this._listeners = {};
        }
        on(event, cb) {
            this._listeners[event] = cb;
            if (event === 'load') {
                setTimeout(cb, 0);
            }
        }
        off() {}
        remove() {}
        addControl() {}
        resize() {}
        getLayer() { return null; }
        getSource() { return null; }
        addSource() {}
        addLayer() {}
        setLayoutProperty() {}
        setPaintProperty() {}
        setFilter() {}
    }
    class MockNavigationControl {}
    class MockScaleControl {}
    class MockFullscreenControl {}
    class MockMarker {
        setLngLat() { return this; }
        setPopup() { return this; }
        addTo() { return this; }
        remove() {}
        getElement() { return document.createElement('div'); }
    }
    class MockPopup {
        setHTML() { return this; }
        setText() { return this; }
    }
    class MockLngLatBounds {
        extend() { return this; }
        isEmpty() { return false; }
    }

    return {
        default: {
            Map: MockMap,
            NavigationControl: MockNavigationControl,
            ScaleControl: MockScaleControl,
            FullscreenControl: MockFullscreenControl,
            Marker: MockMarker,
            Popup: MockPopup,
            LngLatBounds: MockLngLatBounds,
            supported: () => true,
        },
        Map: MockMap,
        NavigationControl: MockNavigationControl,
        ScaleControl: MockScaleControl,
        FullscreenControl: MockFullscreenControl,
        Marker: MockMarker,
        Popup: MockPopup,
        LngLatBounds: MockLngLatBounds,
        supported: () => true,
    };
});

describe('MapView expanded map control', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders "Expand map" tool button when onToggleExpand is provided', async () => {
        const handleToggleExpand = vi.fn();

        render(
            <MapView
                reports={[]}
                onToggleExpand={handleToggleExpand}
                isExpanded={false}
            />
        );

        const expandBtn = await screen.findByRole('button', { name: /expand map/i });
        expect(expandBtn).toBeInTheDocument();
        expect(expandBtn).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(expandBtn);
        expect(handleToggleExpand).toHaveBeenCalledTimes(1);
    });

    test('renders "Exit expanded map" when isExpanded is true', async () => {
        const handleToggleExpand = vi.fn();

        render(
            <MapView
                reports={[]}
                onToggleExpand={handleToggleExpand}
                isExpanded={true}
            />
        );

        const exitBtn = await screen.findByRole('button', { name: /exit expanded map/i });
        expect(exitBtn).toBeInTheDocument();
        expect(exitBtn).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(exitBtn);
        expect(handleToggleExpand).toHaveBeenCalledTimes(1);
    });

    test('omits expand button when onToggleExpand is not provided', async () => {
        render(
            <MapView
                reports={[]}
                onToggleExpand={null}
            />
        );

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /expand map/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /exit expanded map/i })).not.toBeInTheDocument();
        });
    });

    test('does not render tool rail in incident-preview mode', async () => {
        const handleToggleExpand = vi.fn();

        render(
            <MapView
                reports={[]}
                mode="incident-preview"
                onToggleExpand={handleToggleExpand}
            />
        );

        expect(screen.queryByRole('group', { name: /map tools/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /expand map/i })).not.toBeInTheDocument();
    });

    test('omits "Expand map" tool button on mobile viewports below sm breakpoint', async () => {
        const handleToggleExpand = vi.fn();
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

        try {
            render(
                <MapView
                    reports={[]}
                    onToggleExpand={handleToggleExpand}
                    isExpanded={false}
                />
            );

            expect(screen.queryByRole('button', { name: /expand map/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /exit expanded map/i })).not.toBeInTheDocument();
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });

    test('renders "Exit expanded map" on mobile viewports when isExpanded is true', async () => {
        const handleToggleExpand = vi.fn();
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

        try {
            render(
                <MapView
                    reports={[]}
                    onToggleExpand={handleToggleExpand}
                    isExpanded={true}
                />
            );

            const exitBtn = await screen.findByRole('button', { name: /exit expanded map/i });
            expect(exitBtn).toBeInTheDocument();
            expect(exitBtn).toHaveAttribute('aria-pressed', 'true');

            fireEvent.click(exitBtn);
            expect(handleToggleExpand).toHaveBeenCalledTimes(1);
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });
});
