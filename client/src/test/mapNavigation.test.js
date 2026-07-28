import { describe, expect, test, vi } from 'vitest';
import { installCompassOrientationToggle } from '../utils/mapNavigation';

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
