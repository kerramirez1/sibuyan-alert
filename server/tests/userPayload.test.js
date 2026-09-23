import { describe, expect, test } from 'vitest';
import { buildSelfUserPayload } from '../utils/userPayload.js';

const reporter = {
    _id: 'user-1',
    email: 'juan@example.com',
    name: 'Juan Dela Cruz',
    role: 'reporter',
    agency: null,
    responderUnit: null,
    assignedMunicipality: null,
    avatar: '/api/files/507f1f77bcf86cd799439011/photo.jpg',
    address: 'Tampayan, Magdiwang, Sibuyan Island, Romblon',
    barangay: 'Tampayan',
    isVerified: true,
    verificationStatus: 'approved',
    notificationPreferences: { browserPush: true, inApp: true, email: false },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('buildSelfUserPayload', () => {
    test('carries the verification state that gates the reporter submit flow', () => {
        const payload = buildSelfUserPayload(reporter);

        // The profile update used to answer without these two, so a verified
        // reporter who saved a new name lost the client-side state that gates
        // /report and the submit CTA until the next /auth/me poll.
        expect(payload.isVerified).toBe(true);
        expect(payload.verificationStatus).toBe('approved');
        expect(payload.address).toBe(reporter.address);
        expect(payload.barangay).toBe('Tampayan');
    });

    test('is the same shape for every endpoint that answers with the signed-in account', () => {
        const payload = buildSelfUserPayload(reporter);

        expect(Object.keys(payload).sort()).toEqual([
            'address',
            'agency',
            'assignedMunicipality',
            'avatar',
            'barangay',
            'createdAt',
            'email',
            'id',
            'isVerified',
            'name',
            'notificationPreferences',
            'responderUnit',
            'role',
            'verificationStatus',
        ]);
        // `id`, not `_id`: every client call site reads `user.id`.
        expect(payload.id).toBe('user-1');
        expect(payload).not.toHaveProperty('_id');
    });

    test('returns null for a missing user instead of a half-built object', () => {
        expect(buildSelfUserPayload(null)).toBeNull();
    });
});
