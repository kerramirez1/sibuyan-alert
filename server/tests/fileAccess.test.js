import { describe, expect, jest, test } from '@jest/globals';
import { canReadFile } from '../controllers/fileController.js';
import { parseGridFsFileId, sanitizeFilename } from '../services/gridFsService.js';
import { validateUploadContent } from '../middleware/upload.js';

const privateFile = {
    metadata: {
        visibility: 'private',
        ownerId: { toString: () => 'owner-1' },
        municipalityName: 'Cajidiocan',
    },
};

describe('GridFS file authorization', () => {
    test('allows public media without authentication', () => {
        expect(canReadFile({ metadata: { visibility: 'public' } }, null)).toBe(true);
    });

    test('denies private identity media without authentication', () => {
        expect(canReadFile(privateFile, null)).toBe(false);
    });

    test('allows the file owner and a global administrator', () => {
        expect(canReadFile(privateFile, { _id: 'owner-1', role: 'reporter' })).toBe(true);
        expect(canReadFile(privateFile, { _id: 'admin-1', role: 'admin' })).toBe(true);
    });

    test('limits municipal administrators to their municipality', () => {
        expect(canReadFile(privateFile, {
            _id: 'municipal-admin-1',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        })).toBe(true);
        expect(canReadFile(privateFile, {
            _id: 'municipal-admin-2',
            role: 'municipal_admin',
            assignedMunicipality: 'Magdiwang',
        })).toBe(false);
    });

    test('does not grant responders access to private identity media', () => {
        expect(canReadFile(privateFile, {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        })).toBe(false);
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
});
