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

export const MAX_RAW_EVIDENCE_BYTES = 20 * 1024 * 1024; // 20 MB max raw input
export const MAX_OUTPUT_EDGE = 1200; // Standardized optimal balance of crisp details and minimal byte weight
export const JPEG_COMPRESSION_QUALITY = 0.82;
export const SLOW_NETWORK_MAX_OUTPUT_EDGE = 800;
export const SLOW_NETWORK_QUALITY = 0.65;
/**
 * Measured effective throughput below this is treated as a slow link. A 1-bar
 * connection (~50-150 Kbps) lands well under it; a healthy link clears it
 * even for small payloads.
 */
export const SLOW_THROUGHPUT_KBPS = 300;

let webpSupportedCache = null;

// Last measured effective upload throughput for this session. A real
// measurement beats the Network Information API: a 1-bar link often reports
// '3g'/'4g' with unusable real throughput, and iOS Safari does not implement
// the API at all. Recorded by the report form after its fields POST (phase 1
// of the two-phase submit), so later photo preparations in the session can
// compress for the link the reporter actually has.
let measuredUploadKbps = null;
let uploadProbeFailed = false;

/**
 * Records the effective throughput of a completed (or failed) upload probe.
 * A failed probe counts as slow: if the fields POST could not complete, the
 * link is in no state to carry full-resolution photos.
 */
export const recordUploadThroughput = ({ bytes = 0, durationMs = 0, failed = false } = {}) => {
    if (failed) {
        uploadProbeFailed = true;
        return;
    }
    const seconds = Math.max(0.001, (Number(durationMs) || 0) / 1000);
    const kbps = ((Number(bytes) || 0) * 8) / 1000 / seconds;
    if (Number.isFinite(kbps) && kbps >= 0) {
        measuredUploadKbps = kbps;
        uploadProbeFailed = false;
    }
};

/** The last measured effective upload throughput in Kbps, or null if none yet. */
export const getMeasuredUploadKbps = () => measuredUploadKbps;

/** Resets the throughput measurement (primarily for unit tests). */
export const resetUploadThroughputForTesting = () => {
    measuredUploadKbps = null;
    uploadProbeFailed = false;
};

/**
 * Detects whether the current environment canvas supports WebP export.
 * @returns {boolean}
 */
export const isWebpSupported = () => {
    if (webpSupportedCache !== null) return webpSupportedCache;
    if (typeof document === 'undefined' || !document.createElement) {
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const uri = canvas.toDataURL ? canvas.toDataURL('image/webp') : '';
        webpSupportedCache = typeof uri === 'string' && uri.startsWith('data:image/webp');
    } catch {
        webpSupportedCache = false;
    }
    return webpSupportedCache;
};

/**
 * Resets the WebP support cache (primarily for unit testing different browser capabilities).
 */
export const resetWebpSupportCacheForTesting = () => {
    webpSupportedCache = null;
};

/**
 * Determines adaptive image scaling and compression quality based on network conditions.
 * A measured effective throughput (see recordUploadThroughput) wins when one
 * exists; navigator.connection (Network Information API) is only the fallback
 * for sessions with no measurement yet.
 * @returns {{ maxEdge: number, quality: number, isSlowConnection: boolean }}
 */
export const getAdaptiveCompressionSettings = () => {
    if (uploadProbeFailed || (measuredUploadKbps !== null && measuredUploadKbps < SLOW_THROUGHPUT_KBPS)) {
        return {
            maxEdge: SLOW_NETWORK_MAX_OUTPUT_EDGE,
            quality: SLOW_NETWORK_QUALITY,
            isSlowConnection: true,
        };
    }
    if (measuredUploadKbps === null && typeof navigator !== 'undefined') {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const effectiveType = conn?.effectiveType;
        const isSlow = effectiveType === '2g' || effectiveType === 'slow-2g' || conn?.saveData === true;
        if (isSlow) {
            return {
                maxEdge: SLOW_NETWORK_MAX_OUTPUT_EDGE,
                quality: SLOW_NETWORK_QUALITY,
                isSlowConnection: true,
            };
        }
    }
    return {
        maxEdge: MAX_OUTPUT_EDGE,
        quality: JPEG_COMPRESSION_QUALITY,
        isSlowConnection: false,
    };
};

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
        return 'is too large (max 20MB)';
    }
    return '';
};

/**
 * Reads an image file into an HTMLImageElement with immediate object URL cleanup.
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
 * Converts a canvas element to a Blob with format and quality options.
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
const canvasToBlob = (canvas, mimeType, quality) => new Promise((resolve, reject) => {
    canvas.toBlob(
        (blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error(`Failed to compress image canvas to ${mimeType}.`));
            }
        },
        mimeType,
        quality
    );
});

/**
 * Generates a clean output filename preserving original base name with matching extension.
 * @param {string} [originalName]
 * @param {string} [extension='jpg']
 * @returns {string}
 */
const sanitizeOutputFileName = (originalName = 'evidence-photo.jpg', extension = 'jpg') => {
    const base = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
    return `${base || 'evidence-photo'}.${extension}`;
};

/**
 * Compresses and scales an evidence photo before network upload with adaptive resolution
 * and dynamic WebP / JPEG format fallback.
 *
 * @param {File|Blob} sourceFile
 * @param {object} [options]
 * @param {number} [options.maxEdge]
 * @param {number} [options.quality]
 * @param {string} [options.format] 'image/webp' | 'image/jpeg'
 * @returns {Promise<{ file: File, width: number, height: number, originalSize: number, compressedSize: number }>}
 */
export const prepareEvidenceImage = async (sourceFile, options = {}) => {
    const adaptive = getAdaptiveCompressionSettings();
    const maxEdge = options.maxEdge ?? adaptive.maxEdge;
    const quality = options.quality ?? adaptive.quality;

    const validationError = validateEvidenceImageFile(sourceFile);
    if (validationError) {
        throw new Error(validationError);
    }

    // Determine target format and file extension
    let targetMime = options.format;
    if (!targetMime) {
        targetMime = isWebpSupported() ? 'image/webp' : 'image/jpeg';
    }
    const targetExtension = targetMime === 'image/webp' ? 'webp' : 'jpg';

    // Node / SSR / Test environment fallback where 2D canvas context is not implemented
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.createElement) {
        return {
            file: sourceFile instanceof File ? sourceFile : new File([sourceFile], `evidence.${targetExtension}`, { type: targetMime }),
            width: 800,
            height: 600,
            originalSize: sourceFile.size || 0,
            compressedSize: sourceFile.size || 0,
        };
    }

    const testCanvas = document.createElement('canvas');
    if (!testCanvas.getContext || !testCanvas.getContext('2d')) {
        return {
            file: sourceFile instanceof File ? sourceFile : new File([sourceFile], sanitizeOutputFileName(sourceFile.name, targetExtension), { type: sourceFile.type || targetMime }),
            width: 800,
            height: 600,
            originalSize: sourceFile.size || 0,
            compressedSize: sourceFile.size || 0,
        };
    }

    let canvas = null;
    let image = null;
    try {
        image = await loadImageElement(sourceFile);
        const naturalWidth = image.naturalWidth || image.width || 800;
        const naturalHeight = image.naturalHeight || image.height || 600;

        const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
        const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

        canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return {
                file: sourceFile instanceof File ? sourceFile : new File([sourceFile], sanitizeOutputFileName(sourceFile.name, targetExtension), { type: sourceFile.type || targetMime }),
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

        // Clear decoded image source immediately to free decoded bitmap in RAM
        if (typeof image.src === 'string') {
            image.src = '';
        }

        let blob;
        let finalMime = targetMime;
        let finalExtension = targetExtension;

        try {
            blob = await canvasToBlob(canvas, finalMime, quality);
            // Detect silent PNG fallback from browser canvas toBlob (HTML5 spec behavior when WebP is unsupported)
            if (finalMime === 'image/webp' && blob && blob.type && blob.type !== 'image/webp') {
                finalMime = 'image/jpeg';
                finalExtension = 'jpg';
                blob = await canvasToBlob(canvas, finalMime, quality);
            }
        } catch {
            // WebP export fallback to standard JPEG if toBlob with webp fails
            if (finalMime === 'image/webp') {
                finalMime = 'image/jpeg';
                finalExtension = 'jpg';
                blob = await canvasToBlob(canvas, finalMime, quality);
            } else {
                throw new Error('Canvas compression failed');
            }
        }

        const outputFile = new File(
            [blob],
            sanitizeOutputFileName(sourceFile.name || `evidence-photo.${finalExtension}`, finalExtension),
            {
                type: finalMime,
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
        // Safe fallback: return original file or safe copy if compression encountered any issues
        const safeFile = sourceFile instanceof File
            ? sourceFile
            : new File([sourceFile], sanitizeOutputFileName(sourceFile.name, targetExtension), { type: sourceFile.type || targetMime });
        return {
            file: safeFile,
            width: 800,
            height: 600,
            originalSize: sourceFile.size || 0,
            compressedSize: safeFile.size || 0,
        };
    } finally {
        // Explicitly release decoded image bitmap and canvas memory buffer immediately to prevent browser OOM tab crashes
        if (image) {
            image.onload = null;
            image.onerror = null;
            image.src = '';
        }
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
    }
};

/**
 * Sequential batch processing of multiple evidence images to prevent memory spikes (OOM)
 * on low-memory mobile devices.
 *
 * @param {Array<File|Blob>} files
 * @param {object} [options]
 * @returns {Promise<Array<{ file: File, width: number, height: number, originalSize: number, compressedSize: number }>>}
 */
export const prepareEvidenceImages = async (files, options = {}) => {
    if (!Array.isArray(files) || files.length === 0) return [];
    const results = [];
    for (const file of files) {
        const result = await prepareEvidenceImage(file, options);
        results.push(result);
    }
    return results;
};
