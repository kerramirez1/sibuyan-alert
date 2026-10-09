import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Municipal administrators provisioning municipal_admin accounts for their
 * OWN municipality only.
 *
 * The security properties these lock in, in order of how badly they would hurt
 * to lose:
 *
 * 1. **The municipality is never the client's to choose.** It comes from the
 *    session; the validator rejects a supplied `assignedMunicipality` outright
 *    and the handler would not read one anyway. A municipal_admin can only
 *    ever provision for the office they already belong to — sovereignty holds.
 * 2. **The role is never the client's to choose.** Same treatment — the
 *    account is always a `municipal_admin`.
 * 3. **No credential exists for the administrator to see.** The account is
 *    created with no password, which is also what makes it inert: login
 *    already refuses an account that has none.
 * 4. **A mail failure is not a creation failure.** The account exists and the
 *    administrator is told, with a retry, rather than left in an ambiguous
 *    state.
 */
const mocks = vi.hoisted(() => ({
    findOne: vi.fn(),
    findById: vi.fn(),
    sendInvite: vi.fn(),
    saved: [],
}));

vi.mock('../models/User.js', () => {
    class MockUser {
        constructor(data) {
            Object.assign(this, data);
            this._id = 'new-admin-id';
            this.createdAt = new Date('2026-09-29T00:00:00.000Z');
            this.provisioningHistory = [];
        }

        recordProvisioningEvent(event) {
            // Mirrors the real method, timestamp included — the timestamp is one
            // of the three things the audit line is required to carry.
            this.provisioningHistory.push({ ...event, at: new Date() });
        }

        async save() {
            mocks.saved.push(this);
        }
    }

    MockUser.findOne = mocks.findOne;
    MockUser.findById = mocks.findById;
    return { default: MockUser };
});

vi.mock('../services/emailService.js', () => ({
    sendVerificationEmail: vi.fn(),
    sendReportStatusEmail: vi.fn(),
    sendResponderInvitationEmail: mocks.sendInvite,
}));

const { createAdmin, resendResponderInvitation } = await import('../controllers/adminController.js');
const { validateCreateAdmin } = await import('../middleware/validate.js');

// The emailed link is built from CLIENT_URL, so the success path runs with a
// reachable absolute URL — the same precondition production requires.
// Failure-path tests override these per case; the restore keeps the process
// environment identical for every other suite in the file.
const ORIGINAL_CLIENT_URL = process.env.CLIENT_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
    if (ORIGINAL_CLIENT_URL === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = ORIGINAL_CLIENT_URL;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

const ADMIN = { _id: 'admin-1', name: 'Maria Santos', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

const validBody = {
    name: 'Ana Reyes',
    email: 'Ana.Reyes@Example.com',
};

/**
 * Runs an express-validator chain. Each middleware is awaited — they resolve
 * asynchronously even for synchronous rules, so a non-awaited walk runs
 * `handleValidationErrors` before any rule has recorded its result.
 */
const runChain = async (chain, body) => {
    const req = { body, params: {}, query: {} };
    const res = createRes();

    for (const middleware of chain) {
        let advanced = false;
        await middleware(req, res, () => { advanced = true; });
        if (!advanced) break;
    }

    return { res, passed: res.status.mock.calls.length === 0 };
};

describe('POST /api/admin/users/admin — validation', () => {
    test('accepts the two fields the form collects', async () => {
        const { passed } = await runChain(validateCreateAdmin, validBody);
        expect(passed).toBe(true);
    });

    test.each([
        ['name', { ...validBody, name: '   ' }],
        ['email', { ...validBody, email: 'not-an-email' }],
    ])('rejects a malformed %s', async (_field, body) => {
        const { passed, res } = await runChain(validateCreateAdmin, body);
        expect(passed).toBe(false);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test.each([
        ['assignedMunicipality', { ...validBody, assignedMunicipality: 'Magdiwang' }],
        ['role', { ...validBody, role: 'responder' }],
        ['password', { ...validBody, password: 'secret' }],
    ])('rejects a client-supplied %s — the server owns it', async (_field, body) => {
        const { passed, res } = await runChain(validateCreateAdmin, body);
        expect(passed).toBe(false);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('createAdmin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.saved.length = 0;
        mocks.findOne.mockResolvedValue(null);
        mocks.sendInvite.mockResolvedValue({ success: true });
        process.env.CLIENT_URL = 'https://app.example';
        process.env.NODE_ENV = 'test';
    });

    test('creates a municipal_admin with the creator\u2019s municipality — never the client\u2019s', async () => {
        const res = createRes();

        await createAdmin({ user: ADMIN, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        const saved = mocks.saved[0];
        expect(saved.role).toBe('municipal_admin');
        expect(saved.assignedMunicipality).toBe('Cajidiocan');
        expect(saved.createdBy).toBe('admin-1');
        expect(saved.name).toBe('Ana Reyes');
        // The schema lowercases and trims; the handler normalises before the
        // duplicate check and the insert so "A@B.com" cannot double-book.
        expect(saved.email).toBe('ana.reyes@example.com');
        expect(saved.agency).toBeUndefined();
        expect(saved.responderUnit).toBeUndefined();
        expect(saved.password).toBeUndefined();

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.user.role).toBe('municipal_admin');
        expect(payload.invitationSent).toBe(true);
    });

    test('the invitation email reads as an admin invitation, not a responder one', async () => {
        const res = createRes();

        await createAdmin({ user: ADMIN, body: validBody }, res);

        expect(mocks.sendInvite).toHaveBeenCalledTimes(1);
        const options = mocks.sendInvite.mock.calls[0][3];
        expect(options.roleLabel).toBe('admin');
    });

    test('refuses a duplicate email with EMAIL_IN_USE', async () => {
        mocks.findOne.mockResolvedValue({ _id: 'existing', email: 'ana.reyes@example.com' });
        const res = createRes();

        await createAdmin({ user: ADMIN, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].code).toBe('EMAIL_IN_USE');
        expect(mocks.saved).toHaveLength(0);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('refuses an administrator with no assigned municipality', async () => {
        const res = createRes();

        await createAdmin({ user: { ...ADMIN, assignedMunicipality: null }, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mocks.saved).toHaveLength(0);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('a mail failure still creates the account and says so, with a retry', async () => {
        mocks.sendInvite.mockResolvedValue({ success: false, error: 'SMTP refused' });
        const res = createRes();

        await createAdmin({ user: ADMIN, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mocks.saved).toHaveLength(1);
        const payload = res.json.mock.calls[0][0].data;
        expect(payload.invitationSent).toBe(false);
        expect(payload.message).toMatch(/could not be sent/i);
        expect(payload.message).toMatch(/Resend invitation/);
    });
});

describe('resendResponderInvitation — admin accounts', () => {
    const NEW_ADMIN = {
        _id: 'new-admin-id',
        name: 'Ana Reyes',
        email: 'ana@example.com',
        role: 'municipal_admin',
        assignedMunicipality: 'Cajidiocan',
        provisioningHistory: [],
        recordProvisioningEvent(event) { this.provisioningHistory.push(event); },
        save: vi.fn(async () => {}),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sendInvite.mockResolvedValue({ success: true });
        process.env.CLIENT_URL = 'https://app.example';
        process.env.NODE_ENV = 'test';
    });

    test('re-issues the invitation for a local, not-yet-activated admin', async () => {
        mocks.findById.mockReturnValue({ select: vi.fn(async () => ({ ...NEW_ADMIN })) });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'new-admin-id' } }, res);

        expect(res.json.mock.calls[0][0].data.invitationSent).toBe(true);
        expect(mocks.sendInvite).toHaveBeenCalledTimes(1);
        // The retried mail must read as an admin invitation too.
        expect(mocks.sendInvite.mock.calls[0][3].roleLabel).toBe('admin');
    });

    test('refuses to re-issue for an admin of a different municipality', async () => {
        mocks.findById.mockReturnValue({
            select: vi.fn(async () => ({ ...NEW_ADMIN, assignedMunicipality: 'Magdiwang' })),
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'new-admin-id' } }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('still refuses an account that is neither responder nor admin', async () => {
        mocks.findById.mockReturnValue({
            select: vi.fn(async () => ({ ...NEW_ADMIN, role: 'reporter' })),
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'new-admin-id' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('refuses an admin who has already set a password', async () => {
        mocks.findById.mockReturnValue({
            select: vi.fn(async () => ({ ...NEW_ADMIN, password: 'hashed' })),
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'new-admin-id' } }, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].code).toBe('ALREADY_ACTIVATED');
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });
});
