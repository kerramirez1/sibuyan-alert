import { describe, expect, test } from 'vitest';
import { buildSelfUserPayload, buildUserVerificationPayload } from '../utils/userPayload.js';

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
    verificationFeedback: null,
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
            'verificationFeedback',
            'verificationStatus',
        ]);
        // `id`, not `_id`: every client call site reads `user.id`.
        expect(payload.id).toBe('user-1');
        expect(payload).not.toHaveProperty('_id');
    });

    test('returns null for a missing user instead of a half-built object', () => {
        expect(buildSelfUserPayload(null)).toBeNull();
    });

    test('returns owner feedback without identity photos, reviewer details, or history', () => {
        const account = {
            ...reporter,
            isVerified: false,
            verificationStatus: 'rejected',
            verificationFeedback: 'Please upload a clearer ID photo.',
            idDocument: '/api/files/private-id/document.jpg',
            selfiePhoto: '/api/files/private-selfie/selfie.jpg',
            verifiedBy: { name: 'Private reviewer', email: 'reviewer@example.com' },
            verifiedAt: new Date(),
            verificationHistory: [{ action: 'rejected', feedback: 'Internal history' }],
            password: 'private-password-hash',
        };
        for (const payload of [buildSelfUserPayload(account), buildUserVerificationPayload(account)]) {
            expect(payload).toMatchObject({ role: 'reporter', isVerified: false, verificationStatus: 'rejected', verificationFeedback: account.verificationFeedback });
            for (const field of ['idDocument', 'selfiePhoto', 'verifiedBy', 'verifiedAt', 'verificationHistory', 'password']) {
                expect(payload).not.toHaveProperty(field);
            }
        }
    });

    test('does not infer verification from role when approval fields are missing', () => {
        expect(buildUserVerificationPayload({ role: 'reporter' })).toEqual({
            role: 'reporter', isVerified: false, verificationStatus: null, verificationFeedback: null,
        });
    });
});
