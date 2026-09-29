import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Municipal administrators provisioning responder accounts.
 *
 * The security properties these lock in, in order of how badly they would hurt
 * to lose:
 *
 * 1. **The municipality is never the client's to choose.** It comes from the
 *    session; the validator rejects a supplied `assignedMunicipality` outright
 *    and the handler would not read one anyway.
 * 2. **The role is never the client's to choose.** Same treatment — the account
 *    is always a `responder`.
 * 3. **No credential exists for the administrator to see.** The account is
 *    created with no password, which is also what makes it inert: login already
 *    refuses an account that has none.
 * 4. **The invitation secret is stored hashed.** The emailed token must not be
 *    recoverable from the database.
 * 5. **A mail failure is not a creation failure.** The account exists and the
 *    administrator is told, with a retry, rather than left in an ambiguous state.
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
            this._id = 'new-responder-id';
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

const { createResponder, resendResponderInvitation } = await import('../controllers/adminController.js');
const { validateCreateResponder } = await import('../middleware/validate.js');

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

const ADMIN = { _id: 'admin-1', name: 'Maria Santos', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

const validBody = {
    name: 'Juan Dela Cruz',
    email: 'Juan.DelaCruz@Example.com',
    agency: 'MDRRMO',
    responderUnit: 'MDRRMO Rescue 1',
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

describe('POST /api/admin/users/responder — validation', () => {
    test('accepts the four fields the form collects', async () => {
        const { passed } = await runChain(validateCreateResponder, validBody);
        expect(passed).toBe(true);
    });

    test.each([
        ['name', { ...validBody, name: '   ' }],
        ['email', { ...validBody, email: 'not-an-email' }],
        ['agency', { ...validBody, agency: 'COAST_GUARD' }],
        ['responderUnit', { ...validBody, responderUnit: 'x' }],
    ])('rejects an invalid %s', async (_field, body) => {
        const { res, passed } = await runChain(validateCreateResponder, body);

        expect(passed).toBe(false);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test.each(['role', 'assignedMunicipality', 'password'])(
        'rejects a client-supplied %s instead of quietly ignoring it',
        async (field) => {
            const { res, passed } = await runChain(validateCreateResponder, { ...validBody, [field]: 'anything' });

            // Rejected, not dropped: a client sending one of these is either
            // confused or probing, and a 200 would let either read as success.
            expect(passed).toBe(false);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].errors.map((error) => error.field)).toContain(field);
        },
    );
});

describe('createResponder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.saved.length = 0;
        mocks.findOne.mockResolvedValue(null);
        mocks.sendInvite.mockResolvedValue({ success: true });
    });

    test('creates a responder in the administrator’s own municipality and emails the invitation', async () => {
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        const created = mocks.saved[0];

        // Server-owned fields: role, municipality and creator, none from the body.
        expect(created.role).toBe('responder');
        expect(created.assignedMunicipality).toBe('Cajidiocan');
        expect(created.createdBy).toBe('admin-1');
        expect(created.agency).toBe('MDRRMO');
        expect(created.responderUnit).toBe('MDRRMO Rescue 1');
        expect(created.name).toBe('Juan Dela Cruz');
        // Normalised to match the schema's own lowercase+trim.
        expect(created.email).toBe('juan.delacruz@example.com');

        // No credential exists at all — not "a hidden one".
        expect(created.password).toBeUndefined();

        // The audit line the task asks for: creator, municipality, timestamp.
        expect(created.provisioningHistory[0]).toMatchObject({
            action: 'invited',
            actor: 'admin-1',
            municipality: 'Cajidiocan',
        });
        expect(created.provisioningHistory[0].at).toBeInstanceOf(Date);

        expect(mocks.sendInvite).toHaveBeenCalledTimes(1);
        expect(res.json.mock.calls[0][0].data.invitationSent).toBe(true);
    });

    test('stores only a hash of the invitation secret, never the emailed token', async () => {
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        const [, , inviteUrl] = mocks.sendInvite.mock.calls[0];
        const emailedToken = inviteUrl.split('/reset-password/')[1];
        const created = mocks.saved[0];

        expect(emailedToken).toMatch(/^[0-9a-f]{64}$/);
        // The database cannot be read back into a working link.
        expect(created.resetPasswordToken).not.toBe(emailedToken);
        expect(created.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
        expect(created.resetPasswordExpires.getTime()).toBeGreaterThan(Date.now());
    });

    test('rejects a duplicate email with a code the form can act on', async () => {
        mocks.findOne.mockResolvedValue({ _id: 'existing' });
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].code).toBe('EMAIL_IN_USE');
        expect(mocks.saved).toHaveLength(0);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('refuses an administrator with no municipality rather than guessing one', async () => {
        const res = createRes();

        await createResponder({ user: { _id: 'admin-2', name: 'X', role: 'municipal_admin' }, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mocks.saved).toHaveLength(0);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('normalises a legacy LGU agency to MDRRMO', async () => {
        const res = createRes();

        await createResponder({ user: ADMIN, body: { ...validBody, agency: 'LGU' } }, res);

        expect(mocks.saved[0].agency).toBe('MDRRMO');
    });

    test('keeps the account when the invitation email fails, and says so', async () => {
        mocks.sendInvite.mockResolvedValue({ success: false, error: 'SMTP refused' });
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        // Created, not rolled back: the account is inert until the link is used.
        expect(res.status).toHaveBeenCalledWith(201);
        const payload = res.json.mock.calls[0][0].data;
        expect(payload.invitationSent).toBe(false);
        expect(payload.message).toMatch(/resend invitation/i);

        // And the failure is on the audit trail.
        expect(mocks.saved[0].provisioningHistory[0].action).toBe('invitation_failed');
    });

    test('never returns the invitation secret in the created account payload', async () => {
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        const serialised = JSON.stringify(res.json.mock.calls[0][0]);
        expect(serialised).not.toMatch(/resetPassword/);
        expect(serialised).not.toContain(mocks.saved[0].resetPasswordToken);
    });
});

describe('resendResponderInvitation', () => {
    const RESPONDER = {
        _id: 'resp-1',
        name: 'Juan',
        email: 'juan@example.com',
        role: 'responder',
        agency: 'MDRRMO',
        assignedMunicipality: 'Cajidiocan',
        provisioningHistory: [],
        recordProvisioningEvent(event) { this.provisioningHistory.push(event); },
        save: vi.fn(async () => {}),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sendInvite.mockResolvedValue({ success: true });
    });

    test('re-issues the invitation for a local, not-yet-activated responder', async () => {
        mocks.findById.mockReturnValue({ select: vi.fn(async () => ({ ...RESPONDER })) });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(res.json.mock.calls[0][0].data.invitationSent).toBe(true);
        expect(mocks.sendInvite).toHaveBeenCalledTimes(1);
    });

    test('refuses a responder belonging to another municipality', async () => {
        mocks.findById.mockReturnValue({
            select: vi.fn(async () => ({ ...RESPONDER, assignedMunicipality: 'Magdiwang' })),
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('refuses a responder who has already set a password', async () => {
        mocks.findById.mockReturnValue({
            select: vi.fn(async () => ({ ...RESPONDER, password: 'hashed' })),
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].code).toBe('ALREADY_ACTIVATED');
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('refuses an account that is not a responder', async () => {
        mocks.findById.mockReturnValue({
            select: vi.fn(async () => ({ ...RESPONDER, role: 'reporter' })),
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
    });

    test('reports a delivery failure so the administrator can retry', async () => {
        mocks.findById.mockReturnValue({ select: vi.fn(async () => ({ ...RESPONDER })) });
        mocks.sendInvite.mockResolvedValue({ success: false, error: 'SMTP refused' });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json.mock.calls[0][0].code).toBe('INVITATION_DELIVERY_FAILED');
    });

    test('404s an unknown account', async () => {
        mocks.findById.mockReturnValue({ select: vi.fn(async () => null) });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'nope' } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
