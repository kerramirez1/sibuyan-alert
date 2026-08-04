import { describe, expect, test, vi } from 'vitest';
import {
    deduplicateDashboardReports,
    fetchAllAdminReportPages,
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

        const reports = await fetchAllAdminReportPages(fetchPage, {}, 2);

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
});
