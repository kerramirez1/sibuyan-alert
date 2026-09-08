import { afterEach, describe, expect, test, vi as jest } from 'vitest';
import { getSmtpConfig, isEmailConfigured, verifyEmailTransport } from '../services/emailService.js';

const ORIGINAL_ENV = { ...process.env };

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
