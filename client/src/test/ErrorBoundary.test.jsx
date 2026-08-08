import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../components/ui/ErrorBoundary';

const Thrower = ({ shouldThrow }) => {
    if (shouldThrow) {
        throw new Error('Test error');
    }
    return <div data-testid="child">Child content</div>;
};

describe('ErrorBoundary', () => {
    const originalError = console.error;

    beforeEach(() => {
        console.error = vi.fn();
    });

    afterEach(() => {
        console.error = originalError;
    });

    test('renders children when no error occurs', () => {
        render(
            <ErrorBoundary>
                <Thrower shouldThrow={false} />
            </ErrorBoundary>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    test('renders fallback UI when a child component throws', () => {
        render(
            <ErrorBoundary>
                <Thrower shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
        expect(screen.getByText('An unexpected error occurred while rendering this page.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    });

    test('calls onError prop when provided', () => {
        const onError = vi.fn();
        render(
            <ErrorBoundary onError={onError}>
                <Thrower shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ componentStack: expect.any(String) })
        );
    });

    test('supports custom title and message', () => {
        render(
            <ErrorBoundary title="Custom Title" message="Custom message text">
                <Thrower shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByRole('heading', { name: 'Custom Title' })).toBeInTheDocument();
        expect(screen.getByText('Custom message text')).toBeInTheDocument();
    });

    test('reload button triggers window.location.reload', () => {
        const reloadMock = vi.fn();
        Object.defineProperty(window, 'location', {
            value: { reload: reloadMock },
            writable: true,
        });

        render(
            <ErrorBoundary>
                <Thrower shouldThrow={true} />
            </ErrorBoundary>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));

        expect(reloadMock).toHaveBeenCalledTimes(1);
    });
});
