import { useEffect, useRef } from 'react';
import { viewsAPI } from '../services/api';

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

// One warning per session, not one per panel: a wiring failure is a single fact
// about the build, and repeating it on every mount would bury the signal it is
// meant to be.
let hasWarnedAboutMissingRecorder = false;

export const useRecordView = ({ targetType, targetId, enabled = true } = {}) => {
    const recordedRef = useRef(null);

    useEffect(() => {
        if (!enabled || !targetType || !targetId) return;

        const key = `${targetType}:${targetId}`;
        if (recordedRef.current === key) return;
        recordedRef.current = key;

        // A missing recorder is a WIRING bug, not a network failure, and it must
        // not be swallowed the way a failed request is. This hook previously
        // called `api.recordViewEvent?.()` on a module whose default export never
        // had that method, so the optional chain turned every map view into
        // nothing at all — silently, in production, for months. Reach is still
        // allowed to degrade (it is telemetry), but the reason must be visible in
        // development instead of looking like "nobody opened this".
        const record = viewsAPI?.recordViewEvent;
        if (typeof record !== 'function') {
            if (!hasWarnedAboutMissingRecorder) {
                hasWarnedAboutMissingRecorder = true;
                console.warn(
                    '[useRecordView] viewsAPI.recordViewEvent is unavailable; view recording is disabled. '
                    + 'Reach data will be incomplete. Check the export in services/api.js.',
                );
            }
            return;
        }

        try {
            record({ targetType, targetId })?.catch?.(() => {});
        } catch {
            // Swallowed on purpose: telemetry must degrade, never break the panel
            // that called it.
        }
    }, [enabled, targetType, targetId]);
};

export default useRecordView;
