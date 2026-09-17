import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { __queryCacheInternals, clearQueryCache } from '../utils/queryCache';

// Test isolation: module-level SWR cache must not leak snapshots or
// in-flight dedup promises between cases (e.g. AdminReportsPage queue
// tests render the real hook with different mocked API payloads).
// The report draft (localStorage) must not leak either: a draft saved by one
// ReportPage case would otherwise restore into the next case's fresh form.
beforeEach(() => {
    clearQueryCache();
    __queryCacheInternals.inflight.clear();
    try {
        if (typeof localStorage !== 'undefined') localStorage.clear();
    } catch {
        // Storage may be unavailable in some jsdom configurations.
    }
});
