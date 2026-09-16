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
        expect(buildActiveIncidentsSummary({ total: 3, responding: 3 }).helper).toBe('All responding');
        expect(buildActiveIncidentsSummary({ total: 1, responding: 1 }).helper).toBe('Responding');
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

        expect(summary.helper).toBe('Responding');
        expect(summary.helper).not.toContain('-');
    });

    test('mentions the spread only when incidents share fewer locations than they number', () => {
        expect(buildActiveIncidentsSummary({ total: 3, responding: 1, locations: 2 }).description)
            .toContain('across 2 map locations');
        // One incident at one location is not spread across anything.
        expect(buildActiveIncidentsSummary({ total: 1, responding: 1, locations: 1 }).description)
            .not.toContain('across');
    });

    test('keeps the helper short enough that the card cannot truncate it', () => {
        // The KPI card clips its supporting line, and a description cut off
        // mid-word matches the data no better than a wrong one does.
        const cases = [
            { total: 0, responding: 0 },
            { total: 1, responding: 0 },
            { total: 2, responding: 1 },
            { total: 12, responding: 7 },
            { total: 9, responding: 9 },
        ];

        cases.forEach((input) => {
            expect(buildActiveIncidentsSummary(input).helper.length).toBeLessThanOrEqual(30);
        });
    });
});
