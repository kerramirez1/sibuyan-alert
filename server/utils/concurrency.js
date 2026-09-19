/**
 * Bounded-concurrency mapping.
 *
 * The API runs on a single dyno with one Node event loop and one MongoDB
 * connection pool, so "run everything at once" is not free: N simultaneous
 * uploads mean N open GridFS write streams, N buffers held in memory, and N
 * callers competing for the same pool. A bound keeps a multi-photo report from
 * starving every other request in the process.
 *
 * Two properties callers depend on:
 *
 *   - **Order is preserved.** The result array is index-aligned with the input,
 *     never completion order. `Report.images` and `evidenceMetadata[index]`
 *     both read positionally, so a reordered result would silently attach the
 *     wrong analysis to the wrong photo.
 *   - **A failure does not abandon work in flight.** When one worker throws, no
 *     new items are started, but the items already running are allowed to
 *     finish so the caller can see exactly what was created and clean it up.
 *     The first failure (in completion order) is then re-thrown.
 */

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit - Maximum workers running at once. Clamped to >= 1.
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>} results in input order
 */
export const mapWithConcurrency = async (items, limit, worker) => {
    const list = Array.isArray(items) ? items : [];

    if (typeof worker !== 'function') {
        throw new TypeError('mapWithConcurrency requires a worker function');
    }
    if (list.length === 0) return [];

    const parsedLimit = Math.floor(Number(limit));
    const workerCount = Math.min(
        Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1, 1),
        list.length,
    );

    // Dense and index-aligned; entries for work that never started stay undefined.
    const results = Array.from({ length: list.length });
    let nextIndex = 0;
    let failure = null;

    const runWorker = async () => {
        while (nextIndex < list.length && failure === null) {
            const index = nextIndex;
            nextIndex += 1;

            try {
                results[index] = await worker(list[index], index);
            } catch (error) {
                // Keep the first failure and stop dispatching new work. The
                // other workers exit their loop on their next check.
                if (failure === null) failure = error;
            }
        }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    if (failure !== null) throw failure;
    return results;
};

export default { mapWithConcurrency };
