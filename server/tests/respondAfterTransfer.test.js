import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
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
const { default: Notification } = await import('../models/Notification.js');
const { broadcastMultiUnitResponse } = await import('../services/socketService.js');

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
    // findById().populate() chain like the real Mongoose query; the
    // select().lean() chain serves the controller's race-loser re-read.
    Report.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(report),
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ status: report.status }) })),
    });
    // Emulates the atomic respond: the duplicate-guard filter and the
    // $push/$set update are applied to the in-memory mock report, like
    // MongoDB would apply them to the stored document.
    Report.findOneAndUpdate.mockImplementation((filter, update) => {
        const statusOk = Array.isArray(filter?.status?.$in)
            ? filter.status.$in.includes(report.status)
            : true;
        const idOk = filter?._id === undefined || String(filter._id) === String(report._id);
        const dupGuard = filter?.responders?.$not?.$elemMatch;
        const isDuplicate = dupGuard
            ? (report.responders || []).some(
                (r) => String(r?.user) === String(dupGuard.user) && r?.unitName === dupGuard.unitName
            )
            : false;
        const matched = statusOk && idOk && !isDuplicate;
        if (matched) {
            const pushed = update?.$push?.responders;
            if (pushed) report.responders = [...(report.responders || []), { ...pushed }];
            Object.assign(report, update?.$set || {});
        }
        return { populate: jest.fn().mockResolvedValue(matched ? report : null) };
    });
    Report.updateOne.mockResolvedValue({ modifiedCount: 1 });
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

        // The atomic write replaced the read-check-save: one contested
        // findOneAndUpdate instead of a mutated doc + save().
        expect(Report.findOneAndUpdate).toHaveBeenCalledTimes(1);
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
        expect(Report.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(report.responders).toHaveLength(1);
    });

    test('concurrent double-respond by the same unit yields one entry and one notification set', async () => {
        // Shared "database" row; both pre-reads take a stale snapshot (no
        // responders yet) so both pass the gates before either writes — the
        // double-click race.
        const dbReport = {
            _id: 'report-1',
            address: 'Boundary Road',
            status: 'verified',
            municipalityName: 'Magdiwang',
            responders: [],
            reporter: { _id: 'reporter-1' },
            toObject() {
                const { toObject: _self, ...rest } = this;
                return { ...rest };
            },
        };
        const snapshot = () => ({
            ...dbReport,
            reporter: { ...dbReport.reporter },
            responders: dbReport.responders.map((r) => ({ ...r })),
        });
        Report.findById.mockReturnValue({
            populate: jest.fn().mockImplementation(async () => snapshot()),
            select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ status: dbReport.status }) })),
        });
        Report.findOneAndUpdate.mockImplementation((filter, update) => {
            const statusOk = Array.isArray(filter?.status?.$in)
                ? filter.status.$in.includes(dbReport.status)
                : true;
            const idOk = filter?._id === undefined || String(filter._id) === String(dbReport._id);
            const dupGuard = filter?.responders?.$not?.$elemMatch;
            const isDuplicate = dupGuard
                ? dbReport.responders.some(
                    (r) => String(r?.user) === String(dupGuard.user) && r?.unitName === dupGuard.unitName
                )
                : false;
            const matched = statusOk && idOk && !isDuplicate;
            if (matched) {
                const pushed = update?.$push?.responders;
                if (pushed) dbReport.responders = [...dbReport.responders, { ...pushed }];
                Object.assign(dbReport, update?.$set || {});
            }
            return { populate: jest.fn().mockResolvedValue(matched ? snapshot() : null) };
        });
        Report.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const createDoubleClickReq = () => ({
            params: { id: 'report-1' },
            body: {},
            user: magdiwangResponder,
            app: {
                get: jest.fn(() => ({
                    emit: jest.fn(),
                    to: jest.fn(() => ({ emit: jest.fn() })),
                })),
            },
        });
        const res1 = createRes();
        const res2 = createRes();
        await Promise.all([
            respondToReport(createDoubleClickReq(), res1),
            respondToReport(createDoubleClickReq(), res2),
        ]);

        const succeeded = [res1, res2].filter((r) =>
            r.json.mock.calls.some(([payload]) => payload?.success === true));
        const conflicted = [res1, res2].filter((r) =>
            r.status.mock.calls.some(([code]) => code === 409));
        expect(succeeded).toHaveLength(1);
        expect(conflicted).toHaveLength(1);
        // Exactly one responder entry on the winning write...
        expect(dbReport.responders).toHaveLength(1);
        expect(dbReport.responders[0]).toMatchObject({
            user: 'magdiwang-user-id',
            unitName: 'MDRRMO - Magdiwang',
        });
        // ...and exactly one notification set: one reporter notification and
        // one broadcast from the winner; the loser emits nothing.
        expect(Notification.createAndSend).toHaveBeenCalledTimes(1);
        expect(broadcastMultiUnitResponse).toHaveBeenCalledTimes(1);
    });
});
