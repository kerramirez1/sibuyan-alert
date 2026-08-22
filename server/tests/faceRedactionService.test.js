import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { expandBoundingBox, generateRedactedEvidenceDerivative } from '../services/evidenceDerivativeService.js';
import { detectFaces } from '../services/faceDetectionService.js';

describe('Face Redaction and Evidence Derivative Services', () => {
    test('1. expandBoundingBox expands face box by ~28% and clamps to boundaries', () => {
        const box = { x: 100, y: 100, width: 50, height: 50 };
        const expanded = expandBoundingBox(box, 400, 400, 0.28);

        expect(expanded.left).toBeLessThan(box.x);
        expect(expanded.top).toBeLessThan(box.y);
        expect(expanded.width).toBeGreaterThan(box.width);
        expect(expanded.height).toBeGreaterThan(box.height);
        expect(expanded.left).toBeGreaterThanOrEqual(0);
        expect(expanded.top).toBeGreaterThanOrEqual(0);
    });

    test('2. expandBoundingBox safely handles edge/corner faces', () => {
        const cornerBox = { x: 0, y: 0, width: 40, height: 40 };
        const expanded = expandBoundingBox(cornerBox, 200, 200, 0.3);

        expect(expanded.left).toBe(0);
        expect(expanded.top).toBe(0);
        expect(expanded.width).toBeGreaterThan(40);
        expect(expanded.height).toBeGreaterThan(40);
    });

    test('3. detectFaces processes synthetic image without errors and returns array', async () => {
        const testBuffer = await sharp({
            create: {
                width: 200,
                height: 200,
                channels: 4,
                background: { r: 100, g: 150, b: 200, alpha: 1 },
            },
        }).jpeg().toBuffer();

        const faces = await detectFaces(testBuffer);
        expect(Array.isArray(faces)).toBe(true);
    });

    test('4. generateRedactedEvidenceDerivative produces safe JPEG preview and strips EXIF', async () => {
        const testBuffer = await sharp({
            create: {
                width: 400,
                height: 300,
                channels: 4,
                background: { r: 80, g: 120, b: 90, alpha: 1 },
            },
        }).jpeg().toBuffer();

        const result = await generateRedactedEvidenceDerivative(testBuffer);

        expect(result).toBeDefined();
        expect(result.contentType).toBe('image/jpeg');
        expect(Buffer.isBuffer(result.buffer)).toBe(true);
        expect(result.metadata.redactionVersion).toBe('1.0');
        expect(result.metadata.fallbackApplied).toBe(false);

        // Verify output dimensions and absence of private EXIF
        const outMetadata = await sharp(result.buffer).metadata();
        expect(outMetadata.width).toBeLessThanOrEqual(800);
        expect(outMetadata.height).toBeLessThanOrEqual(600);
        expect(outMetadata.exif).toBeUndefined();
    });

    test('5. generateRedactedEvidenceDerivative falls back safely on corrupted data', async () => {
        const corruptBuffer = Buffer.from('invalid-non-image-data-string');
        const result = await generateRedactedEvidenceDerivative(corruptBuffer);

        expect(result).toBeDefined();
        expect(result.metadata.fallbackApplied).toBe(true);
        expect(result.contentType).toBe('image/svg+xml');
        expect(result.buffer.toString('utf-8')).toContain('<svg');
    });
});
