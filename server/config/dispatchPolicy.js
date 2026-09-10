/**
 * Dispatch acknowledgement policy.
 *
 * SMS is out of scope for this system, so every alert has to ride over IP.
 * That only works if silence is treated as failure: an alert nobody
 * acknowledges is re-sent on a widening loop until a unit confirms receipt or
 * the escalation budget runs out. These knobs define that loop.
 *
 * Every value is env-overridable so the window can be tuned per deployment
 * without a code change, and every value falls back to a safe default rather
 * than trusting a malformed env var.
 */

export const DISPATCH_POLICY_DEFAULTS = Object.freeze({
    ackWindowMinutes: 5,
    escalationIntervalMinutes: 5,
    maxEscalations: 3,
    sweepIntervalMs: 30_000,
    sweepBatchSize: 25,
});

const readPositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * @returns {object} the resolved policy with pre-computed millisecond values
 */
export const resolveDispatchPolicy = (env = process.env) => {
    const ackWindowMinutes = readPositiveNumber(
        env.DISPATCH_ACK_WINDOW_MINUTES,
        DISPATCH_POLICY_DEFAULTS.ackWindowMinutes
    );
    const escalationIntervalMinutes = readPositiveNumber(
        env.DISPATCH_ESCALATION_INTERVAL_MINUTES,
        DISPATCH_POLICY_DEFAULTS.escalationIntervalMinutes
    );
    const maxEscalations = Math.floor(readPositiveNumber(
        env.DISPATCH_MAX_ESCALATIONS,
        DISPATCH_POLICY_DEFAULTS.maxEscalations
    ));
    const sweepIntervalMs = readPositiveNumber(
        env.DISPATCH_SWEEP_INTERVAL_MS,
        DISPATCH_POLICY_DEFAULTS.sweepIntervalMs
    );
    const sweepBatchSize = Math.floor(readPositiveNumber(
        env.DISPATCH_SWEEP_BATCH_SIZE,
        DISPATCH_POLICY_DEFAULTS.sweepBatchSize
    ));

    return {
        ackWindowMinutes,
        escalationIntervalMinutes,
        maxEscalations,
        sweepIntervalMs,
        sweepBatchSize,
        ackWindowMs: ackWindowMinutes * 60 * 1000,
        escalationIntervalMs: escalationIntervalMinutes * 60 * 1000,
    };
};

export default { resolveDispatchPolicy, DISPATCH_POLICY_DEFAULTS };
