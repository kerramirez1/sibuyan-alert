export const ID_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const ID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_ID_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_ID_IMAGE_WIDTH = 480;
export const MIN_ID_IMAGE_HEIGHT = 300;

export const MAX_OUTPUT_EDGE = 1600;
export const ID_MAX_OUTPUT_EDGE = 2000;
export const SELFIE_MAX_OUTPUT_EDGE = 1280;
const MAX_IMAGE_PIXELS = 40_000_000;
// Per-subject quality: ID text must stay readable for manual admin review,
// selfies only need face clarity. Lower than the previous 0.92 to halve
// upload size on slow island connections.
export const ID_JPEG_QUALITY = 0.85;
export const SELFIE_JPEG_QUALITY = 0.8;

const validateVerificationImageFile = (file, subject) => {
    if (!file) return `Choose or take a photo of your ${subject}.`;
    if (!ID_IMAGE_TYPES.has(file.type)) return 'Use a JPG, PNG, or WebP image.';
    if (file.size <= 0) return 'The selected image is empty.';
    if (file.size > MAX_ID_IMAGE_BYTES) return `The ${subject} photo must be 5 MB or smaller.`;
    return '';
};

export const validateIdentityImageFile = (file) => validateVerificationImageFile(file, 'ID');

const loadImage = (file) => new Promise((resolve, reject) => {
    try {
        if (!(file instanceof Blob)) {
            reject(new Error('The selected file is not a valid image. Try another photo.'));
            return;
        }
        if (typeof URL?.createObjectURL !== 'function' || typeof Image === 'undefined') {
            reject(new Error('Image preview is not supported in this browser. Try another device.'));
            return;
        }
        const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected image could not be read. Try another photo.'));
    };
    image.src = objectUrl;
    } catch (error) {
        reject(error instanceof Error ? error : new Error('The selected image could not be read. Try another photo.'));
    }
});

const toBlob = (canvas, quality) => new Promise((resolve, reject) => {
    canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('The ID photo could not be prepared. Try again.')),
        'image/jpeg',
        quality,
    );
});

const buildOutputName = (originalName = 'verification-photo', fallbackName = 'verification-photo') => {
    const baseName = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
    return `${baseName || fallbackName}.jpg`;
};

/**
 * Normalizes camera orientation and caps very large photos before upload.
 * The server remains the source of truth for content and dimension validation.
 */
export const prepareVerificationImage = async (sourceFile, {
    subject = 'verification',
    fallbackName = 'verification-photo',
    maxOutputEdge,
    jpegQuality,
} = {}) => {
    const validationError = validateVerificationImageFile(sourceFile, subject);
    if (validationError) throw new Error(validationError);

    if (typeof document === 'undefined') {
        throw new Error('Image preparation is unavailable in this environment.');
    }

    const isSelfie = subject.toLowerCase().includes('selfie');
    const outputEdgeLimit = maxOutputEdge ?? (isSelfie ? SELFIE_MAX_OUTPUT_EDGE : ID_MAX_OUTPUT_EDGE);
    const outputQuality = jpegQuality ?? (isSelfie ? SELFIE_JPEG_QUALITY : ID_JPEG_QUALITY);

    const image = await loadImage(sourceFile);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    if (shortEdge < MIN_ID_IMAGE_HEIGHT || longEdge < MIN_ID_IMAGE_WIDTH) {
        throw new Error(`Use a clearer photo at least ${MIN_ID_IMAGE_WIDTH} × ${MIN_ID_IMAGE_HEIGHT} pixels.`);
    }
    if (width * height > MAX_IMAGE_PIXELS) {
        throw new Error('This photo has an unusually high resolution. Use a smaller image.');
    }

    const scale = Math.min(1, outputEdgeLimit / Math.max(width, height));
    const outputWidth = Math.round(width * scale);
    const outputHeight = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.drawImage(image, 0, 0, outputWidth, outputHeight);

    const blob = await toBlob(canvas, outputQuality);
    if (blob.size > MAX_ID_IMAGE_BYTES) {
        throw new Error('The prepared ID photo is still larger than 5 MB. Use a lower-resolution photo.');
    }

    return {
        file: new File([blob], buildOutputName(sourceFile.name, fallbackName), {
            type: 'image/jpeg',
            lastModified: Date.now(),
        }),
        width: outputWidth,
        height: outputHeight,
    };
};

export const prepareIdentityImage = (sourceFile) => prepareVerificationImage(sourceFile, {
    subject: 'ID',
    fallbackName: 'identification',
});
