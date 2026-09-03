import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { __queryCacheInternals, clearQueryCache } from '../utils/queryCache';

// Test isolation: module-level SWR cache must not leak snapshots or
// in-flight dedup promises between cases (e.g. AdminReportsPage queue
// tests render the real hook with different mocked API payloads).
beforeEach(() => {
    clearQueryCache();
    __queryCacheInternals.inflight.clear();
});
