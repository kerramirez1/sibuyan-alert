import { describe, expect, test } from 'vitest';
import {
    getFilteredMapReports,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../utils/mapReports';

describe('map report visibility', () => {
    test('counts unique active report identities and excludes records that cannot render', () => {
        const reports = [
            { _id: 'report-1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { id: 'report-1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'report-2', status: 'transferred', coordinates: { lat: 12.5, lng: 122.7 } },
            { _id: 'invalid-coordinates', status: 'verified', coordinates: { lat: null, lng: null } },
            { _id: 'resolved', status: 'resolved', coordinates: { lat: 12.6, lng: 122.8 } },
        ];

        expect(getVisibleMapReports(reports).map((report) => report._id || report.id)).toEqual(['report-1', 'report-2', 'resolved']);
    });

    test('groups separate incidents at the same coordinates without losing their report count', () => {
        const reports = [
            { _id: 'report-1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'report-2', status: 'transferred', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'report-3', status: 'verified', coordinates: { lat: 12.5, lng: 122.7 } },
            { _id: 'report-4', status: 'responding', coordinates: { lat: 12.6, lng: 122.8 } },
        ];

        const groups = groupReportsByMapLocation(reports);

        expect(groups).toHaveLength(3);
        expect(groups.map((group) => group.reports.length)).toEqual([2, 1, 1]);
        expect(groups.reduce((total, group) => total + group.reports.length, 0)).toBe(4);
    });

    test('filters by specific statuses cleanly across operational and public modes', () => {
        const coordinates = { lat: 12.4, lng: 122.6 };
        const reports = [
            { _id: 'pending', status: 'pending', coordinates },
            { _id: 'verified', status: 'verified', coordinates },
            { _id: 'transferred', status: 'transferred', coordinates },
            { _id: 'responding', status: 'responding', coordinates },
            { _id: 'resolved', status: 'resolved', coordinates },
        ];

        // Public All Active
        expect(getFilteredMapReports(reports, {
            filterMode: 'public',
        }).map((r) => r._id)).toEqual(['verified', 'transferred', 'responding']);

        // Operational All Active
        expect(getFilteredMapReports(reports, {
            includePending: true,
            filterMode: 'response',
        }).map((r) => r._id)).toEqual(['pending', 'verified', 'transferred', 'responding']);

        // 'incidents' selects the same active report set as 'all'; the hazard
        // layer difference is resolved by isRiskZoneLayerVisibleForFilter.
        expect(getFilteredMapReports(reports, { statusFilter: 'incidents' }).map((r) => r._id)).toEqual(['verified', 'transferred', 'responding']);
        expect(getFilteredMapReports(reports, { includePending: true, statusFilter: 'incidents' }).map((r) => r._id)).toEqual(['pending', 'verified', 'transferred', 'responding']);

        // Specific status filters
        expect(getFilteredMapReports(reports, { includePending: true, statusFilter: 'pending' }).map((r) => r._id)).toEqual(['pending']);
        expect(getFilteredMapReports(reports, { statusFilter: 'verified' }).map((r) => r._id)).toEqual(['verified']);
        expect(getFilteredMapReports(reports, { statusFilter: 'responding' }).map((r) => r._id)).toEqual(['responding']);
        expect(getFilteredMapReports(reports, { statusFilter: 'transferred' }).map((r) => r._id)).toEqual(['transferred']);
        expect(getFilteredMapReports(reports, { statusFilter: 'resolved' }).map((r) => r._id)).toEqual(['resolved']);
        expect(getFilteredMapReports(reports, { statusFilter: 'risk-zones' }).map((r) => r._id)).toEqual([]);
    });
});
