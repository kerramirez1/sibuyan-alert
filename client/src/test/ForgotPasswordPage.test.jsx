import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import api from '../services/api';
import AuthLayout from '../components/layout/AuthLayout';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';

vi.mock('../services/api', () => ({
    default: {
        post: vi.fn(),
    },
}));

vi.mock('../utils/appToast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const renderForgotPassword = () => render(
    <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
            <Route
                path="/forgot-password"
                element={(
                    <AuthLayout variant="login">
                        <ForgotPasswordPage />
                    </AuthLayout>
                )}
            />
        </Routes>
    </MemoryRouter>
);

describe('ForgotPasswordPage auth consistency and behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders consistent auth sidebar and recovery form', () => {
        renderForgotPassword();

        // Left sidebar matches Login page
        expect(screen.getByRole('complementary', { name: 'Sibuyan Alert system overview' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Report, review, map, and coordinate accident response/i })).toBeInTheDocument();
        expect(screen.getByText('Coverage across 3 municipalities')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Cajidiocan seal' })).toBeInTheDocument();

        // Form content
        expect(screen.getByText('Account Recovery')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument();
        expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send Reset Link' })).toHaveClass('bg-brand-700');
        expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login');
        expect(screen.getByRole('link', { name: 'Contact Support' })).toHaveAttribute('href', 'mailto:sibuyan.alert@gmail.com');
    });

    test('handles successful password reset submission', async () => {
        api.post.mockResolvedValueOnce({ data: { success: true } });
        renderForgotPassword();

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { value: 'resident@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', {
                email: 'resident@example.com',
            });
        });

        expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
        expect(screen.getAllByRole('link', { name: 'Back to login' }).length).toBeGreaterThanOrEqual(1);
    });
});
