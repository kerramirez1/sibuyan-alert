import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as faceService from '../services/faceDetectionService.js';
import * as gridFsService from '../services/gridFsService.js';
import * as sessionService from '../services/authSessionService.js';
import User from '../models/User.js';
import {
    handleMulterError,
    requireRegistrationVerificationImages,
    uploadIdDocument,
    validateUploadContent,
} from '../middleware/upload.js';
import { register } from '../controllers/authController.js';

const createPngHeader = (width = 1200, height = 750, totalBytes = 24) => {
    const buffer = Buffer.alloc(totalBytes);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
};

const createRegisterApp = () => {
    const app = express();
    app.post(
        '/api/auth/register',
        uploadIdDocument,
        handleMulterError,
        validateUploadContent,
        requireRegistrationVerificationImages,
        register,
    );
    return app;
};

describe('server-side reporter selfie face validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(gridFsService, 'uploadFileToGridFS').mockResolvedValue({
            url: '/api/files/test-file-id/photo.png',
            filename: 'photo.png',
        });
        vi.spyOn(gridFsService, 'deleteGridFsFilesByUrls').mockResolvedValue();
        vi.spyOn(sessionService, 'revokeRequestSession').mockResolvedValue();
        vi.spyOn(sessionService, 'issueSession').mockResolvedValue();
        vi.spyOn(User, 'findOne').mockResolvedValue(null);
        vi.spyOn(User, 'create').mockImplementation(async (userData) => ({
            ...userData,
            _id: userData._id || 'mock-user-id',
            isVerified: false,
            verificationStatus: 'pending',
        }));
    });

    test('rejects registration when server face detector detects zero faces in selfie', async () => {
        vi.spyOn(faceService, 'detectFaces').mockResolvedValue({
            status: 'no_faces_detected',
            faces: [],
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
        });

        const response = await request(createRegisterApp())
            .post('/api/auth/register')
            .field('name', 'Juan Dela Cruz')
            .field('email', 'juan@example.com')
            .field('password', 'secure-password-123')
            .field('municipality', 'Cajidiocan')
            .field('barangay', 'Gutivan')
            .field('agreeToTerms', 'true')
            .attach('idDocument', createPngHeader(), {
                filename: 'id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/no face detected in the verification selfie/i);
    });

    test.each([
        ['oversized_candidate', /too close to the camera/i],
        ['too_small', /too small in the frame/i],
        ['weak_confidence', /no face detected in the verification selfie/i],
        [undefined, /no face detected in the verification selfie/i],
    ])('returns an actionable message for qualityRejection=%s', async (qualityRejection, expectedMessage) => {
        const detectFacesSpy = vi.spyOn(faceService, 'detectFaces').mockResolvedValue({
            status: 'no_faces_detected',
            faces: [],
            qualityRejection,
            confidenceSummary: { maxConfidence: 0, faceCount: 0, averageConfidence: 0 },
        });

        const response = await request(createRegisterApp())
            .post('/api/auth/register')
            .field('name', 'Juan Dela Cruz')
            .field('email', 'juan@example.com')
            .field('password', 'secure-password-123')
            .field('municipality', 'Cajidiocan')
            .field('barangay', 'Gutivan')
            .field('agreeToTerms', 'true')
            .attach('idDocument', createPngHeader(), {
                filename: 'id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(expectedMessage);
        // The server selfie gate aligns with the client capture gate (0.78).
        expect(detectFacesSpy).toHaveBeenCalledWith(expect.any(Buffer), {
            fastMode: true,
            maxDimension: 800,
            maxFaceSizeRatio: 0.8,
        });
    });

    test('rejects registration when server face detector detects multiple faces in selfie', async () => {
        vi.spyOn(faceService, 'detectFaces').mockResolvedValue({
            status: 'faces_detected',
            faces: [
                { x: 100, y: 100, width: 150, height: 150, confidence: 10 },
                { x: 350, y: 100, width: 150, height: 150, confidence: 10 },
            ],
            confidenceSummary: { maxConfidence: 10, faceCount: 2, averageConfidence: 10 },
        });

        const response = await request(createRegisterApp())
            .post('/api/auth/register')
            .field('name', 'Juan Dela Cruz')
            .field('email', 'juan@example.com')
            .field('password', 'secure-password-123')
            .field('municipality', 'Cajidiocan')
            .field('barangay', 'Gutivan')
            .field('agreeToTerms', 'true')
            .attach('idDocument', createPngHeader(), {
                filename: 'id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/multiple faces detected in the verification selfie/i);
    });

    test('rejects registration when selfie image is corrupted', async () => {
        vi.spyOn(faceService, 'detectFaces').mockResolvedValue({
            status: 'invalid_image',
            faces: [],
        });

        const response = await request(createRegisterApp())
            .post('/api/auth/register')
            .field('name', 'Juan Dela Cruz')
            .field('email', 'juan@example.com')
            .field('password', 'secure-password-123')
            .field('municipality', 'Cajidiocan')
            .field('barangay', 'Gutivan')
            .field('agreeToTerms', 'true')
            .attach('idDocument', createPngHeader(), {
                filename: 'id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/corrupted or invalid/i);
    });

    test('rejects registration when terms are not accepted', async () => {
        const response = await request(createRegisterApp())
            .post('/api/auth/register')
            .field('name', 'Juan Dela Cruz')
            .field('email', 'juan@example.com')
            .field('password', 'secure-password-123')
            .field('municipality', 'Cajidiocan')
            .field('barangay', 'Gutivan')
            .attach('idDocument', createPngHeader(), {
                filename: 'id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/agree to the terms of use and privacy policy/i);
    });

    test('accepts registration and creates pending reporter when exactly one face is validated', async () => {
        vi.spyOn(faceService, 'detectFaces').mockResolvedValue({
            status: 'faces_detected',
            faces: [{ x: 220, y: 130, width: 200, height: 200, confidence: 9.5 }],
            confidenceSummary: { maxConfidence: 9.5, faceCount: 1, averageConfidence: 9.5 },
        });

        const response = await request(createRegisterApp())
            .post('/api/auth/register')
            .field('name', 'Juan Dela Cruz')
            .field('email', 'juan@example.com')
            .field('password', 'secure-password-123')
            .field('municipality', 'Cajidiocan')
            .field('barangay', 'Gutivan')
            .field('agreeToTerms', 'true')
            .field('role', 'municipal_admin')
            .field('isVerified', 'true')
            .field('verificationStatus', 'approved')
            .attach('idDocument', createPngHeader(), {
                filename: 'id.png',
                contentType: 'image/png',
            })
            .attach('selfiePhoto', createPngHeader(750, 1200), {
                filename: 'selfie.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user.role).toBe('reporter');
        expect(response.body.data.user.verificationStatus).toBe('pending');
        expect(response.body.data.user.isVerified).toBe(false);
        expect(response.body.data.user.verificationFeedback).toBeNull();
        expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'reporter', isVerified: false, verificationStatus: 'pending' }));
        expect(response.body.data.user).not.toHaveProperty('idDocument');
        expect(response.body.data.user).not.toHaveProperty('selfiePhoto');
        expect(response.body.data.user).not.toHaveProperty('verificationHistory');
    });
});
