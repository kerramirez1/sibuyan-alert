import { describe, expect, test } from 'vitest';
import {
    buildQueuedFormData,
    createClientReportId,
    enqueueReport,
    isOfflineQueueSupported,
    listQueuedReports,
} from '../utils/offlineReportQueue';

describe('offline report queue', () => {
    test('issues a distinct idempotency key for every report', () => {
        const first = createClientReportId();
        const second = createClientReportId();

        expect(first).toBeTruthy();
        expect(first).not.toBe(second);
    });

    test('rebuilds the multipart body, idempotency key included', () => {
        const formData = buildQueuedFormData({
            clientReportId: 'key-1',
            fields: {
                incidentCategory: 'accident',
                incidentType: 'motorcycle',
                'casualties[injured]': 2,
                lat: 12.4,
                address: '',
                description: null,
            },
            images: [new File(['evidence'], 'scene.jpg', { type: 'image/jpeg' })],
        });

        expect(formData.get('clientReportId')).toBe('key-1');
        expect(formData.get('incidentCategory')).toBe('accident');
        expect(formData.get('casualties[injured]')).toBe('2');
        expect(formData.get('lat')).toBe('12.4');
        expect(formData.getAll('images')).toHaveLength(1);

        // Blank and null fields are omitted rather than sent as empty strings,
        // which would trip the server's required-field validation.
        expect(formData.has('address')).toBe(false);
        expect(formData.has('description')).toBe(false);
    });

    test('survives a device with no usable storage', async () => {
        // jsdom has no IndexedDB, so this exercises the degradation path: the
        // queue must never throw and must never claim a report was saved.
        const supported = isOfflineQueueSupported();
        const entry = await enqueueReport({ fields: { address: 'Poblacion' } });

        if (supported) {
            expect(entry).toMatchObject({ clientReportId: expect.any(String) });
        } else {
            expect(entry).toBeNull();
        }

        await expect(listQueuedReports()).resolves.toBeInstanceOf(Array);
    });
});
