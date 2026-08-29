import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    EVIDENCE_IMAGE_ACCEPT,
    MAX_OUTPUT_EDGE,
    MAX_RAW_EVIDENCE_BYTES,
    prepareEvidenceImage,
    prepareEvidenceImages,
    validateEvidenceImageFile,
} from '../utils/evidenceImage';

describe('Evidence Image Compression & Validation Utility (evidenceImage.js)', () => {
    let originalImage;

    beforeEach(() => {
        vi.clearAllMocks();
        originalImage = globalThis.Image;

        globalThis.Image = class {
            constructor() {
                setTimeout(() => {
                    this.naturalWidth = 3200;
                    this.naturalHeight = 2400;
                    this.width = 3200;
                    this.height = 2400;
                    this.onload?.();
                }, 0);
            }
        };

        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    test('1. Validates accepted image MIME types and file limits', () => {
        expect(EVIDENCE_IMAGE_ACCEPT).toContain('image/jpeg');
        expect(EVIDENCE_IMAGE_ACCEPT).toContain('image/png');
        expect(EVIDENCE_IMAGE_ACCEPT).toContain('image/webp');

        // Valid files
        expect(validateEvidenceImageFile(new File(['bytes'], 'accident.jpg', { type: 'image/jpeg' }))).toBe('');
        expect(validateEvidenceImageFile(new File(['bytes'], 'hazard.png', { type: 'image/png' }))).toBe('');
        expect(validateEvidenceImageFile(new File(['bytes'], 'site.webp', { type: 'image/webp' }))).toBe('');

        // Invalid: missing file
        expect(validateEvidenceImageFile(null)).toMatch(/Select or capture/i);

        // Invalid: non-image MIME
        expect(validateEvidenceImageFile(new File(['bytes'], 'doc.pdf', { type: 'application/pdf' }))).toMatch(/is not an image/i);

        // Invalid: empty file
        expect(validateEvidenceImageFile(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toMatch(/empty/i);

        // Invalid: oversized raw file > 5MB
        const hugeFile = { type: 'image/jpeg', size: MAX_RAW_EVIDENCE_BYTES + 100, name: 'huge.jpg' };
        expect(validateEvidenceImageFile(hugeFile)).toMatch(/too large/i);
    });

    test('2. Compresses and resizes image using canvas in browser environment', async () => {
        const mockBlob = new Blob(['compressed-jpeg-bytes'], { type: 'image/jpeg' });
        const mockToBlob = vi.fn((callback) => callback(mockBlob));

        const mockContext = {
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(),
        };

        const mockCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockContext),
            toBlob: mockToBlob,
        };

        const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') return mockCanvas;
            return document.createElement(tag);
        });

        const rawFile = new File(['raw-camera-bytes-5mb'], 'my-photo.jpg', { type: 'image/jpeg' });
        const result = await prepareEvidenceImage(rawFile, { maxEdge: MAX_OUTPUT_EDGE, quality: 0.82 });

        expect(result.file).toBeInstanceOf(File);
        expect(result.file.type).toBe('image/jpeg');
        expect(result.width).toBe(MAX_OUTPUT_EDGE); // Scaled from 3200 to 1600
        expect(result.height).toBe(1200); // 2400 * (1600/3200) = 1200
        expect(mockContext.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);

        createElementSpy.mockRestore();
    });

    test('3. Batch processes multiple images concurrently with prepareEvidenceImages', async () => {
        const file1 = new File(['img1'], 'photo1.jpg', { type: 'image/jpeg' });
        const file2 = new File(['img2'], 'photo2.jpg', { type: 'image/jpeg' });

        const results = await prepareEvidenceImages([file1, file2]);

        expect(results).toHaveLength(2);
        expect(results[0].file).toBeDefined();
        expect(results[1].file).toBeDefined();

        // Empty array returns empty array
        expect(await prepareEvidenceImages([])).toEqual([]);
    });

    test('4. Falls back safely if canvas or image load throws an error', async () => {
        const badFile = new File(['bad-data'], 'corrupt.jpg', { type: 'image/jpeg' });

        globalThis.Image = class {
            constructor() {
                setTimeout(() => {
                    this.onerror?.(new Error('Corrupt'));
                }, 0);
            }
        };

        const result = await prepareEvidenceImage(badFile);
        expect(result.file).toBeDefined();
        expect(result.file.name).toContain('corrupt');

        globalThis.Image = originalImage;
    });
});
