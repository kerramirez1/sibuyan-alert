import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: { findById: jest.fn() },
}));

jest.mock('../models/User.js', () => ({
    default: { find: jest.fn(() => ({ select: jest.fn().mockResolvedValue([]) })) },
}));

jest.mock('../models/Municipality.js', () => ({
    default: {},
}));

jest.mock('../models/Notification.js', () => ({
    default: { createAndSend: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUser: jest.fn(),
    pushTemplates: {},
}));

jest.mock('../services/socketService.js', () => ({
    broadcastMultiUnitResponse: jest.fn(),
}));

const { respondToReport } = await import('../controllers/adminController.js');
const { default: Report } = await import('../models/Report.js');

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

// Report transferred Cajidiocan -> Magdiwang, with the Cajidiocan unit
// already on scene. Mirrors the production shape (ObjectId-like strings).
const createTransferredReport = (overrides = {}) => {
    const report = {
        _id: 'report-1',
        address: 'Boundary Road',
        status: 'transferred',
        municipalityName: 'Magdiwang',
        originalMunicipalityName: 'Cajidiocan',
        responders: [
            {
                user: 'cajidiocan-user-id',
                unitName: 'MDRRMO - Cajidiocan',
                unitType: 'MDRRMO',
                respondedAt: new Date('2026-08-11T01:08:00.000Z'),
                notes: null,
            },
        ],
        transferHistory: [
            {
                fromMunicipalityName: 'Cajidiocan',
                toMunicipalityName: 'Magdiwang',
                reason: 'Mutual-aid response coverage request',
                acknowledgedAt: null,
            },
        ],
        reporter: { _id: 'reporter-1' },
        respondedBy: 'cajidiocan-user-id',
        respondedAt: new Date('2026-08-11T01:10:00.000Z'),
        responderAgency: 'MDRRMO',
        save: jest.fn().mockResolvedValue(undefined),
        toObject: jest.fn(function toObject() {
            const { save: _save, toObject: _self, ...rest } = this;
            return { ...rest };
        }),
        ...overrides,
    };
    return report;
};

const magdiwangResponder = {
    _id: 'magdiwang-user-id',
    role: 'responder',
    agency: 'MDRRMO',
    responderUnit: null,
    assignedMunicipality: 'Magdiwang',
    name: 'MDRRMO Magdiwang Operative',
};

const createReq = (report, user, body = {}) => {
    // findById().populate() chain like the real Mongoose query
    Report.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(report) });
    return {
        params: { id: 'report-1' },
        body,
        user,
        app: { get: jest.fn(() => null) },
    };
};

describe('respond after transfer with a prior responder on scene', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('a different-municipality responder joins a transferred report (no false duplicate)', async () => {
        const report = createTransferredReport();

        const req = createReq(report, magdiwangResponder);
        const res = createRes();

        await respondToReport(req, res);

        expect(report.save).toHaveBeenCalledTimes(1);
        expect(report.responders).toHaveLength(2);
        expect(report.responders[1]).toMatchObject({
            user: 'magdiwang-user-id',
            unitName: 'MDRRMO - Magdiwang',
            unitType: 'MDRRMO',
        });
        expect(report.status).toBe('responding');
        // Legacy first-responder pointer stays with the Cajidiocan unit
        expect(report.respondedBy).toBe('cajidiocan-user-id');
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
        expect(res.status).not.toHaveBeenCalledWith(409);
        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(res.status).not.toHaveBeenCalledWith(500);
    });

    test('the same user cannot respond twice with the same unit (true duplicate still blocked)', async () => {
        const report = createTransferredReport({
            responders: [
                {
                    user: 'magdiwang-user-id',
                    unitName: 'MDRRMO - Magdiwang',
                    unitType: 'MDRRMO',
                    respondedAt: new Date(),
                    notes: null,
                },
            ],
        });
        const req = createReq(report, magdiwangResponder);
        const res = createRes();

        await respondToReport(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(report.save).not.toHaveBeenCalled();
    });
});
