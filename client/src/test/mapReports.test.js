import { describe, expect, test } from 'vitest';
import {
    getFilteredMapReports,
    getMapReportBounds,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../utils/mapReports';

describe('map opening framing', () => {
    test('returns no bounds when nothing on the map can be framed', () => {
        // The caller reads null as "keep the island-wide default view", so an
        // empty or unusable set must never produce a degenerate box that would
        // zoom the map to a single point.
        expect(getMapReportBounds([])).toBeNull();
        expect(getMapReportBounds(undefined)).toBeNull();
        expect(getMapReportBounds([
            { _id: 'no-coords', status: 'verified' },
            { _id: 'null-coords', status: 'verified', coordinates: { lat: null, lng: null } },
            { _id: 'out-of-range', status: 'verified', coordinates: { lat: 99, lng: 500 } },
        ])).toBeNull();
    });

    test('boxes every report it can frame, in MapLibre corner order', () => {
        const reports = [
            { _id: 'south-west', status: 'verified', coordinates: { lat: 12.30, lng: 122.50 } },
            { _id: 'north-east', status: 'resolved', coordinates: { lat: 12.55, lng: 122.70 } },
            { _id: 'inside', status: 'transferred', coordinates: { lat: 12.40, lng: 122.60 } },
            // Unusable neighbours are skipped, not treated as (0, 0) — a single
            // bad record used to be able to fling the camera to the Atlantic.
            { _id: 'unusable', status: 'verified', coordinates: { lat: 'abc', lng: 'abc' } },
        ];

        expect(getMapReportBounds(reports)).toEqual([[122.50, 12.30], [122.70, 12.55]]);
    });

    test('reads the legacy location array as well as coordinates', () => {
        // Reports arrive from two API shapes; framing one shape and not the other
        // would send the map to the island while the pins sat somewhere else.
        const reports = [
            { _id: 'geojson', status: 'verified', location: { coordinates: [122.58, 12.37] } },
            { _id: 'latlng', status: 'verified', lat: 12.42, lng: 122.62 },
        ];

        expect(getMapReportBounds(reports)).toEqual([[122.58, 12.37], [122.62, 12.42]]);
    });

    test('boxes one incident into a zero-size box rather than refusing it', () => {
        // A lone incident still opens the map on it; the zoom cap in
        // MAP_CONTENT_FIT_CONFIG is what stops that from becoming street level.
        expect(getMapReportBounds([
            { _id: 'only', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
        ])).toEqual([[122.6, 12.4], [122.6, 12.4]]);
    });
});

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
        }).map((r) => r._id)).toEqual(['verified', 'transferred', 'responding']);

        // Operational All Active
        expect(getFilteredMapReports(reports, {
            includePending: true,
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

        // 'dispatch' is the verified + transferred pair — the one operator
        // situation "verified and waiting for a responder". It shows neither
        // pending (not reviewed yet) nor responding (already handled).
        expect(getFilteredMapReports(reports, { statusFilter: 'dispatch' }).map((r) => r._id))
            .toEqual(['verified', 'transferred']);
        expect(getFilteredMapReports(reports, { includePending: true, statusFilter: 'dispatch' }).map((r) => r._id))
            .toEqual(['verified', 'transferred']);
    });

    test('supports includeRejected option and retains resolved/rejected incidents in location grouping', () => {
        const coordinates = { lat: 12.363035, lng: 122.685384 };
        const reports = [
            { _id: 'resolved-1', status: 'resolved', coordinates },
            { _id: 'rejected-1', status: 'rejected', coordinates: { lat: 12.4, lng: 122.5 } },
        ];

        // By default, rejected is excluded from visible reports
        expect(getVisibleMapReports(reports).map((r) => r._id)).toEqual(['resolved-1']);

        // With includeRejected: true, rejected is preserved
        expect(getVisibleMapReports(reports, { includeRejected: true }).map((r) => r._id)).toEqual(['resolved-1', 'rejected-1']);

        // groupReportsByMapLocation groups both resolved and rejected incidents with coordinates
        const groups = groupReportsByMapLocation(reports);
        expect(groups).toHaveLength(2);
        const resolvedGroup = groups.find((g) => g.reports.some((r) => r._id === 'resolved-1'));
        expect(resolvedGroup).toBeDefined();
        expect(resolvedGroup.reports[0].status).toBe('resolved');
    });
});
