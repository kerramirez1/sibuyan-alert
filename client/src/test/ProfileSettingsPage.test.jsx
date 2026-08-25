import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ProfileSettingsPage from '../pages/ProfileSettingsPage';

const mocks = vi.hoisted(() => ({
    updateUser: vi.fn(),
    enablePushNotifications: vi.fn(),
    disablePushNotifications: vi.fn(),
    sendTestPushNotification: vi.fn(),
    updateProfile: vi.fn(),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), default: vi.fn() },
}));

const mockUser = {
    _id: 'user-admin-1',
    name: 'Cajidiocan Admin',
    email: 'admin.cajidiocan@sibuyan.gov.ph',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
    agency: 'LGU Cajidiocan',
    avatar: null,
};

let currentPushState = {
    subscribed: false,
    permission: 'default',
    supported: true,
    loading: false,
};

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser,
        updateUser: mocks.updateUser,
        pushState: currentPushState,
        enablePushNotifications: mocks.enablePushNotifications,
        disablePushNotifications: mocks.disablePushNotifications,
        sendTestPushNotification: mocks.sendTestPushNotification,
    }),
}));

vi.mock('../services/api', () => ({
    authAPI: {
        updateProfile: mocks.updateProfile,
    },
}));

vi.mock('../router', () => ({
    useNavigate: () => mocks.navigate,
}));

vi.mock('../utils/appToast', () => ({
    default: Object.assign((msg) => mocks.toast.default(msg), {
        success: mocks.toast.success,
        error: mocks.toast.error,
    }),
}));

describe('ProfileSettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentPushState = {
            subscribed: false,
            permission: 'default',
            supported: true,
            loading: false,
        };
    });

    test('renders clean page header, account identity row, and Linear-style sections', () => {
        render(<ProfileSettingsPage />);

        // 1. Page Header
        expect(screen.getByText('Account')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Profile settings' })).toBeInTheDocument();
        expect(screen.getByText('Manage your personal information, security, and notification preferences.')).toBeInTheDocument();

        // 2. Identity Row
        const identitySection = screen.getByLabelText('Account identity summary');
        expect(within(identitySection).getByText('Cajidiocan Admin')).toBeInTheDocument();
        expect(within(identitySection).getByText('admin.cajidiocan@sibuyan.gov.ph')).toBeInTheDocument();
        expect(within(identitySection).getByText('Municipal Admin')).toBeInTheDocument();
        expect(within(identitySection).getByText('· Cajidiocan')).toBeInTheDocument();
        expect(within(identitySection).getByRole('button', { name: 'Change profile photo' })).toBeInTheDocument();

        // 3. Basic Information
        expect(screen.getByRole('heading', { name: 'Basic information' })).toBeInTheDocument();
        expect(screen.getByLabelText('Full name')).toHaveValue('Cajidiocan Admin');
        expect(screen.getByLabelText('Email address')).toHaveValue('admin.cajidiocan@sibuyan.gov.ph');

        // 4. Protected Information
        expect(screen.getByRole('heading', { name: 'Protected information' })).toBeInTheDocument();
        expect(screen.getByText('Account role')).toBeInTheDocument();
        expect(screen.getAllByText('Municipal Admin').length).toBeGreaterThan(0);
        expect(screen.getByText('Municipality')).toBeInTheDocument();
        expect(screen.getByText('Agency / Unit')).toBeInTheDocument();

        // 5. Browser Notifications
        expect(screen.getByRole('heading', { name: 'Browser notifications' })).toBeInTheDocument();
        expect(screen.getByText('Disabled on this browser')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enable notifications' })).toBeInTheDocument();

        // 6. Security / Password
        expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
        expect(screen.getByLabelText('Current password')).toBeInTheDocument();
        expect(screen.getByLabelText('New password')).toBeInTheDocument();
        expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
        expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();

        // 7. Save & Cancel Actions
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        const saveButton = screen.getByRole('button', { name: 'Save changes' });
        expect(saveButton).toBeDisabled();
    });

    test('toggles photo menu and provides take photo and choose from device options', () => {
        render(<ProfileSettingsPage />);

        const changePhotoBtn = screen.getByRole('button', { name: 'Change profile photo' });
        fireEvent.click(changePhotoBtn);

        expect(screen.getAllByRole('button', { name: 'Take photo' }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button', { name: 'Choose from device' }).length).toBeGreaterThan(0);

        // Closes when pressing Escape
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('menu', { name: 'Profile photo options' })).not.toBeInTheDocument();
    });

    test('enables Save changes button when form fields are modified and handles submit', async () => {
        mocks.updateProfile.mockResolvedValue({
            data: {
                success: true,
                data: { ...mockUser, name: 'Cajidiocan Admin Refined' },
            },
        });

        render(<ProfileSettingsPage />);

        const nameInput = screen.getByLabelText('Full name');
        fireEvent.change(nameInput, { target: { value: 'Cajidiocan Admin Refined' } });

        const saveButton = screen.getByRole('button', { name: 'Save changes' });
        expect(saveButton).not.toBeDisabled();

        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(mocks.updateProfile).toHaveBeenCalled();
            expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cajidiocan Admin Refined' }));
            expect(mocks.toast.success).toHaveBeenCalledWith('Profile updated successfully');
        });
    });

    test('validates password requirements before submitting password changes', async () => {
        render(<ProfileSettingsPage />);

        const currentPassInput = screen.getByLabelText('Current password');
        const newPassInput = screen.getByLabelText('New password');
        const confirmPassInput = screen.getByLabelText('Confirm password');

        fireEvent.change(currentPassInput, { target: { value: 'oldPassword123' } });
        fireEvent.change(newPassInput, { target: { value: 'short' } });
        fireEvent.change(confirmPassInput, { target: { value: 'short' } });

        const saveButton = screen.getByRole('button', { name: 'Save changes' });
        expect(saveButton).not.toBeDisabled();

        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('8 characters'));
            expect(mocks.updateProfile).not.toHaveBeenCalled();
        });
    });

    test('allows toggling password visibility for all password fields', () => {
        render(<ProfileSettingsPage />);

        const currentPassInput = screen.getByLabelText('Current password');
        expect(currentPassInput).toHaveAttribute('type', 'password');

        const toggleCurrentBtn = screen.getByRole('button', { name: 'Show current password' });
        fireEvent.click(toggleCurrentBtn);
        expect(currentPassInput).toHaveAttribute('type', 'text');

        const newPassInput = screen.getByLabelText('New password');
        expect(newPassInput).toHaveAttribute('type', 'password');
        const toggleNewBtn = screen.getByRole('button', { name: 'Show new password' });
        fireEvent.click(toggleNewBtn);
        expect(newPassInput).toHaveAttribute('type', 'text');

        const confirmPassInput = screen.getByLabelText('Confirm password');
        expect(confirmPassInput).toHaveAttribute('type', 'password');
        const toggleConfirmBtn = screen.getByRole('button', { name: 'Show confirm password' });
        fireEvent.click(toggleConfirmBtn);
        expect(confirmPassInput).toHaveAttribute('type', 'text');
    });

    test('displays field-specific error messages under relevant password inputs', async () => {
        render(<ProfileSettingsPage />);

        const currentPassInput = screen.getByLabelText('Current password');
        const newPassInput = screen.getByLabelText('New password');
        const confirmPassInput = screen.getByLabelText('Confirm password');

        fireEvent.change(currentPassInput, { target: { value: 'currentPass123' } });
        fireEvent.change(newPassInput, { target: { value: 'ValidPassword123!' } });
        fireEvent.change(confirmPassInput, { target: { value: 'MismatchPassword123!' } });

        const saveButton = screen.getByRole('button', { name: 'Save changes' });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
            expect(confirmPassInput).toHaveAttribute('aria-invalid', 'true');
        });

        // Typing in confirm password clears its error
        fireEvent.change(confirmPassInput, { target: { value: 'ValidPassword123!' } });
        expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
    });

    test('triggers browser push notification toggle', async () => {
        mocks.enablePushNotifications.mockResolvedValue({ success: true });

        render(<ProfileSettingsPage />);

        const enablePushBtn = screen.getByRole('button', { name: 'Enable notifications' });
        fireEvent.click(enablePushBtn);

        await waitFor(() => {
            expect(mocks.enablePushNotifications).toHaveBeenCalled();
            expect(mocks.toast.success).toHaveBeenCalledWith('Browser notifications enabled');
        });
    });
});
