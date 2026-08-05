import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const base = vi.fn(() => 'app-notification');
    base.success = vi.fn(() => 'app-notification');
    base.error = vi.fn(() => 'app-notification');
    base.loading = vi.fn(() => 'app-notification');
    base.dismiss = vi.fn();
    base.remove = vi.fn();
    return { hotToast: base };
});

vi.mock('react-hot-toast', () => ({ default: mocks.hotToast }));

import toast, {
    APP_TOAST_DURATION_MS,
    APP_TOAST_ID,
    resetToastDedupeForTests,
} from '../utils/appToast';

describe('application toast policy', () => {
    beforeEach(() => {
        resetToastDedupeForTests();
        mocks.hotToast.mockClear();
        mocks.hotToast.success.mockClear();
        mocks.hotToast.error.mockClear();
        mocks.hotToast.loading.mockClear();
        mocks.hotToast.dismiss.mockClear();
        mocks.hotToast.remove.mockClear();
    });

    test('uses one stable toast slot and a three-second terminal duration', () => {
        toast.success('Response started', { id: 'legacy-id', duration: 8000 });
        toast.error('Unable to respond');

        expect(mocks.hotToast.success).toHaveBeenCalledWith('Response started', {
            id: APP_TOAST_ID,
            duration: APP_TOAST_DURATION_MS,
        });
        expect(mocks.hotToast.error).toHaveBeenCalledWith('Unable to respond', {
            id: APP_TOAST_ID,
            duration: APP_TOAST_DURATION_MS,
        });
    });

    test('suppresses an identical event during the visible toast window', () => {
        toast.success('Response started', { dedupeKey: 'response:report-1' });
        toast.success('Response started again', { dedupeKey: 'response:report-1' });

        expect(mocks.hotToast.success).toHaveBeenCalledTimes(1);
    });

    test('keeps loading feedback in the same three-second slot until a result replaces it', () => {
        toast.loading('Acquiring location...', { id: 'location' });
        toast.loading('Refining location...', { id: 'location' });
        toast.success('Location confirmed', { id: 'location' });

        expect(mocks.hotToast.loading).toHaveBeenNthCalledWith(1, 'Acquiring location...', {
            id: APP_TOAST_ID,
            duration: APP_TOAST_DURATION_MS,
        });
        expect(mocks.hotToast.loading).toHaveBeenNthCalledWith(2, 'Refining location...', {
            id: APP_TOAST_ID,
            duration: APP_TOAST_DURATION_MS,
        });
        expect(mocks.hotToast.success).toHaveBeenCalledWith('Location confirmed', {
            id: APP_TOAST_ID,
            duration: APP_TOAST_DURATION_MS,
        });
    });

    test('maps dismiss and remove operations to the singleton toast', () => {
        toast.dismiss('legacy-id');
        toast.remove('legacy-id');

        expect(mocks.hotToast.dismiss).toHaveBeenCalledWith(APP_TOAST_ID);
        expect(mocks.hotToast.remove).toHaveBeenCalledWith(APP_TOAST_ID);
    });
});
