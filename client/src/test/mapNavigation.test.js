import { describe, expect, test, vi } from 'vitest';
import {
    focusExistingMapEntity,
    installCompassOrientationToggle,
    installCompactAttribution,
    isWithinSibuyanInteractionBounds,
    MAP_FOCUS_PRESETS,
    MAP_INTERACTION_OPTIONS,
    scheduleMapFocus,
} from '../utils/mapNavigation';

const createMapHarness = ({ bearing = -17, pitch = 45 } = {}) => {
    const compass = document.createElement('button');
    const camera = { bearing, pitch };
    const map = {
        getBearing: vi.fn(() => camera.bearing),
        getPitch: vi.fn(() => camera.pitch),
        easeTo: vi.fn((next) => {
            camera.bearing = next.bearing;
            camera.pitch = next.pitch;
        }),
    };

    return { compass, map };
};

test('keeps horizontal and vertical map interactions enabled across map views', () => {
    expect(MAP_INTERACTION_OPTIONS).toMatchObject({
        interactive: true,
        dragPan: true,
        scrollZoom: true,
        keyboard: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
        touchPitch: true,
        cooperativeGestures: false,
    });
});

test('keeps report pins inside the Sibuyan selection envelope while camera bounds remain independent', () => {
    expect(isWithinSibuyanInteractionBounds({ lat: 12.4176, lng: 122.5571 })).toBe(true);
    expect(isWithinSibuyanInteractionBounds({ lat: 12.70, lng: 122.5571 })).toBe(false);
    expect(isWithinSibuyanInteractionBounds({ lat: 12.4176, lng: 123.1 })).toBe(false);
});

describe('installCompassOrientationToggle', () => {
    test('resets the map orientation and restores it on the next click', () => {
        const { compass, map } = createMapHarness();
        const cleanup = installCompassOrientationToggle(map, { _compass: compass }, {
            bearing: -17,
            pitch: 45,
        });

        compass.click();
        expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 0, pitch: 0 }));

        compass.click();
        expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: -17, pitch: 45 }));
        expect(compass).toHaveAttribute('aria-label', 'Reset or restore map orientation');

        cleanup();
        compass.click();
        expect(map.easeTo).toHaveBeenCalledTimes(2);
    });

    test('restores the user\'s latest custom orientation instead of forcing a preset', () => {
        const { compass, map } = createMapHarness({ bearing: 72, pitch: 30 });
        installCompassOrientationToggle(map, { _compass: compass }, {
            bearing: -17,
            pitch: 45,
        });

        compass.click();
        compass.click();

        expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 72, pitch: 30 }));
    });
});

describe('scheduleMapFocus', () => {
    const createPointMap = () => ({
        resize: vi.fn(),
        stop: vi.fn(),
        flyTo: vi.fn(),
        jumpTo: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
        isMoving: vi.fn(() => true),
    });

    test('applies the shared native camera transition without an artificial wait', () => {
        const map = createPointMap();

        scheduleMapFocus(map, {
            lat: 12.4044,
            lng: 122.6897,
            ...MAP_FOCUS_PRESETS.list,
        });

        expect(map.stop).toHaveBeenCalledOnce();
        expect(map.resize).toHaveBeenCalledOnce();
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.6897, 12.4044],
            zoom: MAP_FOCUS_PRESETS.list.zoom,
            duration: MAP_FOCUS_PRESETS.list.duration,
            essential: false,
        }));
    });

    test('does not allow legacy per-component timing overrides', () => {
        const map = createPointMap();
        scheduleMapFocus(map, {
            lat: 12.4044,
            lng: 122.6897,
            delay: 50,
            duration: 600,
        });

        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({
            duration: MAP_FOCUS_PRESETS.list.duration,
        }));
    });

    test('keeps point coordinates at true center instead of applying panel padding', () => {
        const map = createPointMap();

        scheduleMapFocus(map, {
            lat: 12.4044,
            lng: 122.6897,
            padding: { top: 16, right: 320, bottom: 16, left: 16 },
        });

        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.6897, 12.4044],
        }));
        expect(map.flyTo.mock.calls[0][0]).not.toHaveProperty('padding');
    });

    test('removes camera delay and duration for reduced-motion users', () => {
        vi.useFakeTimers();
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
        const map = createPointMap();

        scheduleMapFocus(map, {
            lat: 12.4044,
            lng: 122.6897,
            delay: 900,
            duration: 2200,
        });
        vi.runAllTimers();

        expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.6897, 12.4044],
            zoom: MAP_FOCUS_PRESETS.list.zoom,
        }));
        expect(map.flyTo).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });
});

describe('focusExistingMapEntity', () => {
    const createLocateMap = () => {
        const handlers = new Map();
        return {
            handlers,
            map: {
                resize: vi.fn(),
                stop: vi.fn(),
                flyTo: vi.fn(),
                fitBounds: vi.fn(),
                jumpTo: vi.fn(),
                isMoving: vi.fn(() => true),
                once: vi.fn((eventName, handler) => handlers.set(eventName, handler)),
                off: vi.fn((eventName, handler) => {
                    if (handlers.get(eventName) === handler) handlers.delete(eventName);
                }),
            },
        };
    };

    test('flies the mounted map from its current camera and completes on moveend', () => {
        const { handlers, map } = createLocateMap();
        const onComplete = vi.fn();

        focusExistingMapEntity(map, {
            type: 'incident',
            coordinates: { lat: 12.4044, lng: 122.6897 },
        }, { reducedMotion: false, onComplete });

        expect(map.resize).toHaveBeenCalledOnce();
        expect(map.stop).toHaveBeenCalledOnce();
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.6897, 12.4044],
            zoom: MAP_FOCUS_PRESETS.list.zoom,
            duration: MAP_FOCUS_PRESETS.list.duration,
            essential: false,
        }));
        expect(onComplete).not.toHaveBeenCalled();

        handlers.get('moveend')();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    test('uses the standard smooth flyTo animation for risk zones', () => {
        const { handlers, map } = createLocateMap();
        const bounds = [[122.68, 12.39], [122.70, 12.42]];
        const onComplete = vi.fn();

        focusExistingMapEntity(map, {
            type: 'risk-zone',
            coordinates: { lat: 12.405, lng: 122.69 },
            bounds,
        }, { padding: 48, reducedMotion: false, onComplete });

        expect(map.fitBounds).toHaveBeenCalledWith(bounds, expect.objectContaining({
            padding: 48,
            essential: false,
            duration: MAP_FOCUS_PRESETS.list.duration,
        }));
        expect(map.flyTo).not.toHaveBeenCalled();
        handlers.get('moveend')();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    test('lets the latest focus replace an in-progress request', () => {
        const { handlers, map } = createLocateMap();
        const firstComplete = vi.fn();
        const latestComplete = vi.fn();

        const cancelFirst = focusExistingMapEntity(map, {
            type: 'incident',
            coordinates: { lat: 12.4044, lng: 122.6897 },
        }, { reducedMotion: false, onComplete: firstComplete });
        cancelFirst();
        focusExistingMapEntity(map, {
            type: 'incident',
            coordinates: { lat: 12.367, lng: 122.684 },
        }, { reducedMotion: false, onComplete: latestComplete });

        expect(map.stop).toHaveBeenCalledTimes(2);
        expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({
            center: [122.684, 12.367],
        }));
        handlers.get('moveend')();
        expect(firstComplete).not.toHaveBeenCalled();
        expect(latestComplete).toHaveBeenCalledOnce();
    });

    test('uses an immediate in-place move for reduced-motion users', () => {
        const { map } = createLocateMap();
        const onComplete = vi.fn();

        focusExistingMapEntity(map, {
            type: 'incident',
            coordinates: { lat: 12.4044, lng: 122.6897 },
        }, { reducedMotion: true, onComplete });

        expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.6897, 12.4044],
            zoom: MAP_FOCUS_PRESETS.list.zoom,
        }));
        expect(onComplete).toHaveBeenCalledOnce();
    });
});

describe('installCompactAttribution', () => {
    const buildMap = (sources) => {
        const handlers = new Map();
        const controls = [];
        return {
            controls,
            handlers,
            addControl: vi.fn((control, position) => controls.push({ control, position })),
            removeControl: vi.fn((control) => {
                const index = controls.findIndex((entry) => entry.control === control);
                if (index >= 0) controls.splice(index, 1);
            }),
            getStyle: vi.fn(() => ({ sources })),
            on: vi.fn((eventName, handler) => handlers.set(eventName, handler)),
            off: vi.fn((eventName) => handlers.delete(eventName)),
        };
    };

    test('adds no control while credits are hidden by product decision', async () => {
        const { mapCreditConfig, installCompactAttribution: install } = await import('../utils/mapNavigation.js');
        expect(mapCreditConfig.showAttribution).toBe(false);

        const map = buildMap({ 'esri-imagery': { attribution: 'Tiles © Esri' } });
        const cleanup = install(map, 'bottom-left');

        expect(map.addControl).not.toHaveBeenCalled();
        expect(() => cleanup()).not.toThrow();
    });

    test('installs one static credit line from live sources with duplicates removed', async () => {
        const { mapCreditConfig, installCompactAttribution: install } = await import('../utils/mapNavigation.js');
        mapCreditConfig.showAttribution = true;
        try {
            const map = buildMap({
                'esri-imagery': { attribution: 'Tiles &copy; Esri and its data providers' },
                streets: { attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; OpenStreetMap' },
                labels: { attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; OpenStreetMap' },
                reference: {},
            });
            const cleanup = install(map, 'bottom-left');

            expect(map.addControl).toHaveBeenCalledOnce();
            const [{ control, position }] = map.controls;
            expect(position).toBe('bottom-left');
            const element = control.onAdd();
            expect(element).toHaveClass('sibuyan-map-credit');
            expect(element).toHaveAttribute('aria-label', 'Map data attribution');
            expect(element.textContent).toContain('Esri');
            // Duplicate Protomaps source attribution renders once; provider link survives
            expect(element.innerHTML.split('Protomaps').length - 1).toBe(1);
            expect(element.querySelectorAll('a')).toHaveLength(1);
            expect(element.style.display).not.toBe('none');

            cleanup();
            expect(map.off).toHaveBeenCalledWith('styledata', expect.any(Function));
            expect(map.off).toHaveBeenCalledWith('sourcedata', expect.any(Function));
            expect(map.removeControl).toHaveBeenCalledWith(control);
        } finally {
            mapCreditConfig.showAttribution = false;
        }
    });

    test('refreshes credits on style changes and hides when sources carry none', async () => {
        const { mapCreditConfig, installCompactAttribution: install } = await import('../utils/mapNavigation.js');
        mapCreditConfig.showAttribution = true;
        try {
            let sources = { imagery: { attribution: 'Tiles © Esri' } };
            const map = buildMap(sources);
            // Rebind getStyle so style switches are observed live
            map.getStyle.mockImplementation(() => ({ sources }));
            install(map);
            const [{ control }] = map.controls;
            const element = control.onAdd();
            expect(element.textContent).toContain('Esri');

            sources = { imagery: {}, fallback: { attribution: '© OpenStreetMap contributors' } };
            map.handlers.get('styledata')();
            expect(element.textContent).toContain('OpenStreetMap contributors');
            expect(element.textContent).not.toContain('Esri');

            sources = {};
            map.handlers.get('sourcedata')();
            expect(element.style.display).toBe('none');
            expect(element.innerHTML).toBe('');
        } finally {
            mapCreditConfig.showAttribution = false;
        }
    });

    test('returns a noop cleanup when the map handle is missing', () => {
        expect(() => installCompactAttribution(null)()).not.toThrow();
        expect(() => installCompactAttribution({})()).not.toThrow();
    });
});
