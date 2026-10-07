import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/User.js', () => ({
    default: { findById: vi.fn() },
}));

vi.mock('../models/Report.js', () => ({
    default: { exists: vi.fn(), find: vi.fn(), findById: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock('../models/Notification.js', () => ({
    default: { deleteMany: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../models/AuthSession.js', () => ({
    default: { deleteMany: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../services/viewEventService.js', () => ({
    deleteViewEventsForTarget: vi.fn().mockResolvedValue(true),
    deleteViewerAliasesForUser: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: vi.fn().mockResolvedValue([]),
    uploadFilesToGridFS: vi.fn(),
    getGridFsBucket: vi.fn(),
}));

vi.mock('../services/emailService.js', () => ({
    sendVerificationEmail: vi.fn(),
    sendReportStatusEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/pushService.js', () => ({
    sendPushToUser: vi.fn().mockResolvedValue(false),
    pushTemplates: {},
}));

vi.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: vi.fn(),
    broadcastReportVerified: vi.fn(),
    broadcastReportRejected: vi.fn(),
    broadcastReportResolved: vi.fn(),
}));

const { deleteReport, deleteUser, resolveReport } = await import('../controllers/adminController.js');
const { default: User } = await import('../models/User.js');
const { default: Report } = await import('../models/Report.js');
const { deleteGridFsFilesByUrls, uploadFilesToGridFS, getGridFsBucket } = await import('../services/gridFsService.js');

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

describe('P2: resolution photos leave no orphaned GridFS files', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('deleteReport deletes both evidence and resolution GridFS files', async () => {
        const report = {
            _id: 'report-1',
            municipalityName: 'Cajidiocan',
            images: ['/api/files/1/evidence.jpg'],
            resolutionImages: ['/api/files/2/resolution.jpg'],
            deleteOne: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await deleteReport({
            params: { id: 'report-1' },
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            app: { get: vi.fn(() => null) },
        }, res);

        expect(report.deleteOne).toHaveBeenCalled();
        expect(deleteGridFsFilesByUrls).toHaveBeenCalledWith([
            '/api/files/1/evidence.jpg',
            '/api/files/2/resolution.jpg',
        ]);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('deleteReport succeeds even when the report has no photos at all', async () => {
        const report = {
            _id: 'report-1',
            municipalityName: 'Cajidiocan',
            images: [],
            resolutionImages: undefined,
            deleteOne: vi.fn().mockResolvedValue(true),
        };
        Report.findById.mockResolvedValue(report);
        const res = createRes();

        await deleteReport({
            params: { id: 'report-1' },
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            app: { get: vi.fn(() => null) },
        }, res);

        expect(deleteGridFsFilesByUrls).toHaveBeenCalledWith([]);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('user deletion collects resolutionImages into associatedFileUrls', async () => {
        const target = {
            _id: 'target-1',
            role: 'reporter',
            assignedMunicipality: 'Cajidiocan',
            avatar: null,
            idDocument: null,
            selfiePhoto: null,
            deleteOne: vi.fn().mockResolvedValue(true),
        };
        User.findById.mockResolvedValue(target);
        Report.exists.mockResolvedValue(false);
        // The query must select resolutionImages for the cleanup to see them.
        const findResult = {
            select: vi.fn().mockResolvedValue([
                { images: ['/api/files/1/evidence.jpg'], resolutionImages: ['/api/files/2/resolution.jpg'] },
            ]),
        };
        Report.find.mockReturnValue(findResult);
        Report.deleteMany.mockResolvedValue({});
        const res = createRes();

        await deleteUser({
            params: { id: 'target-1' },
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            app: { get: vi.fn(() => null) },
        }, res);

        expect(Report.find).toHaveBeenCalledWith({ reporter: 'target-1' });
        expect(findResult.select).toHaveBeenCalledWith('images resolutionImages');
        expect(deleteGridFsFilesByUrls).toHaveBeenCalledWith([
            '/api/files/1/evidence.jpg',
            '/api/files/2/resolution.jpg',
        ]);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe('P3: a failed report.save() after photo storage cleans up the stored photos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getGridFsBucket.mockReturnValue({
            find: () => ({ limit: () => ({ toArray: async () => [] }) }),
        });
        uploadFilesToGridFS.mockResolvedValue([{ url: '/api/files/1/res1.jpg', id: 'gridfs-1', filename: 'r.jpg' }]);
    });

    const baseReq = (files = []) => ({
        params: { id: 'report123' },
        body: { resolutionNotes: 'Debris cleared', photoIds: ['photo-1'] },
        files,
        user: { _id: 'user1', role: 'responder', agency: 'MDRRMO', assignedMunicipality: 'Cajidiocan' },
        app: { get: vi.fn().mockReturnValue({ emit: vi.fn() }) },
    });

    const respondingReport = (overrides = {}) => ({
        _id: 'report123',
        status: 'responding',
        municipalityName: 'Cajidiocan',
        respondedBy: 'user1',
        responders: [{ user: 'user1' }],
        images: ['/api/files/1/evidence.jpg'],
        resolutionImages: [],
        save: vi.fn().mockResolvedValue({}),
        populate: vi.fn().mockResolvedValue({}),
        reporter: { _id: 'reporter1', notificationPreferences: {} },
        address: 'Main Street',
        ...overrides,
    });

    test('a save failure deletes the just-stored resolution photos and returns 500', async () => {
        const report = respondingReport({
            save: vi.fn().mockRejectedValue(new Error('write conflict')),
        });
        Report.findById.mockReturnValue({ populate: vi.fn().mockReturnThis() });
        Report.findById().populate.mockResolvedValue(report);
        const res = createRes();

        await resolveReport(baseReq([{ path: '/tmp/r.jpg', originalname: 'r.jpg' }]), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Failed to resolve report',
        }));
        // The photos stored moments ago are rolled back; the reporter's
        // evidence is never touched.
        expect(deleteGridFsFilesByUrls).toHaveBeenCalledWith(['/api/files/1/res1.jpg']);
        expect(report.status).toBe('resolved'); // set before the failed save
    });

    test('a successful save keeps the stored resolution photos', async () => {
        const report = respondingReport();
        Report.findById.mockReturnValue({ populate: vi.fn().mockReturnThis() });
        Report.findById().populate.mockResolvedValue(report);
        const res = createRes();

        await resolveReport(baseReq([{ path: '/tmp/r.jpg', originalname: 'r.jpg' }]), res);

        expect(report.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        // No rollback on the happy path: the report references these files.
        expect(deleteGridFsFilesByUrls).not.toHaveBeenCalled();
        expect(report.resolutionImages).toEqual(['/api/files/1/res1.jpg']);
        expect(report.images).toEqual(['/api/files/1/evidence.jpg']);
    });
});
