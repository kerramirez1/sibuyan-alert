import { describe, expect, test, vi } from 'vitest';
import { mapWithConcurrency } from '../utils/concurrency.js';

const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('mapWithConcurrency', () => {
    test('returns an empty array for empty input without calling the worker', async () => {
        const worker = vi.fn();

        await expect(mapWithConcurrency([], 3, worker)).resolves.toEqual([]);
        expect(worker).not.toHaveBeenCalled();
    });

    test('rejects when the worker is not a function', async () => {
        await expect(mapWithConcurrency([1], 2, null)).rejects.toThrow(TypeError);
    });

    test('preserves input order even when work finishes out of order', async () => {
        const first = createDeferred();
        const second = createDeferred();

        const run = mapWithConcurrency([1, 2], 2, (item) => (item === 1 ? first.promise : second.promise));

        // The second item resolves first; the result must still be positional.
        second.resolve('second');
        first.resolve('first');

        await expect(run).resolves.toEqual(['first', 'second']);
    });

    test('never runs more than the limit at once', async () => {
        let active = 0;
        let maxActive = 0;
        const gates = Array.from({ length: 6 }, () => createDeferred());

        const run = mapWithConcurrency(gates, 2, async (gate) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await gate.promise;
            active -= 1;
            return true;
        });

        // Let the first batch start, then open them one at a time.
        await Promise.resolve();
        expect(maxActive).toBe(2);

        for (const gate of gates) {
            gate.resolve();
            await Promise.resolve();
            await Promise.resolve();
        }

        await expect(run).resolves.toEqual([true, true, true, true, true, true]);
        expect(maxActive).toBe(2);
    });

    test('clamps a non-positive or unparseable limit to one worker', async () => {
        for (const limit of [0, -5, Number.NaN, undefined]) {
            let active = 0;
            let maxActive = 0;

            await mapWithConcurrency([1, 2, 3], limit, async () => {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await Promise.resolve();
                active -= 1;
            });

            expect(maxActive).toBe(1);
        }
    });

    test('stops dispatching new work after a failure and re-throws it', async () => {
        const started = [];
        const failure = new Error('upload failed');

        await expect(mapWithConcurrency([1, 2, 3, 4, 5], 1, async (item) => {
            started.push(item);
            if (item === 2) throw failure;
            return item;
        })).rejects.toBe(failure);

        // Items 3-5 were never started: one failure does not fan out.
        expect(started).toEqual([1, 2]);
    });

    test('lets in-flight work finish so the caller can see what was created', async () => {
        const inFlight = createDeferred();
        const completed = [];

        const run = mapWithConcurrency([1, 2], 2, async (item) => {
            if (item === 1) throw new Error('first failed');
            await inFlight.promise;
            completed.push(item);
            return item;
        });

        // The failure is known to worker 1 while worker 2 is still running.
        await Promise.resolve();
        expect(completed).toEqual([]);

        inFlight.resolve();
        await expect(run).rejects.toThrow('first failed');
        expect(completed).toEqual([2]);
    });

    test('passes each item and its index to the worker', async () => {
        const seen = [];

        await mapWithConcurrency(['a', 'b'], 2, async (item, index) => {
            seen.push([item, index]);
        });

        expect(seen).toEqual([['a', 0], ['b', 1]]);
    });
});
