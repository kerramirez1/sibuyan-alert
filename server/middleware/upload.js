import multer from 'multer';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IDENTITY_IMAGE_FIELDS = new Set(['idDocument', 'selfiePhoto']);
const MIN_IDENTITY_SHORT_EDGE = 300;
const MIN_IDENTITY_LONG_EDGE = 480;
const MAX_IDENTITY_PIXELS = 40_000_000;

const createFileFilter = (allowedTypes, message) => (req, file, callback) => {
    if (allowedTypes.has(file.mimetype)) {
        callback(null, true);
        return;
    }

    req.fileValidationError = message;
    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
};

const memoryStorage = multer.memoryStorage();

const hasExpectedSignature = (file) => {
    const buffer = file?.buffer;
    if (!buffer?.length) return false;

    if (file.mimetype === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (file.mimetype === 'image/png') {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (file.mimetype === 'image/webp') {
        return buffer.length >= 12
            && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
            && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
};

const readUint24LittleEndian = (buffer, offset) =>
    buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

const readJpegDimensions = (buffer) => {
    const startOfFrameMarkers = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
        0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        if (offset + 4 > buffer.length) return null;
        const segmentLength = buffer.readUInt16BE(offset + 2);
        if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return null;
        if (startOfFrameMarkers.has(marker)) {
            return {
                height: buffer.readUInt16BE(offset + 5),
                width: buffer.readUInt16BE(offset + 7),
            };
        }
        offset += 2 + segmentLength;
    }
    return null;
};

export const readImageDimensions = (file) => {
    const buffer = file?.buffer;
    if (!buffer?.length) return null;

    if (file.mimetype === 'image/png' && buffer.length >= 24) {
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (file.mimetype === 'image/jpeg') return readJpegDimensions(buffer);
    if (file.mimetype !== 'image/webp' || buffer.length < 30) return null;

    const format = buffer.subarray(12, 16).toString('ascii');
    if (format === 'VP8X') {
        return {
            width: readUint24LittleEndian(buffer, 24) + 1,
            height: readUint24LittleEndian(buffer, 27) + 1,
        };
    }
    if (format === 'VP8L' && buffer[20] === 0x2f && buffer.length >= 25) {
        return {
            width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
            height: 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10),
        };
    }
    if (format === 'VP8 ' && buffer.length >= 30
        && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
        return {
            width: buffer.readUInt16LE(26) & 0x3fff,
            height: buffer.readUInt16LE(28) & 0x3fff,
        };
    }
    return null;
};

const hasSafeIdentityDimensions = (file) => {
    const dimensions = readImageDimensions(file);
    if (!dimensions?.width || !dimensions?.height) return false;
    const shortEdge = Math.min(dimensions.width, dimensions.height);
    const longEdge = Math.max(dimensions.width, dimensions.height);
    return shortEdge >= MIN_IDENTITY_SHORT_EDGE
        && longEdge >= MIN_IDENTITY_LONG_EDGE
        && dimensions.width * dimensions.height <= MAX_IDENTITY_PIXELS;
};

export const validateUploadContent = (req, res, next) => {
    const nestedFiles = req.files && !Array.isArray(req.files)
        ? Object.values(req.files).flat()
        : req.files || [];
    const files = [req.file, ...nestedFiles].filter(Boolean);
    const invalidFile = files.find((file) => !hasExpectedSignature(file));

    if (invalidFile) {
        return res.status(400).json({
            success: false,
            message: `${invalidFile.originalname || 'Uploaded file'} does not match its declared file type`,
        });
    }

    const invalidIdentityImage = files.find((file) =>
        IDENTITY_IMAGE_FIELDS.has(file.fieldname) && !hasSafeIdentityDimensions(file)
    );
    if (invalidIdentityImage) {
        return res.status(400).json({
            success: false,
            message: 'ID and selfie photos must be readable images of at least 480 × 300 pixels',
        });
    }

    return next();
};

export const requireRegistrationVerificationImages = (req, res, next) => {
    if (!req.files?.idDocument?.[0]) {
        return res.status(400).json({ success: false, message: 'An ID photo is required' });
    }
    if (!req.files?.selfiePhoto?.[0]) {
        return res.status(400).json({ success: false, message: 'A verification selfie is required' });
    }
    return next();
};

export const uploadIdDocument = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 20, parts: 25, fieldSize: 1024 * 1024 },
    fileFilter: createFileFilter(
        IMAGE_MIME_TYPES,
        'ID and selfie uploads must be JPEG, PNG, or WebP images'
    ),
}).fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'selfiePhoto', maxCount: 1 },
]);

export const uploadReportImages = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 30, parts: 40, fieldSize: 2 * 1024 * 1024 },
    fileFilter: createFileFilter(
        IMAGE_MIME_TYPES,
        'Report evidence must be JPEG, PNG, or WebP images'
    ),
}).array('images', 5);

export const uploadRiskZonePhotos = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 30, parts: 40, fieldSize: 2 * 1024 * 1024 },
    fileFilter: createFileFilter(
        IMAGE_MIME_TYPES,
        'Reference photos must be JPEG, PNG, or WebP images'
    ),
}).array('photos', 5);

export const uploadAvatar = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, parts: 25, fieldSize: 1024 * 1024 },
    fileFilter: createFileFilter(
        IMAGE_MIME_TYPES,
        'Avatar must be a JPEG, PNG, or WebP image'
    ),
}).single('avatar');

export const handleMulterError = (error, req, res, next) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: 'Uploaded file is too large (maximum 5 MB)',
            LIMIT_FILE_COUNT: 'Too many files were uploaded',
            LIMIT_UNEXPECTED_FILE: req.fileValidationError || 'Unexpected file or unsupported file type',
        };
        return res.status(400).json({
            success: false,
            message: messages[error.code] || error.message,
        });
    }

    return res.status(400).json({
        success: false,
        message: error.message || 'File upload failed',
    });
};

export default {
    uploadIdDocument,
    uploadReportImages,
    uploadRiskZonePhotos,
    uploadAvatar,
    handleMulterError,
    validateUploadContent,
    requireRegistrationVerificationImages,
};
