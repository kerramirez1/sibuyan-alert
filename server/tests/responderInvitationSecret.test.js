import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import User from '../models/User.js';

/**
 * The invitation secret must not be reachable from a query that loads a whole
 * user document.
 *
 * A provisioned responder sets their first password through the same
 * `resetPasswordToken` the reset flow issues, so that field IS the invitation
 * secret. Before this guard it had no `select: false`, and `GET /api/admin/users`
 * — which projects only `-password` — returned it (hashed, but still) on every
 * row of the municipal user list.
 *
 * Asserted against the schema rather than against a response, because the point
 * is that no future query can leak it by forgetting a projection.
 */
describe('responder invitation secret', () => {
    test.each([
        'resetPasswordToken',
        'resetPasswordExpires',
        'provisioningHistory',
        'createdBy',
    ])('%s is excluded from queries by default', (path) => {
        const schemaPath = User.schema.path(path);

        expect(schemaPath).toBeDefined();
        expect(schemaPath.options.select).toBe(false);
    });

    test('no controller opts the invitation secret back in', () => {
        // `+field` is the only way a caller overrides select:false. The admin
        // controller is where the municipal user list and the single-user read
        // live, so a `+resetPasswordToken` appearing here is exactly the leak
        // this guard exists to catch.
        const source = readFileSync(new URL('../controllers/adminController.js', import.meta.url), 'utf8');

        expect(source).not.toMatch(/\+resetPasswordToken/);
        expect(source).not.toMatch(/\+resetPasswordExpires/);
    });
});
