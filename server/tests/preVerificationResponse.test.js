import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock('../models/User.js', () => ({
    default: { find: jest.fn() },
}));

jest.mock('../models/Municipality.js', () => ({
    default: {},
}));

jest.mock('../models/Notification.js', () => ({
    default: { createAndSend: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn().mockResolvedValue({ success: true }),
    sendResponderInvitationEmail: jest.fn(),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUser: jest.fn().mockResolvedValue(false),
    pushTemplates: {
        reportVerified: jest.fn().mockReturnValue({}),
        reportRejected: jest.fn().mockReturnValue({}),
    },
}));

jest.mock('../services/socketService.js', () => ({
    broadcastMultiUnitResponse: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastReportRejected: jest.fn(),
    broadcastReportResolved: jest.fn(),
    broadcastVerifiedReportToResponders: jest.fn(),
}));

const { respondToReport, verifyReport } = await import('../controllers/adminController.js');
const { resolveDispatchPolicy } = await import('../config/dispatchPolicy.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');

// --- Minimal Mongo-shaped evaluator ---------------------------------------
// Understands exactly the filter/update shapes the two controllers use, so
// the atomic guards are exercised for real rather than assumed.
const getPath = (doc, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
const setPath = (doc, path, value) => {
    const keys = path.split('.');
    let target = doc;
    keys.slice(0, -1).forEach((key) => { if (target[key] == null) target[key] = {}; target = target[key]; });
    target[keys[keys.length - 1]] = value;
};

const matchCondition = (value, cond) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('$in' in cond) return cond.$in.some((entry) => String(entry) === String(value));
        if ('$gt' in cond) return typeof value === 'number' && value > cond.$gt;
        if ('$lte' in cond) return value != null && new Date(value).getTime() <= new Date(cond.$lte).getTime();
        if ('$exists' in cond) {
            if ((value !== undefined) !== cond.$exists) return false;
            if ('$ne' in cond) return value !== cond.$ne;
            return true;
        }
        if ('$ne' in cond) return value !== cond.$ne;
        if ('$not' in cond) return !matchCondition(value, cond.$not);
        if ('$elemMatch' in cond) {
            return Array.isArray(value) && value.some((entry) => Object.entries(cond.$elemMatch)
                .every(([key, expected]) => String(entry?.[key]) === String(expected)));
        }
        return false;
    }
    if (cond === null) return value === null || value === undefined;
    return String(value) === String(cond);
};

const matchesFilter = (doc, filter) => Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matchesFilter(doc, sub));
    if (key === '$and') return cond.every((sub) => matchesFilter(doc, sub));
    return matchCondition(getPath(doc, key), cond);
});

const applyUpdate = (doc, update) => {
    if (update.$set) Object.entries(update.$set).forEach(([key, value]) => setPath(doc, key, value));
    if (update.$push) {
        Object.entries(update.$push).forEach(([key, value]) => {
            const existing = getPath(doc, key);
            if (Array.isArray(existing)) existing.push(value);
            else setPath(doc, key, [value]);
        });
    }
};

// --- Fixtures ---------------------------------------------------------------
let currentUsers = [];
let ioEmits = [];
const fakeIo = {
    to: (room) => ({ emit: (event, payload) => ioEmits.push({ room, event, payload }) }),
    emit: (event, payload) => ioEmits.push({ room: null, event, payload }),
};

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

const createReport = (overrides = {}) => ({
    _id: 'report-1',
    status: 'pending',
    municipalityName: 'Cajidiocan',
    address: 'Poblacion coastal road',
    incidentType: 'vehicular',
    incidentCategory: 'accident',
    severity: 'moderate',
    casualties: { injured: 0, fatalities: 0, missing: 0 },
    createdAt: minutesAgo(1),
    responders: [],
    reportUpdates: [],
    verifiedBy: null,
    verifiedAt: null,
    preVerificationResponseAt: null,
    reporter: {
        _id: 'reporter-1',
        name: 'Reporter One',
        email: 'reporter@example.com',
        pushSubscription: null,
        notificationPreferences: { browserPush: false, email: false },
    },
    toObject: function toObject() {
        const { toObject: _omit, ...rest } = this;
        return { ...rest };
    },
    ...overrides,
});

const cajidiocanResponder = {
    _id: 'responder-1',
    role: 'responder',
    agency: 'MDRRMO',
    responderUnit: 'MDRRMO Alpha',
    assignedMunicipality: 'Cajidiocan',
    name: 'Responder One',
};

const secondResponder = {
    ...cajidiocanResponder,
    _id: 'responder-2',
    responderUnit: 'MDRRMO Bravo',
    name: 'Responder Two',
};

const cajidiocanAdmin = {
    _id: 'admin-1',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
    name: 'Admin One',
};

const respondReq = (user) => ({
    user,
    params: { id: 'report-1' },
    body: {},
    app: { get: () => fakeIo },
});

const verifyReq = (body) => ({
    user: cajidiocanAdmin,
    params: { id: 'report-1' },
    body,
    app: { get: () => fakeIo },
});

const wireReport = (report) => {
    Report.findById.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(report),
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ status: report.status }) })),
    }));
    Report.findOneAndUpdate.mockImplementation((filter, update) => {
        const matched = matchesFilter(report, filter);
        if (matched) applyUpdate(report, update);
        return { populate: jest.fn().mockResolvedValue(matched ? report : null) };
    });
    Report.updateOne.mockImplementation((filter, update) => {
        const matched = matchesFilter(report, filter);
        if (matched) applyUpdate(report, update);
        return Promise.resolve({ acknowledged: true, modifiedCount: matched ? 1 : 0 });
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    currentUsers = [];
    ioEmits = [];
    Notification.createAndSend.mockResolvedValue({});
    User.find.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(currentUsers),
    }));
});

describe('dispatch policy: pre-verification window knob', () => {
    test('defaults to 3 minutes and resolves to milliseconds', () => {
        const policy = resolveDispatchPolicy({});
        expect(policy.preVerificationWindowMinutes).toBe(3);
        expect(policy.preVerificationWindowMs).toBe(3 * 60 * 1000);
    });

    test('env override wins; malformed values fall back to the default', () => {
        expect(resolveDispatchPolicy({ DISPATCH_PRE_VERIFICATION_WINDOW_MINUTES: '5' }).preVerificationWindowMs)
            .toBe(5 * 60 * 1000);
        expect(resolveDispatchPolicy({ DISPATCH_PRE_VERIFICATION_WINDOW_MINUTES: 'soon' }).preVerificationWindowMs)
            .toBe(3 * 60 * 1000);
    });
});

describe('respondToReport: self-dispatch on pending reports', () => {
    test('(a) pending + injured=1 responds immediately, sets the marker, writes history, alerts admins', async () => {
        const report = createReport({ casualties: { injured: 1, fatalities: 0, missing: 0 } });
        wireReport(report);
        currentUsers = [{ _id: 'admin-1' }];
        const res = createRes();

        await respondToReport(respondReq(cajidiocanResponder), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.status).toBe('responding');
        expect(report.responders).toHaveLength(1);
        expect(report.preVerificationResponseAt).toBeInstanceOf(Date);
        const history = report.reportUpdates.find((entry) => entry.message?.includes('began responding before verification'));
        expect(history).toBeTruthy();
        expect(String(history.author)).toBe('responder-1');
        const adminAlert = Notification.createAndSend.mock.calls
            .map(([payload]) => payload)
            .find((payload) => payload.recipient === 'admin-1');
        expect(adminAlert?.title).toBe('Responder Dispatched to Unverified Report');
        expect(adminAlert?.data?.preVerification).toBe(true);
    });

    test('(b) pending + all-zero casualties inside the window is refused and stores nothing', async () => {
        const report = createReport({ createdAt: minutesAgo(1) });
        wireReport(report);
        const res = createRes();

        await respondToReport(respondReq(cajidiocanResponder), res);

        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.message).toContain('3 minutes after it was filed while it is unverified');
        expect(report.status).toBe('pending');
        expect(report.responders).toHaveLength(0);
        expect(report.preVerificationResponseAt).toBeNull();
        expect(Notification.createAndSend).not.toHaveBeenCalled();
    });

    test('(b) the same report after the window responds and sets the marker', async () => {
        const report = createReport({ createdAt: minutesAgo(4) });
        wireReport(report);
        const res = createRes();

        await respondToReport(respondReq(cajidiocanResponder), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.status).toBe('responding');
        expect(report.preVerificationResponseAt).toBeInstanceOf(Date);
    });

    test('(c) all-null casualties follow the timed path, never the immediate one', async () => {
        const early = createReport({
            casualties: { injured: null, fatalities: null, missing: null },
            createdAt: minutesAgo(1),
        });
        wireReport(early);
        const earlyRes = createRes();
        await respondToReport(respondReq(cajidiocanResponder), earlyRes);
        expect(earlyRes.status).toHaveBeenCalledWith(400);
        expect(early.status).toBe('pending');

        const later = createReport({
            casualties: { injured: null, fatalities: null, missing: null },
            createdAt: minutesAgo(4),
        });
        wireReport(later);
        const laterRes = createRes();
        await respondToReport(respondReq(cajidiocanResponder), laterRes);
        expect(laterRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(later.preVerificationResponseAt).toBeInstanceOf(Date);
    });

    test('(f) a second unit joining never moves the marker', async () => {
        const marker = minutesAgo(2);
        const report = createReport({
            status: 'responding',
            preVerificationResponseAt: marker,
            responders: [{
                user: 'responder-1',
                unitName: 'MDRRMO Alpha',
                unitType: 'MDRRMO',
                respondedAt: marker,
                notes: null,
            }],
        });
        wireReport(report);
        const res = createRes();

        await respondToReport(respondReq(secondResponder), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.responders).toHaveLength(2);
        expect(report.preVerificationResponseAt).toBe(marker);
    });

    test('(g) a verified report responds as today and never gains the marker', async () => {
        const report = createReport({
            status: 'verified',
            verifiedBy: 'admin-1',
            verifiedAt: minutesAgo(5),
        });
        wireReport(report);
        const res = createRes();

        await respondToReport(respondReq(cajidiocanResponder), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.status).toBe('responding');
        expect(report.preVerificationResponseAt).toBeNull();
        expect(report.reportUpdates).toHaveLength(0);
    });

    test('(h) a responder from another municipality still gets 403 on the new path', async () => {
        const report = createReport({ casualties: { injured: 2, fatalities: 0, missing: 0 } });
        wireReport(report);
        const res = createRes();
        const outsider = { ...cajidiocanResponder, _id: 'responder-9', assignedMunicipality: 'Magdiwang' };

        await respondToReport(respondReq(outsider), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(report.status).toBe('pending');
        expect(report.responders).toHaveLength(0);
        expect(report.preVerificationResponseAt).toBeNull();
    });
});

describe('verifyReport: reviewing a self-dispatched report', () => {
    const selfDispatchedReport = () => createReport({
        status: 'responding',
        preVerificationResponseAt: minutesAgo(2),
        responders: [{
            user: 'responder-1',
            unitName: 'MDRRMO Alpha',
            unitType: 'MDRRMO',
            respondedAt: minutesAgo(2),
            notes: null,
        }],
    });

    test('(d) verify sets verifiedBy/verifiedAt, keeps status responding, writes history', async () => {
        const report = selfDispatchedReport();
        wireReport(report);
        const res = createRes();

        await verifyReport(verifyReq({ status: 'verified' }), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.status).toBe('responding');
        expect(String(report.verifiedBy)).toBe('admin-1');
        expect(report.verifiedAt).toBeInstanceOf(Date);
        expect(report.dispatch).toBeUndefined();
        const history = report.reportUpdates.find((entry) => entry.message?.includes('verified after response began'));
        expect(history).toBeTruthy();
        expect(history.authorRole).toBe('municipal_admin');
    });

    test('(e) reject notifies the assigned responders to stand down', async () => {
        const report = selfDispatchedReport();
        wireReport(report);
        currentUsers = [{ _id: 'responder-1', pushSubscription: null, notificationPreferences: {} }];
        const res = createRes();

        await verifyReport(verifyReq({ status: 'rejected', rejectionReason: 'Not an emergency' }), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(report.status).toBe('rejected');
        const standDown = Notification.createAndSend.mock.calls
            .map(([payload]) => payload)
            .find((payload) => payload.recipient === 'responder-1' && payload.data?.standDown);
        expect(standDown).toBeTruthy();
        expect(standDown.title).toContain('Stand Down');
        const roomEvent = ioEmits.find((entry) => entry.event === 'reportStandDown');
        expect(roomEvent?.room).toBe('municipality_Cajidiocan_responders');
        expect(roomEvent?.payload?.responderIds).toContain('responder-1');
    });

    test('a normally verified responding report is NOT reviewable again', async () => {
        const report = createReport({
            status: 'responding',
            verifiedBy: 'admin-1',
            verifiedAt: minutesAgo(5),
            responders: [{
                user: 'responder-1',
                unitName: 'MDRRMO Alpha',
                unitType: 'MDRRMO',
                respondedAt: minutesAgo(4),
                notes: null,
            }],
        });
        wireReport(report);
        const res = createRes();

        await verifyReport(verifyReq({ status: 'verified' }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(report.status).toBe('responding');
    });
});
