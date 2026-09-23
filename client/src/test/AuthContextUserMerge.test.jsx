import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import api from '../services/api';

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
    barangay: 'Tampayan',
    address: 'Tampayan, Magdiwang, Sibuyan Island, Romblon',
};

let latestUpdateUser = null;

const ProfileProbe = () => {
    const { user, updateUser } = useAuth();
    latestUpdateUser = updateUser;

    return (
        <div>
            <span data-testid="name">{String(user?.name)}</span>
            <span data-testid="verified">{String(user?.isVerified)}</span>
            <span data-testid="status">{String(user?.verificationStatus)}</span>
            <span data-testid="address">{String(user?.address)}</span>
        </div>
    );
};

const renderProvider = () => render(
    <MemoryRouter>
        <AuthProvider>
            <ProfileProbe />
        </AuthProvider>
    </MemoryRouter>,
);

describe('AuthContext user state updates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        latestUpdateUser = null;
        api.get.mockResolvedValue({ data: { success: true, data: approvedReporter } });
    });

    test('merges a profile update into the session user instead of replacing it', async () => {
        renderProvider();

        await waitFor(() => expect(screen.getByTestId('verified')).toHaveTextContent('true'));

        // What `PUT /auth/me` returns for an avatar-only change.
        await act(async () => {
            latestUpdateUser({
                id: 'reporter-1',
                name: 'Juan D. Cruz',
                avatar: '/api/files/507f1f77bcf86cd799439011/photo.jpg',
            });
        });

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Juan D. Cruz'));

        // A verified reporter who renames themselves must stay verified: these
        // fields gate /report (ProtectedRoute requireVerified) and the submit CTA,
        // and the profile response does not carry them.
        expect(screen.getByTestId('verified')).toHaveTextContent('true');
        expect(screen.getByTestId('status')).toHaveTextContent('approved');
        expect(screen.getByTestId('address')).toHaveTextContent('Tampayan, Magdiwang');
    });

    test('still clears the user when asked explicitly', async () => {
        renderProvider();

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Juan Dela Cruz'));

        await act(async () => {
            latestUpdateUser(null);
        });

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('undefined'));
    });
});
