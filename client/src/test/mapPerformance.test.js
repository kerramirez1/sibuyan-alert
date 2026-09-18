import { describe, expect, test } from 'vitest';
import { getMapPerformanceProfile } from '../utils/mapPerformance';

describe('map performance profile', () => {
    test('keeps full operational rendering on capable desktop devices', () => {
        const profile = getMapPerformanceProfile({
            viewportWidth: 1440,
            devicePixelRatio: 3,
            deviceMemory: 8,
            hardwareConcurrency: 8,
            saveData: false,
            reducedMotion: false,
        });

        expect(profile).toMatchObject({
            cameraPitchEnabled: true,
            antialias: true,
            pixelRatio: 2,
            riskZonePolygonPoints: 48,
        });
    });

    test('reduces GPU and tile pressure on constrained phones', () => {
        const profile = getMapPerformanceProfile({
            viewportWidth: 390,
            devicePixelRatio: 3,
            deviceMemory: 4,
            hardwareConcurrency: 4,
            saveData: false,
            reducedMotion: false,
        });

        expect(profile).toMatchObject({
            resourceConstrained: true,
            cameraPitchEnabled: true,
            antialias: false,
            pixelRatio: 1,
            maxTileCacheSize: 24,
            riskZonePolygonPoints: 20,
        });
    });

    test('respects data saver by reducing resource usage', () => {
        const profile = getMapPerformanceProfile({
            viewportWidth: 1280,
            devicePixelRatio: 2,
            deviceMemory: 8,
            hardwareConcurrency: 8,
            saveData: true,
            reducedMotion: false,
        });

        expect(profile).toMatchObject({
            resourceConstrained: true,
            cameraPitchEnabled: false,
            pixelRatio: 1,
            maxTileCacheSize: 24,
        });
    });

    test('respects reduced motion for camera transitions', () => {
        const profile = getMapPerformanceProfile({
            viewportWidth: 1280,
            saveData: false,
            reducedMotion: true,
        });

        expect(profile.navigationDuration).toBe(0);
        expect(profile.fadeDuration).toBe(0);
    });
});
