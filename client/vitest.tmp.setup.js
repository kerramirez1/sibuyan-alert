// TEMPORARY validation harness (deleted after this task).
//
// The repo's src/test/setup.js imports `beforeEach` from 'vitest', which fails
// with "Vitest failed to find the runner" in this environment. This setup file
// does the same job using the globals injected by `globals: true`.
import '@testing-library/jest-dom';
import { __queryCacheInternals, clearQueryCache } from './src/utils/queryCache';

beforeEach(() => {
    clearQueryCache();
    __queryCacheInternals.inflight.clear();
});
