import { beforeEach, describe, expect, test, vi } from 'vitest';
import api, { adminAPI } from '../services/api';

/**
 * Regression test for silent resolution-photo loss: adminAPI.resolveReport
 * was the only FormData-sending method without a multipart Content-Type
 * override, so axios's transformRequest JSON.stringified the FormData
 * (destroying the File objects) before the request left the browser. The
 * server then saw valid JSON with no files and silently resolved with 0
 * photos. These tests exercise the header/transform seam directly by
 * replacing the axios adapter — mocking adminAPI itself would bypass the
 * bug.
 */
describe('adminAPI.resolveReport transport', () => {
    let captured;

    beforeEach(() => {
        captured = null;
        api.defaults.adapter = vi.fn(async (config) => {
            captured = config;
            return {
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        });
    });

    const contentTypeOf = (config) => {
        const headers = config?.headers || {};
        return String(
            typeof headers.get === 'function' ? headers.get('Content-Type') : headers['Content-Type']
        );
    };

    test('FormData body is sent as multipart/form-data with the body intact', async () => {
        const formData = new FormData();
        formData.append('resolutionNotes', 'Debris cleared');
        const file = new File(['fake-bytes'], 'resolution.jpg', { type: 'image/jpeg' });
        formData.append('resolutionPhotos', file, 'resolution.jpg');
        formData.append('photoIds', 'photo-1');

        await adminAPI.resolveReport('report-1', formData);

        expect(captured).toBeTruthy();
        expect(captured.url).toBe('/admin/reports/report-1/resolve');
        expect(contentTypeOf(captured)).toMatch(/multipart\/form-data/);
        // The FormData must survive transformRequest: File objects intact,
        // not JSON-stringified into a plain string.
        expect(captured.data).toBeInstanceOf(FormData);
        expect(typeof captured.data).not.toBe('string');
        expect(captured.data.getAll('resolutionPhotos')).toHaveLength(1);
        const sentFile = captured.data.getAll('resolutionPhotos')[0];
        expect(sentFile).toBeInstanceOf(File);
        expect(sentFile.name).toBe('resolution.jpg');
        expect(sentFile.type).toBe('image/jpeg');
        expect(captured.data.get('photoIds')).toBe('photo-1');
        expect(captured.data.get('resolutionNotes')).toBe('Debris cleared');
    });

    test('plain object body keeps the application/json content type', async () => {
        await adminAPI.resolveReport('report-1', { resolutionNotes: 'Done' });

        expect(captured).toBeTruthy();
        expect(contentTypeOf(captured)).toBe('application/json');
        // Plain objects are JSON-stringified by transformRequest, as usual.
        expect(JSON.parse(captured.data)).toEqual({ resolutionNotes: 'Done' });
    });
});
