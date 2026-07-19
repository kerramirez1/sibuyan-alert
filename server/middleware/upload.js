import multer from 'multer';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ID_DOCUMENT_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);

const createFileFilter = (allowedTypes, message) => (req, file, callback) => {
    if (allowedTypes.has(file.mimetype)) {
        callback(null, true);
        return;
    }

    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    req.fileValidationError = message;
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
    if (file.mimetype === 'application/pdf') {
        return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    return false;
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

    return next();
};

export const uploadIdDocument = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 2 },
    fileFilter: createFileFilter(
        ID_DOCUMENT_MIME_TYPES,
        'ID documents must be JPEG, PNG, WebP, or PDF files'
    ),
}).fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'selfiePhoto', maxCount: 1 },
]);

export const uploadReportImages = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 5 },
    fileFilter: createFileFilter(
        IMAGE_MIME_TYPES,
        'Report evidence must be JPEG, PNG, or WebP images'
    ),
}).array('images', 5);

export const uploadAvatar = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: createFileFilter(
        IMAGE_MIME_TYPES,
        'Avatar must be a JPEG, PNG, or WebP image'
    ),
}).single('avatar');

export const handleMulterError = (error, req, res, next) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: 'Uploaded file is too large',
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
    uploadAvatar,
    handleMulterError,
    validateUploadContent,
};
