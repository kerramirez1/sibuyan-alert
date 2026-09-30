import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import VerifiedReporterBadge from '../components/ui/VerifiedReporterBadge';

describe('VerifiedReporterBadge', () => {
    test('renders with accessible role, title, and aria-label', () => {
        render(<VerifiedReporterBadge />);

        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('title', 'Verified reporter');
        expect(badge).toHaveAttribute('aria-label', 'Verified reporter');
    });

    test('supports accessible querying by role, label, title, and text', () => {
        render(<VerifiedReporterBadge />);

        // Screen readers and testing queries find "Verified reporter"
        expect(screen.getByRole('status', { name: 'Verified reporter' })).toBeInTheDocument();
        expect(screen.getByLabelText('Verified reporter')).toBeInTheDocument();
        expect(screen.getByTitle('Verified reporter')).toBeInTheDocument();
        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.getByText(/verified/i)).toBeInTheDocument();
    });

    test('renders small variant for compact placements', () => {
        render(<VerifiedReporterBadge size="sm" />);

        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toHaveClass('text-[10px]');
        expect(badge).toHaveClass('shrink-0');
    });

    test('renders sidebar variant tailored for dark layout navigation', () => {
        render(<VerifiedReporterBadge size="sm" variant="sidebar" />);

        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toHaveClass('border-emerald-400/20', 'bg-emerald-400/10', 'text-emerald-300');
    });

    test('renders default styling for standard light/dark pages', () => {
        render(<VerifiedReporterBadge />);

        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toHaveClass('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
        expect(badge.className).toContain('dark:text-emerald-300');
    });

    test('renders md size when explicitly requested', () => {
        render(<VerifiedReporterBadge size="md" />);

        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toHaveClass('text-xs');
    });
});
