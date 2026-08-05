import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Link, MemoryRouter } from '../router';
import Button from '../components/ui/Button';

describe('Button', () => {
    test('uses safe native-button defaults and exposes loading state', () => {
        const onClick = vi.fn();
        const { rerender } = render(<Button onClick={onClick}>Save</Button>);

        const button = screen.getByRole('button', { name: 'Save' });
        expect(button).toHaveAttribute('type', 'button');
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledOnce();

        rerender(<Button loading loadingLabel="Saving..." onClick={onClick}>Save</Button>);
        const loadingButton = screen.getByRole('button', { name: 'Saving...' });
        expect(loadingButton).toBeDisabled();
        expect(loadingButton).toHaveAttribute('aria-busy', 'true');
    });

    test('renders an internal navigation link without leaking component-only props', () => {
        render(
            <MemoryRouter>
                <Button as={Link} to="/report" fullWidth>Submit report</Button>
            </MemoryRouter>,
        );

        const link = screen.getByRole('link', { name: 'Submit report' });
        expect(link).toHaveAttribute('href', '/report');
        expect(link).toHaveClass('w-full');
        expect(link).not.toHaveAttribute('as');
        expect(link).not.toHaveAttribute('disabled');
    });

    test('prevents interaction when a polymorphic button is disabled', () => {
        const onClick = vi.fn();
        render(
            <MemoryRouter>
                <Button as={Link} to="/report" disabled onClick={onClick}>Submit report</Button>
            </MemoryRouter>,
        );

        const link = screen.getByRole('link', { name: 'Submit report' });
        fireEvent.click(link);
        expect(onClick).not.toHaveBeenCalled();
        expect(link).toHaveAttribute('aria-disabled', 'true');
    });
});
