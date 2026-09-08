import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Production accuracy suite for the municipal admin dashboard.
 *
 * Uses an in-memory document set evaluated against the REAL Mongo query
 * shapes the controller builds (no DB). Covers the historical miscounts:
 * transfer double-attribution, dismissed-copy leakage, partial status
 * breakdowns, UTC-vs-Manila buckets, missing casualty sums, and
 * case-split barangay groups.
 */

const fixtures = () => {
    const adminCaj = {
        _id: 'admin-caj', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan',
    };
    const reporter1 = { _id: 'rep-1', role: 'reporter', verificationStatus: 'approved' };
    const responderCaj = {
        _id: 'res-1', role: 'responder', assignedMunicipality: 'Cajidiocan',
    };
    const ordinaryGhost = { _id: 'ord-1', role: 'ordinary', assignedMunicipality: null };
    const users = [adminCaj, reporter1, responderCaj, ordinaryGhost];

    // Fixed "now": 2026-09-08T07:00:00Z == Sep 8, 15:00 Asia/Manila (Tuesday).
    const reports = [
        {
            _id: 'r1', status: 'pending', municipalityName: 'Cajidiocan',
            barangay: 'Poblacion', reporter: 'rep-1',
            casualties: { injured: 0, fatalities: 0, missing: 0 },
            createdAt: new Date('2026-09-08T01:00:00+08:00'),
        },
        {
            _id: 'r2', status: 'verified', municipalityName: 'Cajidiocan',
            barangay: 'Poblacion', reporter: 'rep-1',
            casualties: { injured: 1 },
            createdAt: new Date('2026-09-08T02:00:00+08:00'),
        },
        {
            // Transferred Cajidiocan -> San Fernando: visible in BOTH offices
            // (queue parity), never double-counted within one office.
            _id: 'r3', status: 'transferred', municipalityName: 'San Fernando',
            originalMunicipalityName: 'Cajidiocan',
            transferHistory: [{ fromMunicipalityName: 'Cajidiocan' }],
            barangay: 'Tampayan', reporter: 'rep-1',
            casualties: { injured: 0, fatalities: 0, missing: 0 },
            createdAt: new Date('2026-09-08T03:00:00+08:00'),
        },
        {
            // Belongs to San Fernando only; must not leak into Cajidiocan.
            _id: 'r4', status: 'resolved', municipalityName: 'San Fernando',
            barangay: 'Poblacion', resolvedAt: new Date('2026-09-08T04:00:00+08:00'),
            casualties: { injured: 2, fatalities: 1, missing: 3 },
            createdAt: new Date('2026-09-08T04:00:00+08:00'),
        },
        {
            // Dismissed by Cajidiocan: hidden from its queue AND analytics.
            _id: 'r5', status: 'resolved', municipalityName: 'Cajidiocan',
            hiddenFromMunicipalities: ['Cajidiocan'],
            barangay: 'poblacion', resolvedAt: new Date('2026-09-08T05:00:00+08:00'),
            createdAt: new Date('2026-09-08T05:00:00+08:00'),
        },
        {
            _id: 'r6', status: 'rejected', municipalityName: 'Cajidiocan',
            barangay: 'Alibagon', reporter: 'rep-1',
            createdAt: new Date('2026-09-08T06:00:00+08:00'),
        },
        {
            _id: 'r7', status: 'responding', municipalityName: 'Cajidiocan',
            barangay: 'Poblacion',
            casualties: { injured: 0, fatalities: 0 },
            createdAt: new Date('2026-09-08T06:30:00+08:00'),
        },
        {
            // 2026-09-07T15:30Z == Sep 7, 23:30 Manila (previous Manila day).
            _id: 'r8', status: 'resolved', municipalityName: 'Cajidiocan',
            barangay: 'poblacion', resolvedAt: new Date('2026-09-07T15:30:00Z'),
            casualties: { missing: 2 },
            createdAt: new Date('2026-09-07T15:30:00Z'),
        },
        {
            // Previous calendar month: excluded from thisMonth, included in total.
            _id: 'r9', status: 'verified', municipalityName: 'Cajidiocan',
            barangay: 'Sugod',
            createdAt: new Date('2026-08-15T10:00:00+08:00'),
        },
    ];
    return { users, reports };
};

const getPath = (doc, path) => path.split('.').reduce(
    (current, key) => (current === null || current === undefined ? undefined : current[key]),
    doc,
);

const matchCondition = (value, condition) => {
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        return Object.entries(condition).every(([operator, expected]) => {
            switch (operator) {
                // Mongo $ne on an array field matches only when NO element equals.
                case '$ne': return Array.isArray(value) ? !value.includes(expected) : value !== expected;
                case '$in': return Array.isArray(expected) && expected.includes(value);
                case '$nin': return Array.isArray(expected) && !expected.includes(value);
                case '$gte': return value >= expected;
                case '$gt': return value > expected;
                case '$lte': return value <= expected;
                case '$lt': return value < expected;
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
                const value = typeof option === 'string' && option.startsWith('$')
                    ? getPath(doc, option.slice(1))
                    : option;
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
            const shifted = new Date(
                date.getTime() + (spec.$dateToString.timezone === 'Asia/Manila' ? 8 * 60 * 60 * 1000 : 0),
            );
            const pad = (n) => String(n).padStart(2, '0');
            return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
        }
    }
    return spec;
};

const evalSum = (docs, spec) => {
    if (spec === 1) return docs.length;
    if (typeof spec === 'string' && spec.startsWith('$')) {
        return docs.reduce((sum, doc) => sum + (Number(getPath(doc, spec.slice(1))) || 0), 0);
    }
    if (spec?.$ifNull) {
        const [path, fallback] = spec.$ifNull;
        const field = typeof path === 'string' && path.startsWith('$') ? path.slice(1) : path;
        return docs.reduce((sum, doc) => {
            const value = getPath(doc, field);
            return sum + (Number(value ?? fallback) || 0);
        }, 0);
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
                        const path = spec.$first.startsWith('$') ? spec.$first.slice(1) : spec.$first;
                        row[field] = getPath(groupDocs[0], path);
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
    query.sort = (spec) => {
        const [[field, direction]] = Object.entries(spec);
        const sorted = [...rows].sort((a, b) => {
            const left = a[field] instanceof Date ? a[field].getTime() : a[field];
            const right = b[field] instanceof Date ? b[field].getTime() : b[field];
            if (left < right) return direction === 1 ? -1 : 1;
            if (left > right) return direction === 1 ? 1 : -1;
            return 0;
        });
        return chainable(sorted);
    };
    query.limit = (n) => chainable(rows.slice(0, n));
    query.populate = () => chainable(rows);
    query.select = () => chainable(rows);
    return query;
};

vi.mock('../models/User.js', () => ({ default: { countDocuments: vi.fn(), find: vi.fn() } }));
vi.mock('../models/Report.js', () => ({
    default: {
        countDocuments: vi.fn(),
        distinct: vi.fn(),
        find: vi.fn(),
        aggregate: vi.fn(),
    },
}));
vi.mock('../models/HighRiskZone.js', () => ({ default: { countDocuments: vi.fn() } }));

const { getAdminAnalytics } = await import('../controllers/analyticsController.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');

const createResponse = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

describe('admin analytics accuracy (in-memory fixtures)', () => {
    const { users, reports } = fixtures();
    const cajidiocanAdmin = { _id: 'admin-caj', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-08T07:00:00.000Z'));

        Report.countDocuments.mockImplementation(async (query = {}) => (
            reports.filter((doc) => matchDoc(doc, query)).length
        ));
        Report.distinct.mockImplementation(async (field, query = {}) => {
            const values = new Set();
            for (const doc of reports.filter((d) => matchDoc(d, query))) {
                const value = getPath(doc, field);
                if (value !== null && value !== undefined) values.add(String(value));
            }
            return [...values];
        });
        Report.find.mockImplementation((query = {}) => chainable(
            reports.filter((doc) => matchDoc(doc, query)),
        ));
        Report.aggregate.mockImplementation(async (pipeline) => runAggregate(reports, pipeline));
        User.countDocuments.mockImplementation(async (query = {}) => (
            users.filter((doc) => matchDoc(doc, query)).length
        ));
        User.find.mockImplementation((query = {}) => chainable(
            users.filter((doc) => matchDoc(doc, query)),
        ));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('full status breakdown reconciles with the total', async () => {
        const res = createResponse();
        await getAdminAnalytics({ user: cajidiocanAdmin }, res);

        const data = res.json.mock.calls[0][0].data;
        // r1 pending, r2+r9 verified, r3 transferred, r7 responding,
        // r8 resolved (r5 dismissed, r4 belongs to San Fernando).
        expect(data.reports).toMatchObject({
            total: 7,
            pending: 1,
            verified: 2,
            transferred: 1,
            responding: 1,
            resolved: 1,
            rejected: 1,
        });
        expect(
            data.reports.pending + data.reports.verified + data.reports.transferred
            + data.reports.responding + data.reports.resolved + data.reports.rejected,
        ).toBe(data.reports.total);
    });

    test('dismissed copies vanish from totals and recents', async () => {
        const res = createResponse();
        await getAdminAnalytics({ user: cajidiocanAdmin }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.reports.total).toBe(7);
        expect(data.recentReports.map((report) => report._id)).not.toContain('r5');
    });

    test('Manila calendar windows exclude the previous month and UTC-shifted days', async () => {
        const res = createResponse();
        await getAdminAnalytics({ user: cajidiocanAdmin }, res);

        const data = res.json.mock.calls[0][0].data;
        // September Manila: r1, r2, r3, r6, r7, r8 (r9 is August, r5 dismissed).
        expect(data.reports.thisMonth).toBe(6);
        // Week of Mon Sep 7 (Manila): r1, r2, r3, r6, r7, r8.
        expect(data.reports.thisWeek).toBe(6);

        const byDay = Object.fromEntries(
            data.chartData.reportsByDay.map((row) => [row._id, row.count]),
        );
        // r8 (Sep 7 23:30 Manila) buckets Sep 7, not Sep 8.
        expect(byDay['2026-09-07']).toBe(1);
        expect(byDay['2026-09-08']).toBe(5);
    });

    test('barangay hotspots merge case variants and sum all casualty fields', async () => {
        const res = createResponse();
        await getAdminAnalytics({ user: cajidiocanAdmin }, res);

        const poblacion = data_rows(res).find((row) => row.barangay === 'Poblacion');
        // r2 (Poblacion) + r7 (Poblacion) + r8 (poblacion, case-merged).
        // r5 dismissed (excluded), r4 belongs to San Fernando.
        expect(poblacion).toMatchObject({ count: 3, injured: 1, fatalities: 0, missing: 2 });
    });

    test('transferred reports stay visible to the origin office exactly once', async () => {
        const res = createResponse();
        await getAdminAnalytics({ user: cajidiocanAdmin }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.reports.transferred).toBe(1);
        expect(data.reports.total).toBe(7);
    });

    test('user scope keeps reporters of origin reports and drops strangers', async () => {
        const res = createResponse();
        await getAdminAnalytics({ user: cajidiocanAdmin }, res);

        const data = res.json.mock.calls[0][0].data;
        // responder (assigned) + reporter (via origin reports). The ordinary
        // account never reported and holds no assignment: invisible by design.
        expect(data.users.total).toBe(2);
        expect(data.users.reporters).toBe(1);
    });

    function data_rows(res) {
        return res.json.mock.calls[0][0].data.reportsByBarangay;
    }
});
