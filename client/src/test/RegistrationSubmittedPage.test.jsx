import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import RegistrationSubmittedPage from '../pages/RegistrationSubmittedPage';

const mocks = vi.hoisted(() => ({ user: null }));
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: !!mocks.user, user: mocks.user }),
}));

describe('RegistrationSubmittedPage', () => {
    beforeEach(() => { mocks.user = null; });
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

    test('gives pending reporters a verification link while retaining their role destination', () => {
        mocks.user = { id: 'reporter-1', role: 'reporter', isVerified: false, verificationStatus: 'pending' };
        render(<MemoryRouter><RegistrationSubmittedPage /></MemoryRouter>);
        expect(screen.getByRole('link', { name: 'Go to my account' })).toHaveAttribute('href', '/my-reports');
        expect(screen.getByRole('link', { name: 'View verification status' })).toHaveAttribute('href', '/profile');
    });
});
