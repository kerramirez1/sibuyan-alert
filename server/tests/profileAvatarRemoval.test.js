import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Removing a profile photo.
 *
 * Reported symptom: "it says successful but the photo is not deleted."
 *
 * The request really was successful — the profile was saved. The photo was the
 * part that never happened, in three places at once:
 *
 *   client  handleRemovePhoto()  cleared only the local preview
 *   client  handleSubmit()       sent nothing about the removal, so the server
 *                                could not tell "remove" from "no change"
 *   server  updateProfile()      the only branch touching `user.avatar` required
 *                                a replacement file, so there was no way to
 *                                remove one at all
 *
 * These lock in the server half: an explicit flag clears the field AND discards
 * the stored file, while an ordinary profile edit still cannot wipe an avatar by
 * omitting it.
 */
const mocks = vi.hoisted(() => ({
    findById: vi.fn(),
    uploadFileToGridFS: vi.fn(),
    deleteGridFsFileByUrl: vi.fn(),
    revokeAllUserSessions: vi.fn(),
    issueSession: vi.fn(),
}));

vi.mock('../models/User.js', () => {
    class MockUser {}
    MockUser.findById = mocks.findById;
    return { default: MockUser };
});

vi.mock('../services/gridFsService.js', () => ({
    uploadFileToGridFS: mocks.uploadFileToGridFS,
    deleteGridFsFileByUrl: mocks.deleteGridFsFileByUrl,
    deleteGridFsFilesByUrls: vi.fn(),
}));

vi.mock('../services/authSessionService.js', () => ({
    clearAuthCookies: vi.fn(),
    issueSession: mocks.issueSession,
    revokeAllUserSessions: mocks.revokeAllUserSessions,
    revokeRequestSession: vi.fn(),
    rotateSession: vi.fn(),
    setPrivateNoStore: vi.fn(),
}));

vi.mock('../utils/userPayload.js', () => ({
    buildSelfUserPayload: (user) => ({
        _id: String(user._id),
        name: user.name,
        avatar: user.avatar ?? null,
    }),
}));

const { updateProfile } = await import('../controllers/authController.js');

const STORED_AVATAR = '/api/files/507f191e810c19729de860ea';

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

const createReq = (body = {}, file = null) => ({
    user: { _id: 'user-1' },
    body,
    file,
    app: { get: () => null },
});

const primeUser = (overrides = {}) => {
    const user = {
        _id: 'user-1',
        name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        avatar: STORED_AVATAR,
        assignedMunicipality: 'Cajidiocan',
        notificationPreferences: {},
        save: vi.fn(async () => {}),
        comparePassword: vi.fn(async () => true),
        ...overrides,
    };
    mocks.findById.mockReturnValue({ select: vi.fn(async () => user) });
    return user;
};

describe('updateProfile — avatar removal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.uploadFileToGridFS.mockResolvedValue({ url: '/api/files/new-avatar-id' });
        mocks.deleteGridFsFileByUrl.mockResolvedValue(undefined);
    });

    test('clears the avatar and discards the stored file when removal is requested', async () => {
        const user = primeUser();
        const res = createRes();

        await updateProfile(createReq({ removeAvatar: 'true' }), res);

        // The field is what the UI reads...
        expect(user.avatar).toBeNull();
        expect(user.save).toHaveBeenCalled();
        // ...and the bytes must go with it, or the object is orphaned in GridFS
        // while the profile reads as having no photo.
        expect(mocks.deleteGridFsFileByUrl).toHaveBeenCalledWith(STORED_AVATAR);
        expect(res.json.mock.calls[0][0].success).toBe(true);
        expect(res.json.mock.calls[0][0].data.avatar).toBeNull();
    });

    test('an ordinary profile edit does not wipe the avatar', async () => {
        const user = primeUser();
        const res = createRes();

        await updateProfile(createReq({ name: 'Juan D.' }), res);

        // Omitting the avatar means "leave it alone", never "remove it".
        expect(user.avatar).toBe(STORED_AVATAR);
        expect(mocks.deleteGridFsFileByUrl).not.toHaveBeenCalled();
    });

    test('removeAvatar=false is not a removal', async () => {
        const user = primeUser();
        const res = createRes();

        await updateProfile(createReq({ removeAvatar: 'false' }), res);

        expect(user.avatar).toBe(STORED_AVATAR);
        expect(mocks.deleteGridFsFileByUrl).not.toHaveBeenCalled();
    });

    test('a replacement still wins and discards the previous file', async () => {
        const user = primeUser();
        const res = createRes();

        await updateProfile(createReq({}, { originalname: 'a.png', mimetype: 'image/png' }), res);

        expect(user.avatar).toBe('/api/files/new-avatar-id');
        expect(mocks.deleteGridFsFileByUrl).toHaveBeenCalledWith(STORED_AVATAR);
    });

    test('removal with no stored avatar is a no-op, not an error', async () => {
        const user = primeUser({ avatar: null });
        const res = createRes();

        await updateProfile(createReq({ removeAvatar: 'true' }), res);

        expect(user.avatar).toBeNull();
        expect(mocks.deleteGridFsFileByUrl).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    test('a removal-only request is still a successful save', async () => {
        const user = primeUser();
        const res = createRes();

        // This is the whole payload when the photo is the only change — the
        // client used to send an entirely empty body here.
        await updateProfile(createReq({ removeAvatar: 'true' }), res);

        expect(user.save).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledTimes(1);
    });

    test('a rejecting rollback delete still returns the 500 JSON shape (P2-5)', async () => {
        const user = primeUser();
        user.save.mockRejectedValueOnce(new Error('db down'));
        mocks.deleteGridFsFileByUrl.mockRejectedValueOnce(new Error('gridfs down'));
        const res = createRes();

        await updateProfile(createReq({}, { originalname: 'a.png', mimetype: 'image/png' }), res);

        expect(mocks.deleteGridFsFileByUrl).toHaveBeenCalledWith('/api/files/new-avatar-id');
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'Failed to update profile',
        });
    });
});
