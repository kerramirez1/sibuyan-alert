import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ProfileSettingsPage from '../pages/ProfileSettingsPage';
import { AVATAR_MAX_BYTES } from '../config/avatarUpload';

const mocks = vi.hoisted(() => ({
    updateUser: vi.fn(),
    updateProfile: vi.fn(),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), default: vi.fn() },
}));

const mockUser = {
    id: 'admin-1',
    name: 'Cajidiocan Admin',
    email: 'admin.cajidiocan@sibuyan.gov.ph',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
    avatar: null,
};

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser,
        updateUser: mocks.updateUser,
        pushState: { subscribed: false, permission: 'default', supported: true, loading: false },
        enablePushNotifications: vi.fn(),
        disablePushNotifications: vi.fn(),
        sendTestPushNotification: vi.fn(),
    }),
}));

vi.mock('../services/api', () => ({
    authAPI: { updateProfile: mocks.updateProfile },
}));

vi.mock('../router', () => ({
    useNavigate: () => mocks.navigate,
}));

vi.mock('../utils/appToast', () => ({
    default: Object.assign((message) => mocks.toast.default(message), {
        success: mocks.toast.success,
        error: mocks.toast.error,
    }),
}));

const photoInput = () => screen.getByLabelText('Upload profile image from device');

const photoFile = (name = 'photo.jpg', size = 4096) => {
    const bytes = new Uint8Array(size);
    bytes.set([0xff, 0xd8, 0xff], 0);
    return new File([bytes], name, { type: 'image/jpeg' });
};

const openPhotoMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Change profile photo' }));
};

beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:staged-avatar');
    URL.revokeObjectURL = vi.fn();
});

describe('ProfileSettingsPage avatar upload', () => {
    test('portals the mobile sheet out of the transformed page wrapper', () => {
        const { container } = render(<ProfileSettingsPage />);
        openPhotoMenu();

        const dialog = screen.getByRole('dialog', { name: 'Change profile photo' });

        // The page body is wrapped in `.page-enter`, whose retained
        // `transform` (animation-fill-mode: both) makes it the containing block
        // for every `position: fixed` descendant and lets <main>'s scroll
        // container clip them. Rendered inline, this sheet is laid out against
        // the full page height: the phone shows a dimmed screen and the picker
        // is unreachable.
        expect(container.contains(dialog)).toBe(false);
        expect(document.body.contains(dialog)).toBe(true);
        expect(dialog.parentElement?.parentElement).toBe(document.body);

        // The anchored desktop popover stays inside the page — it is positioned
        // against its trigger, not the viewport.
        const popover = screen.getByRole('menu', { name: 'Profile photo options' });
        expect(container.contains(popover)).toBe(true);
    });

    test('draws a single scrim behind the sheet', () => {
        render(<ProfileSettingsPage />);
        openPhotoMenu();

        // There used to be two stacked scrims (bg-black/40 over bg-black/50),
        // which dimmed the page behind the sheet twice over.
        expect(document.querySelectorAll('[aria-hidden="true"].fixed.inset-0')).toHaveLength(1);
    });

    test('rejects an oversized photo and leaves the picker ready for the same file', () => {
        render(<ProfileSettingsPage />);
        openPhotoMenu();
        fireEvent.click(screen.getAllByRole('button', { name: 'Choose from device' })[0]);

        const input = photoInput();
        fireEvent.change(input, {
            target: { files: [photoFile('huge.jpg', AVATAR_MAX_BYTES + 1)] },
        });

        expect(mocks.toast.error).toHaveBeenCalledWith('Image must be less than 5MB');
        // The input is reset even on rejection. A browser fires no `change`
        // event when the same file is picked again, so a retained value turns
        // the first retry a phone user reaches for into a silent no-op.
        expect(input.value).toBe('');
        expect(screen.queryByAltText('Profile avatar')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    test('survives the pointer sequence of a tap inside the sheet', () => {
        render(<ProfileSettingsPage />);
        openPhotoMenu();

        const input = photoInput();
        const openPicker = vi.spyOn(input, 'click');
        const chooseButton = screen.getAllByRole('button', { name: 'Choose from device' })[0];

        // A real tap is mousedown -> mouseup -> click. Closing the sheet on the
        // mousedown detaches the button before the click lands, so the picker
        // never opens and nothing at all happens.
        fireEvent.mouseDown(chooseButton);
        expect(screen.getByRole('dialog', { name: 'Change profile photo' })).toBeInTheDocument();

        fireEvent.click(chooseButton);
        expect(openPicker).toHaveBeenCalled();
    });

    test('stages the chosen photo and uploads it as multipart form data', async () => {
        mocks.updateProfile.mockResolvedValue({
            data: { success: true, data: { ...mockUser, avatar: '/api/files/507f1f77bcf86cd799439011/photo.jpg' } },
        });

        render(<ProfileSettingsPage />);
        openPhotoMenu();
        fireEvent.click(screen.getAllByRole('button', { name: 'Choose from device' })[0]);

        const photo = photoFile();
        fireEvent.change(photoInput(), { target: { files: [photo] } });

        expect(screen.getByAltText('Profile avatar')).toHaveAttribute('src', 'blob:staged-avatar');

        const save = screen.getByRole('button', { name: 'Save changes' });
        expect(save).not.toBeDisabled();
        fireEvent.click(save);

        await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
        const payload = mocks.updateProfile.mock.calls[0][0];
        expect(payload).toBeInstanceOf(FormData);
        expect(payload.get('avatar')).toBe(photo);

        await waitFor(() => expect(mocks.updateUser).toHaveBeenCalled());
    });

    test('moves focus into the sheet and returns it to the trigger on close', async () => {
        render(<ProfileSettingsPage />);
        const trigger = screen.getByRole('button', { name: 'Change profile photo' });
        fireEvent.click(trigger);

        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close photo menu' }));

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Change profile photo' })).not.toBeInTheDocument();
        });
        expect(document.activeElement).toBe(trigger);
    });

    test('portals the camera dialog and releases the stream when it closes', async () => {
        const stopTrack = vi.fn();
        Object.defineProperty(window.navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
        });

        const { container } = render(<ProfileSettingsPage />);
        openPhotoMenu();
        fireEvent.click(screen.getAllByRole('button', { name: 'Take photo' })[0]);

        const dialog = await screen.findByRole('dialog', { name: 'Take profile photo' });
        expect(container.contains(dialog)).toBe(false);
        expect(document.body.contains(dialog)).toBe(true);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close camera' }));

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => expect(stopTrack).toHaveBeenCalled());
    });
});
