/**
 * Throttled progress reporting for uploads.
 *
 * XHR fires an upload progress event for every network chunk, which on a
 * multi-megabyte photo upload can be dozens to hundreds of events per second.
 * Each one used to call `setUploadProgress` on `ReportPage`, and that component
 * owns a live MapLibre map — so the reporter paid a full page re-render, over
 * and over, for a progress bar that only displays whole percentages.
 *
 * This coalesces those events to at most one emit per `intervalMs`, with two
 * properties that matter for correctness:
 *
 *   - **The last value is never lost.** A trailing timer emits the newest
 *     pending value, so the bar converges to the real progress instead of
 *     stopping at whatever happened to land on a throttle boundary.
 *   - **The first value is immediate.** There is no dead interval at the start
 *     of an upload, so the UI reacts the moment bytes start moving.
 *
 * Clock and timers are injectable so the behaviour is testable without waiting
 * on real time.
 */

export const DEFAULT_PROGRESS_THROTTLE_MS = 250;

/**
 * @param {object} options
 * @param {(value: any) => void} options.onEmit - Receives at most one value per interval.
 * @param {number} [options.intervalMs=DEFAULT_PROGRESS_THROTTLE_MS]
 * @param {() => number} [options.now]
 * @param {(fn: Function, ms: number) => any} [options.schedule]
 * @param {(handle: any) => void} [options.cancelScheduled]
 * @returns {{ push: (value: any) => void, flush: () => void, cancel: () => void }}
 */
export const createThrottledProgressEmitter = ({
    onEmit,
    intervalMs = DEFAULT_PROGRESS_THROTTLE_MS,
    now = () => Date.now(),
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancelScheduled = (handle) => clearTimeout(handle),
} = {}) => {
    const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_PROGRESS_THROTTLE_MS;

    let lastEmittedAt = null;
    let pendingValue = null;
    let timer = null;

    const clearTimer = () => {
        if (timer === null) return;
        cancelScheduled(timer);
        timer = null;
    };

    const emit = (value) => {
        lastEmittedAt = now();
        if (typeof onEmit === 'function') onEmit(value);
    };

    const push = (value) => {
        const elapsed = lastEmittedAt === null ? interval : now() - lastEmittedAt;

        if (elapsed >= interval) {
            clearTimer();
            pendingValue = null;
            emit(value);
            return;
        }

        pendingValue = value;
        if (timer === null) {
            timer = schedule(() => {
                timer = null;
                if (pendingValue === null) return;
                const trailingValue = pendingValue;
                pendingValue = null;
                emit(trailingValue);
            }, interval - elapsed);
        }
    };

    /** Emits the newest pending value right now, if any. */
    const flush = () => {
        clearTimer();
        if (pendingValue === null) return;
        const value = pendingValue;
        pendingValue = null;
        emit(value);
    };

    /** Drops any pending value. Used when the upload ends and the UI is reset. */
    const cancel = () => {
        clearTimer();
        pendingValue = null;
    };

    return { push, flush, cancel };
};

export default { createThrottledProgressEmitter, DEFAULT_PROGRESS_THROTTLE_MS };
