/**
 * In-process background task queue.
 *
 * Some work is real but must not sit between a reporter and their 201 — image
 * analysis being the motivating case. That work still has to run *somewhere*,
 * and "fire and forget" (a bare floating promise) has two failure modes this
 * queue exists to prevent:
 *
 *   1. An unhandled rejection can take the process down. Every task is caught
 *      and reported through `onError` instead.
 *   2. The detector is synchronous JavaScript on the main thread, so `Promise.all`
 *      over five photos is not five-way parallelism — it is one long freeze.
 *      A concurrency bound keeps that freeze to one item at a time.
 *
 * Kept deliberately small and transport-free so it can be unit tested without a
 * database, a clock, or a server: `enqueue` to submit, `drain` to await
 * quiescence (tests and shutdown), `size` for observability.
 */

const defaultOnError = (error, context) => {
    console.error(`Background task failed (${context?.queue || 'queue'}):`, error?.message || error);
};

/**
 * @param {object} [options]
 * @param {string} [options.name='background'] - Label used in error reports.
 * @param {number} [options.concurrency=1] - Maximum tasks started at once.
 * @param {(error: Error, context: {queue: string}) => void} [options.onError]
 */
export const createBackgroundTaskQueue = ({
    name = 'background',
    concurrency = 1,
    onError = defaultOnError,
} = {}) => {
    const parsedConcurrency = Math.floor(Number(concurrency));
    const limit = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 1;

    const waiting = [];
    let active = 0;
    let idleWaiters = [];

    const resolveIdle = () => {
        if (active > 0 || waiting.length > 0) return;
        const waiters = idleWaiters;
        idleWaiters = [];
        waiters.forEach((resolve) => resolve());
    };

    const startNext = () => {
        while (active < limit && waiting.length > 0) {
            const task = waiting.shift();
            active += 1;

            Promise.resolve()
                .then(task)
                .catch((error) => {
                    try {
                        onError(error, { queue: name });
                    } catch {
                        // A reporter that throws must not break the queue.
                    }
                })
                .finally(() => {
                    active -= 1;
                    // Fill the freed slot before deciding we are idle: the next
                    // task may already be waiting.
                    startNext();
                    resolveIdle();
                });
        }

        resolveIdle();
    };

    /**
     * Submits a task. The returned promise settles when that task settles, but
     * callers on a request path are expected to ignore it: failures are already
     * reported through `onError` and must never reach the HTTP response.
     *
     * @param {() => Promise<void>|void} task
     */
    const enqueue = (task) => {
        if (typeof task !== 'function') {
            throw new TypeError('createBackgroundTaskQueue: task must be a function');
        }

        const settled = new Promise((resolve) => {
            waiting.push(async () => {
                try {
                    await task();
                } finally {
                    resolve();
                }
            });
            startNext();
        });

        return settled;
    };

    /** Resolves once no task is running or waiting. */
    const drain = () => {
        if (active === 0 && waiting.length === 0) return Promise.resolve();
        return new Promise((resolve) => { idleWaiters.push(resolve); });
    };

    /** @returns {{pending: number, active: number, concurrency: number, name: string}} */
    const stats = () => ({
        name,
        concurrency: limit,
        active,
        pending: waiting.length,
    });

    return { name, enqueue, drain, stats };
};

export default { createBackgroundTaskQueue };
