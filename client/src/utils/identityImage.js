export const ID_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const ID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_ID_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_ID_IMAGE_WIDTH = 480;
export const MIN_ID_IMAGE_HEIGHT = 300;

const MAX_OUTPUT_EDGE = 2400;
const MAX_IMAGE_PIXELS = 40_000_000;
const JPEG_QUALITY = 0.92;

export const validateIdentityImageFile = (file) => {
    if (!file) return 'Choose or take a photo of your ID.';
    if (!ID_IMAGE_TYPES.has(file.type)) return 'Use a JPG, PNG, or WebP image.';
    if (file.size <= 0) return 'The selected image is empty.';
    if (file.size > MAX_ID_IMAGE_BYTES) return 'The ID photo must be 5 MB or smaller.';
    return '';
};

const loadImage = (file) => new Promise((resolve, reject) => {
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
});

const toBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('The ID photo could not be prepared. Try again.')),
        'image/jpeg',
        JPEG_QUALITY,
    );
});

const buildOutputName = (originalName = 'identification') => {
    const baseName = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
    return `${baseName || 'identification'}.jpg`;
};

/**
 * Normalizes camera orientation and caps very large photos before upload.
 * The server remains the source of truth for content and dimension validation.
 */
export const prepareIdentityImage = async (sourceFile) => {
    const validationError = validateIdentityImageFile(sourceFile);
    if (validationError) throw new Error(validationError);

    const image = await loadImage(sourceFile);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width < MIN_ID_IMAGE_WIDTH || height < MIN_ID_IMAGE_HEIGHT) {
        throw new Error(`Use a clearer photo at least ${MIN_ID_IMAGE_WIDTH} × ${MIN_ID_IMAGE_HEIGHT} pixels.`);
    }
    if (width * height > MAX_IMAGE_PIXELS) {
        throw new Error('This photo has an unusually high resolution. Use a smaller image.');
    }

    const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(width, height));
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

    const blob = await toBlob(canvas);
    if (blob.size > MAX_ID_IMAGE_BYTES) {
        throw new Error('The prepared ID photo is still larger than 5 MB. Use a lower-resolution photo.');
    }

    return {
        file: new File([blob], buildOutputName(sourceFile.name), {
            type: 'image/jpeg',
            lastModified: Date.now(),
        }),
        width: outputWidth,
        height: outputHeight,
    };
};
