import mongoose from 'mongoose';
import { promises as fs } from 'fs';
import { mapWithConcurrency } from '../utils/concurrency.js';

export const GRID_FS_BUCKET_NAME = 'media';

/**
 * How many uploads run at once for a single request.
 *
 * Sequential uploads made a five-photo report pay five round trips in series
 * before the server could even start analysing the evidence. Unbounded
 * parallelism is not the fix either: every in-flight upload holds its whole
 * image buffer and an open write stream, and this runs on one dyno sharing one
 * connection pool with every other request. Three keeps the report moving
 * without letting it monopolise the process.
 */
export const GRID_FS_UPLOAD_CONCURRENCY = 3;

const ensureDatabaseConnection = () => {
    if (!mongoose.connection.db) {
        throw new Error('MongoDB is not connected');
    }
};

export const getGridFsBucket = () => {
    ensureDatabaseConnection();
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: GRID_FS_BUCKET_NAME,
    });
};

export const sanitizeFilename = (filename = 'file') => {
    const sanitized = String(filename)
        .normalize('NFKC')
        .split('\u0000').join('_')
        .replace(/[\\/\r\n]/g, '_')
        .replace(/[^a-zA-Z0-9._()-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[._]+/, '')
        .slice(0, 180);

    return sanitized || 'file';
};

export const buildGridFsUrl = (id, originalName) =>
    `/api/files/${id}/${encodeURIComponent(sanitizeFilename(originalName))}`;

export const parseGridFsFileId = (value) => {
    if (typeof value !== 'string') return null;
    const match = value.match(/\/api\/files\/([a-f\d]{24})(?:\/|$)/i);
    return match && mongoose.isValidObjectId(match[1])
        ? new mongoose.Types.ObjectId(match[1])
        : null;
};

export const uploadFileToGridFS = async (file, metadata = {}) => {
    // P2-11: report-evidence uploads are disk-backed (multer diskStorage), so
    // bytes are read transiently here instead of arriving in file.buffer.
    const buffer = file?.buffer?.length
        ? file.buffer
        : (file?.path ? await fs.readFile(file.path) : null);
    if (!buffer?.length) {
        throw new Error('Cannot store an empty upload');
    }

    const bucket = getGridFsBucket();
    const originalName = sanitizeFilename(file.originalname);
    const uploadStream = bucket.openUploadStream(originalName, {
        contentType: file.mimetype,
        metadata: {
            mimeType: file.mimetype,
            originalName,
            category: metadata.category || 'general',
            visibility: metadata.visibility === 'private' ? 'private' : 'public',
            ownerId: metadata.ownerId && mongoose.isValidObjectId(metadata.ownerId)
                ? new mongoose.Types.ObjectId(metadata.ownerId) : null,
            resourceId: metadata.resourceId && mongoose.isValidObjectId(metadata.resourceId)
                ? new mongoose.Types.ObjectId(metadata.resourceId) : null,
            municipalityName: metadata.municipalityName || null,
            // Idempotency key for retried evidence uploads: the client sends
            // the photoId assigned at enqueue time, and attachReportEvidence
            // skips storing a photoId already attached to the report.
            photoId: typeof metadata.photoId === 'string' && metadata.photoId.trim()
                ? metadata.photoId.trim()
                : null,
            uploadedAt: new Date(),
        },
    });

    return new Promise((resolve, reject) => {
        uploadStream.once('error', reject);
        uploadStream.once('finish', () => {
            resolve({
                id: uploadStream.id,
                url: buildGridFsUrl(uploadStream.id, originalName),
                filename: originalName,
                mimeType: file.mimetype,
            });
        });
        uploadStream.end(buffer);
    });
};

export const uploadFilesToGridFS = async (files = [], metadata = {}) => {
    // Only uploads that actually completed are recorded, so the cleanup below
    // can never miss a file that reached GridFS. `mapWithConcurrency` waits for
    // in-flight uploads before it re-throws, which is what makes that true.
    const uploaded = [];

    try {
        // Index-aligned with `files`: `Report.images` and the per-index evidence
        // metadata are both positional, so completion order must not leak out.
        return await mapWithConcurrency(files, GRID_FS_UPLOAD_CONCURRENCY, async (file) => {
            const stored = await uploadFileToGridFS(file, metadata);
            uploaded.push(stored);
            return stored;
        });
    } catch (error) {
        await Promise.allSettled(uploaded.map(({ id }) => deleteGridFsFile(id)));
        throw error;
    }
};

export const findGridFsFile = async (id) => {
    if (!mongoose.isValidObjectId(id)) return null;
    const bucket = getGridFsBucket();
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(id) }).limit(1).toArray();
    return files[0] || null;
};

export const deleteGridFsFile = async (id) => {
    if (!mongoose.isValidObjectId(id)) return false;

    try {
        await getGridFsBucket().delete(new mongoose.Types.ObjectId(id));
        return true;
    } catch (error) {
        if (error?.code === 26 || /FileNotFound/i.test(error?.message || '')) return false;
        throw error;
    }
};

export const deleteGridFsFileByUrl = async (url) => {
    const id = parseGridFsFileId(url);
    return id ? deleteGridFsFile(id) : false;
};

export const deleteGridFsFilesByUrls = async (urls = []) => {
    const uniqueIds = [
        ...new Map(
            urls
                .map((url) => parseGridFsFileId(url))
                .filter(Boolean)
                .map((id) => [id.toString(), id])
        ).values(),
    ];

    const results = await Promise.allSettled(uniqueIds.map((id) => deleteGridFsFile(id)));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.warn(`Failed to delete GridFS file ${uniqueIds[index]}:`, result.reason?.message || result.reason);
        }
    });
    return results;
};
