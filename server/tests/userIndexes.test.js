import { describe, expect, test } from 'vitest';

/**
 * P2-4: the User schema carries the operational and token indexes.
 * No mocks — the real model definition is inspected.
 */
describe('P2-4 user indexes', () => {
    test('User schema carries the operational and token indexes', async () => {
        const { default: User } = await import('../models/User.js');
        const indexes = User.schema.indexes();
        const byFields = new Map(indexes.map(([fields, options]) => [JSON.stringify(fields), options || {}]));

        expect([...byFields.keys()]).toContain(JSON.stringify({ role: 1, assignedMunicipality: 1 }));
        expect([...byFields.keys()]).toContain(JSON.stringify({ resetPasswordToken: 1 }));
        expect(byFields.get(JSON.stringify({ resetPasswordToken: 1 }))).toMatchObject({ sparse: true });
    });
});
