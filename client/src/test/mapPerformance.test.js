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
            terrainEnabled: true,
            terrainMaxZoom: 14,
            antialias: true,
            pixelRatio: 2,
            markerAnimations: true,
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
            terrainEnabled: true,
            terrainMaxZoom: 12,
            antialias: false,
            pixelRatio: 1,
            markerAnimations: false,
            maxTileCacheSize: 24,
        });
    });

    test('respects data saver by avoiding terrain', () => {
        const profile = getMapPerformanceProfile({
            viewportWidth: 1280,
            devicePixelRatio: 2,
            deviceMemory: 8,
            hardwareConcurrency: 8,
            saveData: true,
            reducedMotion: false,
        });

        expect(profile.terrainEnabled).toBe(false);
    });

    test('respects reduced motion for markers and camera transitions', () => {
        const profile = getMapPerformanceProfile({
            viewportWidth: 1280,
            saveData: false,
            reducedMotion: true,
        });

        expect(profile.markerAnimations).toBe(false);
        expect(profile.navigationDuration).toBe(0);
    });
});
