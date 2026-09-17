// TEMPORARY probe (deleted after this task): direct vitest import.
import { describe, expect, test } from 'vitest';

describe('probe with a direct vitest import', () => {
    test('runs', () => {
        expect(1).toBe(1);
    });
});
