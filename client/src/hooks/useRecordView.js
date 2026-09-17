import { useEffect, useRef } from 'react';
import api from '../services/api';

/**
 * Records one reach view for a specific record.
 *
 * Fire-and-forget by design: a view that fails to send is a missing data point,
 * never a broken screen. Nothing here blocks rendering, surfaces an error, or
 * participates in the request lifecycle of the panel it sits in.
 *
 * The ref guard stops a re-render from firing a second request for the same
 * record. It is a courtesy, not the correctness mechanism — the server's unique
 * index is what makes repeat views impossible to double-count, so this hook is
 * free to be simple and the network is free to be flaky.
 *
 * A view means the viewer OPENED this record's details. It is not an impression:
 * a pin scrolling past the viewport, or a dashboard load, must never call this.
 *
 * @param {object}      [options]
 * @param {'report'|'zone'} [options.targetType]
 * @param {string}      [options.targetId]
 * @param {boolean}     [options.enabled] Skip recording when false.
 */
export const useRecordView = ({ targetType, targetId, enabled = true } = {}) => {
    const recordedRef = useRef(null);

    useEffect(() => {
        if (!enabled || !targetType || !targetId) return;

        const key = `${targetType}:${targetId}`;
        if (recordedRef.current === key) return;
        recordedRef.current = key;

        try {
            // `?.` and the try/catch are not defensive padding — they are the
            // contract. Reach is telemetry, so a missing or broken api method
            // must degrade to "this view was not counted" rather than throwing
            // out of an effect and taking the panel that called it down with it.
            api.recordViewEvent?.({ targetType, targetId })?.catch?.(() => {});
        } catch {
            // Swallowed on purpose, same reason.
        }
    }, [enabled, targetType, targetId]);
};

export default useRecordView;
