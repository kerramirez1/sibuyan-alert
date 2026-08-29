import { describe, expect, test } from 'vitest';
import {
    calculateRegionBrightness,
    evaluateFaceQuality,
    rgbaToGrayscale,
} from '../utils/selfieFaceDetector';

describe('selfieFaceDetector utils', () => {
    test('converts RGBA buffer to ITU-R BT.601 grayscale values', () => {
        // Red pixel (255, 0, 0, 255) -> 0.299 * 255 = 76.245 ~ 76
        // Green pixel (0, 255, 0, 255) -> 0.587 * 255 = 149.685 ~ 149
        // Blue pixel (0, 0, 255, 255) -> 0.114 * 255 = 29.07 ~ 29
        // White pixel (255, 255, 255, 255) -> 255
        const rgba = new Uint8Array([
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 255, 255, 255,
        ]);

        const gray = rgbaToGrayscale(rgba, 2, 2);
        expect(gray).toHaveLength(4);
        expect(gray[0]).toBe(76);
        expect(gray[1]).toBe(149);
        expect(gray[2]).toBe(29);
        expect(gray[3]).toBe(255);
    });

    test('calculates region brightness accurately', () => {
        const frameWidth = 10;
        const grayPixels = new Uint8Array(100).fill(50);
        // Fill a region with brightness 150
        for (let r = 2; r < 6; r += 1) {
            for (let c = 2; c < 6; c += 1) {
                grayPixels[r * frameWidth + c] = 150;
            }
        }

        const brightness = calculateRegionBrightness(grayPixels, frameWidth, 2, 2, 4, 4);
        expect(brightness).toBe(150);
    });

    test('returns "no_face" when no faces are present', () => {
        const result = evaluateFaceQuality({
            faces: [],
            frameWidth: 640,
            frameHeight: 480,
        });

        expect(result.status).toBe('no_face');
        expect(result.message).toBe('No face detected');
        expect(result.guideState).toBe('searching');
        expect(result.valid).toBe(false);
    });

    test('returns "multiple_faces" when more than one face is detected', () => {
        const result = evaluateFaceQuality({
            faces: [
                { x: 100, y: 100, width: 150, height: 150, confidence: 10 },
                { x: 350, y: 100, width: 150, height: 150, confidence: 10 },
            ],
            frameWidth: 640,
            frameHeight: 480,
        });

        expect(result.status).toBe('multiple_faces');
        expect(result.message).toBe('Make sure only one person is visible');
        expect(result.guideState).toBe('warning');
        expect(result.valid).toBe(false);
        expect(result.faceCount).toBe(2);
    });

    test('returns "too_far" when face is too small relative to frame', () => {
        const result = evaluateFaceQuality({
            faces: [{ x: 300, y: 220, width: 50, height: 50, confidence: 10 }],
            frameWidth: 640,
            frameHeight: 480,
            minSizeRatio: 0.20,
        });

        expect(result.status).toBe('too_far');
        expect(result.message).toBe('Move closer');
        expect(result.guideState).toBe('warning');
        expect(result.valid).toBe(false);
    });

    test('returns "too_close" when face is excessively large', () => {
        const result = evaluateFaceQuality({
            faces: [{ x: 50, y: 10, width: 420, height: 420, confidence: 10 }],
            frameWidth: 640,
            frameHeight: 480,
            maxSizeRatio: 0.80,
        });

        expect(result.status).toBe('too_close');
        expect(result.message).toBe('Move back');
        expect(result.guideState).toBe('warning');
        expect(result.valid).toBe(false);
    });

    test('returns "not_centered" when face is off to the edge', () => {
        const result = evaluateFaceQuality({
            faces: [{ x: 20, y: 200, width: 180, height: 180, confidence: 10 }],
            frameWidth: 640,
            frameHeight: 480,
        });

        expect(result.status).toBe('not_centered');
        expect(result.message).toBe('Center your face');
        expect(result.guideState).toBe('warning');
        expect(result.valid).toBe(false);
    });

    test('returns "too_dark" when face region has severely low luminance', () => {
        const frameWidth = 640;
        const frameHeight = 480;
        const grayPixels = new Uint8Array(frameWidth * frameHeight).fill(15); // extremely dark

        const result = evaluateFaceQuality({
            faces: [{ x: 220, y: 140, width: 200, height: 200, confidence: 10 }],
            frameWidth,
            frameHeight,
            grayPixels,
            minBrightness: 30,
        });

        expect(result.status).toBe('too_dark');
        expect(result.message).toBe('Lighting is too dark');
        expect(result.valid).toBe(false);
    });

    test('returns "valid_face" when single face is centered, properly sized, and well-lit', () => {
        const frameWidth = 640;
        const frameHeight = 480;
        const grayPixels = new Uint8Array(frameWidth * frameHeight).fill(120);

        // Center: x=220, width=200 -> center X = (220 + 100) / 640 = 0.5
        // Center: y=130, height=200 -> center Y = (130 + 100) / 480 = 0.479 (~0.48)
        // sizeRatio = 200 / 480 = 0.416
        const result = evaluateFaceQuality({
            faces: [{ x: 220, y: 130, width: 200, height: 200, confidence: 10 }],
            frameWidth,
            frameHeight,
            grayPixels,
        });

        expect(result.status).toBe('valid_face');
        expect(result.message).toBe('Hold still');
        expect(result.guideState).toBe('aligned');
        expect(result.valid).toBe(true);
        expect(result.faceCount).toBe(1);
    });
});
