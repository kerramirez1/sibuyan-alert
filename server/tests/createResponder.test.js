import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
    name: 'Juan Dela Cruz',
    email: 'Juan.DelaCruz@Example.com',
    agency: 'MDRRMO',
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

    test.each(['RESCUE', 'MEDICAL'])('no longer accepts %s for a new responder', async (agency) => {
        const { res, passed } = await runChain(validateCreateResponder, { ...validBody, agency });

        // Removed from the intake, not from storage: existing accounts still carry
        // these values and the User.agency enum still accepts them.
        expect(passed).toBe(false);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('still accepts every agency that remains on offer', async () => {
        for (const agency of ['MDRRMO', 'PNP', 'BFP', 'Medical Team', 'BARANGAY']) {
            const { passed } = await runChain(validateCreateResponder, { ...validBody, agency });
            expect(passed).toBe(true);
        }
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
        process.env.CLIENT_URL = 'https://app.example';
        process.env.NODE_ENV = 'test';
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
        expect(created.name).toBe('Juan Dela Cruz');
        // The form no longer collects a unit name; stored null, not ''.
        expect(created.responderUnit).toBeNull();
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

    test('still stores a unit name when a client supplies one', async () => {
        const res = createRes();

        await createResponder({ user: ADMIN, body: { ...validBody, responderUnit: 'MDRRMO Rescue 1' } }, res);

        // Optional now, not removed: an older client that still sends one keeps
        // working and the value is stored.
        expect(res.status).toHaveBeenCalledWith(201);
        expect(mocks.saved[0].responderUnit).toBe('MDRRMO Rescue 1');
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

    test('points the administrator at the address when the recipient was not accepted', async () => {
        // The transport resolved but never accepted the message for this address.
        mocks.sendInvite.mockResolvedValue({
            success: false,
            code: 'RECIPIENT_REJECTED',
            error: 'The mail server did not accept the recipient address',
        });
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        const payload = res.json.mock.calls[0][0].data;

        // Not "sent", and the cause names the address rather than the server —
        // which is the opposite of the CLIENT_URL and SMTP cases.
        expect(payload.invitationSent).toBe(false);
        expect(payload.message).toMatch(/did not accept that recipient address/i);
        expect(payload.message).not.toMatch(/CLIENT_URL|SMTP/i);
    });

    test('says so plainly when the transport never confirmed the recipient', async () => {
        mocks.sendInvite.mockResolvedValue({
            success: false,
            code: 'DELIVERY_UNCONFIRMED',
            messageId: '<unconfirmed@example.com>',
            error: 'The mail server did not confirm whether it accepted the recipient',
        });
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.invitationSent).toBe(false);
        // Neither "sent" nor blamed on the address — the honest answer is that
        // acceptance could not be confirmed.
        expect(payload.message).toMatch(/did not confirm/i);
    });

    test('never echoes the address or the link back on a delivery failure', async () => {
        mocks.sendInvite.mockResolvedValue({
            success: false,
            code: 'RECIPIENT_REJECTED',
            error: 'The mail server did not accept the recipient address',
        });
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.message).not.toContain('juan.delacruz@example.com');
        expect(payload.message).not.toMatch(/reset-password/);
        expect(JSON.stringify(payload)).not.toContain(mocks.saved[0].resetPasswordToken);
    });

    test('emails an absolute invitation URL on the client reset-password route', async () => {
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        const [, , inviteUrl] = mocks.sendInvite.mock.calls[0];
        // Absolute and reachable: the recipient's browser resolves the host,
        // and the path is the route the client actually serves.
        expect(inviteUrl.startsWith('https://app.example/reset-password/')).toBe(true);
        expect(inviteUrl.split('/reset-password/')[1]).toMatch(/^[0-9a-f]{64}$/);
    });

    test('keeps the account and names CLIENT_URL when no usable client URL is configured', async () => {
        delete process.env.CLIENT_URL;
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        // Created, not rolled back — and crucially, nothing was emailed, so no
        // dead relative link is in flight anywhere.
        expect(res.status).toHaveBeenCalledWith(201);
        expect(mocks.sendInvite).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0].data;
        expect(payload.invitationSent).toBe(false);
        expect(payload.message).toMatch(/CLIENT_URL/);
        expect(payload.message).toMatch(/resend invitation/i);
        expect(mocks.saved[0].provisioningHistory[0].action).toBe('invitation_failed');

        // The failure response carries the same secrecy guarantees as success.
        const serialised = JSON.stringify(res.json.mock.calls[0][0]);
        expect(serialised).not.toMatch(/resetPassword/);
        expect(serialised).not.toContain(mocks.saved[0].resetPasswordToken);
    });

    test('refuses a localhost invitation link in a deployed environment', async () => {
        process.env.NODE_ENV = 'production';
        process.env.CLIENT_URL = 'http://localhost:5173';
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        // SMTP would have accepted this message — which is exactly why the
        // link must be validated first. Nothing is emailed.
        expect(mocks.sendInvite).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0].data;
        expect(payload.invitationSent).toBe(false);
        expect(payload.message).toMatch(/CLIENT_URL/);
        expect(mocks.saved[0].provisioningHistory[0].action).toBe('invitation_failed');
    });

    test('still allows a localhost invitation link in local development', async () => {
        process.env.NODE_ENV = 'development';
        process.env.CLIENT_URL = 'http://localhost:5173';
        const res = createRes();

        await createResponder({ user: ADMIN, body: validBody }, res);

        expect(mocks.sendInvite).toHaveBeenCalledTimes(1);
        expect(res.json.mock.calls[0][0].data.invitationSent).toBe(true);
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
        process.env.CLIENT_URL = 'https://app.example';
        process.env.NODE_ENV = 'test';
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
        // A rejected message points at the address, not the server.
        expect(res.json.mock.calls[0][0].message).toMatch(/check the address/i);
    });

    test('names the server configuration instead of the address when mail is unconfigured', async () => {
        mocks.findById.mockReturnValue({ select: vi.fn(async () => ({ ...RESPONDER })) });
        // The code is what the service actually returns; classification is
        // code-driven now rather than a regex over the message text.
        mocks.sendInvite.mockResolvedValue({
            success: false,
            code: 'EMAIL_NOT_CONFIGURED',
            error: 'Email delivery is not configured',
        });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json.mock.calls[0][0].code).toBe('INVITATION_DELIVERY_FAILED');
        expect(res.json.mock.calls[0][0].message).toMatch(/not configured/i);
        expect(res.json.mock.calls[0][0].message).not.toMatch(/check the address/i);
    });

    test('names CLIENT_URL when the invitation link cannot be built', async () => {
        delete process.env.CLIENT_URL;
        mocks.findById.mockReturnValue({ select: vi.fn(async () => ({ ...RESPONDER })) });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'resp-1' } }, res);

        expect(mocks.sendInvite).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json.mock.calls[0][0].message).toMatch(/CLIENT_URL/);
    });

    test('404s an unknown account', async () => {
        mocks.findById.mockReturnValue({ select: vi.fn(async () => null) });
        const res = createRes();

        await resendResponderInvitation({ user: ADMIN, params: { id: 'nope' } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
