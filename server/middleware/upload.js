import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();


// Ensure Cloudinary is configured
if (process.env.CLOUDINARY_URL) {
    // Manually parse CLOUDINARY_URL to ensure it's picked up correctly
    const match = process.env.CLOUDINARY_URL.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
    if (match) {
        cloudinary.config({
            cloud_name: match[3],
            api_key: match[1],
            api_secret: match[2],
        });
    }
} else {
    console.error('⚠️ CLOUDINARY_URL is not set in environment variables!');
}

// File filter for images
const imageFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
    }
};

// File filter for documents (ID uploads)
const documentFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only images (JPEG, PNG, WebP) and PDF files are allowed'), false);
    }
};

// Storage configuration for ID documents
const idDocStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'sibuyan-alert/id-documents',
        resource_type: 'auto', // Allow PDF and images
        allowed_formats: ['jpg', 'png', 'pdf', 'webp'],
        public_id: (req, file) => `id-${req.user?._id || 'temp'}-${Date.now()}`,
    },
});

// Storage configuration for report images
const reportStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'sibuyan-alert/reports',
        allowed_formats: ['jpg', 'png', 'webp'],
        public_id: (req, file) => `report-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    },
});

// Storage configuration for avatars
const avatarStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'sibuyan-alert/avatars',
        allowed_formats: ['jpg', 'png', 'webp'],
        public_id: (req, file) => `avatar-${req.user?._id || 'temp'}-${Date.now()}`,
    },
});

// Multer instances
export const uploadIdDocument = multer({
    storage: idDocStorage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
        files: 1,
    },
    fileFilter: documentFilter,
}).single('idDocument');

export const uploadReportImages = multer({
    storage: reportStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB per file
        files: 5, // Max 5 images per report
    },
    fileFilter: imageFilter,
}).array('images', 5);

export const uploadAvatar = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB max
        files: 1,
    },
    fileFilter: imageFilter,
}).single('avatar');

// Error handling middleware for multer
export const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large',
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files',
            });
        }
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    next();
};

export default {
    uploadIdDocument,
    uploadReportImages,
    uploadAvatar,
    handleMulterError,
};
