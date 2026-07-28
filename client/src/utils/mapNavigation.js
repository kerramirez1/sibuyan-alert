const ORIENTATION_EPSILON = 0.5;

const normalizeOrientation = (orientation = {}) => ({
    bearing: Number.isFinite(Number(orientation.bearing)) ? Number(orientation.bearing) : 0,
    pitch: Number.isFinite(Number(orientation.pitch)) ? Number(orientation.pitch) : 0,
});

const isNorthUpFlat = ({ bearing, pitch }) => (
    Math.abs(bearing) < ORIENTATION_EPSILON
    && Math.abs(pitch) < ORIENTATION_EPSILON
);

/**
 * Extends MapLibre's reset-only compass click with a reversible orientation toggle.
 * The first click resets bearing and pitch; the next click restores the most recent
 * non-flat orientation. Center and zoom are intentionally left unchanged.
 */
export const installCompassOrientationToggle = (
    map,
    navigationControl,
    fallbackOrientation = { bearing: 0, pitch: 0 },
) => {
    const compassButton = navigationControl?._compass;
    if (!map || !compassButton) return () => {};

    const fallback = normalizeOrientation(fallbackOrientation);
    const initial = normalizeOrientation({
        bearing: map.getBearing?.(),
        pitch: map.getPitch?.(),
    });
    let previousOrientation = isNorthUpFlat(initial) ? fallback : initial;

    const handleCompassClick = (event) => {
        // Capture phase prevents MapLibre's reset-only click listener from also firing.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const current = normalizeOrientation({
            bearing: map.getBearing?.(),
            pitch: map.getPitch?.(),
        });

        if (isNorthUpFlat(current)) {
            map.easeTo({
                ...previousOrientation,
                duration: 500,
                essential: true,
            });
            return;
        }

        previousOrientation = current;
        map.easeTo({
            bearing: 0,
            pitch: 0,
            duration: 500,
            essential: true,
        });
    };

    compassButton.setAttribute('aria-label', 'Reset or restore map orientation');
    compassButton.setAttribute('title', 'Reset or restore map orientation');
    compassButton.addEventListener('click', handleCompassClick, true);

    return () => {
        compassButton.removeEventListener('click', handleCompassClick, true);
    };
};

