/**
 * Dispatch acknowledgement and escalation.
 *
 * The problem this solves: with SMS out of scope, every alert rides over IP.
 * Socket.IO and Web Push both require a live device, so an alert can be sent
 * and read by nobody — and the system has no way of knowing. Silence is
 * indistinguishable from "handled".
 *
 * The fix is to treat silence as failure. A verified incident gets an
 * acknowledgement deadline; if no unit confirms receipt, the alert is re-sent
 * on an escalating loop and the administering office is told that no unit is
 * reachable.
 *
 * Concurrency: escalation must be safe across dynos. The claim is a single
 * atomic findOneAndUpdate whose filter only matches while the incident is
 * still due. Two instances sweeping at the same instant cannot both escalate
 * the same incident — the second matches nothing and skips. No locks, no
 * leader election, no in-process timers holding state.
 */
import Report from '../models/Report.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { broadcastDispatchEscalation } from './socketService.js';
import { sendPushToUsers, pushTemplates } from './pushService.js';
import { resolveDispatchPolicy } from '../config/dispatchPolicy.js';

/**
 * Records that a verified incident was handed to responders and starts the
 * acknowledgement clock. Called once, at verification time.
 */
export const armDispatchAcknowledgement = (report, policy = resolveDispatchPolicy(), now = new Date()) => {
    report.dispatch = {
        alertedAt: now,
        ackDeadlineAt: new Date(now.getTime() + policy.ackWindowMs),
        nextEscalationAt: new Date(now.getTime() + policy.ackWindowMs),
        acknowledgedAt: null,
        acknowledgedBy: null,
        lastEscalatedAt: null,
        escalationCount: 0,
    };
    return report;
};

/**
 * Records an acknowledgement and stops the escalation clock.
 *
 * Acknowledgement is intentionally the same act as responding: a unit that
 * declares itself en route has, by definition, confirmed receipt. A second
 * unit joining later must not overwrite the original acknowledgement time,
 * because that timestamp is the audit record of how long the incident waited.
 */
export const acknowledgeDispatch = (report, responderId, now = new Date()) => {
    if (!report.dispatch) return report;
    if (report.dispatch.acknowledgedAt) return report;

    report.dispatch.acknowledgedAt = now;
    report.dispatch.acknowledgedBy = responderId || null;
    report.dispatch.nextEscalationAt = null;
    return report;
};

/**
 * Atomically claims the next escalation slot for one incident.
 *
 * @returns {Promise<Object|null>} the updated report when this caller won the
 *   claim, or null when the incident is acknowledged, not yet due, exhausted,
 *   or already claimed by another process.
 */
export const claimDispatchEscalation = async ({ reportId, policy, now = new Date() }) => {
    const nextDue = now.getTime() + policy.escalationIntervalMs;

    return Report.findOneAndUpdate(
        {
            _id: reportId,
            status: 'verified',
            'dispatch.acknowledgedAt': null,
            'dispatch.nextEscalationAt': { $lte: now },
            'dispatch.escalationCount': { $lt: policy.maxEscalations },
        },
        [
            {
                $set: {
                    'dispatch.escalationCount': { $add: [{ $ifNull: ['$dispatch.escalationCount', 0] }, 1] },
                    'dispatch.lastEscalatedAt': now,
                },
            },
            {
                $set: {
                    // Exhausting the budget stops the loop. The incident stays
                    // visible to administrators as permanently unacknowledged
                    // rather than quietly retrying forever.
                    'dispatch.nextEscalationAt': {
                        $cond: [
                            { $gte: ['$dispatch.escalationCount', policy.maxEscalations] },
                            null,
                            new Date(nextDue),
                        ],
                    },
                },
            },
        ],
        { new: true }
    );
};

/**
 * Escalates one incident: re-pages responders, tells the administering office,
 * and records a durable notification for anyone who was offline.
 */
export const escalateDispatch = async ({ reportId, io, policy, now = new Date() }) => {
    const report = await claimDispatchEscalation({ reportId, policy, now });
    if (!report) return null;

    const meta = {
        escalationCount: report.dispatch?.escalationCount ?? 1,
        maxEscalations: policy.maxEscalations,
    };

    broadcastDispatchEscalation(io, report, meta);

    const operationalUsers = await User.find({
        role: { $in: ['municipal_admin', 'responder'] },
        assignedMunicipality: report.municipalityName,
    }).catch(() => []);

    // Durable record first: a responder who was offline when the page fired
    // still finds it waiting in their notification feed on reconnect.
    await Promise.all(operationalUsers.map(async (recipient) => {
        try {
            await Notification.createAndSend(
                {
                    recipient: recipient._id,
                    type: 'dispatch_escalated',
                    title: meta.escalationCount >= policy.maxEscalations
                        ? 'Incident still unacknowledged'
                        : 'No unit has acknowledged',
                    message: `No responder has confirmed receipt at ${report.address}. Attempt ${meta.escalationCount} of ${policy.maxEscalations}.`,
                    data: { reportId: report._id, escalationCount: meta.escalationCount },
                },
                io
            );
        } catch (error) {
            console.error('Escalation notification failed:', error?.message);
        }
    }));

    sendPushToUsers(
        operationalUsers.filter((user) => user.pushSubscription && user.notificationPreferences?.browserPush),
        pushTemplates.dispatchEscalated(report, meta)
    ).catch((error) => console.error('Escalation push failed:', error?.message));

    console.warn(`⏱️ Dispatch escalation ${meta.escalationCount}/${policy.maxEscalations} for report ${report._id} (${report.municipalityName || 'unassigned'})`);

    return report;
};

/**
 * One sweep pass. Bounded per pass so a backlog can never turn a single tick
 * into an unbounded burst of pushes.
 */
export const sweepDispatchEscalations = async ({ io, policy = resolveDispatchPolicy(), now = new Date() } = {}) => {
    const due = await Report.find({
        status: 'verified',
        'dispatch.acknowledgedAt': null,
        'dispatch.nextEscalationAt': { $lte: now },
        'dispatch.escalationCount': { $lt: policy.maxEscalations },
    })
        .select('_id')
        .limit(policy.sweepBatchSize)
        .lean();

    const escalated = [];
    for (const { _id } of due) {
        try {
            const result = await escalateDispatch({ reportId: _id, io, policy, now });
            if (result) escalated.push(result._id);
        } catch (error) {
            console.error(`Dispatch escalation failed for report ${_id}:`, error?.message);
        }
    }

    return { scanned: due.length, escalated: escalated.length, reportIds: escalated };
};

/**
 * Starts the periodic sweeper.
 *
 * Deliberately a polling sweep rather than a per-incident timer: timers live in
 * one process's memory and vanish on restart or dyno recycle, which would drop
 * escalations silently. A sweep is stateless and self-healing.
 *
 * @returns {Function} stop function
 */
export const startDispatchEscalationSweeper = ({ io, policy = resolveDispatchPolicy(), intervalMs } = {}) => {
    const period = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : policy.sweepIntervalMs;
    let sweepInFlight = false;

    const timer = setInterval(async () => {
        // Skip rather than queue: a slow database must not build a backlog of
        // overlapping sweeps that all race for the same claims.
        if (sweepInFlight) return;
        sweepInFlight = true;
        try {
            await sweepDispatchEscalations({ io, policy });
        } catch (error) {
            console.error('Dispatch escalation sweep failed:', error?.message);
        } finally {
            sweepInFlight = false;
        }
    }, period);

    // Never hold the process open on account of a background sweep.
    timer.unref?.();

    console.log(`⏱️ Dispatch escalation sweeper started (ack window ${policy.ackWindowMinutes}m, max ${policy.maxEscalations} escalations, sweep ${Math.round(period / 1000)}s)`);

    return () => clearInterval(timer);
};

export default {
    armDispatchAcknowledgement,
    acknowledgeDispatch,
    claimDispatchEscalation,
    escalateDispatch,
    sweepDispatchEscalations,
    startDispatchEscalationSweeper,
};
