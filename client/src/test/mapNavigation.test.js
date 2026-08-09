import { describe, expect, test, vi } from 'vitest';
import {
    focusExistingMapEntity,
    installCompassOrientationToggle,
    installCompactAttribution,
    isWithinSibuyanInteractionBounds,
    MAP_FOCUS_CONFIG,
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
            zoom: 16,
            pitch: 0,
            bearing: 0,
            duration: MAP_FOCUS_CONFIG.duration,
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
            duration: MAP_FOCUS_CONFIG.duration,
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
            zoom: 16,
            duration: MAP_FOCUS_CONFIG.duration,
            curve: MAP_FOCUS_CONFIG.curve,
        }));
        expect(map.jumpTo).not.toHaveBeenCalled();
        expect(onComplete).not.toHaveBeenCalled();

        handlers.get('moveend')();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    test('fits the whole risk-zone geometry instead of applying a point-only zoom', () => {
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
            maxZoom: 16,
            duration: MAP_FOCUS_CONFIG.duration,
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
        }));
        expect(map.flyTo).not.toHaveBeenCalled();
        expect(onComplete).toHaveBeenCalledOnce();
    });
});

describe('installCompactAttribution', () => {
    test('starts collapsed and closes expanded credits when map interaction resumes', () => {
        const container = document.createElement('div');
        const attribution = document.createElement('details');
        attribution.className = 'maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show';
        attribution.setAttribute('open', '');
        const button = document.createElement('button');
        button.className = 'maplibregl-ctrl-attrib-button';
        attribution.append(button);
        container.append(attribution);

        const handlers = new Map();
        const map = {
            addControl: vi.fn(),
            getContainer: vi.fn(() => container),
            on: vi.fn((eventName, handler) => handlers.set(eventName, handler)),
            off: vi.fn((eventName) => handlers.delete(eventName)),
        };
        const cleanup = installCompactAttribution(map, {}, 'bottom-left');

        expect(map.addControl).toHaveBeenCalledWith({}, 'bottom-left');
        expect(attribution).not.toHaveClass('maplibregl-compact-show');
        expect(attribution).not.toHaveAttribute('open');
        expect(button).toHaveAttribute('aria-label', 'Show map data attribution');

        attribution.classList.add('maplibregl-compact-show');
        handlers.get('movestart')();
        expect(attribution).not.toHaveClass('maplibregl-compact-show');

        cleanup();
        expect(map.off).toHaveBeenCalledTimes(3);
    });
});
