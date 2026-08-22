import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pico from 'picojs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to pre-trained cascade file
const CASCADE_PATH = path.resolve(__dirname, '../cascades/facefinder');

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
                    // Fetch if missing during initial setup
                    const res = await fetch('https://raw.githubusercontent.com/nenadmarkus/pico/master/rnt/cascades/facefinder');
                    const arrayBuffer = await res.arrayBuffer();
                    cascadeBuffer = Buffer.from(arrayBuffer);
                    fs.mkdirSync(path.dirname(CASCADE_PATH), { recursive: true });
                    fs.writeFileSync(CASCADE_PATH, cascadeBuffer);
                }

                classifierFunction = pico.unpack_cascade(new Uint8Array(cascadeBuffer));
                return classifierFunction;
            } catch (err) {
                console.error('Failed to load face detection cascade:', err);
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
        // Standard luminance weights: 0.299 R + 0.587 G + 0.114 B (approx (2R + 7G + 1B)/10)
        gray[i] = (2 * rgbaBuffer[offset] + 7 * rgbaBuffer[offset + 1] + rgbaBuffer[offset + 2]) / 10;
    }
    return gray;
};

/**
 * Detects faces in an image buffer using local picojs decision-tree cascade.
 * 
 * @param {Buffer} imageBuffer - Raw image buffer (JPEG, PNG, WebP, etc.)
 * @param {Object} options - Detection configuration
 * @returns {Promise<Array<{ x: number, y: number, width: number, height: number, confidence: number }>>}
 */
export const detectFaces = async (imageBuffer, options = {}) => {
    const {
        maxDimension = 800,
        shiftFactor = 0.08,
        minSize = 24,
        maxSize = 1000,
        scaleFactor = 1.1,
        iouThreshold = 0.2,
        minConfidence = 2.0,
    } = options;

    if (!imageBuffer || imageBuffer.length === 0) {
        return [];
    }

    const classify = await initFaceDetector();
    if (!classify) {
        throw new Error('Face detector classifier not available');
    }

    // 1. Load and auto-orient with sharp
    const sharpInstance = sharp(imageBuffer).rotate();
    const metadata = await sharpInstance.metadata();
    const origWidth = metadata.width || 800;
    const origHeight = metadata.height || 600;

    // 2. Scale down for fast, accurate scanning if larger than maxDimension
    let scanWidth = origWidth;
    let scanHeight = origHeight;
    let scaleRatio = 1.0;

    if (Math.max(origWidth, origHeight) > maxDimension) {
        if (origWidth >= origHeight) {
            scanWidth = maxDimension;
            scanHeight = Math.round((origHeight * maxDimension) / origWidth);
        } else {
            scanHeight = maxDimension;
            scanWidth = Math.round((origWidth * maxDimension) / origHeight);
        }
        scaleRatio = origWidth / scanWidth;
    }

    const { data: rgbaData, info } = await sharpInstance
        .resize(scanWidth, scanHeight, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // 3. Convert to grayscale
    const grayPixels = rgbaToGrayscale(rgbaData, info.width, info.height);

    const imageObj = {
        pixels: grayPixels,
        nrows: info.height,
        ncols: info.width,
        ldim: info.width,
    };

    const cascadeParams = {
        shiftfactor: shiftFactor,
        minsize: minSize,
        maxsize: maxSize,
        scalefactor: scaleFactor,
    };

    // 4. Run cascade across scan scales
    const rawDetections = pico.run_cascade(imageObj, classify, cascadeParams);

    // 5. Cluster overlapping candidate detections
    const clusteredDetections = pico.cluster_detections(rawDetections, iouThreshold);

    // 6. Filter by confidence and project coordinates back to original image size
    const faces = [];
    for (const det of clusteredDetections) {
        const [row, col, size, confidence] = det;

        if (confidence >= minConfidence) {
            const scanRadius = size / 2;
            const scanX = Math.max(0, col - scanRadius);
            const scanY = Math.max(0, row - scanRadius);

            // Project back to original dimensions
            const origX = Math.round(scanX * scaleRatio);
            const origY = Math.round(scanY * scaleRatio);
            const origSize = Math.round(size * scaleRatio);

            faces.push({
                x: Math.max(0, Math.min(origX, origWidth - 1)),
                y: Math.max(0, Math.min(origY, origHeight - 1)),
                width: Math.min(origSize, origWidth - origX),
                height: Math.min(origSize, origHeight - origY),
                confidence: Math.round(confidence * 100) / 100,
            });
        }
    }

    return faces;
};

export default {
    initFaceDetector,
    detectFaces,
};
