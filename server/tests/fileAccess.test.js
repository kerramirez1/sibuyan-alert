import { describe, expect, test, vi as jest } from 'vitest';
import { canReadFile } from '../controllers/fileController.js';
import { parseGridFsFileId, sanitizeFilename } from '../services/gridFsService.js';
import { readImageDimensions, validateUploadContent } from '../middleware/upload.js';

const privateFile = {
    metadata: {
        visibility: 'private',
        ownerId: { toString: () => 'owner-1' },
        municipalityName: 'Cajidiocan',
    },
};

describe('GridFS file authorization', () => {
    test('allows public media without authentication', async () => {
        await expect(canReadFile({ metadata: { visibility: 'public' } }, null)).resolves.toBe(true);
    });

    test('denies private identity media without authentication', async () => {
        await expect(canReadFile(privateFile, null)).resolves.toBe(false);
    });

    test('allows the file owner but not a retired global administrator role', async () => {
        await expect(canReadFile(privateFile, { _id: 'owner-1', role: 'reporter' })).resolves.toBe(true);
        await expect(canReadFile(privateFile, { _id: 'legacy-admin-1', role: 'admin' })).resolves.toBe(false);
    });

    test('limits municipal administrators to their municipality', async () => {
        await expect(canReadFile(privateFile, {
            _id: 'municipal-admin-1',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        })).resolves.toBe(true);
        await expect(canReadFile(privateFile, {
            _id: 'municipal-admin-2',
            role: 'municipal_admin',
            assignedMunicipality: 'Magdiwang',
        })).resolves.toBe(false);
    });

    test('does not grant responders access to private identity media', async () => {
        await expect(canReadFile(privateFile, {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        })).resolves.toBe(false);
    });

    test('allows eligible in-scope responders to read report evidence', async () => {
        const file = {
            metadata: {
                visibility: 'private',
                category: 'report_evidence',
                resourceId: 'report-1',
                ownerId: 'reporter-1',
            },
        };
        const findReportById = jest.fn().mockResolvedValue({
            _id: 'report-1',
            reporter: 'reporter-1',
            municipalityName: 'Cajidiocan',
            status: 'verified',
            responders: [],
        });

        await expect(canReadFile(file, {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        }, { findReportById })).resolves.toBe(true);
        expect(findReportById).toHaveBeenCalledWith('report-1');
    });

    test('denies report evidence when the responder is out of scope', async () => {
        const file = {
            metadata: {
                visibility: 'private',
                category: 'report_evidence',
                resourceId: 'report-1',
            },
        };
        const findReportById = jest.fn().mockResolvedValue({
            _id: 'report-1',
            reporter: 'reporter-1',
            municipalityName: 'Cajidiocan',
            status: 'verified',
            responders: [],
        });

        await expect(canReadFile(file, {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Magdiwang',
        }, { findReportById })).resolves.toBe(false);
    });
});

describe('GridFS URL utilities', () => {
    test('sanitizes unsafe filenames', () => {
        expect(sanitizeFilename('../identity\r\ncard.pdf')).toBe('identity_card.pdf');
    });

    test('extracts only valid GridFS ids from delivery URLs', () => {
        const id = '507f1f77bcf86cd799439011';
        expect(parseGridFsFileId(`/api/files/${id}/photo.jpg`)?.toString()).toBe(id);
        expect(parseGridFsFileId('/api/files/not-an-id/photo.jpg')).toBeNull();
    });
});

describe('upload content validation', () => {
    test('accepts a file whose binary signature matches its MIME type', () => {
        const req = {
            file: {
                originalname: 'photo.png',
                mimetype: 'image/png',
                buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            },
        };
        const next = jest.fn();
        validateUploadContent(req, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('rejects MIME spoofing before database storage', () => {
        const req = {
            files: [{
                originalname: 'fake.jpg',
                mimetype: 'image/jpeg',
                buffer: Buffer.from('not an image'),
            }],
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();
        validateUploadContent(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('reads and accepts safe dimensions for identity images', () => {
        const buffer = Buffer.alloc(24);
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
        buffer.writeUInt32BE(1200, 16);
        buffer.writeUInt32BE(750, 20);
        const file = { fieldname: 'idDocument', originalname: 'id.png', mimetype: 'image/png', buffer };
        expect(readImageDimensions(file)).toEqual({ width: 1200, height: 750 });

        const next = jest.fn();
        validateUploadContent({ files: { idDocument: [file] } }, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('rejects identity images with unreadable or unsafe dimensions', () => {
        const buffer = Buffer.alloc(24);
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
        buffer.writeUInt32BE(200, 16);
        buffer.writeUInt32BE(120, 20);
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();

        validateUploadContent({ files: { idDocument: [{
            fieldname: 'idDocument',
            originalname: 'tiny.png',
            mimetype: 'image/png',
            buffer,
        }] } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/480 × 300/) }));
    });
});
