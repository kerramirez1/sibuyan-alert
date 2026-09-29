import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * `sendEmail`'s success criterion.
 *
 * This is the point where the responder invitation and the password reset used to
 * behave identically *and* wrongly: both returned `success: true` for any
 * resolved `sendMail`, throwing away `info.accepted` / `info.rejected`. A message
 * the mail server refused for the intended address therefore read as delivered —
 * the administrator saw "Invitation sent" and the responder received nothing.
 *
 * The password-reset flow masked it, because it sends to an address the account
 * already owns. The invitation sends to whatever the administrator just typed,
 * which is exactly where an unaccepted recipient shows up.
 */
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), verify: vi.fn() }));

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({ sendMail: mocks.sendMail, verify: mocks.verify })),
    },
}));

const { sendEmail } = await import('../services/emailService.js');

const ORIGINAL_ENV = { ...process.env };

describe('sendEmail delivery result', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_USER = 'alerts@example.com';
        process.env.SMTP_PASS = 'app-password';
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    const message = { to: 'responder@example.com', subject: 'Invitation', html: '<p>hi</p>' };

    test('reports success only when the intended recipient was accepted', async () => {
        mocks.sendMail.mockResolvedValue({
            messageId: '<ok@example.com>',
            accepted: ['responder@example.com'],
            rejected: [],
        });

        const result = await sendEmail(message);

        expect(result.success).toBe(true);
        expect(result.accepted).toEqual(['responder@example.com']);
    });

    test('reports failure when the transport accepted the message for someone else', async () => {
        mocks.sendMail.mockResolvedValue({
            messageId: '<partial@example.com>',
            accepted: ['someone-else@example.com'],
            rejected: ['responder@example.com'],
        });

        const result = await sendEmail(message);

        // Resolving is not delivering. Before this check the function returned
        // success: true here and the invitation was reported as sent.
        expect(result.success).toBe(false);
        expect(result.code).toBe('RECIPIENT_REJECTED');
    });

    test('reports failure when the transport explicitly rejected the recipient', async () => {
        mocks.sendMail.mockResolvedValue({
            messageId: '<rejected@example.com>',
            accepted: [],
            rejected: ['responder@example.com'],
        });

        const result = await sendEmail(message);

        expect(result.success).toBe(false);
        expect(result.code).toBe('RECIPIENT_REJECTED');
    });

    test('matches a display-name recipient against the bare accepted address', async () => {
        mocks.sendMail.mockResolvedValue({
            messageId: '<named@example.com>',
            accepted: ['Responder@Example.com'],
            rejected: [],
        });

        const result = await sendEmail({ ...message, to: 'Juan Dela Cruz <responder@example.com>' });

        // Normalisation, not string equality — otherwise a correctly delivered
        // invitation would be reported as rejected.
        expect(result.success).toBe(true);
    });

    test('reports an explicit unconfirmed state when the transport omits both lists', async () => {
        mocks.sendMail.mockResolvedValue({ messageId: '<quiet@example.com>' });

        const result = await sendEmail(message);

        // CHANGED DELIBERATELY (was `success: true`). The configured transport is
        // Nodemailer's SMTP transport, and it always reports both lists —
        // `_actionDATA` builds `{accepted, rejected}` and DATA is only reached
        // when at least one recipient was accepted. So an absent verdict is not a
        // legitimate outcome; treating it as success was the false positive that
        // let a dead invitation read as sent.
        expect(result.success).toBe(false);
        expect(result.code).toBe('DELIVERY_UNCONFIRMED');
        // The message id is still surfaced as the correlation handle.
        expect(result.messageId).toBe('<quiet@example.com>');
    });

    test('reports an explicit unconfirmed state when both lists come back empty', async () => {
        mocks.sendMail.mockResolvedValue({ messageId: '<empty@example.com>', accepted: [], rejected: [] });

        const result = await sendEmail(message);

        expect(result.success).toBe(false);
        expect(result.code).toBe('DELIVERY_UNCONFIRMED');
    });

    test('masks the recipient in the log line and keeps the message id', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.sendMail.mockResolvedValue({ messageId: '<logged@example.com>', accepted: [], rejected: [] });

        try {
            await sendEmail({ ...message, to: 'juan.delacruz@example.com' });

            const logged = errorSpy.mock.calls.flat().join(' ');
            expect(logged).toContain('messageId=<logged@example.com>');
            expect(logged).toContain('j***@example.com');
            // Not a contact record: the local part never appears in full.
            expect(logged).not.toContain('juan.delacruz@');
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('does not leak the recipient address in the failure reason', async () => {
        mocks.sendMail.mockResolvedValue({ accepted: [], rejected: ['responder@example.com'] });

        const result = await sendEmail(message);

        // The reason reaches an administrator and the log line.
        expect(result.error).not.toContain('responder@example.com');
        expect(JSON.stringify(result.error)).not.toMatch(/@/);
    });

    test('still reports failure when the transport throws', async () => {
        mocks.sendMail.mockRejectedValue(new Error("Can't send mail - all recipients were rejected"));

        const result = await sendEmail(message);

        expect(result.success).toBe(false);
    });

    test('reports failure when SMTP is not configured, without attempting a send', async () => {
        delete process.env.SMTP_HOST;

        const result = await sendEmail(message);

        expect(result.success).toBe(false);
        expect(mocks.sendMail).not.toHaveBeenCalled();
    });
});
