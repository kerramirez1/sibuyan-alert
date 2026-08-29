const CASCADE_URL = '/cascades/facefinder';

let cascadeClassifier = null;
let cascadeLoadPromise = null;

/**
 * Pure ES Module implementation of the Pico decision-tree cascade classifier.
 * Unpacks the 8-bit binary cascade file format into a fast classifier function.
 */
export const unpackCascade = (bytes) => {
    const dview = new DataView(new ArrayBuffer(4));
    let p = 8;

    dview.setUint8(0, bytes[p + 0]);
    dview.setUint8(1, bytes[p + 1]);
    dview.setUint8(2, bytes[p + 2]);
    dview.setUint8(3, bytes[p + 3]);
    const tdepth = dview.getInt32(0, true);
    p += 4;

    dview.setUint8(0, bytes[p + 0]);
    dview.setUint8(1, bytes[p + 1]);
    dview.setUint8(2, bytes[p + 2]);
    dview.setUint8(3, bytes[p + 3]);
    const ntrees = dview.getInt32(0, true);
    p += 4;

    const tcodes = [];
    const tpreds = [];
    const thresh = [];
    for (let t = 0; t < ntrees; t += 1) {
        Array.prototype.push.apply(tcodes, [0, 0, 0, 0]);
        Array.prototype.push.apply(tcodes, bytes.slice(p, p + 4 * Math.pow(2, tdepth) - 4));
        p += 4 * Math.pow(2, tdepth) - 4;

        for (let i = 0; i < Math.pow(2, tdepth); i += 1) {
            dview.setUint8(0, bytes[p + 0]);
            dview.setUint8(1, bytes[p + 1]);
            dview.setUint8(2, bytes[p + 2]);
            dview.setUint8(3, bytes[p + 3]);
            tpreds.push(dview.getFloat32(0, true));
            p += 4;
        }

        dview.setUint8(0, bytes[p + 0]);
        dview.setUint8(1, bytes[p + 1]);
        dview.setUint8(2, bytes[p + 2]);
        dview.setUint8(3, bytes[p + 3]);
        thresh.push(dview.getFloat32(0, true));
        p += 4;
    }

    const tcodesArr = new Int8Array(tcodes);
    const tpredsArr = new Float32Array(tpreds);
    const threshArr = new Float32Array(thresh);

    return function classifyRegion(r, c, s, pixels, ldim) {
        let root = 0;
        let o = 0.0;
        const pow2tdepth = Math.pow(2, tdepth) >> 0;

        for (let i = 0; i < ntrees; i += 1) {
            let idx = 1;
            for (let j = 0; j < tdepth; j += 1) {
                idx = 2 * idx + (pixels[(((256 * r) + tcodesArr[root + 4 * idx + 0] * s) >> 8) * ldim + (((256 * c) + tcodesArr[root + 4 * idx + 1] * s) >> 8)] <= pixels[(((256 * r) + tcodesArr[root + 4 * idx + 2] * s) >> 8) * ldim + (((256 * c) + tcodesArr[root + 4 * idx + 3] * s) >> 8)] ? 1 : 0);
            }

            o += tpredsArr[pow2tdepth * i + idx - pow2tdepth];

            if (o <= threshArr[i]) return -1;

            root += 4 * pow2tdepth;
        }
        return o - threshArr[ntrees - 1];
    };
};

/**
 * Scans an image with the unpacked cascade across scale pyramid.
 */
export const runCascade = (image, classifyRegion, params) => {
    const { pixels, nrows, ncols, ldim } = image;
    const { shiftfactor, minsize, maxsize, scalefactor } = params;

    let scale = minsize;
    const detections = [];

    while (scale <= maxsize) {
        const step = Math.max(shiftfactor * scale, 1) >> 0;
        const offset = (scale / 2 + 1) >> 0;

        for (let r = offset; r <= nrows - offset; r += step) {
            for (let c = offset; c <= ncols - offset; c += step) {
                const q = classifyRegion(r, c, scale, pixels, ldim);
                if (q > 0.0) {
                    detections.push([r, c, scale, q]);
                }
            }
        }

        scale *= scalefactor;
    }

    return detections;
};

/**
 * Non-maximum suppression clustering of detected bounding boxes.
 */
export const clusterDetections = (dets, iouthreshold = 0.2) => {
    const sorted = [...dets].sort((a, b) => b[3] - a[3]);

    const calculateIoU = (det1, det2) => {
        const r1 = det1[0];
        const c1 = det1[1];
        const s1 = det1[2];
        const r2 = det2[0];
        const c2 = det2[1];
        const s2 = det2[2];
        const overr = Math.max(0, Math.min(r1 + s1 / 2, r2 + s2 / 2) - Math.max(r1 - s1 / 2, r2 - s2 / 2));
        const overc = Math.max(0, Math.min(c1 + s1 / 2, c2 + s2 / 2) - Math.max(c1 - s1 / 2, c2 - s2 / 2));
        return (overr * overc) / (s1 * s1 + s2 * s2 - overr * overc);
    };

    const assignments = new Uint8Array(sorted.length);
    const clusters = [];
    for (let i = 0; i < sorted.length; i += 1) {
        if (assignments[i] === 0) {
            let r = 0.0;
            let c = 0.0;
            let s = 0.0;
            let q = 0.0;
            let n = 0;
            for (let j = i; j < sorted.length; j += 1) {
                if (calculateIoU(sorted[i], sorted[j]) > iouthreshold) {
                    assignments[j] = 1;
                    r += sorted[j][0];
                    c += sorted[j][1];
                    s += sorted[j][2];
                    q += sorted[j][3];
                    n += 1;
                }
            }
            clusters.push([r / n, c / n, s / n, q]);
        }
    }

    return clusters;
};

/**
 * Converts RGBA pixels array to an 8-bit grayscale Uint8Array for cascade processing.
 */
export const rgbaToGrayscale = (rgba, width, height) => {
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i += 1) {
        const offset = i * 4;
        // Standard ITU-R BT.601 luminance weights
        gray[i] = (299 * rgba[offset] + 587 * rgba[offset + 1] + 114 * rgba[offset + 2]) / 1000;
    }
    return gray;
};

/**
 * Calculates mean pixel luminance within a region of interest to detect severe underexposure.
 */
export const calculateRegionBrightness = (grayPixels, frameWidth, x, y, width, height) => {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(frameWidth, Math.ceil(x + width));
    const endY = Math.min(Math.floor(grayPixels.length / frameWidth), Math.ceil(y + height));

    if (endX <= startX || endY <= startY) return 128;

    let total = 0;
    let count = 0;
    for (let row = startY; row < endY; row += 2) {
        const rowOffset = row * frameWidth;
        for (let col = startX; col < endX; col += 2) {
            total += grayPixels[rowOffset + col];
            count += 1;
        }
    }
    return count > 0 ? total / count : 128;
};

/**
 * Loads and unpacks the facefinder cascade file into memory.
 */
export const initPicoDetector = async (customFetch = globalThis.fetch) => {
    if (cascadeClassifier) return cascadeClassifier;

    if (!cascadeLoadPromise) {
        cascadeLoadPromise = (async () => {
            try {
                const response = await customFetch(CASCADE_URL);
                if (!response.ok) {
                    throw new Error(`Cascade fetch failed with status ${response.status}`);
                }
                const buffer = await response.arrayBuffer();
                cascadeClassifier = unpackCascade(new Uint8Array(buffer));
                return cascadeClassifier;
            } catch (error) {
                console.warn('Failed to load client face detection cascade:', error);
                cascadeLoadPromise = null;
                return null;
            }
        })();
    }

    return cascadeLoadPromise;
};

/**
 * Normalizes and evaluates detected face geometry against positioning, distance, and lighting criteria.
 */
export const evaluateFaceQuality = ({
    faces = [],
    frameWidth = 640,
    frameHeight = 480,
    grayPixels = null,
    minConfidence = 4.5,
    minSizeRatio = 0.22,
    maxSizeRatio = 0.78,
    centerToleranceX = 0.16,
    centerToleranceY = 0.18,
    minBrightness = 30,
} = {}) => {
    const validFaces = faces.filter((face) => (face.confidence ?? 10) >= minConfidence);

    if (validFaces.length === 0) {
        return {
            status: 'no_face',
            message: 'No face detected',
            guideState: 'searching',
            valid: false,
            faceCount: 0,
        };
    }

    if (validFaces.length > 1) {
        return {
            status: 'multiple_faces',
            message: 'Make sure only one person is visible',
            guideState: 'warning',
            valid: false,
            faceCount: validFaces.length,
        };
    }

    const face = validFaces[0];
    const size = face.size || face.height || face.width || 0;
    const x = face.x ?? (face.col ? face.col - size / 2 : 0);
    const y = face.y ?? (face.row ? face.row - size / 2 : 0);
    const width = face.width || size;
    const height = face.height || size;

    const centerX = (x + width / 2) / frameWidth;
    const centerY = (y + height / 2) / frameHeight;
    const sizeRatio = Math.max(width, height) / frameHeight;

    // Check lighting if grayscale pixels are provided
    if (grayPixels && grayPixels.length > 0) {
        const faceBrightness = calculateRegionBrightness(grayPixels, frameWidth, x, y, width, height);
        if (faceBrightness < minBrightness) {
            return {
                status: 'too_dark',
                message: 'Lighting is too dark',
                guideState: 'warning',
                valid: false,
                faceCount: 1,
                brightness: faceBrightness,
            };
        }
    }

    // Check distance / sizing ratio relative to frame height
    if (sizeRatio < minSizeRatio) {
        return {
            status: 'too_far',
            message: 'Move closer',
            guideState: 'warning',
            valid: false,
            faceCount: 1,
            sizeRatio,
        };
    }
    if (sizeRatio > maxSizeRatio) {
        return {
            status: 'too_close',
            message: 'Move back',
            guideState: 'warning',
            valid: false,
            faceCount: 1,
            sizeRatio,
        };
    }

    // Check centering inside guide oval (ideal center ~ 0.50 X, 0.48 Y)
    const targetCenterX = 0.50;
    const targetCenterY = 0.48;
    const deltaX = Math.abs(centerX - targetCenterX);
    const deltaY = Math.abs(centerY - targetCenterY);

    if (deltaX > centerToleranceX || deltaY > centerToleranceY) {
        return {
            status: 'not_centered',
            message: 'Center your face',
            guideState: 'warning',
            valid: false,
            faceCount: 1,
            centerX,
            centerY,
        };
    }

    // All quality criteria passed: single, centered, well-sized, well-lit face
    return {
        status: 'valid_face',
        message: 'Hold still',
        guideState: 'aligned',
        valid: true,
        faceCount: 1,
        face: {
            x,
            y,
            width,
            height,
            centerX,
            centerY,
            sizeRatio,
            confidence: face.confidence ?? 10,
        },
    };
};

/**
 * Scans a video element frame on an internal downscaled canvas and evaluates face presence.
 */
export const scanVideoFrame = async (videoElement, scratchCanvas, options = {}) => {
    if (!videoElement || !scratchCanvas || !videoElement.videoWidth || !videoElement.videoHeight) {
        return { status: 'idle', message: '', guideState: 'neutral', valid: false };
    }

    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;

    // Scale frame down for ultra-fast <10ms execution
    const maxDim = options.maxScanDimension || 320;
    const scale = Math.min(1, maxDim / Math.max(videoWidth, videoHeight));
    const scanWidth = Math.round(videoWidth * scale);
    const scanHeight = Math.round(videoHeight * scale);

    scratchCanvas.width = scanWidth;
    scratchCanvas.height = scanHeight;
    const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        return { status: 'idle', message: '', guideState: 'neutral', valid: false };
    }

    // Mirror image on canvas to match user-facing preview
    ctx.drawImage(videoElement, 0, 0, scanWidth, scanHeight);

    // 1. Try native Shape Detection API if available
    if (typeof window !== 'undefined' && 'FaceDetector' in window && !options.forcePico) {
        try {
            const detector = new window.FaceDetector({ maxDetectedFaces: 3, fastMode: true });
            const nativeDetections = await detector.detect(scratchCanvas);
            const faces = nativeDetections.map((d) => ({
                x: d.boundingBox.x,
                y: d.boundingBox.y,
                width: d.boundingBox.width,
                height: d.boundingBox.height,
                confidence: 10,
            }));

            const imgData = ctx.getImageData(0, 0, scanWidth, scanHeight);
            const gray = rgbaToGrayscale(imgData.data, scanWidth, scanHeight);

            return evaluateFaceQuality({
                faces,
                frameWidth: scanWidth,
                frameHeight: scanHeight,
                grayPixels: gray,
                ...options,
            });
        } catch {
            // Fall through to cascade
        }
    }

    // 2. Cascade classifier
    const classify = await initPicoDetector(options.customFetch);
    if (!classify) {
        return {
            status: 'detector_unavailable',
            message: 'Position your face in the guide',
            guideState: 'neutral',
            valid: false,
        };
    }

    const imgData = ctx.getImageData(0, 0, scanWidth, scanHeight);
    const gray = rgbaToGrayscale(imgData.data, scanWidth, scanHeight);

    const imageObj = {
        pixels: gray,
        nrows: scanHeight,
        ncols: scanWidth,
        ldim: scanWidth,
    };

    const params = {
        shiftfactor: 0.1,
        minsize: Math.round(Math.min(scanWidth, scanHeight) * 0.18),
        maxsize: Math.round(Math.min(scanWidth, scanHeight) * 0.85),
        scalefactor: 1.1,
    };

    const rawDetections = runCascade(imageObj, classify, params) || [];
    const clustered = clusterDetections(rawDetections, 0.2);

    const faces = clustered.map(([row, col, size, confidence]) => ({
        row,
        col,
        size,
        confidence,
        x: col - size / 2,
        y: row - size / 2,
        width: size,
        height: size,
    }));

    return evaluateFaceQuality({
        faces,
        frameWidth: scanWidth,
        frameHeight: scanHeight,
        grayPixels: gray,
        ...options,
    });
};

export default {
    unpackCascade,
    runCascade,
    clusterDetections,
    rgbaToGrayscale,
    calculateRegionBrightness,
    initPicoDetector,
    evaluateFaceQuality,
    scanVideoFrame,
};
