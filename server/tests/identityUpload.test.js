import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import User from '../models/User.js';
import {
    handleMulterError,
    requireRegistrationVerificationImages,
    uploadIdDocument,
    validateUploadContent,
} from '../middleware/upload.js';

const createPngHeader = (width = 1200, height = 750, totalBytes = 24) => {
    const buffer = Buffer.alloc(totalBytes);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
};

const createUploadApp = () => {
    const app = express();
    app.post(
        '/identity',
        uploadIdDocument,
        handleMulterError,
        validateUploadContent,
        (req, res) => res.status(204).end(),
    );
    return app;
};

const createRegistrationUploadApp = () => {
    const app = express();
    app.post(
        '/identity',
        uploadIdDocument,
        handleMulterError,
        validateUploadContent,
        requireRegistrationVerificationImages,
        (req, res) => res.status(204).end(),
    );
    return app;
};

describe('identity upload boundary', () => {
    test('accepts an image upload with safe dimensions', async () => {
        const response = await request(createUploadApp())
            .post('/identity')
            .attach('idDocument', createPngHeader(), {
                filename: 'school-id.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(204);
    });

    test('rejects PDF identity documents', async () => {
        const response = await request(createUploadApp())
            .post('/identity')
            .attach('idDocument', Buffer.from('%PDF-1.7 sample'), {
                filename: 'school-id.pdf',
                contentType: 'application/pdf',
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/JPEG, PNG, or WebP/);
    });

    test('enforces the five-megabyte server limit', async () => {
        const response = await request(createUploadApp())
            .post('/identity')
            .attach('idDocument', createPngHeader(1200, 750, (5 * 1024 * 1024) + 1), {
                filename: 'oversized-id.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/maximum 5 MB/);
    });

    test('requires both the ID photo and verification selfie at registration', async () => {
        const missingSelfie = await request(createRegistrationUploadApp())
            .post('/identity')
            .attach('idDocument', createPngHeader(), {
                filename: 'school-id.png',
                contentType: 'image/png',
            });
        expect(missingSelfie.status).toBe(400);
        expect(missingSelfie.body.message).toMatch(/verification selfie is required/i);

        const complete = await request(createRegistrationUploadApp())
            .post('/identity')
            .attach('idDocument', createPngHeader(), {
                filename: 'school-id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });
        expect(complete.status).toBe(204);
    });
});

describe('verification audit history', () => {
    test('records verification actions and caps retained history', () => {
        const user = new User({
            name: 'Reporter',
            email: 'reporter@example.com',
            role: 'reporter',
            verificationHistory: [],
        });

        for (let index = 0; index < 55; index += 1) {
            user.recordVerificationEvent({
                action: index % 2 === 0 ? 'approved' : 'rejected',
                feedback: `Review ${index}`,
            });
        }

        expect(user.verificationHistory).toHaveLength(50);
        expect(user.verificationHistory[0].feedback).toBe('Review 5');
        expect(user.verificationHistory.at(-1).feedback).toBe('Review 54');
    });
});
