import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pico from 'picojs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to pre-trained cascade file
const CASCADE_PATH = path.resolve(__dirname, '../cascades/facefinder');
const DETECTOR_VERSION = 'picojs-facefinder-2.3';

let classifierFunction = null;
let cascadeLoadPromise = null;

/**
 * Initializes and caches the pico cascade classifier.
 */
export const initFaceDetector = async () => {
    if (classifierFunction) return classifierFunction;

    if (!cascadeLoadPromise) {
        cascadeLoadPromise = (async () => {
            try {
                let cascadeBuffer;
                if (fs.existsSync(CASCADE_PATH)) {
                    cascadeBuffer = fs.readFileSync(CASCADE_PATH);
                } else {
                    const res = await fetch('https://raw.githubusercontent.com/nenadmarkus/pico/master/rnt/cascades/facefinder', {
                        signal: AbortSignal.timeout(8000),
                    });
                    if (!res.ok) {
                        throw new Error(`Face cascade download failed: HTTP ${res.status}`);
                    }
                    const arrayBuffer = await res.arrayBuffer();
                    if (!arrayBuffer || arrayBuffer.byteLength < 1024) {
                        throw new Error('Face cascade download returned an invalid payload');
                    }
                    cascadeBuffer = Buffer.from(arrayBuffer);
                    const { promises: fsPromises } = await import('fs');
                    await fsPromises.mkdir(path.dirname(CASCADE_PATH), { recursive: true });
                    const tempPath = `${CASCADE_PATH}.tmp`;
                    await fsPromises.writeFile(tempPath, cascadeBuffer);
                    await fsPromises.rename(tempPath, CASCADE_PATH);
                }

                classifierFunction = pico.unpack_cascade(new Uint8Array(cascadeBuffer));
                return classifierFunction;
            } catch (err) {
                console.error('Failed to load face detection cascade:', err);
                // MVP: never poison the cache — allow the next registration to
                // retry instead of 503-ing forever on one bad download.
                cascadeLoadPromise = null;
                return null;
            }
        })();
    }

    return cascadeLoadPromise;
};

/**
 * Converts RGBA image buffer to 8-bit grayscale array for picojs cascade processing.
 */
const rgbaToGrayscale = (rgbaBuffer, width, height) => {
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) {
        const offset = i * 4;
        // Standard ITU-R BT.601 luminance weights: 0.299 R + 0.587 G + 0.114 B
        gray[i] = (299 * rgbaBuffer[offset] + 587 * rgbaBuffer[offset + 1] + 114 * rgbaBuffer[offset + 2]) / 1000;
    }
    return gray;
};

/**
 * Runs a single detection pass over a grayscale image buffer.
 */
const runSingleScanPass = (grayPixels, width, height, classify, cascadeParams) => {
    const imageObj = {
        pixels: grayPixels,
        nrows: height,
        ncols: width,
        ldim: width,
    };
    return pico.run_cascade(imageObj, classify, cascadeParams) || [];
};

const mapRotatedDetectionToStandardScan = (detection, angle, standardWidth, standardHeight) => {
    const [row, col, size, confidence] = detection;
    const x = col - (size / 2);
    const y = row - (size / 2);
    let mappedX = x;
    let mappedY = y;

    if (angle === 90) {
        mappedX = y;
        mappedY = standardHeight - (x + size);
    } else if (angle === 270) {
        mappedX = standardWidth - (y + size);
        mappedY = x;
    } else if (angle === 180) {
        mappedX = standardWidth - (x + size);
        mappedY = standardHeight - (y + size);
    }

    return [mappedY + (size / 2), mappedX + (size / 2), size, confidence];
};

/**
 * Detects faces in an image buffer using local picojs decision-tree cascade with
 * multi-scale scanning, EXIF-orientation safety, and contrast-normalized secondary passes.
 * 
 * Returns a structured result:
 * {
 *   status: 'faces_detected' | 'no_faces_detected' | 'detector_failed' | 'invalid_image',
 *   faces: Array<{ x: number, y: number, width: number, height: number, confidence: number }>,
 *   detectorVersion: string,
 *   confidenceSummary: { maxConfidence: number, faceCount: number, averageConfidence: number },
 *   diagnostics: { ... }
 * }
 * 
 * @param {Buffer} imageBuffer - Raw image buffer (JPEG, PNG, WebP, etc.)
 * @param {Object} options - Detection configuration
 * @param {boolean} [options.fastMode=false] - Single-pass ≤800px gate for
 *   latency-sensitive flows (registration). Same fail-closed thresholds.
 * @returns {Promise<Object>} Structured detection result
 */
export const detectFaces = async (imageBuffer, options = {}) => {
    const {
        maxDimension = 1200,
        shiftFactor = 0.05,
        minSize = 16,
        maxSize = 1200,
        scaleFactor = 1.08,
        iouThreshold = 0.2,
        // picojs returns a raw cascade score. Values below 5 are usually weak
        // background false positives and must not be treated as a verified face.
        minConfidence = 5,
        minConfirmedConfidence = 6,
        // Upper bound on an accepted face's projected size relative to the
        // frame. The evidence-redaction flow keeps the strict 0.55 default so
        // oversized detections (e.g. a face on a poster) are never treated as
        // real faces; the registration/resubmit selfie gates pass 0.8 to align
        // with the client capture gate (0.78) plus a small margin.
        maxFaceSizeRatio = 0.55,
        // Fast mode for latency-sensitive flows (e.g. registration selfie
        // gate). Runs the single standard-grayscale pass at <=800px and skips
        // the contrast-normalization and multi-rotation passes. Same
        // confidence/quality gates are enforced — only recall on sideways or
        // severely underexposed photos is reduced.
        fastMode = false,
    } = options;
    const effectiveMaxDimension = fastMode ? Math.min(maxDimension, 800) : maxDimension;

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        return {
            status: 'invalid_image',
            faces: [],
            detectorVersion: DETECTOR_VERSION,
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
            diagnostics: { error: 'Empty or invalid image buffer' },
        };
    }

    let classify;
    try {
        classify = await initFaceDetector();
    } catch (initErr) {
        console.error('Face detector initialization failed:', initErr);
        return {
            status: 'detector_failed',
            faces: [],
            detectorVersion: DETECTOR_VERSION,
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
            diagnostics: { error: initErr.message },
        };
    }

    if (!classify) {
        return {
            status: 'detector_failed',
            faces: [],
            detectorVersion: DETECTOR_VERSION,
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
            diagnostics: { error: 'Cascade classifier function unavailable' },
        };
    }

    let orientedWidth = 800;
    let orientedHeight = 600;
    let orientedBuffer;
    let sourceOrientation = 1;

    try {
        // 1. Auto-orient according to EXIF and get true rotated dimensions
        sourceOrientation = (await sharp(imageBuffer).metadata()).orientation || 1;
        const { data: rotatedBytes, info: rotatedInfo } = await sharp(imageBuffer)
            .rotate()
            .toBuffer({ resolveWithObject: true });

        orientedBuffer = rotatedBytes;
        orientedWidth = rotatedInfo.width;
        orientedHeight = rotatedInfo.height;

        if (!orientedWidth || !orientedHeight || orientedWidth <= 0 || orientedHeight <= 0) {
            return {
                status: 'invalid_image',
                faces: [],
                detectorVersion: DETECTOR_VERSION,
                confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
                diagnostics: { error: 'Invalid rotated image dimensions' },
            };
        }
    } catch (sharpErr) {
        console.warn('Failed to decode/orient image for face detection:', sharpErr.message);
        return {
            status: 'invalid_image',
            faces: [],
            detectorVersion: DETECTOR_VERSION,
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
            diagnostics: { error: sharpErr.message },
        };
    }

    try {
        // 2. Scale down proportionally for fast and accurate multi-scale scanning
        let scanWidth = orientedWidth;
        let scanHeight = orientedHeight;
        let scaleRatioX = 1.0;
        let scaleRatioY = 1.0;

        if (Math.max(orientedWidth, orientedHeight) > effectiveMaxDimension) {
            if (orientedWidth >= orientedHeight) {
                scanWidth = effectiveMaxDimension;
                scanHeight = Math.max(1, Math.round((orientedHeight * effectiveMaxDimension) / orientedWidth));
            } else {
                scanHeight = effectiveMaxDimension;
                scanWidth = Math.max(1, Math.round((orientedWidth * effectiveMaxDimension) / orientedHeight));
            }
            scaleRatioX = orientedWidth / scanWidth;
            scaleRatioY = orientedHeight / scanHeight;
        }

        const cascadeParams = {
            shiftfactor: shiftFactor,
            minsize: Math.max(16, minSize),
            maxsize: Math.min(maxSize, Math.min(scanWidth, scanHeight)),
            scalefactor: scaleFactor,
        };

        const passesRun = [];
        let allRawDetections = [];

        // Pass 1: Standard contrast RGB -> Grayscale
        const { data: rgbaData, info: scanInfo } = await sharp(orientedBuffer)
            .resize(scanWidth, scanHeight, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const grayPixels = rgbaToGrayscale(rgbaData, scanInfo.width, scanInfo.height);
        const pass1Detections = runSingleScanPass(grayPixels, scanInfo.width, scanInfo.height, classify, cascadeParams);
        passesRun.push('standard_grayscale');
        allRawDetections = [...allRawDetections, ...pass1Detections];

        const hasStrongCandidate = () => allRawDetections.some(([, , , confidence]) => confidence >= minConfidence);

        // Pass 2: Enhanced contrast / normalization pass when the first pass
        // only produced weak candidates. This prevents a weak background hit
        // from suppressing a real face found after normalization.
        // Skipped in fastMode: latency-sensitive gates accept the small
        // recall trade-off and instruct the user to retake in good lighting.
        if (!fastMode && !hasStrongCandidate() && (
            sourceOrientation !== 1
            || allRawDetections.length > 0
            || Math.max(scanWidth, scanHeight) >= 900
        )) {
            try {
                const { data: normRgba, info: normInfo } = await sharp(orientedBuffer)
                    .resize(scanWidth, scanHeight, { fit: 'fill' })
                    .normalize()
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                const normGray = rgbaToGrayscale(normRgba, normInfo.width, normInfo.height);
                const pass2Detections = runSingleScanPass(normGray, normInfo.width, normInfo.height, classify, cascadeParams);
                if (pass2Detections && pass2Detections.length > 0) {
                    passesRun.push('normalized_contrast');
                    allRawDetections = [...allRawDetections, ...pass2Detections];
                }
            } catch {
                // Secondary pass is best-effort enhancement
            }
        }

        // Pass 3: Multi-rotation pass (in case image was saved sideways without EXIF tags).
        // A sideways portrait needs the 90/270 passes even when the normal scan
        // is empty. The 180 pass is reserved for larger real-world images to
        // avoid spending several seconds rotating clean document photos.
        // Skipped in fastMode for the same latency reason as Pass 2.
        if (!fastMode && !hasStrongCandidate() && (sourceOrientation !== 1 || allRawDetections.length > 0)) {
            const rotationAngles = Math.max(scanWidth, scanHeight) >= 900 ? [90, 270, 180] : [90, 270];
            for (const angle of rotationAngles) {
                try {
                    const rotationWidth = angle === 90 || angle === 270 ? scanHeight : scanWidth;
                    const rotationHeight = angle === 90 || angle === 270 ? scanWidth : scanHeight;
                    const { data: rotRgba, info: rotInfo } = await sharp(orientedBuffer)
                        .rotate(angle)
                        .resize(rotationWidth, rotationHeight, { fit: 'fill' })
                        .ensureAlpha()
                        .raw()
                        .toBuffer({ resolveWithObject: true });

                    const rotGray = rgbaToGrayscale(rotRgba, rotInfo.width, rotInfo.height);
                    const rotDetections = runSingleScanPass(rotGray, rotInfo.width, rotInfo.height, classify, cascadeParams);

                    if (rotDetections && rotDetections.length > 0) {
                        passesRun.push(`rotated_${angle}deg`);
                        // Map the complete square detection box from rotated
                        // scan space back into the standard scan coordinate space.
                        for (const detection of rotDetections) {
                            allRawDetections.push(mapRotatedDetectionToStandardScan(
                                detection,
                                angle,
                                scanWidth,
                                scanHeight,
                            ));
                        }
                        if (hasStrongCandidate()) break;
                    }
                } catch {
                    // Best-effort orientation scan
                }
            }
        }

        // 3. Cluster overlapping candidate detections
        const clusteredDetections = pico.cluster_detections(allRawDetections, iouThreshold);

        // 4. Filter by confidence and project coordinates back to original oriented image size
        const faces = [];
        const rejectedDetections = [];
        const imageArea = orientedWidth * orientedHeight;
        for (const det of clusteredDetections) {
            const [row, col, size, confidence] = det;

            if (confidence >= minConfidence) {
                const scanRadius = size / 2;
                const scanX = Math.max(0, col - scanRadius);
                const scanY = Math.max(0, row - scanRadius);

                // Project back to original oriented dimensions
                const origX = Math.round(scanX * scaleRatioX);
                const origY = Math.round(scanY * scaleRatioY);
                const origWidth = Math.max(1, Math.round(size * scaleRatioX));
                const origHeight = Math.max(1, Math.round(size * scaleRatioY));
                const safeX = Math.max(0, Math.min(origX, orientedWidth - 1));
                const safeY = Math.max(0, Math.min(origY, orientedHeight - 1));

                const projectedWidth = Math.min(origWidth, orientedWidth - safeX);
                const projectedHeight = Math.min(origHeight, orientedHeight - safeY);
                const aspectRatio = projectedWidth / Math.max(1, projectedHeight);
                const areaRatio = (projectedWidth * projectedHeight) / imageArea;
                const qualityReasons = [];
                if (confidence < minConfirmedConfidence) qualityReasons.push('weak_confidence');
                if (projectedWidth < 18 || projectedHeight < 18) qualityReasons.push('too_small');
                if (aspectRatio < 0.55 || aspectRatio > 1.8) qualityReasons.push('implausible_aspect_ratio');
                const maxFacePixels = Math.min(orientedWidth, orientedHeight) * maxFaceSizeRatio;
                if (projectedWidth > maxFacePixels || projectedHeight > maxFacePixels) {
                    qualityReasons.push('oversized_candidate');
                }
                if (safeX + projectedWidth > orientedWidth || safeY + projectedHeight > orientedHeight) {
                    qualityReasons.push('out_of_bounds');
                }

                const candidate = {
                    x: safeX,
                    y: safeY,
                    width: projectedWidth,
                    height: projectedHeight,
                    confidence: Math.round(confidence * 100) / 100,
                    aspectRatio: Math.round(aspectRatio * 1000) / 1000,
                    areaRatio: Math.round(areaRatio * 100000) / 100000,
                };

                if (qualityReasons.length === 0) faces.push(candidate);
                else rejectedDetections.push({ ...candidate, reasons: qualityReasons });
            }
        }

        // When every detection was quality-gated out, surface the dominant
        // rejection reason as a single enum string (never raw diagnostics) so
        // callers can give the user an actionable message.
        let qualityRejection;
        if (faces.length === 0 && rejectedDetections.length > 0) {
            const reasonCounts = {};
            for (const rejected of rejectedDetections) {
                for (const reason of rejected.reasons || []) {
                    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                }
            }
            const ranked = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
            qualityRejection = ranked.length > 0 ? ranked[0][0] : undefined;
        }

        const maxConfidence = faces.reduce((max, f) => Math.max(max, f.confidence), 0);
        const totalConfidence = faces.reduce((sum, f) => sum + f.confidence, 0);
        const averageConfidence = faces.length > 0 ? Math.round((totalConfidence / faces.length) * 100) / 100 : 0;

        const diagnostics = {
            rawDetectionsCount: allRawDetections.length,
            clusteredDetectionsCount: clusteredDetections.length,
            acceptedDetectionsCount: faces.length,
            maxConfidence,
            averageConfidence,
            orientedDimensions: { width: orientedWidth, height: orientedHeight },
            scanDimensions: { width: scanWidth, height: scanHeight },
            scaleRatio: scaleRatioX,
            scaleRatioX,
            scaleRatioY,
            thresholdUsed: minConfidence,
            confirmedThresholdUsed: minConfirmedConfidence,
            rejectedDetections,
            passesRun,
            fastMode,
        };

        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.log(`🔍 [FaceDetector] Scan complete: ${faces.length} face(s) found (raw: ${allRawDetections.length}, passes: ${passesRun.join(', ')})`);
        }

        return {
            status: faces.length > 0 ? 'faces_detected' : 'no_faces_detected',
            faces,
            // Single dominant quality-gate rejection reason (or undefined).
            // Raw diagnostics stay server-side; this is safe to map to a
            // user-facing message.
            qualityRejection,
            detectorVersion: DETECTOR_VERSION,
            confidenceSummary: {
                maxConfidence,
                faceCount: faces.length,
                averageConfidence,
            },
            diagnostics,
        };
    } catch (runErr) {
        console.error('Error during face detection execution:', runErr);
        return {
            status: 'detector_failed',
            faces: [],
            detectorVersion: DETECTOR_VERSION,
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
            diagnostics: { error: runErr.message },
        };
    }
};

export default {
    initFaceDetector,
    detectFaces,
};
