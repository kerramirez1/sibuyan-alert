import mongoose from 'mongoose';
import { findGridFsFile, getGridFsBucket, sanitizeFilename } from '../services/gridFsService.js';

export const canReadFile = (file, user) => {
    if (file.metadata?.visibility !== 'private') return true;
    if (!user) return false;
    if (user.role === 'admin') return true;

    const ownerId = file.metadata?.ownerId?.toString();
    if (ownerId && ownerId === user._id.toString()) return true;

    return user.role === 'municipal_admin'
        && Boolean(user.assignedMunicipality)
        && user.assignedMunicipality === file.metadata?.municipalityName;
};

const encodeDispositionFilename = (filename) =>
    encodeURIComponent(filename).replace(/['()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );

export const streamFile = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const file = await findGridFsFile(req.params.id);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (!canReadFile(file, req.user)) {
            return res.status(req.user ? 403 : 401).json({
                success: false,
                message: req.user ? 'Not authorized to access this file' : 'Authentication required',
            });
        }

        const mimeType = file.metadata?.mimeType || file.contentType || 'application/octet-stream';
        const filename = sanitizeFilename(file.metadata?.originalName || file.filename);
        const isPrivate = file.metadata?.visibility === 'private';
        const etag = `"${file._id}-${file.length}"`;

        res.set({
            'Content-Type': mimeType,
            'Content-Length': file.length,
            'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodeDispositionFilename(filename)}`,
            'Cache-Control': isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            ETag: etag,
        });

        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }

        const downloadStream = getGridFsBucket().openDownloadStream(file._id);
        downloadStream.once('error', (error) => {
            console.error('GridFS stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Failed to read file' });
            } else {
                res.destroy(error);
            }
        });
        downloadStream.pipe(res);
    } catch (error) {
        console.error('File delivery error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to read file' });
        }
    }
};
