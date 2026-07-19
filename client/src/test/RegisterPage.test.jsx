import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getMunicipalities: vi.fn(),
    register: vi.fn(),
}));

vi.mock('../services/api', () => ({
    reportsAPI: { getMunicipalities: mocks.getMunicipalities },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ register: mocks.register }),
}));

import RegisterPage from '../pages/RegisterPage';

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
        <RegisterPage />
    </MemoryRouter>
);

describe('RegisterPage location reference and responsive form', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getMunicipalities.mockResolvedValue({ data: { data: officialLocations } });
        mocks.register.mockResolvedValue({ success: true });
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

        fireEvent.click(screen.getByRole('button', { name: /Continue to identification/i }));

        expect(screen.getAllByRole('alert')).toHaveLength(6);
        expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
        expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('heading', { name: 'Account and home address' })).toBeInTheDocument();
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
});
