import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    login: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ login: mocks.login }),
}));

import AuthLayout from '../components/layout/AuthLayout';
import LoginPage from '../pages/LoginPage';

const renderLogin = () => render(
    <MemoryRouter initialEntries={['/login']}>
        <Routes>
            <Route path="/login" element={<AuthLayout variant="login"><LoginPage /></AuthLayout>} />
        </Routes>
    </MemoryRouter>
);

describe('LoginPage system-accurate content', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.login.mockResolvedValue({ success: true });
    });

    test('presents focused institutional access and preserves secondary navigation', () => {
        renderLogin();

        expect(screen.getByRole('heading', { name: 'Sign in to Sibuyan Alert' })).toBeInTheDocument();
        expect(screen.getByText('Access your account securely.')).toBeInTheDocument();
        expect(screen.getByText(/Report, review, map, and coordinate accident response/i)).toBeInTheDocument();
        expect(screen.getByText('Coverage across 3 municipalities')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Cajidiocan seal' })).toHaveAttribute('src', '/icons/Cajidiocan.logo.png');
        expect(screen.getByRole('img', { name: 'Magdiwang seal' })).toHaveAttribute('src', '/icons/Magdiwang.logo.png');
        expect(screen.getByRole('img', { name: 'San Fernando seal' })).toHaveAttribute('src', '/icons/Sanfernando.logo.png');
        expect(screen.getByRole('complementary', { name: 'Sibuyan Alert system overview' })).toHaveClass('bg-brand-950');
        expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('min-h-12', 'bg-brand-700');
        expect(screen.getByRole('link', { name: /Register as a reporter/i })).toHaveAttribute('href', '/register');
        expect(screen.getByRole('link', { name: /View public incident map/i })).toHaveAttribute('href', '/dashboard?view=map');
        expect(screen.getByText(/Submit incident reports after approval/i)).toBeInTheDocument();
        expect(screen.getByText(/no sign-in required/i)).toBeInTheDocument();

        expect(screen.queryByText('Operational Map')).not.toBeInTheDocument();
        expect(screen.queryByText('Responder Alerts')).not.toBeInTheDocument();
        expect(screen.queryByText('Role-based Workflow')).not.toBeInTheDocument();
        expect(screen.queryByText('Administrator Review')).not.toBeInTheDocument();
        expect(screen.queryByText(/^or$/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/disaster warnings/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/live tracking/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Sign In to Dashboard/i)).not.toBeInTheDocument();
    });

    test('preserves forgot-password and password-visibility controls', () => {
        renderLogin();

        const password = screen.getByLabelText('Password');
        expect(password).toHaveAttribute('type', 'password');
        expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');

        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(password).toHaveAttribute('type', 'text');
        expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
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
