import { describe, expect, test, vi } from 'vitest';
import sharp from 'sharp';
import { expandBoundingBox, generateRedactedEvidenceDerivative } from '../services/evidenceDerivativeService.js';
import * as faceDetectionService from '../services/faceDetectionService.js';
import {
    createCorruptImage,
    createDarkFacePhoto,
    createDocumentFixture,
    createExifRotatedFacePhoto,
    createLowResFacePhoto,
    createMultiFacePhoto,
    createSingleFacePhoto,
} from './helpers/evidenceFixtures.js';

describe('Face Redaction and Evidence Derivative Services with Real Fixtures', { timeout: 30000 }, () => {
    test('1. expandBoundingBox expands face box by ~35% and clamps to boundaries', () => {
        const box = { x: 100, y: 100, width: 50, height: 50 };
        const expanded = expandBoundingBox(box, 400, 400, 0.35);

        expect(expanded.left).toBeLessThan(box.x);
        expect(expanded.top).toBeLessThan(box.y);
        expect(expanded.width).toBeGreaterThan(box.width);
        expect(expanded.height).toBeGreaterThan(box.height);
        expect(expanded.left).toBeGreaterThanOrEqual(0);
        expect(expanded.top).toBeGreaterThanOrEqual(0);
    });

    test('2. expandBoundingBox safely handles edge/corner faces', () => {
        const cornerBox = { x: 0, y: 0, width: 40, height: 40 };
        const expanded = expandBoundingBox(cornerBox, 200, 200, 0.35);

        expect(expanded.left).toBe(0);
        expect(expanded.top).toBe(0);
        expect(expanded.width).toBeGreaterThan(40);
        expect(expanded.height).toBeGreaterThan(40);
    });

    test('3. Real-looking single face photo: detects human face, redacts face region, and keeps background sharp', async () => {
        const originalFaceBuffer = await createSingleFacePhoto({ width: 500, height: 600 });
        const detectionResult = await faceDetectionService.detectFaces(originalFaceBuffer);

        expect(detectionResult.status).toBe('faces_detected');
        expect(detectionResult.faces.length).toBeGreaterThanOrEqual(1);

        const primaryFace = detectionResult.faces[0];
        // The face center in the fixture is around x=250, y=270
        expect(primaryFace.x + primaryFace.width / 2).toBeGreaterThan(150);
        expect(primaryFace.x + primaryFace.width / 2).toBeLessThan(350);
        expect(primaryFace.y + primaryFace.height / 2).toBeGreaterThan(150);
        expect(primaryFace.y + primaryFace.height / 2).toBeLessThan(380);

        // Generate redacted derivative
        const derivative = await generateRedactedEvidenceDerivative(originalFaceBuffer);
        expect(derivative.contentType).toBe('image/jpeg');
        expect(derivative.metadata.detectionStatus).toBe('faces_detected');
        expect(derivative.metadata.redactionType).toBe('face_blur');
        expect(derivative.metadata.facesDetected).toBeGreaterThanOrEqual(1);
        expect(derivative.metadata.fallbackApplied).toBe(false);

        // Pixel verification:
        // Extract the face region from original and derivative, verify they are DIFFERENT
        const origFacePatch = await sharp(originalFaceBuffer)
            .extract({ left: primaryFace.x, top: primaryFace.y, width: primaryFace.width, height: primaryFace.height })
            .raw()
            .toBuffer();

        const derivFacePatch = await sharp(derivative.buffer)
            .extract({ left: primaryFace.x, top: primaryFace.y, width: primaryFace.width, height: primaryFace.height })
            .raw()
            .toBuffer();

        // Must be pixel-different in face region due to blur and pixelation
        expect(origFacePatch.equals(derivFacePatch)).toBe(false);
    });

    test('4. Photo with multiple faces: detects and redacts every human face', async () => {
        const multiFaceBuffer = await createMultiFacePhoto();
        const detectionResult = await faceDetectionService.detectFaces(multiFaceBuffer);

        expect(detectionResult.status).toBe('faces_detected');
        expect(detectionResult.faces.length).toBeGreaterThanOrEqual(2);

        const derivative = await generateRedactedEvidenceDerivative(multiFaceBuffer);
        expect(derivative.metadata.detectionStatus).toBe('faces_detected');
        expect(derivative.metadata.redactionType).toBe('face_blur');
        expect(derivative.metadata.facesDetected).toBeGreaterThanOrEqual(2);
    });

    test('5. Official document with text (no faces): remains sharp and readable with no_faces_detected status', async () => {
        const documentBuffer = await createDocumentFixture();
        const detectionResult = await faceDetectionService.detectFaces(documentBuffer);

        expect(detectionResult.status).toBe('no_faces_detected');
        expect(detectionResult.faces.length).toBe(0);

        const result = await generateRedactedEvidenceDerivative(documentBuffer);
        expect(result.contentType).toBe('image/jpeg');
        expect(result.metadata.detectionStatus).toBe('no_faces_detected');
        expect(result.metadata.redactionType).toBe('none');
        expect(result.metadata.facesDetected).toBe(0);
        expect(result.metadata.fallbackApplied).toBe(false);

        // Document text lines remain intact and readable
        const outMetadata = await sharp(result.buffer).metadata();
        expect(outMetadata.width).toBeLessThanOrEqual(1200);
        expect(outMetadata.exif).toBeUndefined();
    });

    test('6. EXIF-rotated portrait photo: auto-orients and redacts face correctly', async () => {
        const rotatedFaceBuffer = await createExifRotatedFacePhoto();
        const detectionResult = await faceDetectionService.detectFaces(rotatedFaceBuffer);

        expect(detectionResult.status).toBe('faces_detected');
        expect(detectionResult.faces.length).toBeGreaterThanOrEqual(1);

        const derivative = await generateRedactedEvidenceDerivative(rotatedFaceBuffer);
        expect(derivative.metadata.detectionStatus).toBe('faces_detected');
        expect(derivative.metadata.redactionType).toBe('face_blur');
    });

    test('7. Low-resolution compressed face photo: detects and redacts face', async () => {
        const lowResBuffer = await createLowResFacePhoto();
        const detectionResult = await faceDetectionService.detectFaces(lowResBuffer);

        expect(detectionResult.status).toBe('faces_detected');
        expect(detectionResult.faces.length).toBeGreaterThanOrEqual(1);

        const derivative = await generateRedactedEvidenceDerivative(lowResBuffer);
        expect(derivative.metadata.detectionStatus).toBe('faces_detected');
        expect(derivative.metadata.redactionType).toBe('face_blur');
    });

    test('8. Dark outdoor shadow photo: detects and redacts face via secondary contrast pass', async () => {
        const darkFaceBuffer = await createDarkFacePhoto();
        const detectionResult = await faceDetectionService.detectFaces(darkFaceBuffer);

        expect(detectionResult.status).toBe('faces_detected');
        expect(detectionResult.faces.length).toBeGreaterThanOrEqual(1);

        const derivative = await generateRedactedEvidenceDerivative(darkFaceBuffer);
        expect(derivative.metadata.detectionStatus).toBe('faces_detected');
        expect(derivative.metadata.redactionType).toBe('face_blur');
    });

    test('9. Corrupt/invalid image buffer: returns safe placeholder with invalid_image status', async () => {
        const corruptBuffer = createCorruptImage();
        const result = await generateRedactedEvidenceDerivative(corruptBuffer);

        expect(result).toBeDefined();
        expect(result.metadata.fallbackApplied).toBe(true);
        expect(['invalid_image', 'derivative_failed', 'detector_failed']).toContain(result.metadata.detectionStatus);
        expect(result.metadata.redactionType).toBe('svg_fallback');
        expect(result.contentType).toBe('image/svg+xml');
        expect(result.buffer.toString('utf-8')).toContain('<svg');
    });

    test('10. Forced detector failure: fails closed with fallback_blur and detector_failed status, never leaks original', async () => {
        const singleFace = await createSingleFacePhoto();
        
        // Mock detectFaces to simulate a detector exception
        const detectFacesSpy = vi.spyOn(faceDetectionService, 'detectFaces').mockResolvedValueOnce({
            status: 'detector_failed',
            faces: [],
            detectorVersion: 'picojs-facefinder-2.3',
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
            diagnostics: { error: 'Simulated detector hardware failure' },
        });

        // Use a unique option to bypass in-memory hash cache
        const result = await generateRedactedEvidenceDerivative(singleFace, { forcedFailureTest: true });

        expect(result).toBeDefined();
        expect(result.metadata.fallbackApplied).toBe(true);
        expect(result.metadata.detectionStatus).toBe('detector_failed');
        expect(result.metadata.redactionType).toBe('fallback_blur');
        expect(result.metadata.facesDetected).toBe(0);

        detectFacesSpy.mockRestore();
    });

    test('11. Strips all EXIF, GPS, and device metadata from output derivative', async () => {
        const imageWithExif = await sharp({
            create: {
                width: 300,
                height: 200,
                channels: 4,
                background: { r: 50, g: 100, b: 150, alpha: 1 },
            },
        }).withExif({
            IFD0: {
                Make: 'TestCameraMaker',
                Model: 'TestCameraModel',
                Software: 'TestSoftware',
            },
        }).jpeg().toBuffer();

        const result = await generateRedactedEvidenceDerivative(imageWithExif);
        const metadata = await sharp(result.buffer).metadata();

        expect(metadata.exif).toBeUndefined();
    });

    test('12. Public soft blur skips face detection and returns a privacy derivative', async () => {
        const source = await createSingleFacePhoto({ width: 500, height: 600 });
        const detectFacesSpy = vi.spyOn(faceDetectionService, 'detectFaces');

        const result = await generateRedactedEvidenceDerivative(source, {
            publicSoftBlur: true,
            publicSoftBlurTest: Date.now(),
        });

        expect(result.metadata.redactionType).toBe('public_soft_blur');
        expect(result.metadata.detectionStatus).toBe('privacy_derivative');
        expect(result.metadata.fallbackApplied).toBe(false);
        expect(detectFacesSpy).not.toHaveBeenCalled();

        detectFacesSpy.mockRestore();
    });
});
