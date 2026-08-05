import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from '../router';
import RegistrationSubmittedPage from '../pages/RegistrationSubmittedPage';

describe('RegistrationSubmittedPage', () => {
    test('explains the pending-review state and provides an account action', () => {
        render(
            <MemoryRouter>
                <RegistrationSubmittedPage />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: /Account submitted for review/i })).toBeInTheDocument();
        expect(screen.getByText(/manually compare your ID and selfie/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Go to my account/i })).toHaveAttribute('href', '/my-reports');
        expect(screen.getByText(/not displayed on public incident reports/i)).toBeInTheDocument();
    });
});
