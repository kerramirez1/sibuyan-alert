const readMediaPreference = (query) => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches
);

/**
 * Produces one stable rendering profile per map instance. The profile keeps the
 * operational map usable on lower-powered phones without changing its data,
 * permissions, markers, or navigation behavior.
 *
 * Everything here is handed to MapLibre or to the marker builders. Marker
 * *animation* is deliberately not in that list: those cues are pure CSS
 * (`transform` + `opacity`, so they are composited on the GPU), which means the
 * only thing entitled to turn them off is `prefers-reduced-motion` itself. A
 * `resourceConstrained` flag that also disabled them used to freeze the
 * responding pulse on ordinary laptops while the hazard radar kept sweeping.
 */
export const getMapPerformanceProfile = (overrides = {}) => {
    const browserWindow = typeof window !== 'undefined' ? window : undefined;
    const browserNavigator = typeof navigator !== 'undefined' ? navigator : undefined;
    const viewportWidth = overrides.viewportWidth ?? browserWindow?.innerWidth ?? 1280;
    const devicePixelRatio = overrides.devicePixelRatio ?? browserWindow?.devicePixelRatio ?? 1;
    const saveData = overrides.saveData ?? Boolean(browserNavigator?.connection?.saveData);
    const deviceMemory = overrides.deviceMemory ?? browserNavigator?.deviceMemory;
    const hardwareConcurrency = overrides.hardwareConcurrency ?? browserNavigator?.hardwareConcurrency;
    const reducedMotion = overrides.reducedMotion ?? readMediaPreference('(prefers-reduced-motion: reduce)');

    const compactViewport = viewportWidth < 768;
    const limitedMemory = Number.isFinite(deviceMemory) && deviceMemory <= 4;
    const limitedCpu = Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 4;
    const resourceConstrained = saveData || (compactViewport && (limitedMemory || limitedCpu));

    return {
        compactViewport,
        resourceConstrained,
        cameraPitchEnabled: !saveData,
        antialias: !compactViewport && !resourceConstrained,
        pixelRatio: resourceConstrained
            ? 1
            : Math.min(Math.max(devicePixelRatio, 1), compactViewport ? 1.5 : 2),
        maxTileCacheSize: resourceConstrained ? 24 : compactViewport ? 40 : 80,
        fadeDuration: reducedMotion || resourceConstrained ? 0 : 150,
        navigationDuration: reducedMotion ? 0 : resourceConstrained ? 450 : 800,
        riskZonePolygonPoints: resourceConstrained ? 20 : compactViewport ? 28 : 48,
    };
};

export default getMapPerformanceProfile;
