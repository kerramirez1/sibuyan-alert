import { describe, expect, test, vi } from 'vitest';
import {
    createThrottledProgressEmitter,
    DEFAULT_PROGRESS_THROTTLE_MS,
} from '../utils/progressThrottle';

/**
 * Manual clock and timer queue: progress throttling is time-dependent, and
 * asserting it with real timers would make the suite slow and flaky.
 */
const createHarness = ({ intervalMs = 100, onEmit = vi.fn() } = {}) => {
    let currentTime = 0;
    let scheduled = [];
    let nextId = 1;

    const emitter = createThrottledProgressEmitter({
        onEmit,
        intervalMs,
        now: () => currentTime,
        schedule: (fn, ms) => {
            const id = nextId;
            nextId += 1;
            scheduled.push({ id, fn, ms });
            return id;
        },
        cancelScheduled: (id) => {
            scheduled = scheduled.filter((task) => task.id !== id);
        },
    });

    return {
        emitter,
        onEmit,
        advance: (ms) => { currentTime += ms; },
        pendingCount: () => scheduled.length,
        runScheduled: () => {
            const tasks = scheduled;
            scheduled = [];
            tasks.forEach((task) => task.fn());
        },
    };
};

describe('createThrottledProgressEmitter', () => {
    test('emits the first value immediately so the bar moves at once', () => {
        const { emitter, onEmit } = createHarness();

        emitter.push({ percent: 1 });

        expect(onEmit).toHaveBeenCalledTimes(1);
        expect(onEmit).toHaveBeenCalledWith({ percent: 1 });
    });

    test('coalesces a burst of events into one emit per interval', () => {
        const { emitter, onEmit, pendingCount } = createHarness({ intervalMs: 100 });

        emitter.push({ percent: 1 });
        for (let percent = 2; percent <= 50; percent += 1) {
            emitter.push({ percent });
        }

        // 50 XHR events, one re-render: this is the whole point of the change.
        expect(onEmit).toHaveBeenCalledTimes(1);
        expect(pendingCount()).toBe(1);
    });

    test('emits the newest pending value after the interval, never a stale one', () => {
        const { emitter, onEmit, advance, runScheduled } = createHarness({ intervalMs: 100 });

        emitter.push({ percent: 1 });
        emitter.push({ percent: 2 });
        emitter.push({ percent: 3 });
        advance(100);
        runScheduled();

        expect(onEmit).toHaveBeenCalledTimes(2);
        expect(onEmit).toHaveBeenLastCalledWith({ percent: 3 });
    });

    test('keeps emitting at the interval while events keep arriving', () => {
        const { emitter, onEmit, advance, runScheduled } = createHarness({ intervalMs: 100 });

        emitter.push({ percent: 1 });
        for (let step = 0; step < 3; step += 1) {
            advance(100);
            emitter.push({ percent: 10 * (step + 1) });
            runScheduled();
        }

        expect(onEmit.mock.calls.map(([value]) => value.percent)).toEqual([1, 10, 20, 30]);
    });

    test('flush emits the pending value immediately', () => {
        const { emitter, onEmit, pendingCount } = createHarness({ intervalMs: 100 });

        emitter.push({ percent: 1 });
        emitter.push({ percent: 90 });
        expect(onEmit).toHaveBeenCalledTimes(1);

        emitter.flush();

        expect(onEmit).toHaveBeenCalledTimes(2);
        expect(onEmit).toHaveBeenLastCalledWith({ percent: 90 });
        // The scheduled trailing emit was cleared, so it cannot fire twice.
        expect(pendingCount()).toBe(0);
    });

    test('flush with nothing pending does not emit again', () => {
        const { emitter, onEmit } = createHarness({ intervalMs: 100 });

        emitter.push({ percent: 1 });
        emitter.flush();

        expect(onEmit).toHaveBeenCalledTimes(1);
    });

    test('cancel drops the pending value so a finished upload shows no late progress', () => {
        const { emitter, onEmit, advance, runScheduled, pendingCount } = createHarness({ intervalMs: 100 });

        emitter.push({ percent: 1 });
        emitter.push({ percent: 80 });
        emitter.cancel();

        advance(500);
        runScheduled();

        expect(pendingCount()).toBe(0);
        expect(onEmit).toHaveBeenCalledTimes(1);
        expect(onEmit).toHaveBeenLastCalledWith({ percent: 1 });
    });

    test('falls back to the default interval when given an unusable one', () => {
        let emitted = 0;
        const emitter = createThrottledProgressEmitter({
            onEmit: () => { emitted += 1; },
            intervalMs: 0,
            now: () => 0,
            schedule: () => 1,
            cancelScheduled: () => {},
        });

        emitter.push('a');
        emitter.push('b');

        expect(DEFAULT_PROGRESS_THROTTLE_MS).toBeGreaterThan(0);
        expect(emitted).toBe(1);
    });

    test('does not throw when no onEmit handler is given', () => {
        const emitter = createThrottledProgressEmitter({ intervalMs: 10 });

        expect(() => {
            emitter.push('progress');
            emitter.flush();
            emitter.cancel();
        }).not.toThrow();
    });
});
