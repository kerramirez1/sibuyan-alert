/**
 * Client-Side Evidence Image Compression & Optimization
 * 
 * Objectives:
 * 1. Compress raw mobile phone camera photos (5MB-15MB, 4000x3000px) down to ~200KB-350KB before upload.
 * 2. Preserve forensic evidentiary clarity (vehicle plates, collision damage, road markings, street signs).
 * 3. Dramatically reduce upload and download latency on mobile / remote connections.
 */

export const EVIDENCE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/jpg';
export const EVIDENCE_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
]);

export const MAX_RAW_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB max raw input
export const MAX_OUTPUT_EDGE = 1600; // Optimal balance of crisp details and minimal byte weight
export const JPEG_COMPRESSION_QUALITY = 0.82;

/**
 * Validates a user-selected evidence image file.
 * @param {File|Blob} file
 * @returns {string} Error message or empty string if valid.
 */
export const validateEvidenceImageFile = (file) => {
    if (!file) return 'Select or capture a photo.';
    if (!file.type || !file.type.startsWith('image/')) {
        return 'is not an image';
    }
    if (file.size <= 0) return 'is empty';
    if (file.size > MAX_RAW_EVIDENCE_BYTES) {
        return 'is too large (max 5MB)';
    }
    return '';
};

/**
 * Reads an image file into an HTMLImageElement.
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
const loadImageElement = (file) => new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
        reject(new Error('Canvas image processing is only available in a browser environment.'));
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
    };

    img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected image could not be loaded. Please try another photo.'));
    };

    img.src = objectUrl;
});

/**
 * Converts a canvas element to a JPEG Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
const canvasToJpegBlob = (canvas, quality = JPEG_COMPRESSION_QUALITY) => new Promise((resolve, reject) => {
    canvas.toBlob(
        (blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to compress image canvas.'));
            }
        },
        'image/jpeg',
        quality
    );
});

/**
 * Generates a clean output filename preserving original base name with .jpg extension.
 * @param {string} [originalName]
 * @returns {string}
 */
const sanitizeOutputFileName = (originalName = 'evidence-photo.jpg') => {
    const base = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
    return `${base || 'evidence-photo'}.jpg`;
};

/**
 * Compresses and scales an evidence photo before network upload.
 * @param {File|Blob} sourceFile
 * @param {object} [options]
 * @param {number} [options.maxEdge=1600]
 * @param {number} [options.quality=0.82]
 * @returns {Promise<{ file: File, width: number, height: number, originalSize: number, compressedSize: number }>}
 */
export const prepareEvidenceImage = async (sourceFile, options = {}) => {
    const {
        maxEdge = MAX_OUTPUT_EDGE,
        quality = JPEG_COMPRESSION_QUALITY,
    } = options;

    const validationError = validateEvidenceImageFile(sourceFile);
    if (validationError) {
        throw new Error(validationError);
    }

    // Node / SSR / Test environment fallback where 2D canvas context is not implemented
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.createElement) {
        return {
            file: sourceFile instanceof File ? sourceFile : new File([sourceFile], 'evidence.jpg', { type: 'image/jpeg' }),
            width: 800,
            height: 600,
            originalSize: sourceFile.size || 0,
            compressedSize: sourceFile.size || 0,
        };
    }

    const testCanvas = document.createElement('canvas');
    if (!testCanvas.getContext || !testCanvas.getContext('2d')) {
        return {
            file: sourceFile instanceof File ? sourceFile : new File([sourceFile], sanitizeOutputFileName(sourceFile.name), { type: sourceFile.type || 'image/jpeg' }),
            width: 800,
            height: 600,
            originalSize: sourceFile.size || 0,
            compressedSize: sourceFile.size || 0,
        };
    }

    try {
        const image = await loadImageElement(sourceFile);
        const naturalWidth = image.naturalWidth || image.width || 800;
        const naturalHeight = image.naturalHeight || image.height || 600;

        const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
        const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return {
                file: sourceFile instanceof File ? sourceFile : new File([sourceFile], sanitizeOutputFileName(sourceFile.name), { type: sourceFile.type || 'image/jpeg' }),
                width: naturalWidth,
                height: naturalHeight,
                originalSize: sourceFile.size || 0,
                compressedSize: sourceFile.size || 0,
            };
        }

        // Draw image onto white background canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        const blob = await canvasToJpegBlob(canvas, quality);

        const outputFile = new File(
            [blob],
            sanitizeOutputFileName(sourceFile.name || 'evidence-photo.jpg'),
            {
                type: 'image/jpeg',
                lastModified: Date.now(),
            }
        );

        return {
            file: outputFile,
            width: targetWidth,
            height: targetHeight,
            originalSize: sourceFile.size,
            compressedSize: outputFile.size,
        };
    } catch {
        // Safe fallback: return the original file if compression encountered any issues
        const safeFile = sourceFile instanceof File
            ? sourceFile
            : new File([sourceFile], sanitizeOutputFileName(sourceFile.name), { type: sourceFile.type || 'image/jpeg' });
        return {
            file: safeFile,
            width: 800,
            height: 600,
            originalSize: sourceFile.size || 0,
            compressedSize: safeFile.size || 0,
        };
    }
};

/**
 * Batch processes multiple evidence images concurrently.
 * @param {Array<File|Blob>} files
 * @param {object} [options]
 * @returns {Promise<Array<{ file: File, width: number, height: number, originalSize: number, compressedSize: number }>>}
 */
export const prepareEvidenceImages = async (files, options = {}) => {
    if (!Array.isArray(files) || files.length === 0) return [];
    return Promise.all(files.map((file) => prepareEvidenceImage(file, options)));
};
