import { describe, expect, test } from 'vitest';
import {
    buildNotificationTarget,
    getReportUpdateMeta,
    normalizeNotificationId,
    shouldDeferNotificationRead,
} from '../utils/notificationNavigation';

const reportId = '64b100000000000000000001';
const updateId = '64b100000000000000000002';
const notificationId = '64b100000000000000000003';

const reporterUpdate = {
    _id: notificationId,
    type: 'report_update',
    data: { reportId, updateId, tag: 'need_help' },
};

describe('notification navigation policy', () => {
    test('builds a scoped incident deep link for operational users', () => {
        expect(buildNotificationTarget(reporterUpdate, 'municipal_admin')).toBe(
            `/admin/reports?report=${reportId}&source=notification&notification=${notificationId}&update=${updateId}`
        );
        expect(shouldDeferNotificationRead(reporterUpdate, 'municipal_admin')).toBe(true);
        expect(shouldDeferNotificationRead(reporterUpdate, 'responder')).toBe(true);
    });

    test('does not trust malformed identifiers in a notification payload', () => {
        const malformed = {
            ...reporterUpdate,
            data: { ...reporterUpdate.data, reportId: '../admin/users' },
        };
        expect(normalizeNotificationId(malformed.data.reportId)).toBe('');
        expect(buildNotificationTarget(malformed, 'municipal_admin')).toBe('/admin/reports');
        expect(shouldDeferNotificationRead(malformed, 'municipal_admin')).toBe(false);
    });

    test('keeps reporter destinations and urgency metadata role appropriate', () => {
        expect(buildNotificationTarget(reporterUpdate, 'reporter')).toBe('/my-reports');
        expect(shouldDeferNotificationRead(reporterUpdate, 'reporter')).toBe(false);
        expect(getReportUpdateMeta(reporterUpdate)).toEqual(expect.objectContaining({
            label: 'Urgent help requested',
            priority: 'urgent',
        }));
    });
});
