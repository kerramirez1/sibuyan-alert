import { describe, expect, test, vi } from 'vitest';
import {
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
    test('applies the shared delayed camera transition', () => {
        vi.useFakeTimers();
        const map = { stop: vi.fn(), easeTo: vi.fn() };

        scheduleMapFocus(map, {
            lat: 12.4044,
            lng: 122.6897,
            ...MAP_FOCUS_PRESETS.list,
        });

        expect(map.stop).toHaveBeenCalledOnce();
        expect(map.easeTo).not.toHaveBeenCalled();
        vi.advanceTimersByTime(MAP_FOCUS_PRESETS.list.delay);
        expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.6897, 12.4044],
            zoom: 16,
            pitch: 0,
            bearing: 0,
            duration: 2200,
        }));
        vi.useRealTimers();
    });

    test('cancels a superseded focus request before it moves the camera', () => {
        vi.useFakeTimers();
        const map = { stop: vi.fn(), easeTo: vi.fn() };
        const cancel = scheduleMapFocus(map, {
            lat: 12.4044,
            lng: 122.6897,
            ...MAP_FOCUS_PRESETS.list,
        });

        cancel();
        vi.runAllTimers();
        expect(map.easeTo).not.toHaveBeenCalled();
        vi.useRealTimers();
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
