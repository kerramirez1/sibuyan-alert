import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getMunicipalities: vi.fn(),
    register: vi.fn(),
    prepareIdentityImage: vi.fn(),
    prepareVerificationImage: vi.fn(),
}));

vi.mock('../services/api', () => ({
    reportsAPI: { getMunicipalities: mocks.getMunicipalities },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ register: mocks.register }),
}));

vi.mock('../utils/identityImage', () => ({
    ID_IMAGE_ACCEPT: 'image/jpeg,image/png,image/webp',
    prepareIdentityImage: mocks.prepareIdentityImage,
    prepareVerificationImage: mocks.prepareVerificationImage,
}));

import RegisterPage from '../pages/RegisterPage';
import AuthLayout from '../components/layout/AuthLayout';

const officialLocations = [
    {
        name: 'Cajidiocan',
        barangays: ['Alibagon', 'Danao', 'Gutivan', 'Marigondon', 'Poblacion'].map((name) => ({ name })),
    },
    {
        name: 'Magdiwang',
        barangays: ['Agsao', 'Jao-asan', 'Tampayan'].map((name) => ({ name })),
    },
    {
        name: 'San Fernando',
        barangays: ['Agtiwa', 'Azarga', 'Campalingo', 'Canjalon', 'Espa', 'Mabini', 'Mabulo', 'Otod', 'Panangcalan', 'Pili', 'Poblacion', 'Taclobo'].map((name) => ({ name })),
    },
];

const renderRegister = () => render(
    <MemoryRouter>
        <AuthLayout variant="registration">
            <RegisterPage />
        </AuthLayout>
    </MemoryRouter>
);

describe('RegisterPage location reference and responsive form', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:preview');
        if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
        HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();
        HTMLMediaElement.prototype.pause = vi.fn();
        mocks.getMunicipalities.mockResolvedValue({ data: { data: officialLocations } });
        mocks.register.mockResolvedValue({ success: true });
        mocks.prepareIdentityImage.mockImplementation(async (file) => ({ file }));
        mocks.prepareVerificationImage.mockImplementation(async (file) => ({ file }));
    });

    test('presents a registration-specific enrollment context and accessible progress', async () => {
        renderRegister();
        await screen.findByLabelText('Municipality');

        expect(screen.getByRole('complementary', { name: 'Sibuyan Alert reporter registration overview' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Become a verified reporter.' })).toBeInTheDocument();
        expect(screen.getByText('Submit your government ID')).toBeInTheDocument();
        expect(screen.getByText('Wait for municipal approval')).toBeInTheDocument();
        expect(screen.queryByText('Operational Map')).not.toBeInTheDocument();
        expect(screen.queryByText('Responder Alerts')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
        expect(screen.getAllByText('Step 1 of 3: Account')).toHaveLength(2);
    });

    test('loads barangays from the backend and shows only the selected municipality records', async () => {
        renderRegister();

        const municipality = await screen.findByLabelText('Municipality');
        fireEvent.change(municipality, { target: { value: 'Cajidiocan' } });

        let barangay = screen.getByLabelText('Barangay');
        expect(within(barangay).getByRole('option', { name: 'Gutivan' })).toBeInTheDocument();
        expect(within(barangay).getByRole('option', { name: 'Danao' })).toBeInTheDocument();
        expect(within(barangay).queryByRole('option', { name: 'Danao Norte' })).not.toBeInTheDocument();

        fireEvent.change(municipality, { target: { value: 'San Fernando' } });
        barangay = screen.getByLabelText('Barangay');
        expect(within(barangay).getByRole('option', { name: 'Agtiwa' })).toBeInTheDocument();
        expect(within(barangay).getByRole('option', { name: 'Panangcalan' })).toBeInTheDocument();
        expect(within(barangay).queryByRole('option', { name: 'Butong' })).not.toBeInTheDocument();
    });

    test('blocks progression and exposes accessible validation feedback', async () => {
        renderRegister();
        await screen.findByLabelText('Municipality');

        fireEvent.click(screen.getByRole('button', { name: /Continue to ID Upload/i }));

        expect(screen.getAllByRole('alert')).toHaveLength(6);
        expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
        expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('heading', { name: /Account information/i })).toBeInTheDocument();
    });

    test('keeps independent show-password controls aligned with each field', async () => {
        renderRegister();
        await screen.findByLabelText('Municipality');

        const password = screen.getByLabelText('Password');
        const confirmation = screen.getByLabelText('Confirm password');
        expect(password).toHaveAttribute('type', 'password');
        expect(confirmation).toHaveAttribute('type', 'password');

        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(password).toHaveAttribute('type', 'text');
        expect(confirmation).toHaveAttribute('type', 'password');
        expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
        expect(confirmation).toHaveAttribute('type', 'text');
    });

    test('keeps location selection disabled and provides retry when reference loading fails', async () => {
        mocks.getMunicipalities.mockRejectedValueOnce(new Error('offline'));
        renderRegister();

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i));
        expect(screen.getByLabelText('Municipality')).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByLabelText('Municipality')).not.toBeDisabled());
        expect(mocks.getMunicipalities).toHaveBeenCalledTimes(2);
    });

    test('offers separate image-only camera and device inputs for the ID photo', async () => {
        renderRegister();
        await screen.findByLabelText('Municipality');

        fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Juan Dela Cruz' } });
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'juan@example.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Municipality'), { target: { value: 'Cajidiocan' } });
        fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'Gutivan' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to ID Upload/i }));

        expect(screen.getByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Upload your ID' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Take a photo/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Choose from device/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Continue to Selfie/i })).toBeDisabled();
        expect(screen.getByLabelText('Take an ID photo')).toHaveAttribute('capture', 'environment');
        expect(screen.getByLabelText('Take an ID photo')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
        expect(screen.getByLabelText('Choose an ID photo from device')).not.toHaveAttribute('capture');
        expect(screen.getByText(/never shown on public reports/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByLabelText('Full name')).toHaveValue('Juan Dela Cruz');
        expect(screen.getByLabelText('Municipality')).toHaveValue('Cajidiocan');
        expect(screen.getByLabelText('Barangay')).toHaveValue('Gutivan');
    });

    test('requires explicit selfie confirmation before enabling final submission', async () => {
        renderRegister();
        await screen.findByLabelText('Municipality');

        fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Juan Dela Cruz' } });
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'juan@example.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Municipality'), { target: { value: 'Cajidiocan' } });
        fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'Gutivan' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to ID Upload/i }));

        const idPhoto = new File(['id'], 'id.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Choose an ID photo from device'), { target: { files: [idPhoto] } });
        await screen.findByAltText('Selected identification preview');
        fireEvent.click(screen.getByRole('button', { name: /Continue to Selfie/i }));

        expect(screen.getByRole('heading', { name: /Take a verification selfie/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Confirm your selfie to continue/i })).toBeDisabled();

        const selfie = new File(['selfie'], 'selfie.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Choose a verification selfie from device'), { target: { files: [selfie] } });
        await screen.findByAltText('Verification selfie preview');
        expect(screen.getByRole('button', { name: /Confirm your selfie to continue/i })).toBeDisabled();

        const usePhoto = screen.getByRole('button', { name: /Use this photo/i });
        await waitFor(() => expect(usePhoto).toHaveFocus());
        fireEvent.click(usePhoto);
        const submit = screen.getByRole('button', { name: /Submit for municipal review/i });
        expect(submit).toBeEnabled();
        await waitFor(() => expect(submit).toHaveFocus());
        expect(screen.getByText(/manual identity comparison/i)).toBeInTheDocument();

        // Terms acceptance is required before submission
        const termsCheckbox = screen.getByRole('checkbox', { name: /i agree to the terms of use and privacy policy/i });
        expect(termsCheckbox).not.toBeChecked();
        fireEvent.click(submit);
        await waitFor(() => expect(screen.getByText(/you must agree to the terms of use and privacy policy/i)).toBeInTheDocument());
        expect(mocks.register).not.toHaveBeenCalled();

        fireEvent.click(termsCheckbox);
        expect(termsCheckbox).toBeChecked();
        await waitFor(() => expect(screen.queryByText(/you must agree to the terms of use and privacy policy/i)).not.toBeInTheDocument());

        fireEvent.click(submit);
        await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
        const submittedData = mocks.register.mock.calls[0][0];
        expect(submittedData.get('name')).toBe('Juan Dela Cruz');
        expect(submittedData.get('municipality')).toBe('Cajidiocan');
        expect(submittedData.get('idDocument')).toBe(idPhoto);
        expect(submittedData.get('agreeToTerms')).toBe('true');
    });

    test('handles camera opening, live face guide overlay, and manual capture', async () => {
        const mockTracks = [{ stop: vi.fn() }];
        const mockStream = { getTracks: () => mockTracks };
        const originalMediaDevices = navigator.mediaDevices;
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn().mockResolvedValue(mockStream),
            },
            configurable: true,
        });

        renderRegister();
        await screen.findByLabelText('Municipality');

        fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Maria Santos' } });
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'maria@example.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Municipality'), { target: { value: 'Cajidiocan' } });
        fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'Gutivan' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to ID Upload/i }));

        const idPhoto = new File(['id'], 'id.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Choose an ID photo from device'), { target: { files: [idPhoto] } });
        await screen.findByAltText('Selected identification preview');
        fireEvent.click(screen.getByRole('button', { name: /Continue to Selfie/i }));

        const openCameraBtn = screen.getByRole('button', { name: /Open camera/i });
        fireEvent.click(openCameraBtn);

        await waitFor(() => {
            expect(screen.getByText('Camera is live')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Close camera/i })).toBeInTheDocument();

        Object.defineProperty(navigator, 'mediaDevices', {
            value: originalMediaDevices,
            configurable: true,
        });
    });

    test('handles camera permission failure gracefully with non-blocking guidance', async () => {
        const permissionError = new Error('Permission denied');
        permissionError.name = 'NotAllowedError';
        const originalMediaDevices = navigator.mediaDevices;
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn().mockRejectedValue(permissionError),
            },
            configurable: true,
        });

        renderRegister();
        await screen.findByLabelText('Municipality');

        fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Maria Santos' } });
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'maria@example.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('Municipality'), { target: { value: 'Cajidiocan' } });
        fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'Gutivan' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to ID Upload/i }));

        const idPhoto = new File(['id'], 'id.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Choose an ID photo from device'), { target: { files: [idPhoto] } });
        await screen.findByAltText('Selected identification preview');
        fireEvent.click(screen.getByRole('button', { name: /Continue to Selfie/i }));

        const openCameraBtn = screen.getByRole('button', { name: /Open camera/i });
        fireEvent.click(openCameraBtn);

        await waitFor(() => {
            expect(screen.getByText(/Camera access was denied/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Try camera again/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Choose from device/i })).not.toBeInTheDocument();

        Object.defineProperty(navigator, 'mediaDevices', {
            value: originalMediaDevices,
            configurable: true,
        });
    });
});
