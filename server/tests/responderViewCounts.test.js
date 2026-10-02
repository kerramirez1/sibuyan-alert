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
const { default: Report } = await import('../models/Report.js');

const ME = 'responder-1';
const MUNI = 'Cajidiocan';

// Minimal Mongo $match evaluator supporting exactly the operators the
// responder view filters use: $and, $or, $in, $exists, $ne, and direct
// equality (including null matching a missing field, as Mongo does).
// Like Mongo's dotted paths: a numeric segment indexes into an array
// ('responders.0'), while a named segment fans out over array elements
// ('responders.user' matches when any element's user matches).
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

const clauseMatches = (doc, clause) => Object.entries(clause).every(([key, cond]) => {
    if (key === '$and') return cond.every((sub) => clauseMatches(doc, sub));
    if (key === '$or') return cond.some((sub) => clauseMatches(doc, sub));
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        return Object.entries(cond).every(([op, val]) => {
            const actual = getPath(doc, key);
            if (op === '$in') return Array.isArray(val) && val.some((v) => valueMatches(actual, v));
            if (op === '$exists') return val ? actual !== undefined : actual === undefined;
            if (op === '$ne') return !valueMatches(actual, val);
            throw new Error(`unsupported operator in test matcher: ${op}`);
        });
    }
    return valueMatches(getPath(doc, key), cond);
});

const inScope = (overrides = {}) => ({
    municipalityName: MUNI,
    originalMunicipalityName: MUNI,
    transferHistory: [],
    ...overrides,
});

const FIXTURES = [
    // available + municipalActive
    { _id: 'r1', status: 'transferred', ...inScope() },
    { _id: 'r2', status: 'verified', respondedBy: null, responders: [], ...inScope() },
    // municipalActive only (assigned / has responders, so not "available")
    { _id: 'r3', status: 'verified', respondedBy: ME, responders: [], ...inScope() },
    { _id: 'r4', status: 'verified', respondedBy: null, responders: [{ user: 'other-1' }], ...inScope() },
    // municipalActive + active (mine)
    { _id: 'r5', status: 'responding', respondedBy: ME, responders: [], ...inScope() },
    { _id: 'r6', status: 'responding', respondedBy: null, responders: [{ user: ME }], ...inScope() },
    // municipalActive only (someone else's response)
    { _id: 'r7', status: 'responding', respondedBy: 'other-9', responders: [], ...inScope() },
    // history (mine, via each of the three assignment shapes)
    { _id: 'r8', status: 'resolved', resolvedBy: ME, ...inScope() },
    { _id: 'r9', status: 'resolved', respondedBy: ME, ...inScope() },
    { _id: 'r10', status: 'resolved', responders: [{ user: ME }], ...inScope() },
    // resolved by someone else: in stats, but not in my history
    { _id: 'r11', status: 'resolved', respondedBy: 'other-9', ...inScope() },
    // pending: visible in stats, in no responder view tab
    { _id: 'r12', status: 'pending', ...inScope() },
    // out of municipal scope entirely: must not leak into any count
    {
        _id: 'r13',
        status: 'responding',
        municipalityName: 'Magdiwang',
        originalMunicipalityName: 'Magdiwang',
        transferHistory: [],
        respondedBy: ME,
    },
    // rejected: in stats.total, in no responder view tab
    { _id: 'r14', status: 'rejected', ...inScope() },
];

const chainable = (resolved) => {
    const chain = {};
    ['populate', 'sort', 'limit', 'skip', 'maxTimeMS'].forEach((method) => {
        chain[method] = jest.fn(() => chain);
    });
    chain.lean = jest.fn(() => Promise.resolve(resolved));
    return chain;
};

let aggregateCalls;

const installAggregateMock = (fixtures) => {
    aggregateCalls = [];
    Report.aggregate.mockImplementation((pipeline) => {
        aggregateCalls.push(pipeline);
        const run = () => {
            if (pipeline[0]?.$facet) {
                const result = {};
                for (const [key, stages] of Object.entries(pipeline[0].$facet)) {
                    const matchStage = stages.find((stage) => stage.$match);
                    const matched = fixtures.filter((doc) => clauseMatches(doc, matchStage.$match));
                    // Real $count yields no document for an empty bucket.
                    result[key] = matched.length ? [{ count: matched.length }] : [];
                }
                return [result];
            }
            const matchStage = pipeline.find((stage) => stage.$match);
            const matched = fixtures.filter((doc) => clauseMatches(doc, matchStage.$match));
            const groups = {};
            matched.forEach((doc) => {
                groups[doc.status] = (groups[doc.status] || 0) + 1;
            });
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

const createReq = (user, query = {}) => ({ query, user });

beforeEach(() => {
    jest.clearAllMocks();
    Report.find.mockImplementation(() => chainable([]));
    Report.countDocuments.mockReturnValue({ maxTimeMS: jest.fn(() => Promise.resolve(0)) });
});

describe('getAllReports responder viewCounts', () => {
    test('attaches per-view counts that match the view filters on fixture data', async () => {
        installAggregateMock(FIXTURES);
        const res = createRes();

        await getAllReports(
            createReq({ _id: ME, role: 'responder', assignedMunicipality: MUNI }),
            res,
        );

        expect(res.json).toHaveBeenCalledTimes(1);
        const stats = res.json.mock.calls[0][0].data.stats;

        expect(stats.viewCounts).toEqual({
            available: 2, // r1, r2
            municipalActive: 7, // r1-r7
            active: 2, // r5, r6
            history: 3, // r8, r9, r10
            // stats.total over the municipal scope (rejected included,
            // matching the endpoint's long-standing stats definition)
            all: 13, // 1 pending + 3 verified + 1 transferred + 1 rejected + 3 responding + 4 resolved
        });

        // The facet ran as a single aggregation with the query-policy timeout.
        const facetCall = aggregateCalls.find((pipeline) => pipeline[0]?.$facet);
        expect(facetCall).toBeDefined();
        expect(Object.keys(facetCall[0].$facet).sort()).toEqual(
            ['active', 'available', 'history', 'municipalActive'],
        );
    });

    test('defaults missing buckets to 0 instead of omitting them', async () => {
        installAggregateMock([]);
        const res = createRes();

        await getAllReports(
            createReq({ _id: ME, role: 'responder', assignedMunicipality: MUNI }),
            res,
        );

        const stats = res.json.mock.calls[0][0].data.stats;
        expect(stats.viewCounts).toEqual({
            available: 0,
            municipalActive: 0,
            active: 0,
            history: 0,
            all: 0,
        });
    });

    test('does not add viewCounts for non-responder roles', async () => {
        installAggregateMock(FIXTURES);
        const res = createRes();

        await getAllReports(
            createReq({ _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: MUNI }),
            res,
        );

        const stats = res.json.mock.calls[0][0].data.stats;
        expect(stats).not.toHaveProperty('viewCounts');
        // Only the status-count aggregation ran; no facet round trip.
        expect(aggregateCalls.filter((pipeline) => pipeline[0]?.$facet)).toHaveLength(0);
        expect(stats.total).toBe(13);
    });
});
