import { render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import api from '../services/api';
import useRecordView from '../hooks/useRecordView';

/**
 * Wiring guard for the reach recorder.
 *
 * Every other reach test mocks `../services/api`, so they can only prove that a
 * mock was called — and the bug this file exists for was a mock describing an API
 * shape the real module never had. `useRecordView` called
 * `api.recordViewEvent?.()` on a default export whose only method was the axios
 * instance itself, so the optional chain skipped it and every view opened from
 * the map was dropped in production. Silently. For months. With a green suite.
 *
 * So this file deliberately does NOT mock the api module: it renders the real
 * hook, which imports the real module, and asserts the request that actually
 * leaves the app. Only the HTTP adapter underneath is stubbed, which is the
 * lowest layer that can be faked without faking the thing under test.
 */
const requests = [];
const originalAdapter = api.defaults.adapter;

const VALID_ID = '507f1f77bcf86cd799439013';
const ANON_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

const Host = ({ targetType, targetId }) => {
    useRecordView({ targetType, targetId });
    return null;
};

const bodyOf = (config) => (typeof config.data === 'string' ? JSON.parse(config.data) : config.data);

describe('useRecordView wiring (real api module, stubbed adapter)', () => {
    beforeEach(() => {
        requests.length = 0;
        api.defaults.adapter = async (config) => {
            requests.push(config);
            return {
                data: { success: true, data: { counted: true } },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };
    });

    afterAll(() => {
        api.defaults.adapter = originalAdapter;
    });

    test('sends a POST to /views naming the record it was given', async () => {
        render(<Host targetType="zone" targetId={VALID_ID} />);

        await waitFor(() => expect(requests).toHaveLength(1));

        expect(requests[0].method).toBe('post');
        expect(requests[0].url).toBe('/views');
        expect(requests[0].baseURL).toBe('/api');
        expect(bodyOf(requests[0])).toMatchObject({ targetType: 'zone', targetId: VALID_ID });
    });

    test('attaches a guest identity the server will accept', async () => {
        render(<Host targetType="report" targetId={VALID_ID} />);

        await waitFor(() => expect(requests).toHaveLength(1));

        // A view with no identity is deliberately not counted server-side, so a
        // recorder that forgets this would look like "nobody opened anything"
        // rather than like a bug.
        expect(bodyOf(requests[0]).anonymousId).toMatch(ANON_ID_PATTERN);
    });

    test('records once per record and ignores an incomplete target', async () => {
        const { rerender } = render(<Host targetType="report" targetId={VALID_ID} />);
        await waitFor(() => expect(requests).toHaveLength(1));

        rerender(<Host targetType="report" targetId={VALID_ID} />);
        expect(requests).toHaveLength(1);

        rerender(<Host targetType="report" targetId={undefined} />);
        expect(requests).toHaveLength(1);
    });
});
