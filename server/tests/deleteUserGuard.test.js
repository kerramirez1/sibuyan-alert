import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/User.js', () => ({
    default: { findById: vi.fn() },
}));

vi.mock('../models/Report.js', () => ({
    default: { exists: vi.fn(), find: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock('../models/Notification.js', () => ({
    default: { deleteMany: vi.fn() },
}));

vi.mock('../models/AuthSession.js', () => ({
    default: { deleteMany: vi.fn() },
}));

vi.mock('../services/viewEventService.js', () => ({
    deleteViewEventsForTarget: vi.fn(),
    deleteViewerAliasesForUser: vi.fn(),
}));

vi.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: vi.fn(),
}));

const { deleteUser } = await import('../controllers/adminController.js');
const { default: User } = await import('../models/User.js');
const { default: Report } = await import('../models/Report.js');

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

/**
 * P2-8: the pre-delete guard blocks users referenced anywhere in the
 * incident audit trail — not just reporters with production reports.
 */
describe('deleteUser responder/audit guard (P2-8)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const setupUsers = (targetId = 'target-1') => {
        const target = {
            _id: targetId,
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
            deleteOne: vi.fn().mockResolvedValue(true),
        };
        User.findById.mockResolvedValue(target);
        return target;
    };

    const baseReq = (targetId = 'target-1') => ({
        params: { id: targetId },
        user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
        app: { get: vi.fn(() => null) },
    });

    test('queries all nine audit-trail branches in one $or', async () => {
        setupUsers();
        Report.exists.mockResolvedValue(null);

        const res = createRes();
        await deleteUser(baseReq(), res);

        expect(Report.exists).toHaveBeenCalledTimes(1);
        const query = Report.exists.mock.calls[0][0];
        expect(query.$or).toHaveLength(9);
        const branches = query.$or.map((b) => JSON.stringify(b));
        expect(branches).toContain(JSON.stringify({
            reporter: 'target-1',
            status: { $in: ['verified', 'responding', 'resolved'] },
        }));
        expect(branches).toContain(JSON.stringify({ 'responders.user': 'target-1' }));
        expect(branches).toContain(JSON.stringify({ verifiedBy: 'target-1' }));
        expect(branches).toContain(JSON.stringify({ resolvedBy: 'target-1' }));
        expect(branches).toContain(JSON.stringify({ respondedBy: 'target-1' }));
        // F3: transfer history, dispatch acknowledgement, report updates.
        expect(branches).toContain(JSON.stringify({ 'transferHistory.transferredBy': 'target-1' }));
        expect(branches).toContain(JSON.stringify({ 'transferHistory.acknowledgedBy': 'target-1' }));
        expect(branches).toContain(JSON.stringify({ 'dispatch.acknowledgedBy': 'target-1' }));
        expect(branches).toContain(JSON.stringify({ 'reportUpdates.author': 'target-1' }));
    });

    test('blocks with 400 when the user is linked to any incident report', async () => {
        setupUsers();
        Report.exists.mockResolvedValue({ _id: 'report-9' });

        const res = createRes();
        await deleteUser(baseReq(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: expect.stringContaining('Cannot delete user linked to incident reports'),
        }));
    });

    test('still deletes a user with no incident links', async () => {
        const target = setupUsers();
        Report.exists.mockResolvedValue(null);
        Report.find.mockReturnValue({ select: vi.fn().mockResolvedValue([]) });

        const res = createRes();
        await deleteUser(baseReq(), res);

        expect(target.deleteOne).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
