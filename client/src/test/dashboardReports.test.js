import { describe, expect, test, vi } from 'vitest';
import {
    buildActiveIncidentsSummary,
    deduplicateDashboardReports,
    fetchAllReportPages,
    getDashboardReportId,
    mergeDashboardReport,
    removeDashboardReport,
    updateDashboardReportStatus,
    upsertDashboardReport,
} from '../utils/dashboardReports';

describe('dashboard report data synchronization', () => {
    test('preserves canonical submission and first-response fields during socket merges', () => {
        const existing = {
            _id: 'report-1',
            createdAt: '2026-06-30T23:55:00.000Z',
            barangay: 'Poblacion',
            reporter: { _id: 'reporter-1', name: 'Reporter' },
            respondedAt: '2026-07-01T00:05:00.000Z',
            respondedBy: { _id: 'responder-1', name: 'First Responder' },
        };

        const merged = mergeDashboardReport(existing, {
            id: 'report-1',
            status: 'responding',
            incidentTime: '2026-07-02T10:00:00.000Z',
            respondedAt: '2026-07-02T10:30:00.000Z',
            respondedBy: { _id: 'responder-2', name: 'Additional Responder' },
            responders: [{ user: 'responder-1' }, { user: 'responder-2' }],
        });

        expect(merged).toMatchObject({
            _id: 'report-1',
            status: 'responding',
            createdAt: existing.createdAt,
            barangay: 'Poblacion',
            reporter: existing.reporter,
            respondedAt: existing.respondedAt,
            respondedBy: existing.respondedBy,
        });
        expect(merged.responders).toHaveLength(2);
    });

    test('updates rejected lifecycle state without removing the report', () => {
        const reports = [{ _id: 'report-1', status: 'pending', createdAt: '2026-07-01T00:00:00.000Z' }];
        const updated = updateDashboardReportStatus(reports, 'report-1', 'rejected');

        expect(updated).toHaveLength(1);
        expect(updated[0]).toMatchObject({ _id: 'report-1', status: 'rejected' });
    });

    test('preserves private resolver identity when a public socket update omits it', () => {
        const existing = {
            _id: 'report-1',
            status: 'responding',
            resolvedBy: { _id: 'responder-1', name: 'Assigned Responder' },
        };

        const merged = mergeDashboardReport(existing, {
            id: 'report-1',
            status: 'resolved',
            resolvedBy: { agency: 'MDRRMO' },
            resolvedAt: '2026-08-04T01:00:00.000Z',
        });

        expect(merged.resolvedBy).toEqual(existing.resolvedBy);
        expect(merged).toMatchObject({
            status: 'resolved',
            resolvedAt: '2026-08-04T01:00:00.000Z',
        });
    });

    test('merges verified payloads into existing records instead of replacing complete data', () => {
        const reports = [{
            _id: 'report-1',
            status: 'pending',
            createdAt: '2026-07-01T00:00:00.000Z',
            barangay: 'Cambajao',
            reporter: { name: 'Reporter' },
        }];

        const updated = upsertDashboardReport(reports, {
            _id: 'report-1',
            status: 'verified',
            address: 'Updated address',
            incidentTime: '2026-06-30T20:00:00.000Z',
        });

        expect(updated[0]).toMatchObject({
            status: 'verified',
            createdAt: '2026-07-01T00:00:00.000Z',
            barangay: 'Cambajao',
            reporter: { name: 'Reporter' },
            address: 'Updated address',
        });
    });

    test('loads and deduplicates every paginated admin report page', async () => {
        const fetchPage = vi.fn(({ page, limit }) => Promise.resolve({
            data: {
                data: {
                    reports: page === 1
                        ? [{ _id: 'report-1' }, { _id: 'report-2' }]
                        : [{ _id: 'report-2' }, { _id: 'report-3' }],
                    pagination: { page, pages: 2, limit },
                },
            },
        }));

        const reports = await fetchAllReportPages(fetchPage, {}, 2);

        expect(fetchPage).toHaveBeenNthCalledWith(1, { page: 1, limit: 2 });
        expect(fetchPage).toHaveBeenNthCalledWith(2, { page: 2, limit: 2 });
        expect(reports.map((report) => report._id)).toEqual(['report-1', 'report-2', 'report-3']);
    });

    test('normalizes report identities and removes stale duplicates during socket upserts', () => {
        const reports = [
            { _id: 42, status: 'verified', address: 'Old representation' },
            { id: '42', status: 'verified', address: 'Duplicate representation' },
            { _id: 'report-2', status: 'verified' },
        ];

        const updated = upsertDashboardReport(reports, {
            id: '42',
            status: 'transferred',
            address: 'Current representation',
        });

        expect(updated).toHaveLength(2);
        expect(updated[0]).toMatchObject({ _id: '42', status: 'transferred', address: 'Current representation' });
        expect(removeDashboardReport(updated, 42)).toEqual([{ _id: 'report-2', status: 'verified' }]);
        expect(deduplicateDashboardReports(reports)).toHaveLength(2);
    });

    test('normalizes Extended-JSON object ids instead of collapsing to [object Object]', () => {
        const reports = [
            { _id: { $oid: 'aaa' }, status: 'verified' },
            { _id: { $oid: 'bbb' }, status: 'verified' },
        ];

        expect(getDashboardReportId(reports[0])).toBe('aaa');
        expect(getDashboardReportId(reports[1])).toBe('bbb');
        expect(deduplicateDashboardReports(reports)).toHaveLength(2);
        expect(upsertDashboardReport(reports, { _id: { $oid: 'aaa' }, status: 'resolved' })[0])
            .toMatchObject({ _id: 'aaa', status: 'resolved' });
    });

    test('preserves id-less records when paginating instead of dropping them', async () => {
        const fetchPage = vi.fn(({ page, limit }) => Promise.resolve({
            data: {
                data: {
                    reports: page === 1
                        ? [{ _id: 'report-1' }, { status: 'pending' }]
                        : [{ _id: 'report-1' }],
                    pagination: { page, pages: 2, limit },
                },
            },
        }));

        const reports = await fetchAllReportPages(fetchPage, {}, 2);

        expect(reports).toHaveLength(2);
        expect(reports[0]).toMatchObject({ _id: 'report-1' });
        expect(reports[1]).toMatchObject({ status: 'pending' });
    });

    test('fetches remaining pages in parallel with capped concurrency, preserving page order', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const fetchPage = vi.fn(async ({ page, limit }) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 10));
            inFlight -= 1;
            return {
                data: {
                    data: {
                        reports: [{ _id: `report-p${page}` }],
                        pagination: { page, pages: 6, limit },
                    },
                },
            };
        });

        const reports = await fetchAllReportPages(fetchPage, {}, 2);

        expect(fetchPage).toHaveBeenCalledTimes(6);
        // Page 1 goes first to learn the page count; the rest fan out.
        expect(fetchPage.mock.calls[0][0]).toEqual({ page: 1, limit: 2 });
        expect(maxInFlight).toBeGreaterThan(1);
        expect(maxInFlight).toBeLessThanOrEqual(3);
        expect(reports.map((report) => report._id)).toEqual([
            'report-p1',
            'report-p2',
            'report-p3',
            'report-p4',
            'report-p5',
            'report-p6',
        ]);
    });

    test('later pages still win dedup ties when fetched in parallel', async () => {
        const fetchPage = vi.fn(({ page, limit }) => Promise.resolve({
            data: {
                data: {
                    reports: [{ _id: 'dup', v: page }],
                    pagination: { page, pages: 3, limit },
                },
            },
        }));

        const reports = await fetchAllReportPages(fetchPage, {}, 2);

        expect(reports).toHaveLength(1);
        expect(reports[0]).toMatchObject({ _id: 'dup', v: 3 });
    });

    test('skips a failed page with a warning and keeps the successful pages', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const fetchPage = vi.fn(({ page, limit }) => {
                if (page === 3) return Promise.reject(new Error('timeout'));
                return Promise.resolve({
                    data: {
                        data: {
                            reports: [{ _id: `report-p${page}` }],
                            pagination: { page, pages: 4, limit },
                        },
                    },
                });
            });

            const reports = await fetchAllReportPages(fetchPage, {}, 2);

            expect(reports.map((report) => report._id)).toEqual(['report-p1', 'report-p2', 'report-p4']);
            expect(warnSpy).toHaveBeenCalledWith(
                'fetchAllReportPages: skipping failed page 3',
                expect.any(Error),
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    test('a page-1 failure still throws so callers hit their error path', async () => {
        const fetchPage = vi.fn().mockRejectedValue(new Error('down'));

        await expect(fetchAllReportPages(fetchPage, {}, 2)).rejects.toThrow('down');
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });
});

describe('active incidents summary copy', () => {
    test('describes a mix of responding and not-yet-responding incidents', () => {
        // The case that made the old fixed phrase wrong: two active incidents,
        // only one of them with a responder.
        const summary = buildActiveIncidentsSummary({ total: 2, responding: 1 });

        expect(summary.helper).toBe('1 responding, 1 waiting');
        expect(summary.description).toContain('1 responding');
        expect(summary.description).toContain('1 waiting');
    });

    test('never claims anything is responding when nothing is', () => {
        const summary = buildActiveIncidentsSummary({ total: 2, responding: 0 });

        expect(summary.helper).toBe('2 waiting for a responder');
        expect(summary.helper).not.toMatch(/responding/);
        expect(summary.description).toContain('none responding yet');
    });

    test('says so plainly when every active incident is responding', () => {
        expect(buildActiveIncidentsSummary({ total: 3, responding: 3 }).helper).toBe('All in active response');
        expect(buildActiveIncidentsSummary({ total: 1, responding: 1 }).helper).toBe('Active response');
    });

    test('handles the empty state without a stray count', () => {
        const summary = buildActiveIncidentsSummary({ total: 0, responding: 0 });

        expect(summary.helper).toBe('Nothing active');
        expect(summary.description).toMatch(/^No active/);
    });

    test('clamps a responding count that exceeds the total', () => {
        // Socket updates can briefly deliver the two lists out of step; the copy
        // must never invent a negative "waiting" figure.
        const summary = buildActiveIncidentsSummary({ total: 1, responding: 5 });

        expect(summary.helper).toBe('Active response');
        expect(summary.helper).not.toContain('-');
    });

    test('names transferred incidents as part of the waiting set, not as a fourth count', () => {
        // 4 active: 1 in response, 3 still unhandled, and 2 of those handed on.
        // The parenthetical is a property of the waiting three, so the line can
        // never be read as six incidents beside a card that says four.
        const summary = buildActiveIncidentsSummary({ total: 4, responding: 1, transferred: 2 });

        expect(summary.helper).toBe('1 responding, 3 waiting (2 transferred)');
        expect(summary.description).toBe('4 active: 1 responding, 3 waiting (2 transferred)');
    });

    test('still names the transfer when nothing is responding yet', () => {
        // "2 waiting for a responder" would swallow the one fact the admin needs,
        // so the transfer replaces that phrase rather than hiding behind it.
        const summary = buildActiveIncidentsSummary({ total: 2, responding: 0, transferred: 2 });

        expect(summary.helper).toBe('2 waiting (2 transferred)');
        expect(summary.helper).not.toMatch(/waiting for a responder/);
    });

    test('drops the parenthetical when nothing has been transferred', () => {
        expect(buildActiveIncidentsSummary({ total: 2, responding: 1, transferred: 0 }).helper)
            .toBe('1 responding, 1 waiting');
    });

    test('clamps a transferred count that exceeds what is still waiting', () => {
        // Socket updates can deliver the lists out of step. An incident a unit is
        // already handling cannot also be one of the handed-on ones, so the two
        // cases that would contradict the card resolve to its existing copy or to
        // the waiting total.
        expect(buildActiveIncidentsSummary({ total: 1, responding: 1, transferred: 5 }).helper)
            .toBe('Active response');
        expect(buildActiveIncidentsSummary({ total: 3, responding: 0, transferred: 9 }).helper)
            .toBe('3 waiting (3 transferred)');
        expect(buildActiveIncidentsSummary({ total: 3, responding: 0, transferred: -4 }).helper)
            .toBe('3 waiting for a responder');
    });

    test('keeps the panel description to one line of count and mix', () => {
        // The summary panel prints this in its header, one line of context above
        // the record list. It used to carry a second sentence — "Verified and
        // transferred count too." — plus a location spread, which wrapped it to
        // three lines in the panel's actual width. The records below it show
        // where the incidents are, so the line stays the count and its mix.
        const summary = buildActiveIncidentsSummary({ total: 4, responding: 1, transferred: 2 });

        expect(summary.description).toBe('4 active: 1 responding, 3 waiting (2 transferred)');
        expect(summary.description.split('\n')).toHaveLength(1);
        expect(summary.description).not.toMatch(/count too|counted separately|across/);
    });

    test('keeps the helper inside the card’s two-line budget', () => {
        // The KPI card wraps this line to two lines instead of clipping it, so a
        // supporting line cut off mid-word — which matches the data no better
        // than a wrong one — can no longer happen. The ceiling is the widest line
        // the copy can produce: all three counts at two digits, which is 42
        // characters. The extra few keep the assertion from being a tautology.
        const cases = [
            { total: 0, responding: 0 },
            { total: 1, responding: 0 },
            { total: 2, responding: 1 },
            { total: 12, responding: 7 },
            { total: 9, responding: 9 },
            { total: 4, responding: 1, transferred: 2 },
            { total: 99, responding: 12, transferred: 41 },
        ];

        cases.forEach((input) => {
            expect(buildActiveIncidentsSummary(input).helper.length).toBeLessThanOrEqual(46);
        });
    });

    test('keeps the description inside the panel header’s one-line budget', () => {
        // The header prints this at 12px on one line. The widest string the copy
        // can produce is the two-digit mix below at 53 characters, well inside
        // the 56 kept here so the assertion is a ceiling and not a restatement.
        const cases = [
            { total: 1, responding: 0 },
            { total: 9, responding: 9 },
            { total: 4, responding: 1, transferred: 2 },
            { total: 99, responding: 12, transferred: 41 },
        ];

        cases.forEach((input) => {
            expect(buildActiveIncidentsSummary(input).description.length).toBeLessThanOrEqual(56);
        });
    });
});
