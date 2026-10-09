import { describe, expect, test, vi as jest } from 'vitest';
import { getPresence } from '../controllers/adminController.js';
import { requireRole } from '../middleware/roleCheck.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const socketWithUser = (user) => ({ data: { user } });

describe('GET /api/admin/presence', () => {
    test('counts unique online responders and admins in municipal rooms', async () => {
        const responderSockets = [
            socketWithUser({ id: 'r1', role: 'responder', assignedMunicipality: 'Cajidiocan' }),
            socketWithUser({ id: 'r1', role: 'responder', assignedMunicipality: 'Cajidiocan' }),
            socketWithUser({ id: 'r2', role: 'responder', assignedMunicipality: 'Cajidiocan' }),
        ];
        const memberSockets = [
            socketWithUser({ id: 'a1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' }),
            socketWithUser({ id: 'r2', role: 'responder', assignedMunicipality: 'Cajidiocan' }),
        ];
        const io = {
            in: jest.fn((room) => ({
                fetchSockets: jest.fn(async () => (
                    room.endsWith('_responders') ? responderSockets : memberSockets
                )),
            })),
        };
        const req = {
            user: { _id: 'a1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            app: { get: jest.fn(() => io) },
        };
        const res = createRes();

        await getPresence(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledTimes(1);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.data).toMatchObject({
            municipality: 'Cajidiocan',
            respondersOnline: 2,
            adminsOnline: 1,
            operatorsOnline: 3,
        });
        expect(typeof payload.data.updatedAt).toBe('string');
    });

    test('returns 403 when the administrator has no municipality', async () => {
        const req = {
            user: { _id: 'a1', role: 'municipal_admin' },
            app: { get: jest.fn(() => ({})) },
        };
        const res = createRes();

        await getPresence(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 503 when realtime is unavailable', async () => {
        const req = {
            user: { _id: 'a1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            app: { get: jest.fn(() => null) },
        };
        const res = createRes();

        await getPresence(req, res);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json.mock.calls[0][0].code).toBe('REALTIME_UNAVAILABLE');
    });
});

/**
 * Route-level role gating for GET /api/admin/presence. The controller itself
 * is municipality-scoped and returns counts only, so responders of the same
 * municipality may read it; ordinary users and reporters may not.
 */
describe('GET /api/admin/presence — role gating', () => {
    const runGate = (role) => new Promise((resolve) => {
        const middleware = requireRole('municipal_admin', 'responder');
        const req = { user: { _id: 'u1', role, assignedMunicipality: 'Cajidiocan' } };
        const res = { status: (code) => ({ json: () => resolve(code) }) };
        middleware(req, res, () => resolve(200));
    });

    test.each([
        ['municipal_admin', 200],
        ['responder', 200],
        ['ordinary', 403],
        ['reporter', 403],
    ])('role %s → %s', async (role, expected) => {
        expect(await runGate(role)).toBe(expected);
    });
});
