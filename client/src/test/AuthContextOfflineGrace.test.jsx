import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import api from '../services/api';
import { OFFLINE_USER_KEY } from '../utils/offlineUserSnapshot';

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    refreshAuthSession: vi.fn(),
}));

vi.mock('../services/pushNotifications', () => ({
    getPushState: vi.fn().mockResolvedValue({ supported: false, permission: 'default', subscribed: false }),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
    isPushSupported: vi.fn().mockReturnValue(false),
}));

vi.mock('../utils/appToast', () => ({
    default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
    dismissActiveToast: vi.fn(),
}));

// The account a reporter has while they are allowed to submit reports.
const approvedReporter = {
    id: 'reporter-1',
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    role: 'reporter',
    isVerified: true,
    verificationStatus: 'approved',
};

const freshSnapshot = (overrides = {}) => ({
    id: 'reporter-1',
    role: 'reporter',
    name: 'Juan Dela Cruz',
    reporterVerificationStatus: 'approved',
    savedAt: Date.now(),
    ...overrides,
});

const seedSnapshot = (snapshot = freshSnapshot()) => {
    window.localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(snapshot));
};

const readSnapshot = () => {
    const raw = window.localStorage.getItem(OFFLINE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
};

let latestAuth = null;

const AuthProbe = () => {
    const auth = useAuth();
    latestAuth = auth;
    const { user, loading } = auth;
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="name">{String(user?.name)}</span>
            <span data-testid="role">{String(user?.role)}</span>
            <span data-testid="offline">{String(user?.offline)}</span>
            <span data-testid="status">{String(user?.reporterVerificationStatus)}</span>
        </div>
    );
};

const renderProvider = () => render(
    <MemoryRouter>
        <AuthProvider>
            <AuthProbe />
        </AuthProvider>
    </MemoryRouter>,
);

const networkFailure = () => {
    const error = new Error('Network Error');
    return error;
};

describe('AuthContext offline session grace', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        latestAuth = null;
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    test('restores an offline reporter when /auth/me fails with a network error and a fresh snapshot exists', async () => {
        seedSnapshot();
        api.get.mockRejectedValue(networkFailure());

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('name')).toHaveTextContent('Juan Dela Cruz');
        expect(screen.getByTestId('role')).toHaveTextContent('reporter');
        expect(screen.getByTestId('offline')).toHaveTextContent('true');
        expect(screen.getByTestId('status')).toHaveTextContent('approved');
        // The snapshot survives: it is the credential for the next attempt.
        expect(readSnapshot()?.id).toBe('reporter-1');
    });

    test('a 401 is still a real logout: user clears and the snapshot is dropped', async () => {
        seedSnapshot();
        api.get.mockRejectedValue({ response: { status: 401 } });

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('name')).toHaveTextContent('undefined');
        expect(screen.getByTestId('offline')).toHaveTextContent('undefined');
        expect(window.localStorage.getItem(OFFLINE_USER_KEY)).toBeNull();
    });

    test('a 403 also clears the user and the snapshot', async () => {
        seedSnapshot();
        api.get.mockRejectedValue({ response: { status: 403 } });

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('name')).toHaveTextContent('undefined');
        expect(window.localStorage.getItem(OFFLINE_USER_KEY)).toBeNull();
    });

    test('a stale snapshot does not restore offline mode', async () => {
        seedSnapshot(freshSnapshot({ savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }));
        api.get.mockRejectedValue(networkFailure());

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('name')).toHaveTextContent('undefined');
    });

    test('a non-reporter snapshot does not restore offline mode', async () => {
        seedSnapshot(freshSnapshot({ role: 'municipal_admin' }));
        api.get.mockRejectedValue(networkFailure());

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('name')).toHaveTextContent('undefined');
    });

    test('writes the snapshot after a successful /auth/me and never stores a credential', async () => {
        api.get.mockResolvedValue({ data: { success: true, data: approvedReporter } });

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Juan Dela Cruz'));
        const snapshot = readSnapshot();
        expect(snapshot).toMatchObject({
            id: 'reporter-1',
            role: 'reporter',
            name: 'Juan Dela Cruz',
            reporterVerificationStatus: 'approved',
        });
        expect(typeof snapshot.savedAt).toBe('number');
        // Identity claims only: no token, no password, no session secret.
        expect(Object.keys(snapshot).sort()).toEqual(
            ['id', 'name', 'reporterVerificationStatus', 'role', 'savedAt'],
        );
    });

    test('clears the snapshot on logout', async () => {
        api.get.mockResolvedValue({ data: { success: true, data: approvedReporter } });
        api.post.mockResolvedValue({ data: { success: true } });

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Juan Dela Cruz'));
        expect(readSnapshot()?.id).toBe('reporter-1');

        await act(async () => {
            await latestAuth.logout();
        });

        expect(screen.getByTestId('name')).toHaveTextContent('undefined');
        expect(window.localStorage.getItem(OFFLINE_USER_KEY)).toBeNull();
    });

    test('revalidates the session when the device comes back online', async () => {
        seedSnapshot();
        api.get.mockRejectedValue(networkFailure());

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('offline')).toHaveTextContent('true'));

        // The link returns: the next /auth/me answers with the live session.
        api.get.mockResolvedValue({ data: { success: true, data: approvedReporter } });

        await act(async () => {
            window.dispatchEvent(new Event('online'));
        });

        await waitFor(() => expect(screen.getByTestId('offline')).toHaveTextContent('undefined'));
        expect(screen.getByTestId('name')).toHaveTextContent('Juan Dela Cruz');
        // The snapshot is refreshed from the live session.
        expect(readSnapshot()?.reporterVerificationStatus).toBe('approved');
    });

    test('a failed revalidation keeps offline mode and the snapshot', async () => {
        seedSnapshot();
        api.get.mockRejectedValue(networkFailure());

        renderProvider();

        await waitFor(() => expect(screen.getByTestId('offline')).toHaveTextContent('true'));

        await act(async () => {
            window.dispatchEvent(new Event('online'));
        });

        // Still offline: the mode and the snapshot both survive for the next try.
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
        expect(screen.getByTestId('offline')).toHaveTextContent('true');
        expect(readSnapshot()?.id).toBe('reporter-1');
    });
});
