import { describe, expect, test } from 'vitest';
import {
    isAuthorizedRedactedPreviewEndpoint,
    isProtectedOriginalFileUrl,
    normalizeEvidenceDescriptor,
} from '../utils/evidenceModel';

describe('Evidence Model Normalization and Security Boundaries', () => {
    test('1. isProtectedOriginalFileUrl identifies GridFS, uploads, and MongoDB ObjectIds', () => {
        expect(isProtectedOriginalFileUrl('/api/files/607f1f77bcf86cd799439011/photo.jpg')).toBe(true);
        expect(isProtectedOriginalFileUrl('/api/files/607f1f77bcf86cd799439011')).toBe(true);
        expect(isProtectedOriginalFileUrl('/uploads/reports/photo.jpg')).toBe(true);
        expect(isProtectedOriginalFileUrl('607f1f77bcf86cd799439011')).toBe(true);

        expect(isProtectedOriginalFileUrl('/api/reports/report-1/evidence/0/preview')).toBe(false);
        expect(isProtectedOriginalFileUrl('')).toBe(false);
        expect(isProtectedOriginalFileUrl(null)).toBe(false);
    });

    test('2. isAuthorizedRedactedPreviewEndpoint validates canonical preview routes', () => {
        expect(isAuthorizedRedactedPreviewEndpoint('/api/reports/report-1/evidence/0/preview')).toBe(true);
        expect(isAuthorizedRedactedPreviewEndpoint('/api/reports/607f1f77bcf86cd799439011/evidence/2/preview')).toBe(true);
        expect(isAuthorizedRedactedPreviewEndpoint('/api/files/607f1f77bcf86cd799439011')).toBe(false);
    });

    test('3. Normalizes guest/redacted evidence descriptor without leaking original URLs or raw images', () => {
        const rawEvidence = {
            evidenceCount: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/rep-1/evidence/0/preview',
                    originalUrl: '/api/files/secret-photo.jpg', // Forged/attempted leak
                    detectionStatus: 'faces_detected',
                    redactionType: 'face_blur',
                },
            ],
        };

        const result = normalizeEvidenceDescriptor(rawEvidence, {
            isOwner: false,
            isOperational: false,
            rawImages: ['/api/files/secret-photo.jpg'],
        });

        expect(result.viewerAccess).toBe('redacted');
        expect(result.items).toHaveLength(1);
        expect(result.items[0].sourceKind).toBe('redacted-preview');
        expect(result.items[0].src).toBe('/api/reports/rep-1/evidence/0/preview');
        expect(result.items[0].originalUrl).toBeUndefined();
        expect(result.items[0].isForbiddenOriginal).toBe(false);
        expect(result.items[0].detectionStatus).toBe('faces_detected');
    });

    test('4. Rejects protected GridFS URL passed as redactedPreviewUrl in redacted mode', () => {
        const rawEvidence = {
            evidenceCount: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                },
            ],
        };

        const result = normalizeEvidenceDescriptor(rawEvidence);

        expect(result.viewerAccess).toBe('redacted');
        expect(result.items[0].isForbiddenOriginal).toBe(true);
        expect(result.items[0].src).toBe('');
        expect(result.items[0].isUnavailable).toBe(true);
    });

    test('5. Local isOwner or isOperational cannot promote viewerAccess when server specifies redacted', () => {
        const rawEvidence = {
            count: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/rep-2/evidence/0/preview',
                    isOwner: true,
                },
            ],
        };

        const result = normalizeEvidenceDescriptor(rawEvidence, {
            isOwner: true,
            isOperational: true,
        });

        expect(result.viewerAccess).toBe('redacted');
        expect(result.items[0].sourceKind).toBe('redacted-preview');
        expect(result.items[0].originalUrl).toBeUndefined();
    });

    test('6. Normalizes authorized-original descriptor for authenticated owner / operational responder', () => {
        const rawEvidence = {
            count: 1,
            viewerAccess: 'original',
            items: [
                {
                    id: '0',
                    index: 0,
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    previewUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    isOwner: true,
                },
            ],
        };

        const result = normalizeEvidenceDescriptor(rawEvidence, {
            isOwner: true,
        });

        expect(result.viewerAccess).toBe('original');
        expect(result.items[0].sourceKind).toBe('authorized-original');
        expect(result.items[0].src).toBe('/api/files/607f1f77bcf86cd799439011/photo.jpg');
        expect(result.items[0].isOwner).toBe(true);
    });

    test('7. Rejects arbitrary external URLs and non-canonical endpoints in redacted mode', () => {
        const rawEvidence = {
            count: 2,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: 'https://evil.com/fake-image.jpg',
                },
                {
                    id: '1',
                    index: 1,
                    redactedPreviewUrl: '/local/path/unauthorized.jpg',
                },
            ],
        };

        const result = normalizeEvidenceDescriptor(rawEvidence);

        expect(result.viewerAccess).toBe('redacted');
        expect(result.items[0].src).toBe('');
        expect(result.items[0].isUnavailable).toBe(true);
        expect(result.items[1].src).toBe('');
        expect(result.items[1].isUnavailable).toBe(true);
    });
});

