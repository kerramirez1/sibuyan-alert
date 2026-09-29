import { describe, expect, test } from 'vitest';
import {
    getEntityId,
    getManilaCalendarDateKey,
    getMillisecondsUntilNextManilaDay,
    getResolvedTodayReports,
    isSameManilaCalendarDay,
    responderParticipatedInReport,
} from '../utils/reportResolution';

describe('responder resolved-today calculations', () => {
    const now = new Date('2026-08-04T00:30:00.000Z');

    test('normalizes auth and populated MongoDB identifiers', () => {
        expect(getEntityId({ id: 'responder-1' })).toBe('responder-1');
        expect(getEntityId({ _id: 'responder-1' })).toBe('responder-1');
        expect(getEntityId('responder-1')).toBe('responder-1');
    });

    test('uses Philippine calendar-day boundaries regardless of browser timezone', () => {
        expect(isSameManilaCalendarDay('2026-08-03T16:00:00.000Z', now)).toBe(true);
        expect(isSameManilaCalendarDay('2026-08-03T15:59:59.999Z', now)).toBe(false);
        expect(getManilaCalendarDateKey(now)).toBe('2026-08-04');
        expect(getMillisecondsUntilNextManilaDay(now)).toBe(55_800_000);
    });

    test('counts incidents resolved by or handled by the current responder', () => {
        const responder = { id: 'responder-1' };
        const resolvedByMe = {
            _id: 'resolved-by-me',
            status: 'resolved',
            resolvedAt: '2026-08-03T23:00:00.000Z',
            resolvedBy: { _id: 'responder-1' },
        };
        const joinedResponse = {
            _id: 'joined-response',
            status: 'resolved',
            resolvedAt: '2026-08-03T22:00:00.000Z',
            resolvedBy: { _id: 'responder-2' },
            responders: [{ user: { _id: 'responder-1' } }],
        };
        const unrelated = {
            _id: 'unrelated',
            status: 'resolved',
            resolvedAt: '2026-08-03T21:00:00.000Z',
            resolvedBy: { _id: 'responder-2' },
        };

        expect(responderParticipatedInReport(resolvedByMe, responder)).toBe(true);
        expect(responderParticipatedInReport(joinedResponse, responder)).toBe(true);
        expect(getResolvedTodayReports(
            [resolvedByMe, joinedResponse, unrelated],
            { currentUser: responder, now },
        ).map((report) => report._id)).toEqual(['resolved-by-me', 'joined-response']);
    });

    test('requires an explicit resolution timestamp and supports admin-wide counts', () => {
        const reports = [
            { _id: 'valid', status: 'resolved', resolvedAt: '2026-08-03T20:00:00.000Z' },
            { _id: 'missing-time', status: 'resolved', updatedAt: '2026-08-03T20:00:00.000Z' },
            { _id: 'not-resolved', status: 'responding', resolvedAt: '2026-08-03T20:00:00.000Z' },
        ];

        expect(getResolvedTodayReports(reports, { includeAll: true, now })).toEqual([reports[0]]);
    });

    // The dashboard page calls the helper exactly this way for guests and
    // reporters: no signed-in participant to match against, so the whole
    // already-visible set is read and only the Manila calendar day filters.
    test('counts the whole visible set for signed-out viewers across the Manila midnight boundary', () => {
        const reports = [
            // 2026-08-04 08:00 Manila — today.
            { _id: 'today-morning', status: 'resolved', resolvedAt: '2026-08-04T00:00:00.000Z' },
            // 2026-08-03 23:59:59.999 Manila — yesterday, one millisecond out.
            { _id: 'yesterday-edge', status: 'resolved', resolvedAt: '2026-08-03T15:59:59.999Z' },
            // No timestamp, no matter how recently it changed state.
            { _id: 'missing-time', status: 'resolved', updatedAt: '2026-08-04T00:00:00.000Z' },
            // Open incidents are never "resolved today", whatever their stamps.
            { _id: 'still-open', status: 'responding', resolvedAt: '2026-08-04T00:00:00.000Z' },
        ];

        expect(getResolvedTodayReports(reports, { currentUser: null, includeAll: true, now })
            .map((report) => report._id)).toEqual(['today-morning']);
    });

    test('returns an empty set — never null — when nothing closed today', () => {
        expect(getResolvedTodayReports(
            [{ _id: 'old', status: 'resolved', resolvedAt: '2026-01-02T04:00:00.000Z' }],
            { currentUser: null, includeAll: true, now },
        )).toEqual([]);
        expect(getResolvedTodayReports(undefined, { currentUser: null, includeAll: true, now })).toEqual([]);
    });
});
