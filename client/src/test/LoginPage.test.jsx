import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ThemeProvider } from '../context/ThemeContext';

const mocks = vi.hoisted(() => ({
    login: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ login: mocks.login }),
}));

import AuthLayout from '../components/layout/AuthLayout';
import LoginPage from '../pages/LoginPage';

const renderLogin = () => render(
    <ThemeProvider>
        <MemoryRouter initialEntries={['/login']}>
            <Routes>
                <Route element={<AuthLayout />}>
                    <Route path="/login" element={<LoginPage />} />
                </Route>
            </Routes>
        </MemoryRouter>
    </ThemeProvider>
);

describe('LoginPage system-accurate content', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.login.mockResolvedValue({ success: true });
    });

    test('describes implemented roles, publication rules, alerts, and public-map access', () => {
        renderLogin();

        expect(screen.getByText('Operational Map')).toBeInTheDocument();
        expect(screen.getByText(/published incidents and active high-risk zones/i)).toBeInTheDocument();
        expect(screen.getByText('Responder Alerts')).toBeInTheDocument();
        expect(screen.getByText(/after verification or transfer/i)).toBeInTheDocument();
        expect(screen.getByText(/off the public map until verified/i)).toBeInTheDocument();
        expect(screen.getByText('Coverage across 3 municipalities')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Cajidiocan seal' })).toHaveAttribute('src', '/icons/Cajidiocan.logo.png');
        expect(screen.getByRole('img', { name: 'Magdiwang seal' })).toHaveAttribute('src', '/icons/Magdiwang.logo.png');
        expect(screen.getByRole('img', { name: 'San Fernando seal' })).toHaveAttribute('src', '/icons/Sanfernando.logo.png');
        expect(screen.getByRole('complementary', { name: 'Sibuyan Alert system overview' })).toHaveClass('bg-brand-950');
        expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('min-h-12', 'bg-brand-700');
        expect(screen.getByRole('link', { name: /Register as a reporter/i })).toHaveAttribute('href', '/register');
        expect(screen.getByRole('link', { name: /View public incident map/i })).toHaveAttribute('href', '/dashboard?view=map');
        expect(screen.getByText(/Administrator approval is required before reporting/i)).toBeInTheDocument();
        expect(screen.getByText(/no sign-in required/i)).toBeInTheDocument();

        expect(screen.queryByText(/disaster warnings/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/live tracking/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Sign In to Dashboard/i)).not.toBeInTheDocument();
    });

    test('shows the authentication result inline when login returns a failure', async () => {
        mocks.login.mockResolvedValueOnce({ success: false, message: 'Invalid credentials' });
        renderLogin();

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { value: 'reporter@example.com' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { value: 'wrong-password' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
        });
        expect(mocks.login).toHaveBeenCalledWith('reporter@example.com', 'wrong-password');
    });
});
