import { describe, expect, test, vi } from 'vitest';
import { createBackgroundTaskQueue } from '../services/backgroundTaskQueue.js';

const createDeferred = () => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
};

describe('createBackgroundTaskQueue', () => {
    test('runs queued tasks and reports quiescence through drain', async () => {
        const queue = createBackgroundTaskQueue();
        const ran = [];

        queue.enqueue(() => { ran.push('a'); });
        queue.enqueue(() => { ran.push('b'); });

        await queue.drain();

        expect(ran).toEqual(['a', 'b']);
        expect(queue.stats()).toMatchObject({ active: 0, pending: 0 });
    });

    test('runs tasks one at a time by default', async () => {
        const queue = createBackgroundTaskQueue();
        const gate = createDeferred();
        let active = 0;
        let maxActive = 0;

        const track = () => async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await gate.promise;
            active -= 1;
        };

        queue.enqueue(track());
        queue.enqueue(track());
        queue.enqueue(track());

        await Promise.resolve();
        expect(maxActive).toBe(1);

        gate.resolve();
        await queue.drain();
        expect(maxActive).toBe(1);
    });

    test('honours an explicit concurrency bound', async () => {
        const queue = createBackgroundTaskQueue({ concurrency: 2 });
        const gate = createDeferred();
        let active = 0;
        let maxActive = 0;

        for (let i = 0; i < 5; i += 1) {
            queue.enqueue(async () => {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await gate.promise;
                active -= 1;
            });
        }

        await Promise.resolve();
        await Promise.resolve();
        expect(maxActive).toBe(2);
        expect(queue.stats()).toMatchObject({ active: 2, pending: 3, concurrency: 2 });

        gate.resolve();
        await queue.drain();
        expect(maxActive).toBe(2);
    });

    test('clamps an invalid concurrency to one', async () => {
        const queue = createBackgroundTaskQueue({ concurrency: 0 });
        expect(queue.stats().concurrency).toBe(1);
    });

    test('isolates a failing task: the report is called and the queue keeps going', async () => {
        const onError = vi.fn();
        const queue = createBackgroundTaskQueue({ name: 'evidence', onError });
        const ran = [];

        await queue.enqueue(() => { throw new Error('analysis exploded'); });
        queue.enqueue(() => { ran.push('after'); });
        await queue.drain();

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(onError.mock.calls[0][1]).toEqual({ queue: 'evidence' });
        // The failure did not stop the next task.
        expect(ran).toEqual(['after']);
    });

    test('resolves a failing task instead of rejecting the enqueue promise', async () => {
        const queue = createBackgroundTaskQueue({ onError: () => {} });

        await expect(queue.enqueue(async () => { throw new Error('boom'); })).resolves.toBeUndefined();
    });

    test('contains an onError reporter that itself throws', async () => {
        const queue = createBackgroundTaskQueue({
            onError: () => { throw new Error('reporter failed'); },
        });

        await expect(queue.enqueue(() => { throw new Error('task failed'); })).resolves.toBeUndefined();
        await expect(queue.drain()).resolves.toBeUndefined();
    });

    test('drain resolves immediately when nothing was queued', async () => {
        const queue = createBackgroundTaskQueue();
        await expect(queue.drain()).resolves.toBeUndefined();
    });

    test('rejects a task that is not a function', () => {
        const queue = createBackgroundTaskQueue();
        expect(() => queue.enqueue(null)).toThrow(TypeError);
    });
});
