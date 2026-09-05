import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import RegistrationSubmittedPage from '../pages/RegistrationSubmittedPage';

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: false, user: null }),
}));

describe('RegistrationSubmittedPage', () => {
    test('explains the pending-review state and provides an account action', () => {
        render(
            <MemoryRouter>
                <RegistrationSubmittedPage />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: /Account submitted for review/i })).toBeInTheDocument();
        expect(screen.getByText(/manually compare your ID and selfie/i)).toBeInTheDocument();
        // Unauthenticated fallback goes to login; authed reporter -> /my-reports, ordinary -> /profile.
        expect(screen.getByRole('link', { name: /Go to my account/i })).toHaveAttribute('href', '/login');
        expect(screen.getByText(/not displayed on public incident reports/i)).toBeInTheDocument();
    });

    test('routes reporters to my-reports via override', () => {
        render(
            <MemoryRouter>
                <RegistrationSubmittedPage accountTargetOverride="/my-reports" />
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: /Go to my account/i })).toHaveAttribute('href', '/my-reports');
    });
});
