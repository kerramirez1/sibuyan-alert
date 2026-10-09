import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * municipal_admin accounts are visible in the municipal user list.
 *
 * This is deliberately a visibility change only: administrators can SEE the
 * other municipal_admin accounts of their own municipality, but
 * `ensureUserScopeAccess` still refuses municipal_admin targets for every
 * management action (delete, verify, invite-resend beyond same-office
 * invitations). The last test pins that boundary.
 */
const mocks = vi.hoisted(() => ({
    find: vi.fn(),
    findById: vi.fn(),
    countDocuments: vi.fn(),
    distinct: vi.fn(),
}));

vi.mock('../models/User.js', () => ({
    default: {
        find: mocks.find,
        findById: mocks.findById,
        countDocuments: mocks.countDocuments,
    },
}));

vi.mock('../models/Report.js', () => ({
    default: { distinct: mocks.distinct },
}));

const { getUsers, deleteUser } = await import('../controllers/adminController.js');

const ADMIN = { _id: 'admin-1', name: 'Maria Santos', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

const MOCK_USERS = [
    { _id: 'ord-1', name: 'Ord User', email: 'ord@example.com', role: 'ordinary', assignedMunicipality: 'Cajidiocan' },
    { _id: 'rep-1', name: 'Rep One', email: 'rep@example.com', role: 'reporter', verificationStatus: 'approved', assignedMunicipality: 'Cajidiocan' },
    { _id: 'resp-1', name: 'Resp One', email: 'resp@example.com', role: 'responder', assignedMunicipality: 'Cajidiocan' },
    { _id: 'adm-1', name: 'Admin One', email: 'adm1@example.com', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
    { _id: 'adm-2', name: 'Admin Two', email: 'adm2@example.com', role: 'municipal_admin', assignedMunicipality: 'Magdiwang' },
];

const scopedIds = () => MOCK_USERS.filter((u) => u.assignedMunicipality === 'Cajidiocan').map((u) => u._id);

const applyQuery = (query) => {
    let users = MOCK_USERS.filter((u) => scopedIds().includes(u._id));
    const roleQuery = query.role;
    if (typeof roleQuery === 'string') {
        users = users.filter((u) => u.role === roleQuery);
    } else if (roleQuery && Array.isArray(roleQuery.$in)) {
        users = users.filter((u) => roleQuery.$in.includes(u.role));
    }
    if (query.verificationStatus) {
        users = users.filter((u) => u.verificationStatus === query.verificationStatus);
    }
    return users;
};

const listQuery = () => mocks.find.mock.calls.map((call) => call[0]).find((q) => 'role' in q);

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

describe('getUsers — municipal_admin visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.distinct.mockResolvedValue([]);
        mocks.find.mockImplementation((query) => {
            // getMunicipalityScopedUserIds asks only for assigned ids.
            if (query.assignedMunicipality) {
                return {
                    select: vi.fn(async () => MOCK_USERS
                        .filter((u) => u.assignedMunicipality === query.assignedMunicipality)
                        .map((u) => ({ _id: u._id }))),
                };
            }
            const chain = {
                select: vi.fn(() => chain),
                sort: vi.fn(() => chain),
                limit: vi.fn(() => chain),
                skip: vi.fn(async () => applyQuery(query)),
            };
            return chain;
        });
        mocks.countDocuments.mockImplementation(async (query) => applyQuery(query).length);
    });

    test('lists municipal_admin accounts of the administrator\u2019s municipality by default', async () => {
        const res = createRes();

        await getUsers({ user: ADMIN, query: {} }, res);

        const payload = res.json.mock.calls[0][0].data;
        const roles = payload.users.map((u) => u.role);
        expect(roles).toContain('municipal_admin');
        expect(payload.users.map((u) => u._id)).toContain('adm-1');
        // Another municipality's admin stays out of scope.
        expect(payload.users.map((u) => u._id)).not.toContain('adm-2');
        // The query itself admits all four roles.
        expect(listQuery().role).toEqual({
            $in: ['ordinary', 'reporter', 'responder', 'municipal_admin'],
        });
    });

    test('role=municipal_admin filter returns only admins', async () => {
        const res = createRes();

        await getUsers({ user: ADMIN, query: { role: 'municipal_admin' } }, res);

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.users).toHaveLength(1);
        expect(payload.users[0].role).toBe('municipal_admin');
        expect(listQuery().role).toBe('municipal_admin');
    });

    test('role=invalid falls back to the default four-role set', async () => {
        const res = createRes();

        await getUsers({ user: ADMIN, query: { role: 'superadmin' } }, res);

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.users).toHaveLength(4);
        expect(listQuery().role).toEqual({
            $in: ['ordinary', 'reporter', 'responder', 'municipal_admin'],
        });
    });

    test('totalUsers stat counts municipal_admin accounts', async () => {
        const res = createRes();

        await getUsers({ user: ADMIN, query: {} }, res);

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.stats.totalUsers).toBe(4);
        expect(payload.stats.reporters).toBe(1);
        expect(payload.stats.responders).toBe(1);
    });
});

describe('municipal_admin management guard (unchanged)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('deleting another admin still returns 403', async () => {
        mocks.findById.mockResolvedValue({
            _id: 'adm-1',
            name: 'Admin One',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        });
        const res = createRes();

        await deleteUser({ user: ADMIN, params: { id: 'adm-1' }, app: { get: vi.fn(() => null) } }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].message).toBe('Not authorized to manage this account');
    });
});
