import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

// Mock the dependencies first
jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
    },
}));

jest.mock('../models/User.js', () => ({
    default: {},
}));

jest.mock('../models/Municipality.js', () => ({ default: {} }));

jest.mock('../models/Notification.js', () => ({
    default: {
        createAndSend: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUser: jest.fn().mockResolvedValue(false),
    pushTemplates: {
        reporterVerified: jest.fn(),
        reporterRejected: jest.fn(),
    },
}));

jest.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
    broadcastReportResolved: jest.fn(),
}));

jest.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: jest.fn().mockResolvedValue(true),
    uploadFilesToGridFS: jest.fn(),
    getGridFsBucket: jest.fn(),
}));

const { resolveReport } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');
const { uploadFilesToGridFS, getGridFsBucket, deleteGridFsFilesByUrls } = await import('../services/gridFsService.js');
const { handleMulterError } = await import('../middleware/upload.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

// A real disk-backed multer file so the F5 temp-cleanup assertions are real.
const makeTempFile = (name = 'resolution.jpg') => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-photos-test-'));
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, 'fake-image-bytes');
    return {
        fieldname: 'resolutionPhotos',
        originalname: name,
        mimetype: 'image/jpeg',
        path: filePath,
        size: 16,
    };
};

const mockReport = (overrides = {}) => ({
    _id: 'report123',
    status: 'responding',
    municipalityName: 'Cajidiocan',
    respondedBy: 'user1',
    responders: [{ user: 'user1', unitName: 'MDRRMO', unitType: 'MDRRMO' }],
    images: ['/api/files/1/evidence.jpg'],
    resolutionImages: [],
    save: jest.fn().mockResolvedValue({}),
    populate: jest.fn().mockResolvedValue({}),
    reporter: { _id: 'reporter1', notificationPreferences: {} },
    address: 'Main Street',
    ...overrides,
});

const findReport = (report) => {
    Report.findById.mockReturnValue({ populate: jest.fn().mockReturnThis() });
    Report.findById().populate.mockResolvedValue(report);
};

const noExistingPhoto = () => {
    getGridFsBucket.mockReturnValue({
        find: () => ({ limit: () => ({ toArray: async () => [] }) }),
    });
};

const baseReq = () => ({
    params: { id: '507f1f77bcf86cd799439011' },
    body: { resolutionNotes: 'Debris cleared' },
    user: { _id: 'user1', role: 'responder', agency: 'MDRRMO', assignedMunicipality: 'Cajidiocan' },
    app: { get: jest.fn().mockReturnValue({ emit: jest.fn() }) },
});

describe('resolveReport with resolution photos (multipart)', () => {
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = baseReq();
        res = createRes();
        noExistingPhoto();
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/1/res1.jpg', id: 'gridfs-1', filename: 'resolution.jpg' }]);
    });

    test('stores resolution photos in resolutionImages, never in the reporter evidence array', async () => {
        const report = mockReport();
        findReport(report);
        const file = makeTempFile();
        req.files = [file];
        req.body = { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] };

        await resolveReport(req, res);

        expect(uploadFilesToGridFS).toHaveBeenCalledWith(
            [file],
            expect.objectContaining({
                category: 'resolution',
                visibility: 'private',
                resourceId: 'report123',
                photoId: 'photo-1',
            })
        );
        expect(report.resolutionImages).toEqual(['/api/files/1/res1.jpg']);
        // The reporter's evidence array is untouched: separate identity.
        expect(report.images).toEqual(['/api/files/1/evidence.jpg']);
        expect(report.status).toBe('resolved');
        expect(report.resolutionNotes).toBe('Debris cleared');
        // F5: the disk temp copy does not survive the request.
        expect(fs.existsSync(file.path)).toBe(false);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('a retried photoId is not stored twice', async () => {
        const report = mockReport();
        findReport(report);
        const file = makeTempFile();
        req.files = [file];
        req.body = { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] };
        getGridFsBucket.mockReturnValue({
            find: () => ({ limit: () => ({ toArray: async () => [{ _id: 'already-there' }] }) }),
        });

        await resolveReport(req, res);

        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
        expect(report.resolutionImages).toEqual([]);
        expect(report.status).toBe('resolved');
        expect(fs.existsSync(file.path)).toBe(false);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('a storage failure rejects with 500, rolls back stored photos, and cleans temp files', async () => {
        const report = mockReport();
        findReport(report);
        const file = makeTempFile();
        req.files = [file];
        req.body = { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] };
        uploadFilesToGridFS.mockRejectedValueOnce(new Error('GridFS unavailable'));

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(deleteGridFsFilesByUrls).toHaveBeenCalled();
        expect(fs.existsSync(file.path)).toBe(false);
        // The resolve itself never happened.
        expect(report.status).toBe('responding');
        expect(report.save).not.toHaveBeenCalled();
    });

    test('a non-assigned responder is rejected with 403 and temp files are cleaned', async () => {
        const report = mockReport();
        findReport(report);
        const file = makeTempFile();
        req.files = [file];
        req.body = { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] };
        req.user = { _id: 'intruder', role: 'responder', agency: 'MDRRMO', assignedMunicipality: 'Cajidiocan' };

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
        expect(fs.existsSync(file.path)).toBe(false);
        expect(report.status).toBe('responding');
    });

    test('a missing report is rejected with 404 and temp files are cleaned', async () => {
        Report.findById.mockReturnValue({ populate: jest.fn().mockReturnThis() });
        Report.findById().populate.mockResolvedValue(null);
        const file = makeTempFile();
        req.files = [file];
        req.body = { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] };

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(fs.existsSync(file.path)).toBe(false);
    });

    test('a non-responding report is rejected with 400 and temp files are cleaned', async () => {
        const report = mockReport({ status: 'verified' });
        findReport(report);
        const file = makeTempFile();
        req.files = [file];
        req.body = { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] };

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
        expect(fs.existsSync(file.path)).toBe(false);
    });

    test('a JSON (no-files) resolve still works exactly as before', async () => {
        const report = mockReport();
        findReport(report);

        await resolveReport(req, res);

        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
        expect(report.resolutionImages).toEqual([]);
        expect(report.status).toBe('resolved');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe('resolve route upload middleware (invalid mime / too many files)', () => {
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        res = createRes();
    });

    test('an invalid mime type is rejected with 400 and temp files are cleaned', async () => {
        const file = makeTempFile('evil.exe');
        const req = {
            files: [file],
            fileValidationError: 'Resolution photos must be JPEG, PNG, or WebP images',
        };
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE');

        await handleMulterError(error, req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Resolution photos must be JPEG, PNG, or WebP images',
        }));
        expect(fs.existsSync(file.path)).toBe(false);
    });

    test('more than 5 files is rejected with 400 and temp files are cleaned', async () => {
        const files = [makeTempFile('r1.jpg'), makeTempFile('r2.jpg')];
        const req = { files };
        const error = new multer.MulterError('LIMIT_FILE_COUNT');

        await handleMulterError(error, req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Too many files were uploaded',
        }));
        for (const file of files) expect(fs.existsSync(file.path)).toBe(false);
    });
});

describe('validateResolveReportWithFiles (validation failure after multer)', () => {
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        res = createRes();
    });

    test('an over-long resolutionNotes rejects with 400 and temp files are cleaned', async () => {
        const { validateResolveReportWithFiles } = await import('../middleware/validate.js');
        const file = makeTempFile();
        const req = {
            params: { id: '507f1f77bcf86cd799439011' },
            body: { resolutionNotes: 'x'.repeat(1001) },
            files: [file],
        };

        for (const middleware of validateResolveReportWithFiles) {
            let nextCalled = false;
            await middleware(req, res, () => { nextCalled = true; });
            if (!nextCalled) break;
        }

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(fs.existsSync(file.path)).toBe(false);
    });

    test('a valid multipart body passes validation without touching temp files', async () => {
        const { validateResolveReportWithFiles } = await import('../middleware/validate.js');
        const file = makeTempFile();
        const req = {
            params: { id: '507f1f77bcf86cd799439011' },
            body: { resolutionNotes: 'Debris cleared' },
            files: [file],
        };

        let nextCount = 0;
        for (const middleware of validateResolveReportWithFiles) {
            let nextCalled = false;
            await middleware(req, res, () => { nextCalled = true; nextCount += 1; });
            if (!nextCalled) break;
        }

        expect(nextCount).toBe(validateResolveReportWithFiles.length);
        expect(res.status).not.toHaveBeenCalled();
        expect(fs.existsSync(file.path)).toBe(true);
        fs.unlinkSync(file.path);
    });
});
