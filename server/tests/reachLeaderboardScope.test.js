import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Reach leaderboard scoping and labelling.
 *
 * These lock in three fixes that were each invisible in the data:
 *
 * 1. **Incident reach is municipal.** The endpoint used to read the island-wide
 *    top N and join it to records with no municipality filter, so a Cajidiocan
 *    admin saw the titles of Magdiwang incidents. The scope is now taken from
 *    `buildMunicipalReportScope` — the same definition of "this office's
 *    incidents" every other admin surface uses — and applied *before* the
 *    aggregation's limit rather than after, which is the difference between an
 *    empty panel and a correct one for a municipality absent from the island-wide
 *    top N.
 * 2. **Zone reach stays island-wide**, deliberately: hazard visibility is
 *    island-wide for every viewer, so scoping zone reach to one municipality
 *    would describe a rule the app does not have.
 * 3. **Zones are labelled from `municipality`**, not `municipalityName`. Reading
 *    the Report field off a zone document produced a silently empty label on
 *    every row.
 */
const mocks = vi.hoisted(() => ({
    readTopReach: vi.fn(),
    reportDistinct: vi.fn(),
    reportFind: vi.fn(),
    zoneFind: vi.fn(),
}));

vi.mock('../services/viewEventService.js', () => ({
    readTopReach: mocks.readTopReach,
    recordViewEvent: vi.fn(),
    buildViewerIdentity: vi.fn(),
}));

vi.mock('../models/Report.js', () => ({
    default: {
        distinct: mocks.reportDistinct,
        find: mocks.reportFind,
        findById: vi.fn(),
        updateOne: vi.fn(),
    },
}));

vi.mock('../models/HighRiskZone.js', () => ({
    default: {
        find: mocks.zoneFind,
        exists: vi.fn(),
    },
}));

const { getReachLeaderboard } = await import('../controllers/viewController.js');
const { buildMunicipalReportScope } = await import('../utils/analyticsScope.js');

const makeRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

const REPORT_A = '507f1f77bcf86cd799439011';
const REPORT_B = '507f1f77bcf86cd799439012';
const ZONE_A = '507f1f77bcf86cd799439013';

const findReturns = (records) => ({ select: vi.fn(() => Promise.resolve(records)) });

describe('getReachLeaderboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.reportDistinct.mockResolvedValue([REPORT_A]);
        mocks.reportFind.mockReturnValue(findReturns([
            { _id: REPORT_A, title: 'Road Accident at Poblacion', incidentType: 'motorcycle', municipalityName: 'Cajidiocan', status: 'verified' },
        ]));
        mocks.zoneFind.mockReturnValue(findReturns([]));
        mocks.readTopReach.mockResolvedValue([]);
    });

    test('scopes incident reach with the shared municipal scope, applied before the limit', async () => {
        const res = makeRes();

        await getReachLeaderboard(
            { user: { assignedMunicipality: 'Cajidiocan' }, query: { limit: '10' } },
            res,
        );

        // The same scope object every other admin surface uses, not a
        // re-implementation. A divergence here is how two admin screens started
        // disagreeing about which incidents belong to the office.
        expect(mocks.reportDistinct).toHaveBeenCalledWith('_id', buildMunicipalReportScope('Cajidiocan'));

        const [reportCall, zoneCall] = mocks.readTopReach.mock.calls.map(([options]) => options);
        expect(reportCall).toEqual({ targetType: 'report', limit: 10, targetIds: [REPORT_A] });
        // No targetIds: zone reach is island-wide on purpose.
        expect(zoneCall).toEqual({ targetType: 'zone', limit: 10 });
    });

    test('answers an empty municipal scope without falling back to island-wide data', async () => {
        mocks.reportDistinct.mockResolvedValue([]);
        const res = makeRes();

        await getReachLeaderboard({ user: { assignedMunicipality: 'Magdiwang' }, query: {} }, res);

        const [reportCall] = mocks.readTopReach.mock.calls.map(([options]) => options);
        expect(reportCall.targetIds).toEqual([]);
        expect(mocks.reportFind).not.toHaveBeenCalled();
    });

    test('labels a risk zone from its municipality field', async () => {
        mocks.readTopReach.mockImplementation(async ({ targetType }) => (
            targetType === 'zone'
                ? [{ _id: ZONE_A, uniqueViewers: 4, publicViewers: 3, guestViewers: 2, lastViewedAt: new Date() }]
                : []
        ));
        mocks.zoneFind.mockReturnValue(findReturns([
            { _id: ZONE_A, name: 'Cambajao River Flash Flood Zone', type: 'flood_prone', municipality: 'Cajidiocan' },
        ]));
        const res = makeRes();

        await getReachLeaderboard({ user: { assignedMunicipality: 'Cajidiocan' }, query: {} }, res);

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.zones).toHaveLength(1);
        expect(payload.zones[0]).toMatchObject({
            id: ZONE_A,
            label: 'Cambajao River Flash Flood Zone',
            municipalityName: 'Cajidiocan',
            uniqueViewers: 4,
            publicViewers: 3,
            guestViewers: 2,
        });
    });

    test('reports the public slice alongside the totals, in the aggregation order', async () => {
        mocks.reportDistinct.mockResolvedValue([REPORT_A, REPORT_B]);
        mocks.readTopReach.mockResolvedValue([
            { _id: REPORT_B, uniqueViewers: 9, publicViewers: 7, guestViewers: 4, lastViewedAt: new Date() },
            { _id: REPORT_A, uniqueViewers: 3, publicViewers: 1, guestViewers: 0, lastViewedAt: new Date() },
        ]);
        mocks.reportFind.mockReturnValue(findReturns([
            { _id: REPORT_A, title: 'First', incidentType: 'other', municipalityName: 'Cajidiocan', status: 'verified' },
            { _id: REPORT_B, title: 'Second', incidentType: 'other', municipalityName: 'Cajidiocan', status: 'resolved' },
        ]));
        const res = makeRes();

        await getReachLeaderboard({ user: { assignedMunicipality: 'Cajidiocan' }, query: {} }, res);

        const { reports } = res.json.mock.calls[0][0].data;
        // Highest public reach first, as the aggregation decided — the controller
        // must not re-sort and quietly rank staff activity as reach.
        expect(reports.map((row) => row.id)).toEqual([REPORT_B, REPORT_A]);
        expect(reports[0]).toMatchObject({ publicViewers: 7, guestViewers: 4, uniqueViewers: 9 });
    });

    test('drops a row whose record no longer exists instead of rendering a ghost', async () => {
        mocks.reportDistinct.mockResolvedValue([REPORT_A, REPORT_B]);
        mocks.readTopReach.mockResolvedValue([
            { _id: REPORT_A, uniqueViewers: 1, publicViewers: 1, guestViewers: 1, lastViewedAt: new Date() },
            { _id: REPORT_B, uniqueViewers: 5, publicViewers: 5, guestViewers: 5, lastViewedAt: new Date() },
        ]);
        // REPORT_B was deleted between the aggregation and the join.
        const res = makeRes();

        await getReachLeaderboard({ user: { assignedMunicipality: 'Cajidiocan' }, query: {} }, res);

        const { reports } = res.json.mock.calls[0][0].data;
        expect(reports.map((row) => row.id)).toEqual([REPORT_A]);
    });

    test('refuses an administrator with no municipality rather than guessing one', async () => {
        const res = makeRes();

        await getReachLeaderboard({ user: {}, query: {} }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mocks.readTopReach).not.toHaveBeenCalled();
    });
});
