import crypto from 'crypto';
import sharp from 'sharp';
import { detectFaces } from './faceDetectionService.js';
import { generateBlurredEvidenceSvg } from './previewService.js';

const DERIVATIVE_VERSION = '3.4';
const DETECTOR_VERSION = 'picojs-facefinder-2.3';

// In-memory cache for fast, deterministic derivative responses without re-decoding
const derivativeCache = new Map();
const inFlightDerivatives = new Map();
const MAX_CACHE_ENTRIES = 100;

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const finalizeDerivativeResult = (result, sourceHash) => ({
    ...result,
    metadata: {
        ...result.metadata,
        cacheHit: false,
        sourceHash: sourceHash || null,
        derivativeHash: hashBuffer(result.buffer),
        derivativeByteLength: result.buffer.length,
    },
});

const getCacheKey = (buffer, options) => {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const optStr = JSON.stringify(options || {});
    return `${DERIVATIVE_VERSION}_${DETECTOR_VERSION}_${hash}_${optStr}`;
};

const setCache = (key, value) => {
    if (derivativeCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = derivativeCache.keys().next().value;
        if (firstKey) derivativeCache.delete(firstKey);
    }
    derivativeCache.set(key, value);
};

/**
 * Expands a confirmed face box conservatively. Large padding creates false-looking
 * rectangular redactions and must never be used for normal or retry processing.
 */
export const expandBoundingBox = (box, imageWidth, imageHeight, paddingPercent = 0.18) => {
    const safeImageWidth = Math.max(1, Math.floor(Number(imageWidth) || 1));
    const safeImageHeight = Math.max(1, Math.floor(Number(imageHeight) || 1));
    const x = Math.max(0, Number(box?.x) || 0);
    const y = Math.max(0, Number(box?.y) || 0);
    const width = Math.max(1, Number(box?.width) || 1);
    const height = Math.max(1, Number(box?.height) || 1);
    const padX = Math.round(width * paddingPercent);
    const padY = Math.round(height * (paddingPercent * 1.3));

    const left = Math.min(safeImageWidth - 1, Math.max(0, Math.floor(x - padX)));
    const top = Math.min(safeImageHeight - 1, Math.max(0, Math.floor(y - padY)));
    const right = Math.min(safeImageWidth, Math.max(left + 1, Math.ceil(x + width + padX)));
    const bottom = Math.min(safeImageHeight, Math.max(top + 1, Math.ceil(y + height + padY)));

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
const createRedactedPatch = async (orientedBaseBuffer, region, options = {}) => {
    const {
        blur = 28,
        blockDivisor = 12,
    } = options;

    const safeRegion = {
        left: Math.max(0, Math.floor(region.left)),
        top: Math.max(0, Math.floor(region.top)),
        width: Math.max(1, Math.floor(region.width)),
        height: Math.max(1, Math.floor(region.height)),
    };

    // Extract face region, apply heavy blur + pixelate for irreversible anonymization
    const patchBuffer = await sharp(orientedBaseBuffer)
        .ensureAlpha()
        .extract({
            left: safeRegion.left,
            top: safeRegion.top,
            width: safeRegion.width,
            height: safeRegion.height,
        })
        .resize(Math.max(4, Math.round(safeRegion.width / blockDivisor)), Math.max(4, Math.round(safeRegion.height / blockDivisor)), { fit: 'fill' })
        .resize(safeRegion.width, safeRegion.height, { kernel: 'nearest' })
        .blur(blur)
        .toBuffer();

    return {
        input: patchBuffer,
        left: safeRegion.left,
        top: safeRegion.top,
    };
};

const createFullImageFallback = async (orientedBuffer, maxPreviewWidth, maxPreviewHeight) => (
    sharp(orientedBuffer)
        .resize(maxPreviewWidth, maxPreviewHeight, { fit: 'inside', withoutEnlargement: true })
        .blur(32)
        .jpeg({ quality: 75, mozjpeg: true })
        .toBuffer()
);

const createPublicSoftBlurDerivative = async (sourceBuffer, maxPreviewWidth, maxPreviewHeight, quality) => (
    sharp(sourceBuffer)
        .rotate()
        .resize(maxPreviewWidth, maxPreviewHeight, { fit: 'inside', withoutEnlargement: true })
        .blur(11)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
);

const generatePublicSoftBlurResult = async (originalBuffer, options, sourceHash, cacheKey) => {
    const {
        maxPreviewWidth = 1200,
        maxPreviewHeight = 900,
        quality = 85,
    } = options;

    const derivativeBuffer = await createPublicSoftBlurDerivative(
        originalBuffer,
        maxPreviewWidth,
        maxPreviewHeight,
        quality,
    );
    const result = finalizeDerivativeResult({
        buffer: derivativeBuffer,
        contentType: 'image/jpeg',
        metadata: {
            redactionVersion: DERIVATIVE_VERSION,
            detectorVersion: DETECTOR_VERSION,
            facesDetected: 0,
            redactedRegions: 1,
            detectionStatus: 'privacy_derivative',
            redactionType: 'public_soft_blur',
            privacyStatus: 'public_soft_blur',
            fallbackApplied: false,
        },
    }, sourceHash);
    setCache(cacheKey, result);
    return result;
};

const measureRegionDifference = async (originalBuffer, derivativeBuffer, region) => {
    try {
        const safeRegion = {
            left: Math.max(0, Math.floor(region.left)),
            top: Math.max(0, Math.floor(region.top)),
            width: Math.max(1, Math.floor(region.width)),
            height: Math.max(1, Math.floor(region.height)),
        };

        const [original, derivative] = await Promise.all([
            sharp(originalBuffer)
                .ensureAlpha()
                .extract(safeRegion)
                .raw()
                .toBuffer({ resolveWithObject: true }),
            sharp(derivativeBuffer)
                .ensureAlpha()
                .extract(safeRegion)
                .raw()
                .toBuffer({ resolveWithObject: true }),
        ]);

        if (
            original.info.width !== derivative.info.width
            || original.info.height !== derivative.info.height
            || original.info.channels !== derivative.info.channels
        ) {
            return { materiallyChanged: false, meanAbsoluteDifference: 0, changedPixelRatio: 0 };
        }

        let totalDifference = 0;
        let changedPixels = 0;
        const pixelCount = original.info.width * original.info.height;
        const channels = Math.min(original.info.channels, derivative.info.channels, 3);
        const sourceChannels = original.info.channels;

        for (let offset = 0; offset < original.data.length; offset += sourceChannels) {
            let pixelDifference = 0;
            for (let channel = 0; channel < channels; channel += 1) {
                pixelDifference += Math.abs(original.data[offset + channel] - derivative.data[offset + channel]);
            }
            const averageDifference = pixelDifference / channels;
            totalDifference += averageDifference;
            if (averageDifference >= 8) changedPixels += 1;
        }

        const meanAbsoluteDifference = pixelCount > 0 ? totalDifference / pixelCount : 0;
        const changedPixelRatio = pixelCount > 0 ? changedPixels / pixelCount : 0;

        return {
            materiallyChanged: meanAbsoluteDifference >= 8 && changedPixelRatio >= 0.08,
            meanAbsoluteDifference: Number(meanAbsoluteDifference.toFixed(2)),
            changedPixelRatio: Number(changedPixelRatio.toFixed(4)),
        };
    } catch (error) {
        return {
            materiallyChanged: false,
            meanAbsoluteDifference: 0,
            changedPixelRatio: 0,
            verificationError: error.message,
        };
    }
};

/**
 * Generates a privacy-safe face-redacted image derivative from original evidence.
 * Strips all EXIF, GPS, and device metadata.
 * Fail-closed: Never returns the original image on failure.
 * 
 * @param {Buffer} originalBuffer - Original image bytes from GridFS
 * @param {Object} options - Derivative options (preview width, quality, etc.)
 * @returns {Promise<{ buffer: Buffer, contentType: string, metadata: Object }>}
 */
export const generateRedactedEvidenceDerivative = async (originalBuffer, options = {}) => {
    const {
        maxPreviewWidth = 1200,
        maxPreviewHeight = 900,
        quality = 85,
            expandPadding = 0.18,
    } = options;

    if (!originalBuffer || !Buffer.isBuffer(originalBuffer) || originalBuffer.length === 0) {
        const svgFallback = generateBlurredEvidenceSvg(Buffer.from('empty'));
        return finalizeDerivativeResult({
            buffer: svgFallback,
            contentType: 'image/svg+xml',
            metadata: {
                redactionVersion: DERIVATIVE_VERSION,
                detectorVersion: DETECTOR_VERSION,
                facesDetected: 0,
                redactedRegions: 0,
                detectionStatus: 'invalid_image',
                redactionType: 'svg_fallback',
                privacyStatus: 'fallback_svg',
                fallbackApplied: true,
            },
        }, null);
    }

    const sourceHash = hashBuffer(originalBuffer);

    const cacheKey = getCacheKey(originalBuffer, options);
    if (derivativeCache.has(cacheKey)) {
        const cached = derivativeCache.get(cacheKey);
        return {
            ...cached,
            metadata: {
                ...cached.metadata,
                cacheHit: true,
            },
        };
    }

    if (options.publicSoftBlur === true) {
        const existingWork = inFlightDerivatives.get(cacheKey);
        if (existingWork) {
            const result = await existingWork;
            return { ...result, metadata: { ...result.metadata, cacheHit: true, inFlightReuse: true } };
        }

        const work = generatePublicSoftBlurResult(originalBuffer, options, sourceHash, cacheKey);
        inFlightDerivatives.set(cacheKey, work);
        try {
            return await work;
        } finally {
            inFlightDerivatives.delete(cacheKey);
        }
    }

    let orientedBuffer;
    let imgWidth = 800;
    let imgHeight = 600;

    try {
        // 1. Load image and auto-orient EXIF
        const { data: rotBytes, info: rotInfo } = await sharp(originalBuffer)
            .rotate()
            .toBuffer({ resolveWithObject: true });

        orientedBuffer = rotBytes;
        imgWidth = rotInfo.width;
        imgHeight = rotInfo.height;

        if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
            throw new Error('Invalid oriented dimensions');
        }
    } catch (decodeErr) {
        console.warn('Image decoding error, generating SVG fallback:', decodeErr.message);
        const svgFallback = generateBlurredEvidenceSvg(originalBuffer);
        const result = finalizeDerivativeResult({
            buffer: svgFallback,
            contentType: 'image/svg+xml',
            metadata: {
                redactionVersion: DERIVATIVE_VERSION,
                detectorVersion: DETECTOR_VERSION,
                facesDetected: 0,
                redactedRegions: 0,
                detectionStatus: 'invalid_image',
                redactionType: 'svg_fallback',
                privacyStatus: 'fallback_svg',
                fallbackApplied: true,
            },
        }, sourceHash);
        setCache(cacheKey, result);
        return result;
    }

    // 2. Detect human faces using structured detector for non-public/internal derivatives
    // The detector owns EXIF orientation and returns coordinates in its
    // auto-oriented coordinate space, which matches orientedBuffer below.
    // Passing the already-rotated buffer would discard the source orientation
    // signal and can turn a sideways/small face into a false no-face result.
    const detectionResult = await detectFaces(originalBuffer, options);

    // The public map viewer intentionally uses a complete soft-blur derivative.
    // This avoids exposing incorrect local detector boxes to unauthorized viewers.

    // 3. Handle Detector Failure
    if (detectionResult.status === 'detector_failed') {
        console.warn('Face detection failed, applying safe full-image blur');
        try {
            const fallbackBuffer = await sharp(orientedBuffer)
                .resize(maxPreviewWidth, maxPreviewHeight, { fit: 'inside', withoutEnlargement: true })
                .blur(32)
                .jpeg({ quality: 75 })
                .toBuffer();

            const result = finalizeDerivativeResult({
                buffer: fallbackBuffer,
                contentType: 'image/jpeg',
                metadata: {
                    redactionVersion: DERIVATIVE_VERSION,
                    detectorVersion: DETECTOR_VERSION,
                    facesDetected: 0,
                    redactedRegions: 0,
                    detectionStatus: 'detector_failed',
                    redactionType: 'fallback_blur',
                    privacyStatus: 'fallback_blurred',
                    fallbackApplied: true,
                    confidenceSummary: detectionResult.confidenceSummary,
                },
            }, sourceHash);
            setCache(cacheKey, result);
            return result;
        } catch {
            const svgFallback = generateBlurredEvidenceSvg(originalBuffer);
            const result = finalizeDerivativeResult({
                buffer: svgFallback,
                contentType: 'image/svg+xml',
                metadata: {
                    redactionVersion: DERIVATIVE_VERSION,
                    detectorVersion: DETECTOR_VERSION,
                    facesDetected: 0,
                    redactedRegions: 0,
                    detectionStatus: 'detector_failed',
                    redactionType: 'svg_fallback',
                    privacyStatus: 'fallback_svg',
                    fallbackApplied: true,
                },
            }, sourceHash);
            setCache(cacheKey, result);
            return result;
        }
    }

    // 4. Handle Invalid Image
    if (detectionResult.status === 'invalid_image') {
        const svgFallback = generateBlurredEvidenceSvg(originalBuffer);
        const result = finalizeDerivativeResult({
            buffer: svgFallback,
            contentType: 'image/svg+xml',
            metadata: {
                redactionVersion: DERIVATIVE_VERSION,
                detectorVersion: DETECTOR_VERSION,
                facesDetected: 0,
                redactedRegions: 0,
                detectionStatus: 'invalid_image',
                redactionType: 'svg_fallback',
                privacyStatus: 'fallback_svg',
                fallbackApplied: true,
            },
        }, sourceHash);
        setCache(cacheKey, result);
        return result;
    }

    // 5. Handle Successful Detection: Faces Detected or No Faces Detected
    let redactionAudit = [];
    try {
        let processedPipeline = sharp(orientedBuffer).ensureAlpha();
        const detectedFaces = detectionResult.faces || [];
        redactionAudit = [];

        if (detectedFaces.length > 0) {
            // 5a. Redact detected faces: background scene remains completely sharp
            const composites = [];
            for (const face of detectedFaces) {
                const expandedRegion = expandBoundingBox(face, imgWidth, imgHeight, expandPadding);
                const patch = await createRedactedPatch(orientedBuffer, expandedRegion);
                composites.push(patch);
                redactionAudit.push({
                    detectedRegion: {
                        x: Math.max(0, Math.floor(Number(face.x) || 0)),
                        y: Math.max(0, Math.floor(Number(face.y) || 0)),
                        width: Math.max(1, Math.floor(Number(face.width) || 1)),
                        height: Math.max(1, Math.floor(Number(face.height) || 1)),
                    },
                    expandedRegion,
                    composited: true,
                });
            }
            processedPipeline = processedPipeline.composite(composites);
        }

        // 5b. Materially verify every composite before resizing/encoding. This
        // protects against a coordinate-space bug silently serving a sharp face
        // while the UI claims the image was redacted.
        let redactedBaseBuffer = await processedPipeline.toBuffer();
        if (redactionAudit.length > 0) {
            for (const audit of redactionAudit) {
                // Verify the detector's actual face box. The expanded region is
                // intentionally larger and can contain unchanged background;
                // measuring only that larger box can create a false failure.
                const difference = await measureRegionDifference(orientedBuffer, redactedBaseBuffer, {
                    left: audit.detectedRegion.x,
                    top: audit.detectedRegion.y,
                    width: audit.detectedRegion.width,
                    height: audit.detectedRegion.height,
                });
                Object.assign(audit, difference);
            }

            if (redactionAudit.some((audit) => !audit.materiallyChanged)) {
                // Small/distant faces can produce a weak first patch. Retry with a
                // larger local region and a stronger pixelation pass before using
                // the full-image fail-closed fallback.
                const retryComposites = [];
                for (let index = 0; index < detectedFaces.length; index += 1) {
                    const face = detectedFaces[index];
                    const retryRegion = expandBoundingBox(
                        face,
                        imgWidth,
                        imgHeight,
                        Math.min(Math.max(expandPadding, 0.24), 0.28),
                    );
                    retryComposites.push(await createRedactedPatch(orientedBuffer, retryRegion, {
                        blur: 32,
                        blockDivisor: 10,
                    }));
                    redactionAudit[index] = {
                        ...redactionAudit[index],
                        expandedRegion: retryRegion,
                        retryApplied: true,
                        composited: true,
                    };
                }

                redactedBaseBuffer = await sharp(orientedBuffer)
                    .ensureAlpha()
                    .composite(retryComposites)
                    .toBuffer();

                for (const audit of redactionAudit) {
                    const difference = await measureRegionDifference(orientedBuffer, redactedBaseBuffer, {
                        left: audit.detectedRegion.x,
                        top: audit.detectedRegion.y,
                        width: audit.detectedRegion.width,
                        height: audit.detectedRegion.height,
                    });
                    Object.assign(audit, difference);
                }

                if (redactionAudit.some((audit) => !audit.materiallyChanged)) {
                    throw new Error('Redaction verification failed after local small-face retry');
                }
            }
        }

        // When detectedFaces.length === 0 (e.g. document images), the image is rendered sharp with NO blur applied.
        const derivativeBuffer = await sharp(redactedBaseBuffer)
            .resize(maxPreviewWidth, maxPreviewHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

        const isFacesDetected = detectedFaces.length > 0;
        const result = finalizeDerivativeResult({
            buffer: derivativeBuffer,
            contentType: 'image/jpeg',
            metadata: {
                redactionVersion: DERIVATIVE_VERSION,
                detectorVersion: DETECTOR_VERSION,
                facesDetected: detectedFaces.length,
                redactedRegions: detectedFaces.length,
                detectionStatus: isFacesDetected ? 'faces_detected' : 'no_faces_detected',
                redactionType: isFacesDetected ? 'face_blur' : 'none',
                privacyStatus: isFacesDetected ? 'faces_redacted' : 'privacy_derivative',
                confidenceSummary: detectionResult.confidenceSummary,
                redactionDiagnostics: redactionAudit,
                fallbackApplied: false,
            },
        }, sourceHash);

        setCache(cacheKey, result);
        return result;
    } catch (err) {
        console.error('Evidence derivative generation failed, applying full-image privacy fallback:', err.message);
        let fallbackBuffer;
        let fallbackContentType = 'image/jpeg';
        let fallbackMetadata = {
            redactionVersion: DERIVATIVE_VERSION,
            detectorVersion: DETECTOR_VERSION,
            facesDetected: detectionResult.faces?.length || 0,
            redactedRegions: 0,
            detectionStatus: 'derivative_failed',
            redactionType: 'fallback_blur',
            privacyStatus: 'fallback_blurred',
            redactionDiagnostics: {
                error: err.message,
                regions: redactionAudit,
            },
            fallbackApplied: true,
        };

        try {
            fallbackBuffer = await createFullImageFallback(orientedBuffer, maxPreviewWidth, maxPreviewHeight);
        } catch {
            fallbackBuffer = generateBlurredEvidenceSvg(originalBuffer);
            fallbackContentType = 'image/svg+xml';
            fallbackMetadata = {
                ...fallbackMetadata,
                redactionType: 'svg_fallback',
                privacyStatus: 'fallback_svg',
            };
        }

        const result = finalizeDerivativeResult({
            buffer: fallbackBuffer,
            contentType: fallbackContentType,
            metadata: fallbackMetadata,
        }, sourceHash);
        setCache(cacheKey, result);
        return result;
    }
};

export default {
    expandBoundingBox,
    generateRedactedEvidenceDerivative,
};
