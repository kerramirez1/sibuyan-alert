import { describe, expect, test } from 'vitest';
import {
    ID_IMAGE_ACCEPT,
    MAX_ID_IMAGE_BYTES,
    validateIdentityImageFile,
} from '../utils/identityImage';

describe('identity image validation', () => {
    test('advertises only supported image MIME types', () => {
        expect(ID_IMAGE_ACCEPT).toBe('image/jpeg,image/png,image/webp');
        expect(ID_IMAGE_ACCEPT).not.toContain('pdf');
    });

    test('accepts supported non-empty images within the upload limit', () => {
        expect(validateIdentityImageFile({ type: 'image/jpeg', size: 1024 })).toBe('');
        expect(validateIdentityImageFile({ type: 'image/png', size: MAX_ID_IMAGE_BYTES })).toBe('');
        expect(validateIdentityImageFile({ type: 'image/webp', size: 2048 })).toBe('');
    });

    test('rejects documents, empty files, and oversized images', () => {
        expect(validateIdentityImageFile({ type: 'application/pdf', size: 1024 })).toMatch(/JPG, PNG, or WebP/);
        expect(validateIdentityImageFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/);
        expect(validateIdentityImageFile({ type: 'image/jpeg', size: MAX_ID_IMAGE_BYTES + 1 })).toMatch(/5 MB/);
    });
});
