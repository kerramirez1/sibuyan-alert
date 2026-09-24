import { describe, expect, test } from 'vitest';
import { isVerifiedReporter, isVerifiedReportReporter } from '../utils/reporterVerification';

describe('isVerifiedReporter utility', () => {
    test('returns true only for approved, verified reporters', () => {
        expect(isVerifiedReporter({
            role: 'reporter',
            verificationStatus: 'approved',
            isVerified: true,
        })).toBe(true);
    });

    test('returns false for reporters pending verification', () => {
        expect(isVerifiedReporter({
            role: 'reporter',
            verificationStatus: 'pending',
            isVerified: false,
        })).toBe(false);
    });

    test('returns false for rejected reporters', () => {
        expect(isVerifiedReporter({
            role: 'reporter',
            verificationStatus: 'rejected',
            isVerified: false,
        })).toBe(false);
    });

    test('returns false when status is approved but isVerified flag is false', () => {
        expect(isVerifiedReporter({
            role: 'reporter',
            verificationStatus: 'approved',
            isVerified: false,
        })).toBe(false);
    });

    test('returns false for ordinary community members even if marked approved', () => {
        expect(isVerifiedReporter({
            role: 'ordinary',
            verificationStatus: 'approved',
            isVerified: true,
        })).toBe(false);
    });

    test('returns false for responders and municipal admins', () => {
        expect(isVerifiedReporter({
            role: 'responder',
            verificationStatus: 'approved',
            isVerified: true,
        })).toBe(false);

        expect(isVerifiedReporter({
            role: 'municipal_admin',
            verificationStatus: 'approved',
            isVerified: true,
        })).toBe(false);
    });

    test('returns false for null, undefined, or empty inputs', () => {
        expect(isVerifiedReporter(null)).toBe(false);
        expect(isVerifiedReporter(undefined)).toBe(false);
        expect(isVerifiedReporter({})).toBe(false);
        expect(isVerifiedReporter('reporter')).toBe(false);
    });
});

describe('isVerifiedReportReporter utility', () => {
    test('returns true for report reporter with isVerified: true', () => {
        expect(isVerifiedReportReporter({
            name: 'Juan Dela Cruz',
            avatar: '/avatar.jpg',
            isVerified: true,
        })).toBe(true);

        expect(isVerifiedReportReporter({
            name: 'Juan Dela Cruz',
            role: 'reporter',
            verificationStatus: 'approved',
            isVerified: true,
        })).toBe(true);
    });

    test('returns false when isVerified is false', () => {
        expect(isVerifiedReportReporter({
            name: 'Unverified Reporter',
            isVerified: false,
        })).toBe(false);
    });

    test('returns false when role is not reporter', () => {
        expect(isVerifiedReportReporter({
            name: 'Responder User',
            role: 'responder',
            isVerified: true,
        })).toBe(false);

        expect(isVerifiedReportReporter({
            name: 'Municipal Admin',
            role: 'municipal_admin',
            isVerified: true,
        })).toBe(false);

        expect(isVerifiedReportReporter({
            name: 'Ordinary User',
            role: 'ordinary',
            isVerified: true,
        })).toBe(false);
    });

    test('returns false when verificationStatus is not approved', () => {
        expect(isVerifiedReportReporter({
            name: 'Pending Reporter',
            role: 'reporter',
            verificationStatus: 'pending',
            isVerified: true,
        })).toBe(false);

        expect(isVerifiedReportReporter({
            name: 'Rejected Reporter',
            role: 'reporter',
            verificationStatus: 'rejected',
            isVerified: true,
        })).toBe(false);
    });

    test('returns false for null, undefined, or empty inputs', () => {
        expect(isVerifiedReportReporter(null)).toBe(false);
        expect(isVerifiedReportReporter(undefined)).toBe(false);
        expect(isVerifiedReportReporter({})).toBe(false);
    });
});
