import { describe, test, expect } from 'vitest';
import { isGridFsAsset, toApiFilePath, resolveAssetUrl } from '../utils/assets';

describe('Assets Utility', () => {
    describe('isGridFsAsset', () => {
        test('identifies canonical /api/files/ URLs', () => {
            expect(isGridFsAsset('/api/files/607f1f77bcf86cd799439011/photo.jpg')).toBe(true);
            expect(isGridFsAsset('/api/files/607f1f77bcf86cd799439011')).toBe(true);
            expect(isGridFsAsset('https://example.com/api/files/607f1f77bcf86cd799439011/evidence.png')).toBe(true);
        });

        test('identifies raw 24-character hexadecimal ObjectIds', () => {
            expect(isGridFsAsset('607f1f77bcf86cd799439011')).toBe(true);
            expect(isGridFsAsset(' 607f1f77bcf86cd799439011 ')).toBe(true);
        });

        test('returns false for non-GridFS assets', () => {
            expect(isGridFsAsset('/images/logo.png')).toBe(false);
            expect(isGridFsAsset('https://example.com/avatar.jpg')).toBe(false);
            expect(isGridFsAsset('')).toBe(false);
            expect(isGridFsAsset(null)).toBe(false);
        });
    });

    describe('toApiFilePath', () => {
        test('normalizes relative /api/files URLs by stripping /api prefix for Axios baseURL', () => {
            expect(toApiFilePath('/api/files/607f1f77bcf86cd799439011/photo.jpg')).toBe('/files/607f1f77bcf86cd799439011/photo.jpg');
            expect(toApiFilePath('/api/files/607f1f77bcf86cd799439011')).toBe('/files/607f1f77bcf86cd799439011');
        });

        test('normalizes full HTTP URLs by extracting path and stripping /api prefix', () => {
            expect(toApiFilePath('http://localhost:5000/api/files/607f1f77bcf86cd799439011/photo.jpg')).toBe('/files/607f1f77bcf86cd799439011/photo.jpg');
        });

        test('normalizes raw 24-hex ObjectId strings to /files/:id path', () => {
            expect(toApiFilePath('607f1f77bcf86cd799439011')).toBe('/files/607f1f77bcf86cd799439011');
            expect(toApiFilePath(' 607f1f77bcf86cd799439011 ')).toBe('/files/607f1f77bcf86cd799439011');
        });

        test('preserves query-parameter stripped paths', () => {
            expect(toApiFilePath('/api/files/607f1f77bcf86cd799439011/photo.jpg?token=abc')).toBe('/files/607f1f77bcf86cd799439011/photo.jpg');
        });
    });

    describe('resolveAssetUrl', () => {
        test('returns untouched for blob and data URLs', () => {
            expect(resolveAssetUrl('blob:http://localhost:5173/123')).toBe('blob:http://localhost:5173/123');
            expect(resolveAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
        });

        test('returns untouched for absolute https URLs', () => {
            expect(resolveAssetUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
        });
    });
});
