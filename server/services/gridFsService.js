import mongoose from 'mongoose';

export const GRID_FS_BUCKET_NAME = 'media';

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

export const uploadFileToGridFS = (file, metadata = {}) => {
    if (!file?.buffer?.length) {
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
        uploadStream.end(file.buffer);
    });
};

export const uploadFilesToGridFS = async (files = [], metadata = {}) => {
    const uploaded = [];

    try {
        for (const file of files) {
            uploaded.push(await uploadFileToGridFS(file, metadata));
        }
        return uploaded;
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
