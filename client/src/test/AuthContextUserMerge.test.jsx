import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from '../router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from '../utils/appToast';

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
    verificationFeedback: null,
    barangay: 'Tampayan',
    address: 'Tampayan, Magdiwang, Sibuyan Island, Romblon',
};

let latestUpdateUser = null;
let latestAuth = null;

const ProfileProbe = () => {
    const auth = useAuth();
    const { user, updateUser, canSubmitReports } = auth;
    const location = useLocation();
    latestUpdateUser = updateUser;
    latestAuth = auth;

    return (
        <div>
            <span data-testid="name">{String(user?.name)}</span>
            <span data-testid="verified">{String(user?.isVerified)}</span>
            <span data-testid="status">{String(user?.verificationStatus)}</span>
            <span data-testid="address">{String(user?.address)}</span>
            <span data-testid="role">{String(user?.role)}</span>
            <span data-testid="feedback">{String(user?.verificationFeedback)}</span>
            <span data-testid="can-submit">{String(canSubmitReports())}</span>
            <span data-testid="location">{location.pathname}</span>
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
    afterEach(() => vi.useRealTimers());

    beforeEach(() => {
        vi.clearAllMocks();
        latestUpdateUser = null;
        latestAuth = null;
        api.get.mockResolvedValue({ data: { success: true, data: approvedReporter } });
    });

    test('merges a profile update into the session user instead of replacing it', async () => {
        renderProvider();

        await waitFor(() => expect(screen.getByTestId('verified')).toHaveTextContent('true'));

        // A partial caller update must also remain safe; API responses now carry
        // the full self-account projection.
        await act(async () => {
            latestUpdateUser({
                id: 'reporter-1',
                name: 'Juan D. Cruz',
                avatar: '/api/files/507f1f77bcf86cd799439011/photo.jpg',
            });
        });

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Juan D. Cruz'));

        // A verified reporter who renames themselves must stay verified: these
        // fields gate /report (ProtectedRoute requireVerified) and the submit CTA.
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

    test.each(['pending', 'approved', 'rejected'])('complete profile responses retain the %s verification state', async (status) => {
        const account = { ...approvedReporter, verificationStatus: status, isVerified: status === 'approved', verificationFeedback: status === 'rejected' ? 'Please replace the ID.' : null };
        api.get.mockResolvedValue({ data: { data: account } });
        api.put.mockResolvedValue({ data: { data: { ...account, name: 'Updated reporter' } } });
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(status));
        await act(async () => { await latestAuth.updateProfile({ name: 'Updated reporter' }); });
        expect(screen.getByTestId('name')).toHaveTextContent('Updated reporter');
        expect(screen.getByTestId('role')).toHaveTextContent('reporter');
        expect(screen.getByTestId('status')).toHaveTextContent(status);
        expect(screen.getByTestId('verified')).toHaveTextContent(String(status === 'approved'));
        expect(screen.getByTestId('feedback')).toHaveTextContent(String(account.verificationFeedback));
    });

    test.each(['approved', 'rejected'])('polling detects pending → %s without changing reporter identity', async (nextStatus) => {
        vi.useFakeTimers();
        const pending = { ...approvedReporter, isVerified: false, verificationStatus: 'pending' };
        const nextUser = { ...pending, isVerified: nextStatus === 'approved', verificationStatus: nextStatus, verificationFeedback: nextStatus === 'rejected' ? 'The selfie needs to be clearer.' : null };
        api.get.mockReset().mockResolvedValueOnce({ data: { data: pending } }).mockResolvedValue({ data: { data: nextUser } });
        await act(async () => { renderProvider(); });
        expect(screen.getByTestId('can-submit')).toHaveTextContent('false');
        await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
        expect(screen.getByTestId('role')).toHaveTextContent('reporter');
        expect(screen.getByTestId('status')).toHaveTextContent(nextStatus);
        expect(screen.getByTestId('verified')).toHaveTextContent(String(nextStatus === 'approved'));
        expect(screen.getByTestId('can-submit')).toHaveTextContent(String(nextStatus === 'approved'));
        expect(screen.getByTestId('feedback')).toHaveTextContent(String(nextUser.verificationFeedback));
        if (nextStatus === 'approved') {
            expect(toast.success).toHaveBeenCalledWith('Account approved. You can now submit reports.');
            await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
            expect(api.get).toHaveBeenCalledTimes(2);
        } else {
            expect(toast.error).toHaveBeenCalledWith('Verification was rejected. Please check feedback in your profile.');
        }
    });

    test('resubmission applies the authoritative pending flag and clears stale feedback immediately', async () => {
        const rejected = { ...approvedReporter, isVerified: false, verificationStatus: 'rejected', verificationFeedback: 'Replace the ID.' };
        api.get.mockResolvedValue({ data: { data: rejected } });
        api.post.mockResolvedValue({ data: { data: { ...rejected, verificationStatus: 'pending', verificationFeedback: null } } });
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('rejected'));
        await act(async () => { await latestAuth.resubmitIdDocument(new FormData()); });
        expect(screen.getByTestId('role')).toHaveTextContent('reporter');
        expect(screen.getByTestId('status')).toHaveTextContent('pending');
        expect(screen.getByTestId('verified')).toHaveTextContent('false');
        expect(screen.getByTestId('feedback')).toHaveTextContent('null');
        expect(screen.getByTestId('can-submit')).toHaveTextContent('false');
    });

    test('an old resubmission response cannot overwrite a different signed-in account', async () => {
        const rejected = { ...approvedReporter, isVerified: false, verificationStatus: 'rejected' };
        api.get.mockResolvedValue({ data: { data: rejected } });
        let resolveResubmission;
        api.post.mockImplementation(() => new Promise((resolve) => { resolveResubmission = resolve; }));
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('rejected'));
        let request;
        act(() => { request = latestAuth.resubmitIdDocument(new FormData()); });
        act(() => latestUpdateUser({ ...approvedReporter, id: 'another-account', name: 'Another reporter' }));
        await act(async () => {
            resolveResubmission({ data: { data: { ...rejected, verificationStatus: 'pending', verificationFeedback: null } } });
            await request;
        });
        expect(screen.getByTestId('name')).toHaveTextContent('Another reporter');
        expect(screen.getByTestId('status')).toHaveTextContent('approved');
        expect(screen.getByTestId('verified')).toHaveTextContent('true');
    });

    test.each(['pending', 'approved', 'rejected'])('login keeps %s reporters in their existing role-based routing', async (status) => {
        api.get.mockRejectedValueOnce(new Error('No session'));
        const account = { ...approvedReporter, isVerified: status === 'approved', verificationStatus: status };
        api.post.mockResolvedValue({ data: { data: { user: account } } });
        renderProvider();
        await waitFor(() => expect(latestAuth.loading).toBe(false));
        await act(async () => { await latestAuth.login('juan@example.com', 'password', '/report'); });
        expect(screen.getByTestId('role')).toHaveTextContent('reporter');
        expect(screen.getByTestId('status')).toHaveTextContent(status);
        expect(screen.getByTestId('location')).toHaveTextContent(status === 'approved' ? '/report' : '/reporter');
    });
});
