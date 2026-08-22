import sharp from 'sharp';
import { detectFaces } from './faceDetectionService.js';
import { generateBlurredEvidenceSvg } from './previewService.js';

/**
 * Expands a face bounding box by approximately 25-30% to guarantee full coverage
 * of the chin, hairline, ears, and surrounding identity features.
 */
export const expandBoundingBox = (box, imageWidth, imageHeight, paddingPercent = 0.28) => {
    const padX = Math.round(box.width * paddingPercent);
    const padY = Math.round(box.height * (paddingPercent * 1.15));

    const left = Math.max(0, box.x - padX);
    const top = Math.max(0, box.y - padY);
    const right = Math.min(imageWidth, box.x + box.width + padX);
    const bottom = Math.min(imageHeight, box.y + box.height + padY);

    return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    };
};

/**
 * Creates a blurred/pixelated image patch for a given region using sharp.
 */
const createRedactedPatch = async (orientedBaseBuffer, region) => {
    // Extract face region, apply heavy blur + pixelate for irreversible anonymization
    const patchBuffer = await sharp(orientedBaseBuffer)
        .extract({
            left: region.left,
            top: region.top,
            width: region.width,
            height: region.height,
        })
        .resize(Math.max(4, Math.round(region.width / 12)), Math.max(4, Math.round(region.height / 12)), { fit: 'fill' })
        .resize(region.width, region.height, { kernel: 'nearest' })
        .blur(16)
        .toBuffer();

    return {
        input: patchBuffer,
        left: region.left,
        top: region.top,
    };
};

/**
 * Generates a privacy-safe face-redacted image derivative from original evidence.
 * Strips all EXIF, GPS, and device metadata.
 * 
 * @param {Buffer} originalBuffer - Original image bytes from GridFS
 * @param {Object} options - Derivative options (preview width, quality, etc.)
 * @returns {Promise<{ buffer: Buffer, contentType: string, metadata: Object }>}
 */
export const generateRedactedEvidenceDerivative = async (originalBuffer, options = {}) => {
    const {
        maxPreviewWidth = 800,
        maxPreviewHeight = 600,
        quality = 82,
        expandPadding = 0.28,
    } = options;

    if (!originalBuffer || originalBuffer.length === 0) {
        throw new Error('Invalid image buffer');
    }

    try {
        // 1. Load image and auto-orient EXIF
        const baseSharp = sharp(originalBuffer).rotate();
        const orientedBuffer = await baseSharp.toBuffer();
        const baseMetadata = await sharp(orientedBuffer).metadata();
        const imgWidth = baseMetadata.width || 800;
        const imgHeight = baseMetadata.height || 600;

        // 2. Detect human faces
        let detectedFaces = [];
        try {
            detectedFaces = await detectFaces(orientedBuffer);
        } catch (detectErr) {
            console.warn('Face detection error, using fallback full blur:', detectErr.message);
            // On detector failure, fall back to safe full-image blur
            const fallbackBuffer = await sharp(orientedBuffer)
                .resize(maxPreviewWidth, maxPreviewHeight, { fit: 'inside', withoutEnlargement: true })
                .blur(32)
                .withMetadata(false)
                .jpeg({ quality: 75 })
                .toBuffer();

            return {
                buffer: fallbackBuffer,
                contentType: 'image/jpeg',
                metadata: {
                    redactionVersion: '1.0',
                    facesDetected: 0,
                    redactedRegions: 0,
                    privacyStatus: 'fallback_blurred',
                    fallbackApplied: true,
                },
            };
        }

        let processedPipeline = sharp(orientedBuffer);

        // 3. Redact detected faces if present
        if (detectedFaces.length > 0) {
            const composites = [];

            for (const face of detectedFaces) {
                const expandedRegion = expandBoundingBox(face, imgWidth, imgHeight, expandPadding);
                const patch = await createRedactedPatch(orientedBuffer, expandedRegion);
                composites.push(patch);
            }

            processedPipeline = processedPipeline.composite(composites);
        }

        // 4. Resize to safe preview size, strip all metadata/EXIF, and encode as optimized JPEG
        const derivativeBuffer = await processedPipeline
            .resize(maxPreviewWidth, maxPreviewHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

        return {
            buffer: derivativeBuffer,
            contentType: 'image/jpeg',
            metadata: {
                redactionVersion: '1.0',
                facesDetected: detectedFaces.length,
                redactedRegions: detectedFaces.length,
                privacyStatus: detectedFaces.length > 0 ? 'faces_redacted' : 'privacy_derivative',
                fallbackApplied: false,
            },
        };
    } catch (err) {
        console.error('Evidence derivative generation failed, generating SVG fallback:', err);
        // Absolute fallback if sharp fails: return safe SVG placeholder
        const svgFallback = generateBlurredEvidenceSvg(originalBuffer);
        return {
            buffer: svgFallback,
            contentType: 'image/svg+xml',
            metadata: {
                redactionVersion: '1.0',
                facesDetected: 0,
                redactedRegions: 0,
                privacyStatus: 'fallback_svg',
                fallbackApplied: true,
            },
        };
    }
};

export default {
    expandBoundingBox,
    generateRedactedEvidenceDerivative,
};
