import { beforeEach, describe, expect, test, vi as jest } from 'vitest';

jest.mock('../models/Report.js', () => ({
    default: { find: jest.fn(), findOneAndUpdate: jest.fn() },
}));

jest.mock('../models/User.js', () => ({
    default: { find: jest.fn() },
}));

jest.mock('../models/Notification.js', () => ({
    default: { createAndSend: jest.fn() },
}));

jest.mock('../services/socketService.js', () => ({
    broadcastDispatchEscalation: jest.fn(),
}));

jest.mock('../services/pushService.js', () => ({
    sendPushToUsers: jest.fn(),
    pushTemplates: { dispatchEscalated: jest.fn() },
}));

const {
    armDispatchAcknowledgement,
    acknowledgeDispatch,
    escalateDispatch,
    sweepDispatchEscalations,
} = await import('../services/dispatchEscalationService.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');
const { broadcastDispatchEscalation } = await import('../services/socketService.js');
const { sendPushToUsers, pushTemplates } = await import('../services/pushService.js');
const { resolveDispatchPolicy } = await import('../config/dispatchPolicy.js');

const policy = resolveDispatchPolicy({});

const report = (overrides = {}) => ({
    _id: 'report-1',
    status: 'verified',
    address: 'Sibuyan Circumferential Road',
    municipalityName: 'Cajidiocan',
    dispatch: { escalationCount: 1, acknowledgedAt: null },
    ...overrides,
});

const dueQuery = (ids) => ({
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
});

beforeEach(() => {
    Report.find.mockReset();
    Report.findOneAndUpdate.mockReset();
    User.find.mockReset();
    User.find.mockResolvedValue([]);
    Notification.createAndSend.mockReset();
    Notification.createAndSend.mockResolvedValue({});
    broadcastDispatchEscalation.mockReset();
    sendPushToUsers.mockReset();
    sendPushToUsers.mockResolvedValue(false);
    pushTemplates.dispatchEscalated.mockReset();
    pushTemplates.dispatchEscalated.mockReturnValue({});
});

describe('dispatch acknowledgement clock', () => {
    test('arms a deadline one acknowledgement window after the alert', () => {
        const now = new Date('2026-09-11T00:00:00.000Z');
        const armed = armDispatchAcknowledgement(report(), policy, now);

        expect(armed.dispatch.alertedAt).toEqual(now);
        expect(armed.dispatch.ackDeadlineAt).toEqual(new Date(now.getTime() + policy.ackWindowMs));
        expect(armed.dispatch.nextEscalationAt).toEqual(armed.dispatch.ackDeadlineAt);
        expect(armed.dispatch.escalationCount).toBe(0);
        expect(armed.dispatch.acknowledgedAt).toBeNull();
    });

    test('acknowledging records the responder and stops the escalation clock', () => {
        const now = new Date('2026-09-11T00:05:00.000Z');
        const acknowledged = acknowledgeDispatch(
            report({ dispatch: { nextEscalationAt: new Date(), escalationCount: 0 } }),
            'responder-1',
            now
        );

        expect(acknowledged.dispatch.acknowledgedAt).toEqual(now);
        expect(acknowledged.dispatch.acknowledgedBy).toBe('responder-1');
        expect(acknowledged.dispatch.nextEscalationAt).toBeNull();
    });

    test('a later unit joining does not overwrite the original acknowledgement time', () => {
        const first = new Date('2026-09-11T00:03:00.000Z');
        const target = report({ dispatch: { acknowledgedAt: first, acknowledgedBy: 'responder-1' } });

        acknowledgeDispatch(target, 'responder-2', new Date('2026-09-11T00:20:00.000Z'));

        expect(target.dispatch.acknowledgedAt).toEqual(first);
        expect(target.dispatch.acknowledgedBy).toBe('responder-1');
    });

    test('acknowledging a report that was never armed is a no-op', () => {
        const target = report({ dispatch: undefined });
        expect(() => acknowledgeDispatch(target, 'responder-1')).not.toThrow();
        expect(target.dispatch).toBeUndefined();
    });
});

describe('escalating an unacknowledged incident', () => {
    test('re-pages responders and notifies the administering office', async () => {
        const claimed = report();
        Report.findOneAndUpdate.mockResolvedValue(claimed);
        User.find.mockResolvedValue([
            { _id: 'admin-1', role: 'municipal_admin', pushSubscription: { endpoint: 'x' }, notificationPreferences: { browserPush: true } },
        ]);

        const result = await escalateDispatch({ reportId: 'report-1', io: {}, policy });

        expect(result).toBe(claimed);
        expect(broadcastDispatchEscalation).toHaveBeenCalledWith({}, claimed, {
            escalationCount: 1,
            maxEscalations: policy.maxEscalations,
        });
        expect(Notification.createAndSend).toHaveBeenCalledTimes(1);
        expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    });

    test('does nothing when another instance already claimed the escalation', async () => {
        Report.findOneAndUpdate.mockResolvedValue(null);

        const result = await escalateDispatch({ reportId: 'report-1', io: {}, policy });

        expect(result).toBeNull();
        expect(broadcastDispatchEscalation).not.toHaveBeenCalled();
        expect(Notification.createAndSend).not.toHaveBeenCalled();
    });

    test('the claim filter only matches still-verified, unacknowledged, due incidents', async () => {
        Report.findOneAndUpdate.mockResolvedValue(null);
        const now = new Date('2026-09-11T01:00:00.000Z');

        await escalateDispatch({ reportId: 'report-1', io: {}, policy, now });

        const [filter] = Report.findOneAndUpdate.mock.calls[0];
        expect(filter).toMatchObject({
            _id: 'report-1',
            status: 'verified',
            'dispatch.acknowledgedAt': null,
            'dispatch.nextEscalationAt': { $lte: now },
            'dispatch.escalationCount': { $lt: policy.maxEscalations },
        });
    });
});

describe('the escalation sweep', () => {
    test('escalates every due incident and reports what it did', async () => {
        Report.find.mockReturnValue(dueQuery(['a', 'b']));
        Report.findOneAndUpdate.mockResolvedValue(report());

        const summary = await sweepDispatchEscalations({ io: {}, policy });

        expect(summary.scanned).toBe(2);
        expect(summary.escalated).toBe(2);
    });

    test('bounds a sweep so a backlog cannot become a push storm', async () => {
        Report.find.mockReturnValue(dueQuery(['a']));
        Report.findOneAndUpdate.mockResolvedValue(null);

        await sweepDispatchEscalations({ io: {}, policy });

        expect(Report.find().limit).toHaveBeenCalledWith(policy.sweepBatchSize);
    });

    test('one failing incident does not abandon the rest of the sweep', async () => {
        Report.find.mockReturnValue(dueQuery(['a', 'b']));
        Report.findOneAndUpdate
            .mockRejectedValueOnce(new Error('transient mongo error'))
            .mockResolvedValueOnce(report());

        const summary = await sweepDispatchEscalations({ io: {}, policy });

        expect(summary.scanned).toBe(2);
        expect(summary.escalated).toBe(1);
    });
});

describe('dispatch policy', () => {
    test('falls back to safe defaults for malformed environment values', () => {
        const resolved = resolveDispatchPolicy({
            DISPATCH_ACK_WINDOW_MINUTES: 'not-a-number',
            DISPATCH_MAX_ESCALATIONS: '-4',
        });

        expect(resolved.ackWindowMinutes).toBe(5);
        expect(resolved.maxEscalations).toBe(3);
    });

    test('honours explicit environment overrides', () => {
        const resolved = resolveDispatchPolicy({
            DISPATCH_ACK_WINDOW_MINUTES: '2',
            DISPATCH_ESCALATION_INTERVAL_MINUTES: '3',
            DISPATCH_MAX_ESCALATIONS: '5',
        });

        expect(resolved.ackWindowMs).toBe(2 * 60 * 1000);
        expect(resolved.escalationIntervalMs).toBe(3 * 60 * 1000);
        expect(resolved.maxEscalations).toBe(5);
    });
});
