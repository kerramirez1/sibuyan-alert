import { afterEach, beforeEach, describe, expect, test, vi, vi as jest } from 'vitest';
import {
    getSmtpConfig,
    isEmailConfigured,
    sendEmail,
    sendResponderInvitationEmail,
    verifyEmailTransport,
} from '../services/emailService.js';

const ORIGINAL_ENV = { ...process.env };

const mailMocks = vi.hoisted(() => ({
    sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({ sendMail: mailMocks.sendMail })),
    },
}));

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.unstubAllGlobals();
});

describe('SMTP credential normalization', () => {
    test('strips whitespace from the Gmail app password', () => {
        process.env.SMTP_HOST = 'smtp.gmail.com';
        process.env.SMTP_USER = '  sibuyan.alert@gmail.com  ';
        process.env.SMTP_PASS = 'rjbj mrbf qysa kszu';

        const config = getSmtpConfig();
        expect(config).toMatchObject({
            host: 'smtp.gmail.com',
            port: 587,
            user: 'sibuyan.alert@gmail.com',
            pass: 'rjbj mrbf qysa kszu'.replace(/\s+/g, ''),
        });
        expect(config.pass).not.toMatch(/\s/);
        expect(isEmailConfigured()).toBe(true);
    });

    test('falls back to Gmail defaults when unset', () => {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_PORT;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        expect(getSmtpConfig()).toMatchObject({ host: 'smtp.gmail.com', port: 587 });
        expect(isEmailConfigured()).toBe(false);
    });
});

describe('verifyEmailTransport', () => {
    test('skips verification when SMTP is not configured', async () => {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        await expect(verifyEmailTransport()).resolves.toMatchObject({ success: false, skipped: true });
    });
});

describe('invitation deliverability headers', () => {
    beforeEach(() => {
        process.env.SMTP_HOST = 'smtp.gmail.com';
        process.env.SMTP_USER = 'alerts@example.com';
        process.env.SMTP_PASS = 'app-password';
        mailMocks.sendMail.mockReset();
        mailMocks.sendMail.mockResolvedValue({
            messageId: '<test-message-id>',
            accepted: ['responder@example.com'],
            rejected: [],
        });
    });

    test('attaches a List-Unsubscribe mailto header addressed to the sender mailbox', async () => {
        await sendResponderInvitationEmail(
            'responder@example.com',
            'Juan Dela Cruz',
            `https://app.example/reset-password/${'a'.repeat(64)}`,
            { municipality: 'Cajidiocan', agency: 'MDRRMO', invitedBy: 'Maria Santos' },
        );

        const mailOptions = mailMocks.sendMail.mock.calls[0][0];
        const unsubscribe = mailOptions.headers?.['List-Unsubscribe'];
        expect(unsubscribe).toBe('<mailto:alerts@example.com?subject=Unsubscribe>');
        // A header value with a newline would smuggle a second header.
        expect(unsubscribe).not.toMatch(/[\r\n\s]/);
    });

    test('carries the full invitation URL in the text part without stylesheet residue', async () => {
        const inviteUrl = `https://app.example/reset-password/${'b'.repeat(64)}`;
        await sendResponderInvitationEmail('responder@example.com', 'Juan Dela Cruz', inviteUrl, {});

        const mailOptions = mailMocks.sendMail.mock.calls[0][0];
        expect(mailOptions.text).toContain(inviteUrl);
        // The old derived text part opened with ~1KB of CSS, which reads as an
        // obfuscated payload to a filter. The hand-written part has no tags.
        expect(mailOptions.text).not.toMatch(/<style|body\s*\{|\.container\s*\{/i);
        expect(mailOptions.subject).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    test('leaves mail without a deliverability header request untouched', async () => {
        await sendEmail({ to: 'responder@example.com', subject: 'Hello', html: '<p>Hello</p>' });

        expect(mailMocks.sendMail.mock.calls[0][0]).not.toHaveProperty('headers');
    });

    test.each([
        ['responder', 'Responder account invitation - Sibuyan Alert'],
        ['admin', 'Admin account invitation - Sibuyan Alert'],
        [undefined, 'Responder account invitation - Sibuyan Alert'],
    ])('names the account type in the subject when roleLabel is %s', async (roleLabel, expected) => {
        const inviteUrl = `https://app.example/reset-password/${'c'.repeat(64)}`;
        await sendResponderInvitationEmail('user@example.com', 'Ana Reyes', inviteUrl, { roleLabel });

        const mailOptions = mailMocks.sendMail.mock.calls[0][0];
        expect(mailOptions.subject).toBe(expected);
        // No emoji in the subject: plain text, no pictograph.
        expect(mailOptions.subject).not.toMatch(/[^\x20-\x7E]/);
    });
});
