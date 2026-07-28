import { describe, expect, test } from 'vitest';
import {
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

        expect(getVisibleMapReports(reports).map((report) => report._id || report.id)).toEqual(['report-1', 'report-2']);
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
});
