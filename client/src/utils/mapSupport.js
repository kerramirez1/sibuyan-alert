/**
 * Map runtime capability guards.
 *
 * Single Responsibility: answer "can we safely construct a MapLibre map right
 * now?" without ever throwing, so mount effects can render a fallback instead
 * of crashing the React tree (which the root ErrorBoundary would turn into a
 * reload loop on devices without WebGL).
 */
import maplibregl from 'maplibre-gl';

/** True when the browser can create a WebGL-backed MapLibre map. */
export const isWebGLAvailable = () => {
    try {
        if (typeof maplibregl?.supported === 'function') {
            return maplibregl.supported({ failIfMajorPerformanceCaveat: false });
        }
    } catch {
        // supported() threw (e.g. no WebGL context): treat as unavailable only
        // when it explicitly returns false below; a throw here is inconclusive.
    }
    // No `supported()` export (mocked builds, tests): fail-open and let the
    // Map constructor's try/catch decide — blocking mount here would break
    // jsdom (canvas.getContext is unimplemented) and any future MapLibre
    // build that renames the helper.
    if (typeof document === 'undefined') return true;
    try {
        const canvas = document.createElement('canvas');
        // jsdom logs "Not implemented: HTMLCanvasElement's getContext()" and
        // returns undefined — inconclusive, so fail-open.
        const getContext = canvas?.getContext;
        if (typeof getContext !== 'function') return true;
        const gl = getContext.call(canvas, 'webgl2')
            || getContext.call(canvas, 'webgl')
            || getContext.call(canvas, 'experimental-webgl');
        // Null context in a real browser = genuinely no WebGL.
        // Undefined (jsdom stub) = unknown = allow mount attempt.
        if (gl === null) return false;
        if (gl) return true;
        return true;
    } catch {
        return true;
    }
};

/** True when the container exists, is connected, and has measurable size. */
export const hasMeasurableMapSize = (element) => {
    if (!element) return false;
    try {
        if (typeof element.isConnected === 'boolean' && !element.isConnected) return false;
        const rect = typeof element.getBoundingClientRect === 'function'
            ? element.getBoundingClientRect()
            : null;
        if (rect && rect.width > 0 && rect.height > 0) return true;
        return Number(element.clientWidth) > 0 && Number(element.clientHeight) > 0;
    } catch {
        return false;
    }
};

export const MAP_UNAVAILABLE_REASON = Object.freeze({
    WEBGL: 'webgl',
    SIZE: 'size',
});

/**
 * Classify why a map cannot mount yet. Returns `null` when it is safe to try.
 *
 * Zero-size containers (hidden tab, jsdom, `display:none` parent) are
 * intentionally NOT blocking: MapLibre can mount and a ResizeObserver resizes
 * it once layout settles. Blocking mount here caused permanent skeletons in
 * tests and lazy tabs; only a definitive no-WebGL verdict blocks.
 */
export const getMapMountBlocker = (container) => {
    if (!container) return MAP_UNAVAILABLE_REASON.SIZE;
    if (!isWebGLAvailable()) return MAP_UNAVAILABLE_REASON.WEBGL;
    return null;
};

export default { isWebGLAvailable, hasMeasurableMapSize, getMapMountBlocker, MAP_UNAVAILABLE_REASON };
