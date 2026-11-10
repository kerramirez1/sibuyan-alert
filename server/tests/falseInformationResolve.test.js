import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * False-information resolve: the flag, its notes gate, the reporter
 * notification wording, and the analytics exclusion.
 *
 * Resolve cases run the real controller against a mocked Report model
 * (the resolveReport.test.js pattern). Analytics cases evaluate the REAL
 * query shapes the controllers build against in-memory fixtures (the
 * adminAnalyticsAccuracy.test.js pattern), so the counts asserted here
 * are the counts production would produce.
 */

vi.mock('../models/Report.js', () => ({
    default: {
        findById: vi.fn(),
        countDocuments: vi.fn(),
        distinct: vi.fn(),
        find: vi.fn(),
        aggregate: vi.fn(),
    },
}));
vi.mock('../models/User.js', () => ({ default: { countDocuments: vi.fn(), find: vi.fn() } }));
vi.mock('../models/Municipality.js', () => ({ default: {} }));
vi.mock('../models/HighRiskZone.js', () => ({ default: { countDocuments: vi.fn() } }));
vi.mock('../models/Notification.js', () => ({
    default: { createAndSend: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../services/emailService.js', () => ({
    sendVerificationEmail: vi.fn(),
    sendReportStatusEmail: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../services/pushService.js', () => ({
    sendPushToUser: vi.fn().mockResolvedValue(false),
    pushTemplates: { reporterVerified: vi.fn(), reporterRejected: vi.fn() },
}));
vi.mock('../services/socketService.js', () => ({
    broadcastVerifiedReportToResponders: vi.fn(),
    broadcastReportVerified: vi.fn(),
    broadcastReportRejected: vi.fn(),
    broadcastReportResolved: vi.fn(),
}));
vi.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: vi.fn().mockResolvedValue(true),
    uploadFilesToGridFS: vi.fn(),
    getGridFsBucket: vi.fn(),
}));

const { resolveReport } = await import('../controllers/adminController.js');
const { getAdminAnalytics, getPublicAnalytics } = await import('../controllers/analyticsController.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');
const { sendPushToUser } = await import('../services/pushService.js');
const { uploadFilesToGridFS } = await import('../services/gridFsService.js');
const { buildAccidentHotspotMatch } = await import('../utils/accidentHotspots.js');
const { FALSE_INFORMATION_EXCLUSION } = await import('../utils/analyticsScope.js');

const createRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

// --- In-memory Mongo matcher (subset, mirrors adminAnalyticsAccuracy) ---
const getPath = (doc, pathStr) => pathStr.split('.').reduce(
    (current, key) => (current === null || current === undefined ? undefined : current[key]),
    doc,
);
const matchCondition = (value, condition) => {
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        return Object.entries(condition).every(([operator, expected]) => {
            switch (operator) {
                case '$ne': return Array.isArray(value) ? !value.includes(expected) : value !== expected;
                case '$in': return Array.isArray(expected) && expected.includes(value);
                case '$nin': return Array.isArray(expected) && !expected.includes(value);
                case '$gte': return value >= expected;
                case '$gt': return value > expected;
                case '$lte': return value <= expected;
                case '$lt': return value < expected;
                case '$type': return expected === 'number' ? typeof value === 'number' : true;
                case '$exists': return expected ? value !== undefined : value === undefined;
                default: return false;
            }
        });
    }
    return value === condition;
};
const matchDoc = (doc, query = {}) => Object.entries(query).every(([key, condition]) => {
    if (key === '$and') return condition.every((clause) => matchDoc(doc, clause));
    if (key === '$or') return condition.some((clause) => matchDoc(doc, clause));
    return matchCondition(getPath(doc, key), condition);
});
const evalGroupId = (doc, spec) => {
    if (typeof spec === 'string' && spec.startsWith('$')) return getPath(doc, spec.slice(1));
    if (spec && typeof spec === 'object') {
        if (spec.$ifNull) {
            for (const option of spec.$ifNull) {
                const value = typeof option === 'string' && option.startsWith('$') ? getPath(doc, option.slice(1)) : option;
                if (value !== null && value !== undefined) return value;
            }
            return null;
        }
        if (spec.$toLower) {
            const value = getPath(doc, spec.$toLower.slice(1));
            return typeof value === 'string' ? value.toLowerCase() : value;
        }
        if (spec.$dateToString) {
            const raw = getPath(doc, spec.$dateToString.date.slice(1));
            const date = new Date(raw);
            const shifted = new Date(date.getTime() + (spec.$dateToString.timezone === 'Asia/Manila' ? 8 * 60 * 60 * 1000 : 0));
            const pad = (n) => String(n).padStart(2, '0');
            return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
        }
    }
    return spec;
};
const evalSum = (docs, spec) => {
    if (spec === 1) return docs.length;
    if (spec?.$ifNull) {
        const [pathArg, fallback] = spec.$ifNull;
        const field = typeof pathArg === 'string' && pathArg.startsWith('$') ? pathArg.slice(1) : pathArg;
        return docs.reduce((sum, doc) => sum + (Number(getPath(doc, field) ?? fallback) || 0), 0);
    }
    return 0;
};
const runAggregate = (docs, pipeline) => {
    let rows = [...docs];
    for (const stage of pipeline) {
        if (stage.$match) {
            rows = rows.filter((doc) => matchDoc(doc, stage.$match));
        } else if (stage.$group) {
            const groups = new Map();
            for (const doc of rows) {
                const key = JSON.stringify(evalGroupId(doc, stage.$group._id));
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(doc);
            }
            rows = [...groups.entries()].map(([key, groupDocs]) => {
                const row = { _id: JSON.parse(key) };
                for (const [field, spec] of Object.entries(stage.$group)) {
                    if (field === '_id') continue;
                    if (spec?.$sum !== undefined) row[field] = evalSum(groupDocs, spec.$sum);
                    else if (spec?.$first) {
                        const p = spec.$first.startsWith('$') ? spec.$first.slice(1) : spec.$first;
                        row[field] = getPath(groupDocs[0], p);
                    }
                }
                return row;
            });
        } else if (stage.$sort) {
            const [[field, direction]] = Object.entries(stage.$sort);
            rows = [...rows].sort((a, b) => {
                if (a[field] < b[field]) return direction === 1 ? -1 : 1;
                if (a[field] > b[field]) return direction === 1 ? 1 : -1;
                return 0;
            });
        }
    }
    return rows;
};
const chainable = (rows) => {
    const query = Promise.resolve(rows);
    query.sort = () => chainable(rows);
    query.limit = (n) => chainable(rows.slice(0, n));
    query.populate = () => chainable(rows);
    query.select = () => chainable(rows);
    return query;
};

// --- Resolve fixtures ---
const RESPONDER = { _id: 'user1', role: 'responder', agency: 'MDRRMO', name: 'Ramon Reyes', assignedMunicipality: 'Cajidiocan' };

const makeReportDoc = () => ({
    _id: 'report-1',
    status: 'responding',
    address: 'Poblacion, Cajidiocan',
    municipalityName: 'Cajidiocan',
    respondedBy: 'user1',
    responders: [],
    reporter: {
        _id: 'reporter-1',
        name: 'Ana',
        pushSubscription: { endpoint: 'https://push.example/1' },
        notificationPreferences: { browserPush: true },
    },
    resolutionImages: [],
    isFalseInformation: false,
    save: vi.fn(async () => {}),
    populate: vi.fn(async () => {}),
});

const makeResolveReq = (doc, body, files) => {
    Report.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(doc) });
    return {
        params: { id: 'report-1' },
        body,
        files,
        user: { ...RESPONDER },
        app: { get: vi.fn().mockReturnValue({ emit: vi.fn(), to: vi.fn().mockReturnValue({ emit: vi.fn() }) }) },
    };
};

describe('resolveReport false-information flag', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        Notification.createAndSend.mockResolvedValue({});
        sendPushToUser.mockResolvedValue(false);
    });

    test('(a) flagged resolve with notes: 200, flag set in the same save as resolvedBy/resolvedAt', async () => {
        const doc = makeReportDoc();
        const req = makeResolveReq(doc, {
            resolutionNotes: 'Went to the site — no incident occurred.',
            isFalseInformation: 'true',
        });
        const res = createRes();

        await resolveReport(req, res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(doc.status).toBe('resolved');
        expect(doc.isFalseInformation).toBe(true);
        expect(String(doc.resolvedBy)).toBe('user1');
        expect(doc.resolvedAt).toBeInstanceOf(Date);
        expect(doc.resolutionNotes).toBe('Went to the site — no incident occurred.');
        expect(doc.save).toHaveBeenCalledTimes(1);
    });

    test('(a2) boolean true (JSON body) also counts as checked', async () => {
        const doc = makeReportDoc();
        const req = makeResolveReq(doc, { resolutionNotes: 'Fabricated report.', isFalseInformation: true });
        const res = createRes();

        await resolveReport(req, res);

        expect(doc.isFalseInformation).toBe(true);
        expect(doc.status).toBe('resolved');
    });

    test('(a3) strict parsing: "1" and "false" do NOT count as checked', async () => {
        for (const value of ['1', 'false']) {
            const doc = makeReportDoc();
            const req = makeResolveReq(doc, { resolutionNotes: 'Done.', isFalseInformation: value });
            const res = createRes();

            await resolveReport(req, res);

            expect(doc.status).toBe('resolved');
            expect(doc.isFalseInformation).toBe(false);
        }
    });

    test('(b) flagged resolve with blank notes: 400, nothing stored in GridFS, temp file cleaned up', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'false-info-test-'));
        const filePath = path.join(dir, 'resolution.jpg');
        fs.writeFileSync(filePath, 'fake-image-bytes');
        const tempFile = { fieldname: 'resolutionPhotos', path: filePath, originalname: 'resolution.jpg' };

        const doc = makeReportDoc();
        const req = makeResolveReq(doc, { resolutionNotes: '   ', isFalseInformation: 'true' }, [tempFile]);
        const res = createRes();

        await resolveReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Resolution notes are required'),
        }));
        expect(uploadFilesToGridFS).not.toHaveBeenCalled();
        expect(doc.save).not.toHaveBeenCalled();
        expect(doc.status).toBe('responding');
        expect(fs.existsSync(filePath)).toBe(false);
    });

    test('(e) flagged resolve notifies the reporter with false-information wording and data flag', async () => {
        const doc = makeReportDoc();
        const req = makeResolveReq(doc, {
            resolutionNotes: 'No such incident at the address.',
            isFalseInformation: 'true',
        });
        const res = createRes();

        await resolveReport(req, res);

        expect(Notification.createAndSend).toHaveBeenCalledTimes(1);
        const [payload] = Notification.createAndSend.mock.calls[0];
        expect(payload.type).toBe('report_resolved');
        expect(payload.title).toBe('Report Closed as False Information');
        expect(payload.message).toContain('closed as false information');
        expect(payload.message).toContain('No such incident at the address.');
        expect(payload.data.falseInformation).toBe(true);

        expect(sendPushToUser).toHaveBeenCalledTimes(1);
        const [, pushPayload] = sendPushToUser.mock.calls[0];
        expect(pushPayload.title).toBe('Report Closed as False Information');
        expect(pushPayload.body).toContain('closed as false information');
    });

    test('(e2) unflagged resolve keeps the exact current notification wording and no data flag', async () => {
        const doc = makeReportDoc();
        const req = makeResolveReq(doc, { resolutionNotes: 'Fixed the issue' });
        const res = createRes();

        await resolveReport(req, res);

        const [payload] = Notification.createAndSend.mock.calls[0];
        expect(payload.title).toBe('Incident Resolved');
        expect(payload.message).toBe('Your report at Poblacion, Cajidiocan has been resolved by MDRRMO (Ramon Reyes). Notes: Fixed the issue');
        expect(payload.data).not.toHaveProperty('falseInformation');
        const [, pushPayload] = sendPushToUser.mock.calls[0];
        expect(pushPayload.title).toBe('Incident Resolved');
        expect(pushPayload.body).toBe('Your report at Poblacion, Cajidiocan has been resolved by MDRRMO.');
    });
});

describe('analytics exclusion for false-information reports', () => {
    const users = [
        { _id: 'admin-caj', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
        { _id: 'rep-1', role: 'reporter', verificationStatus: 'approved', assignedMunicipality: 'Cajidiocan' },
        { _id: 'res-1', role: 'responder', assignedMunicipality: 'Cajidiocan' },
    ];
    const reports = [
        {
            _id: 'normal', status: 'resolved', municipalityName: 'Cajidiocan', barangay: 'Poblacion',
            reporter: 'rep-1', casualties: { injured: 1, fatalities: 0, missing: 0 },
            isFalseInformation: false,
            createdAt: new Date('2026-09-08T01:00:00+08:00'), verifiedAt: new Date('2026-09-08T01:30:00+08:00'),
        },
        {
            _id: 'flagged', status: 'resolved', municipalityName: 'Cajidiocan', barangay: 'Poblacion',
            reporter: 'rep-1', casualties: { injured: 5, fatalities: 2, missing: 1 },
            isFalseInformation: true,
            createdAt: new Date('2026-09-08T02:00:00+08:00'), verifiedAt: new Date('2026-09-08T02:30:00+08:00'),
        },
        {
            // Legacy: written before the field existed — $ne must keep it counted.
            _id: 'legacy', status: 'resolved', municipalityName: 'Cajidiocan', barangay: 'Sugod',
            reporter: 'rep-1', casualties: { injured: 0, fatalities: 0, missing: 0 },
            createdAt: new Date('2026-09-07T03:00:00+08:00'), verifiedAt: new Date('2026-09-07T03:30:00+08:00'),
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-08T07:00:00.000Z'));

        Report.countDocuments.mockImplementation(async (query = {}) => reports.filter((doc) => matchDoc(doc, query)).length);
        Report.aggregate.mockImplementation(async (pipeline) => runAggregate(reports, pipeline));
        Report.find.mockImplementation((query = {}) => chainable(
            reports.filter((doc) => matchDoc(doc, query)).sort((a, b) => b.createdAt - a.createdAt),
        ));
        Report.distinct.mockImplementation(async (field, query = {}) => {
            const values = new Set();
            for (const doc of reports.filter((d) => matchDoc(d, query))) {
                const value = getPath(doc, field);
                if (value !== null && value !== undefined) values.add(String(value));
            }
            return [...values];
        });
        User.countDocuments.mockImplementation(async (query = {}) => users.filter((doc) => matchDoc(doc, query)).length);
        User.find.mockImplementation(() => chainable([]));
    });

    test('the shared exclusion matches false/absent and rejects only true', () => {
        expect(matchDoc({ isFalseInformation: true }, FALSE_INFORMATION_EXCLUSION)).toBe(false);
        expect(matchDoc({ isFalseInformation: false }, FALSE_INFORMATION_EXCLUSION)).toBe(true);
        expect(matchDoc({}, FALSE_INFORMATION_EXCLUSION)).toBe(true);
    });

    test('(c)+(d) getAdminAnalytics counts the normal and legacy reports, never the flagged one', async () => {
        const req = { user: { _id: 'admin-caj', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' } };
        const res = createRes();

        await getAdminAnalytics(req, res);

        const { data } = res.json.mock.calls[0][0];
        expect(data.reports.total).toBe(2);
        expect(data.reports.resolved).toBe(2);
        expect(data.reports.thisMonth).toBe(2);
        expect(data.reports.byMunicipality).toEqual({ Cajidiocan: 2 });
        const poblacion = data.reportsByBarangay.find((row) => row.barangay === 'Poblacion');
        expect(poblacion.count).toBe(1);
        expect(poblacion.injured).toBe(1);
        expect(poblacion.fatalities).toBe(0);
        const byDayTotal = data.chartData.reportsByDay.reduce((sum, row) => sum + row.count, 0);
        expect(byDayTotal).toBe(2);
        expect(data.recentReports.map((row) => row._id)).not.toContain('flagged');
    });

    test('(d) getPublicAnalytics excludes the flagged report from totals and monthly counts', async () => {
        const res = createRes();

        await getPublicAnalytics({}, res);

        const { data } = res.json.mock.calls[0][0];
        expect(data.totalReportsAllTime).toBe(2);
        expect(data.verifiedThisMonth).toBe(2);
    });

    test('(d) the accident-hotspot derivation match ignores the flagged report', () => {
        const match = buildAccidentHotspotMatch();
        expect(match.isFalseInformation).toEqual({ $ne: true });

        const base = {
            status: 'resolved',
            coordinates: { lat: 12.345053009068735, lng: 122.67621853831145 },
            incidentTime: new Date('2026-09-08T01:00:00+08:00'),
        };
        expect(matchDoc({ ...base, isFalseInformation: true }, match)).toBe(false);
        expect(matchDoc({ ...base, isFalseInformation: false }, match)).toBe(true);
        expect(matchDoc({ ...base }, match)).toBe(true);
    });
});
