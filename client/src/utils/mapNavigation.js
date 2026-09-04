const ORIENTATION_EPSILON = 0.5;

export const SIBUYAN_INTERACTION_BOUNDS = Object.freeze([
    Object.freeze([122.45, 12.30]),
    Object.freeze([122.70, 12.55]),
]);

export const isWithinSibuyanInteractionBounds = ({ lat, lng } = {}) => (
    Number.isFinite(Number(lat))
    && Number.isFinite(Number(lng))
    && Number(lat) >= SIBUYAN_INTERACTION_BOUNDS[0][1]
    && Number(lat) <= SIBUYAN_INTERACTION_BOUNDS[1][1]
    && Number(lng) >= SIBUYAN_INTERACTION_BOUNDS[0][0]
    && Number(lng) <= SIBUYAN_INTERACTION_BOUNDS[1][0]
);

export const MAP_INTERACTION_OPTIONS = Object.freeze({
    interactive: true,
    dragPan: true,
    scrollZoom: true,
    boxZoom: true,
    dragRotate: true,
    pitchWithRotate: true,
    keyboard: true,
    doubleClickZoom: true,
    touchZoomRotate: true,
    touchPitch: true,
    cooperativeGestures: false,
});

export const MAP_FOCUS_CONFIG = Object.freeze({
    duration: 3000,
    pointZoom: 16,
    bearing: 0,
    pitch: 0,
    curve: 1.2,
    riskZonePadding: Object.freeze({
        compact: 24,
        default: 48,
    }),
});

// Preserve the existing preset API for coordinate-driven map inputs while
// keeping every standard focus action on one camera configuration.
export const MAP_FOCUS_PRESETS = Object.freeze({
    list: Object.freeze({
        zoom: MAP_FOCUS_CONFIG.pointZoom,
        pitch: MAP_FOCUS_CONFIG.pitch,
        bearing: MAP_FOCUS_CONFIG.bearing,
        delay: 0,
        duration: MAP_FOCUS_CONFIG.duration,
    }),
    marker: Object.freeze({
        zoom: MAP_FOCUS_CONFIG.pointZoom,
        pitch: MAP_FOCUS_CONFIG.pitch,
        bearing: MAP_FOCUS_CONFIG.bearing,
        delay: 0,
        duration: MAP_FOCUS_CONFIG.duration,
    }),
});

export const MAP_SCROLL_PRESET = Object.freeze({
    delay: 250,
    duration: 1400,
});

const asFiniteNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

export const mapFocusEasing = (progress) => (
    progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2
);

const hasValidBounds = (bounds) => (
    Array.isArray(bounds)
    && bounds.length === 2
    && bounds.every((corner) => (
        Array.isArray(corner)
        && corner.length === 2
        && corner.every((value) => Number.isFinite(Number(value)))
    ))
);

/**
 * Moves the already-mounted map from its current camera to an entity.
 * The returned cleanup detaches only this request's completion listener so a
 * later Locate action can safely replace an in-progress flight.
 */
export const focusExistingMapEntity = (map, entityFocus, options = {}) => {
    if (!map || !entityFocus) return () => { };

    const lat = Number(entityFocus.coordinates?.lat);
    const lng = Number(entityFocus.coordinates?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return () => { };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return () => { };

    const prefersReducedMotion = options.reducedMotion
        ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const duration = prefersReducedMotion
        ? 0
        : Math.max(0, asFiniteNumber(options.duration, MAP_FOCUS_CONFIG.duration));
    const zoom = asFiniteNumber(options.zoom, MAP_FOCUS_CONFIG.pointZoom);
    const riskZonePadding = Math.max(0, asFiniteNumber(
        options.padding,
        MAP_FOCUS_CONFIG.riskZonePadding.default,
    ));
    let completed = false;

    const complete = () => {
        if (completed) return;
        completed = true;
        map.off?.('moveend', complete);
        options.onComplete?.();
    };

    // Resize first so MapLibre calculates the center from the current viewport,
    // including after a caller has collapsed a contextual panel.
    map.resize?.();
    map.stop?.();

    if (prefersReducedMotion) {
        const immediateCamera = {
            center: [lng, lat],
            zoom,
            bearing: MAP_FOCUS_CONFIG.bearing,
            pitch: MAP_FOCUS_CONFIG.pitch,
        };
        if (typeof map.jumpTo === 'function') {
            map.jumpTo(immediateCamera);
        } else {
            map.flyTo?.({ ...immediateCamera, duration: 0, essential: false });
        }
        complete();
        return () => map.off?.('moveend', complete);
    }

    map.once?.('moveend', complete);
    if (
        entityFocus.type === 'risk-zone'
        && hasValidBounds(entityFocus.bounds)
        && typeof map.fitBounds === 'function'
    ) {
        map.fitBounds(entityFocus.bounds, {
            padding: riskZonePadding,
            duration,
            essential: false,
        });
    } else {
        map.flyTo?.({
            center: [lng, lat],
            zoom,
            bearing: MAP_FOCUS_CONFIG.bearing,
            pitch: MAP_FOCUS_CONFIG.pitch,
            curve: MAP_FOCUS_CONFIG.curve,
            essential: false,
            duration,
        });
    }
    if (map.isMoving?.() === false) complete();

    return () => map.off?.('moveend', complete);
};

/**
 * Compatibility entry point for coordinate-driven map focus. It delegates to
 * the same native flyTo lifecycle used by incident and risk-zone Locate flows.
 */
export const scheduleMapFocus = (map, location, fallback = {}) => {
    if (!map || !location) return () => { };

    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return () => { };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return () => { };

    const prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const options = {
        zoom: asFiniteNumber(
            location.zoom,
            asFiniteNumber(fallback.zoom, MAP_FOCUS_CONFIG.pointZoom),
        ),
        duration: MAP_FOCUS_CONFIG.duration,
        reducedMotion: prefersReducedMotion,
    };

    return focusExistingMapEntity(map, {
        type: 'point',
        coordinates: { lat, lng },
    }, options);
};

/** Smoothly centers an element inside the application's nearest scroll area. */
export const scheduleElementScroll = (element, options = {}) => {
    if (!element) return () => { };

    const delay = Math.max(0, asFiniteNumber(options.delay, MAP_SCROLL_PRESET.delay));
    const duration = Math.max(0, asFiniteNumber(options.duration, MAP_SCROLL_PRESET.duration));
    const behavior = options.behavior || 'center';
    let animationFrame = null;

    const timer = globalThis.setTimeout(() => {
        const scrollContainer = element.closest?.('[data-map-scroll-container], main');
        if (
            !scrollContainer
            || typeof globalThis.requestAnimationFrame !== 'function'
            || typeof scrollContainer.scrollTo !== 'function'
        ) {
            element.scrollIntoView?.({ behavior: 'smooth', block: behavior === 'reveal' ? 'start' : 'center' });
            return;
        }

        const startTop = scrollContainer.scrollTop;
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        const relativeTop = elementRect.top - containerRect.top;
        const viewportHeight = containerRect.height;

        let targetOffset = (viewportHeight - elementRect.height) / 2;

        if (behavior === 'reveal') {
            const relativeBottom = elementRect.bottom - containerRect.top;

            // If the top of the element is nicely visible within the upper 120px 
            // OR the element is large and currently covers most of the viewport
            const isTopNicelyVisible = relativeTop >= 0 && relativeTop <= 120;
            const isLargeAndCovering = relativeTop < 0 && relativeBottom > viewportHeight * 0.7;

            if (isTopNicelyVisible || isLargeAndCovering) return;

            // Provide a comfortable 80px breathing room from the top, or center if the element is small
            targetOffset = Math.min(80, (viewportHeight - elementRect.height) / 2);
        }

        const unclampedTarget = startTop + relativeTop - targetOffset;
        const maximumTop = Math.max(0, scrollContainer.scrollHeight - viewportHeight);
        const targetTop = Math.min(maximumTop, Math.max(0, unclampedTarget));
        const distance = targetTop - startTop;

        if (Math.abs(distance) < 20) return;

        const startedAt = globalThis.performance?.now() ?? Date.now();

        const animate = (timestamp) => {
            const progress = duration === 0
                ? 1
                : Math.min(1, (timestamp - startedAt) / duration);
            scrollContainer.scrollTo({ top: startTop + distance * mapFocusEasing(progress) });
            if (progress < 1) animationFrame = globalThis.requestAnimationFrame(animate);
        };

        animationFrame = globalThis.requestAnimationFrame(animate);
    }, delay);

    return () => {
        globalThis.clearTimeout(timer);
        if (animationFrame !== null) globalThis.cancelAnimationFrame?.(animationFrame);
    };
};

/**
 * Map credit visibility switch.
 *
 * NOTE: Esri, OpenStreetMap (ODbL), and Protomaps licences require visible
 * credit. Hiding is a product decision — flip back to `true` if the panel or
 * a provider review asks for attribution to be restored. One line, all maps.
 */
export const mapCreditConfig = {
    showAttribution: false,
};

/**
 * Static micro-attribution control shared by every operational map.
 *
 * Currently disabled via {@link mapCreditConfig} — this is intentionally kept
 * as a working no-op path (not deleted) so credits can be restored without
 * re-implementing provider attribution. When enabled, it renders one tiny
 * always-visible, never-expanding credit line fed by the live style sources.
 */
export const installCompactAttribution = (map, position = 'bottom-left') => {
    if (!map || typeof map.addControl !== 'function') return () => { };
    // Credits hidden by product decision (see mapCreditConfig above).
    if (!mapCreditConfig.showAttribution) return () => { };
    const placement = typeof position === 'string' ? position : 'bottom-left';

    const element = document.createElement('div');
    element.className = 'sibuyan-map-credit';
    element.setAttribute('aria-label', 'Map data attribution');
    element.style.display = 'none';

    const collectAttributions = () => {
        let sources = {};
        try {
            sources = map.getStyle?.()?.sources || {};
        } catch {
            sources = {};
        }
        const credits = [];
        for (const source of Object.values(sources)) {
            const attribution = typeof source?.attribution === 'string' ? source.attribution.trim() : '';
            if (attribution && !credits.includes(attribution)) credits.push(attribution);
        }
        return credits;
    };

    const refresh = () => {
        const credits = collectAttributions();
        if (credits.length === 0) {
            element.style.display = 'none';
            element.innerHTML = '';
            return;
        }
        element.innerHTML = credits.join(' <span aria-hidden="true">|</span> ');
        element.style.display = '';
    };

    const control = { onAdd: () => element, onRemove: () => element.remove() };
    map.addControl(control, placement);
    refresh();
    map.on?.('styledata', refresh);
    map.on?.('sourcedata', refresh);

    return () => {
        map.off?.('styledata', refresh);
        map.off?.('sourcedata', refresh);
        // Map containers are discarded on unmount; detach defensively.
        try {
            map.removeControl?.(control);
        } catch {
            /* already torn down */
        }
    };
};

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
    if (!map || !compassButton) return () => { };

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
