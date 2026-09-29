import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * The text/plain alternative.
 *
 * Every message the app sent used to open its plain-text part with roughly a
 * kilobyte of raw CSS, because the fallback was `html.replace(/<[^>]*>/g, '')` —
 * tags stripped, `<style>` CONTENTS left behind. Measured on the real invitation:
 * 2351 bytes, the first ~1000 of them `body { ... }`, `.container { ... }`, and
 * so on, with the actual message buried below.
 *
 * Filters score a text/plain part dense with code-like tokens as suspicious, and
 * a screen reader or text-only client received a stylesheet instead of the
 * invitation.
 */
const mocks = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock('nodemailer', () => ({
    default: { createTransport: vi.fn(() => ({ sendMail: mocks.sendMail })) },
}));

const { htmlToPlainText, sendEmail, sendResponderInvitationEmail } = await import('../services/emailService.js');

const ORIGINAL_ENV = { ...process.env };

describe('htmlToPlainText', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
        </style>
      </head>
      <body>
        <h1>Responder Account Invitation</h1>
        <p>Hello Juan,</p>
        <ul>
          <li>Municipality: Cajidiocan</li>
          <li>Unit type: PDRRMO</li>
        </ul>
        <p>Set your password at https://app.example/reset-password/tok3n</p>
      </body>
      </html>
    `;

    test('never carries <style> content into the text part', () => {
        const text = htmlToPlainText(html);

        expect(text).not.toMatch(/font-family/);
        expect(text).not.toMatch(/max-width/);
        expect(text).not.toMatch(/\{/);
    });

    test('keeps the message and the link', () => {
        const text = htmlToPlainText(html);

        expect(text).toContain('Responder Account Invitation');
        expect(text).toContain('Hello Juan,');
        expect(text).toContain('https://app.example/reset-password/tok3n');
    });

    test('separates block-level content instead of running it together', () => {
        const text = htmlToPlainText(html);

        // The old fallback produced "Municipality: CajidiocanUnit type: PDRRMO".
        expect(text).toContain('Municipality: Cajidiocan');
        expect(text).toContain('Unit type: PDRRMO');
        expect(text).not.toMatch(/CajidiocanUnit/);
    });

    test('drops script content and comments too', () => {
        const text = htmlToPlainText('<p>Visible</p><script>alert("nope")</script><!-- hidden -->');

        expect(text).toContain('Visible');
        expect(text).not.toContain('nope');
        expect(text).not.toContain('hidden');
    });

    test('returns an empty string for missing input rather than throwing', () => {
        expect(htmlToPlainText(undefined)).toBe('');
        expect(htmlToPlainText('')).toBe('');
    });
});

describe('sendEmail plain-text derivation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_USER = 'alerts@example.com';
        process.env.SMTP_PASS = 'app-password';
        mocks.sendMail.mockResolvedValue({ messageId: '<ok@example.com>', accepted: ['a@b.com'], rejected: [] });
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    test('derives a CSS-free text part for every template that does not supply one', async () => {
        await sendEmail({
            to: 'a@b.com',
            subject: 'Reset',
            html: '<style>body { color: red; }</style><p>Reset your password</p>',
        });

        const [{ text }] = mocks.sendMail.mock.calls[0];
        expect(text).toContain('Reset your password');
        expect(text).not.toContain('color: red');
    });

    test('prefers an explicitly supplied text part', async () => {
        await sendEmail({
            to: 'a@b.com',
            subject: 'Reset',
            html: '<p>html version</p>',
            text: 'hand written version',
        });

        const [{ text }] = mocks.sendMail.mock.calls[0];
        expect(text).toBe('hand written version');
    });
});

describe('responder invitation message', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_USER = 'alerts@example.com';
        process.env.SMTP_PASS = 'app-password';
        mocks.sendMail.mockResolvedValue({ messageId: '<ok@example.com>', accepted: ['r@b.com'], rejected: [] });
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    const sendInvite = async () => {
        await sendResponderInvitationEmail(
            'r@b.com',
            'Juan Dela Cruz',
            'https://app.example/reset-password/tok3n',
            { municipality: 'Cajidiocan', agency: 'PDRRMO', invitedBy: 'Maria Santos' },
        );
        return mocks.sendMail.mock.calls[0][0];
    };

    test('carries a readable text alternative with the link on its own line', async () => {
        const { text } = await sendInvite();

        expect(text).toContain('https://app.example/reset-password/tok3n');
        expect(text).not.toMatch(/\{|\}/);
        // On its own line, so a text-only client can copy it.
        expect(text.split('\n')).toContain('https://app.example/reset-password/tok3n');
    });

    test('names who invited the responder, in a sentence', async () => {
        const { text, html } = await sendInvite();

        expect(text).toContain('Maria Santos has created a responder account for you');
        expect(html).toContain('Maria Santos has created a responder account for you');
    });

    test('keeps the single-use and expiry facts in the text part', async () => {
        const { text } = await sendInvite();

        expect(text).toMatch(/only be used once/i);
        expect(text).toMatch(/expires in 1 hour/i);
    });

    test('sends a subject with no decorative emoji', async () => {
        const { subject } = await sendInvite();

        expect(subject).toBe('Responder account invitation - Sibuyan Accident Alert');
        // No pictographs in the subject line.
        expect(subject).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });
});
