import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: {
        find: jest.fn(),
        countDocuments: jest.fn(),
        aggregate: jest.fn(),
    },
}));

jest.mock('../models/User.js', () => ({
    default: {},
}));

jest.mock('../models/Municipality.js', () => ({
    default: {},
}));

jest.mock('../models/Notification.js', () => ({
    default: {},
}));

jest.mock('../models/HighRiskZone.js', () => ({
    default: {
        countDocuments: jest.fn().mockResolvedValue(0),
        find: jest.fn(() => ({
            sort: jest.fn(() => ({
                limit: jest.fn(() => ({
                    select: jest.fn().mockResolvedValue([]),
                })),
            })),
        })),
    },
}));

jest.mock('../services/emailService.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendReportStatusEmail: jest.fn(),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUser: jest.fn(),
    pushTemplates: {},
}));

jest.mock('../services/socketService.js', () => ({
    broadcastReportRejected: jest.fn(),
    broadcastReportResolved: jest.fn(),
    broadcastReportVerified: jest.fn(),
    broadcastVerifiedReportToResponders: jest.fn(),
}));

const { getAllReports } = await import('../controllers/adminController.js');
const { getResponderAnalytics } = await import('../controllers/analyticsController.js');
const { default: Report } = await import('../models/Report.js');

/**
 * Waiting-work surfaces after responder self-dispatch: the dispatch
 * queue ('available') lists EVERY pending report, and a pending report
 * joins the active set (queue 'municipalActive' view + the dashboard
 * 'Active emergencies' count) at the moment respondToReport would let
 * a responder respond to it — any casualty count above zero, or the
 * pre-verification window (default 3 minutes) elapsed since filing.
 *
 * Queries are evaluated against fixtures with the same minimal $match
 * evaluator the viewCounts suite uses (extended with range operators),
 * so list membership, tab counts, and dashboard counts are all checked
 * semantically rather than by query-shape snapshots. The window cases
 * control createdAt relative to the real clock with minute-scale
 * margins, the same approach the self-dispatch tests take.
 */

const getPath = (doc, path) => {
    let current = [doc];
    for (const part of path.split('.')) {
        const next = [];
        for (const value of current) {
            if (value === null || value === undefined) continue;
            if (Array.isArray(value) && /^\d+$/.test(part)) {
                const item = value[Number(part)];
                if (item !== undefined) next.push(item);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (item === null || item === undefined) continue;
                    const resolved = item[part];
                    if (resolved !== undefined) next.push(resolved);
                }
            } else {
                const resolved = value[part];
                if (resolved !== undefined) next.push(resolved);
            }
        }
        current = next;
    }
    if (current.length === 0) return undefined;
    return current.length === 1 ? current[0] : current;
};

const valueMatches = (actual, expected) => {
    if (Array.isArray(actual)) return actual.some((item) => valueMatches(item, expected));
    if (expected === null) return actual === null || actual === undefined;
    return actual === expected;
};

const compareRange = (actual, val, op) => {
    // A null/missing value never satisfies a range comparison in Mongo
    // (a null casualty count is "unknown", not zero).
    if (actual === null || actual === undefined) return false;
    const actualValue = actual instanceof Date ? actual.getTime() : actual;
    const expectedValue = val instanceof Date ? val.getTime() : val;
    if (op === '$gt') return actualValue > expectedValue;
    if (op === '$gte') return actualValue >= expectedValue;
    if (op === '$lt') return actualValue < expectedValue;
    return actualValue <= expectedValue;
};

const clauseMatches = (doc, clause) => Object.entries(clause).every(([key, cond]) => {
    if (key === '$and') return cond.every((sub) => clauseMatches(doc, sub));
    if (key === '$or') return cond.some((sub) => clauseMatches(doc, sub));
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
        return Object.entries(cond).every(([op, val]) => {
            const actual = getPath(doc, key);
            if (op === '$in') return Array.isArray(val) && val.some((v) => valueMatches(actual, v));
            if (op === '$exists') return val ? actual !== undefined : actual === undefined;
            if (op === '$ne') return !valueMatches(actual, val);
            if (['$gt', '$gte', '$lt', '$lte'].includes(op)) return compareRange(actual, val, op);
            throw new Error(`unsupported operator in test matcher: ${op}`);
        });
    }
    return valueMatches(getPath(doc, key), cond);
});

const ME = 'responder-1';
const MUNI = 'Cajidiocan';
const MINUTE = 60 * 1000;
const NOW = Date.now();
const ago = (ms) => new Date(NOW - ms);

const inScope = (overrides = {}) => ({
    municipalityName: MUNI,
    originalMunicipalityName: MUNI,
    transferHistory: [],
    ...overrides,
});

const NO_CASUALTIES = { injured: 0, fatalities: 0, missing: 0 };
const UNKNOWN_CASUALTIES = { injured: null, fatalities: null, missing: null };

const FIXTURES = [
    // (a) pending with a casualty count > 0: respondable immediately.
    {
        _id: 'p-casualty',
        status: 'pending',
        casualties: { injured: 2, fatalities: null, missing: null },
        createdAt: ago(20 * 1000),
        ...inScope(),
    },
    // (b) pending, zero casualties, still inside the window: not active.
    {
        _id: 'p-zero-fresh',
        status: 'pending',
        casualties: NO_CASUALTIES,
        createdAt: ago(40 * 1000),
        ...inScope(),
    },
    // (b) pending, null (unknown) casualties, inside the window: the
    // immediate path never opens for unknown counts.
    {
        _id: 'p-null-fresh',
        status: 'pending',
        casualties: UNKNOWN_CASUALTIES,
        createdAt: ago(50 * 1000),
        ...inScope(),
    },
    // (b) pending, zero casualties, window elapsed: respondable.
    {
        _id: 'p-zero-old',
        status: 'pending',
        casualties: NO_CASUALTIES,
        createdAt: ago(10 * MINUTE),
        ...inScope(),
    },
    // (b) pending, unknown casualties, window elapsed: respondable via
    // the timed path only.
    {
        _id: 'p-null-old',
        status: 'pending',
        casualties: UNKNOWN_CASUALTIES,
        createdAt: ago(11 * MINUTE),
        ...inScope(),
    },
    // (d) another municipality's pending, casualties and all: nowhere.
    {
        _id: 'p-other-muni',
        status: 'pending',
        casualties: { injured: 5, fatalities: 0, missing: 0 },
        createdAt: ago(30 * MINUTE),
        municipalityName: 'Magdiwang',
        originalMunicipalityName: 'Magdiwang',
        transferHistory: [],
    },
    // (e) the pre-existing active set, unchanged by this feature.
    {
        _id: 'v-plain',
        status: 'verified',
        respondedBy: null,
        responders: [],
        verifiedAt: ago(20 * MINUTE),
        createdAt: ago(25 * MINUTE),
        ...inScope(),
    },
    {
        _id: 't-plain',
        status: 'transferred',
        verifiedAt: ago(15 * MINUTE),
        createdAt: ago(18 * MINUTE),
        ...inScope(),
    },
    {
        _id: 'r-plain',
        status: 'responding',
        respondedBy: 'other-9',
        responders: [],
        createdAt: ago(30 * MINUTE),
        ...inScope(),
    },
    {
        _id: 'resolved-one',
        status: 'resolved',
        resolvedBy: ME,
        createdAt: ago(40 * MINUTE),
        ...inScope(),
    },
];

const AVAILABLE_IDS = [
    'p-null-old', 'p-zero-old', 'p-null-fresh', 'p-zero-fresh', 'p-casualty',
    'v-plain', 't-plain',
];
const ACTIVE_IDS = ['p-casualty', 'p-zero-old', 'p-null-old', 'v-plain', 't-plain', 'r-plain'];

// Mongo ordering for the harness: ascending puts null/missing first,
// descending puts them last; values compare by time/number/string.
const compareForSort = (a, b, direction) => {
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing && bMissing) return 0;
    if (aMissing) return direction === 1 ? -1 : 1;
    if (bMissing) return direction === 1 ? 1 : -1;
    const av = a instanceof Date ? a.getTime() : a;
    const bv = b instanceof Date ? b.getTime() : b;
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * direction;
};

const sortDocs = (docs, sortSpec) => [...docs].sort((left, right) => {
    for (const [key, direction] of Object.entries(sortSpec || {})) {
        const result = compareForSort(getPath(left, key), getPath(right, key), direction);
        if (result !== 0) return result;
    }
    return 0;
});

let findCalls;

const installReportMocks = (fixtures) => {
    findCalls = [];
    Report.find.mockImplementation((query) => {
        const call = { query, sortSpec: null, limitN: null, skipN: 0 };
        findCalls.push(call);
        const chain = {};
        ['populate'].forEach((method) => { chain[method] = jest.fn(() => chain); });
        chain.sort = jest.fn((spec) => { call.sortSpec = spec; return chain; });
        chain.limit = jest.fn((n) => { call.limitN = n; return chain; });
        chain.skip = jest.fn((n) => { call.skipN = n; return chain; });
        chain.maxTimeMS = jest.fn(() => chain);
        chain.lean = jest.fn(() => {
            const matched = fixtures.filter((doc) => clauseMatches(doc, query));
            const sorted = sortDocs(matched, call.sortSpec);
            const end = call.limitN === null ? undefined : call.skipN + call.limitN;
            return Promise.resolve(sorted.slice(call.skipN, end));
        });
        return chain;
    });
    Report.countDocuments.mockImplementation((query) => ({
        maxTimeMS: jest.fn(() => Promise.resolve(
            fixtures.filter((doc) => clauseMatches(doc, query)).length,
        )),
    }));
    Report.aggregate.mockImplementation((pipeline) => {
        const run = () => {
            if (pipeline[0]?.$facet) {
                const result = {};
                for (const [key, stages] of Object.entries(pipeline[0].$facet)) {
                    const matchStage = stages.find((stage) => stage.$match);
                    const matched = fixtures.filter((doc) => clauseMatches(doc, matchStage.$match));
                    result[key] = matched.length ? [{ count: matched.length }] : [];
                }
                return [result];
            }
            const matchStage = pipeline.find((stage) => stage.$match);
            const matched = fixtures.filter((doc) => clauseMatches(doc, matchStage.$match));
            const groups = {};
            matched.forEach((doc) => { groups[doc.status] = (groups[doc.status] || 0) + 1; });
            return Object.entries(groups).map(([_id, count]) => ({ _id, count }));
        };
        return { option: jest.fn(() => Promise.resolve(run())) };
    });
};

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const responderUser = { _id: ME, role: 'responder', assignedMunicipality: MUNI };

const fetchView = async (responderView) => {
    const res = createRes();
    await getAllReports({ query: { responderView }, user: responderUser }, res);
    expect(res.json).toHaveBeenCalledTimes(1);
    return res.json.mock.calls[0][0].data;
};

beforeEach(() => {
    jest.clearAllMocks();
    installReportMocks(FIXTURES);
});

describe('responder waiting-work surfaces (self-dispatch parity)', () => {
    test('(c) the available list holds every pending report, oldest pending first (f)', async () => {
        const data = await fetchView('available');

        // (f) Sort pinned: { verifiedAt: 1, createdAt: 1 } — pending has
        // no verifiedAt, so pending rows lead (oldest first), then
        // verified/transferred by verification time.
        expect(findCalls).toHaveLength(1);
        expect(findCalls[0].sortSpec).toEqual({ verifiedAt: 1, createdAt: 1 });
        expect(data.reports.map((report) => report._id)).toEqual(AVAILABLE_IDS);
        expect(data.pagination.total).toBe(AVAILABLE_IDS.length);
        // (d) the other municipality's pending report is not here.
        expect(data.reports.map((report) => report._id)).not.toContain('p-other-muni');
    });

    test('(a)(b) the municipalActive list holds exactly the respondable pending reports plus the active set', async () => {
        const data = await fetchView('municipalActive');

        const ids = data.reports.map((report) => report._id);
        expect(new Set(ids)).toEqual(new Set(ACTIVE_IDS));
        expect(data.pagination.total).toBe(ACTIVE_IDS.length);
        // (b) inside-window pending reports are absent, casualty or not.
        expect(ids).not.toContain('p-zero-fresh');
        expect(ids).not.toContain('p-null-fresh');
        // (d)
        expect(ids).not.toContain('p-other-muni');
    });

    test('(a)(b)(c) viewCounts agree with the lists', async () => {
        const data = await fetchView('available');

        expect(data.stats.viewCounts.available).toBe(AVAILABLE_IDS.length);
        expect(data.stats.viewCounts.municipalActive).toBe(ACTIVE_IDS.length);
    });

    test('(a)(b)(c)(d)(e) dashboard counts mirror the queue definitions', async () => {
        // getResponderAnalytics awaits countDocuments directly (no
        // maxTimeMS chain), so re-install it as a plain evaluating mock.
        Report.countDocuments.mockImplementation((query) => Promise.resolve(
            FIXTURES.filter((doc) => clauseMatches(doc, query)).length,
        ));
        Report.aggregate.mockResolvedValue([]);

        const res = createRes();
        await getResponderAnalytics({ user: responderUser }, res);

        expect(res.json).toHaveBeenCalledTimes(1);
        const { data } = res.json.mock.calls[0][0];
        // Active emergencies: the verified/transferred/responding set
        // (e) plus the respondable pending reports (a, b) — and not the
        // inside-window ones, and not the other municipality's (d).
        expect(data.activeIncidents).toBe(ACTIVE_IDS.length);
        // Dispatch queue badge: every pending report (c) plus the
        // previously available verified/transferred rows (e).
        expect(data.availableIncidents).toBe(AVAILABLE_IDS.length);
    });
});
