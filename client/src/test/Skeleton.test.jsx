import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Skeleton, {
    SkeletonText,
    SkeletonCircle,
    SkeletonButton,
    SkeletonCard,
    SkeletonRow,
    SkeletonTable,
    SkeletonThumbnail,
    PageSkeleton,
} from '../components/ui/Skeleton';

describe('Skeleton UI Component & Primitives', () => {
    test('renders base Skeleton with status role, aria-busy, and pulse animation', () => {
        render(<Skeleton label="Loading item" className="h-6 w-32" />);

        const skeleton = screen.getByRole('status', { name: 'Loading item' });
        expect(skeleton).toBeInTheDocument();
        expect(skeleton).toHaveAttribute('aria-busy', 'true');
        expect(skeleton).toHaveClass('motion-safe:animate-pulse', 'motion-reduce:animate-none');
        expect(skeleton).toHaveClass('bg-gray-200/80');
    });

    test('renders SkeletonText with multiple lines and varied last line width', () => {
        const { container } = render(
            <SkeletonText lines={3} label="Loading text block" lastLineWidth="60%" />
        );

        const containerStatus = screen.getByRole('status', { name: 'Loading text block' });
        expect(containerStatus).toBeInTheDocument();

        const lines = container.querySelectorAll('.motion-safe\\:animate-pulse');
        expect(lines).toHaveLength(3);
        expect(lines[2]).toHaveStyle({ width: '60%' });
    });

    test('renders SkeletonCircle for avatar and badge placeholders', () => {
        render(<SkeletonCircle size="h-12 w-12" label="Loading avatar" />);

        const circle = screen.getByRole('status', { name: 'Loading avatar' });
        expect(circle).toHaveClass('rounded-full', 'h-12', 'w-12', 'shrink-0');
    });

    test('renders SkeletonButton for action placeholders', () => {
        render(<SkeletonButton size="h-9 w-28" label="Loading action" />);

        const button = screen.getByRole('status', { name: 'Loading action' });
        expect(button).toHaveClass('h-9', 'w-28', 'rounded-lg');
    });

    test('renders SkeletonCard with application styling and children', () => {
        render(
            <SkeletonCard label="Loading card container">
                <div data-testid="card-child">Card content placeholder</div>
            </SkeletonCard>
        );

        const card = screen.getByRole('status', { name: 'Loading card container' });
        expect(card).toHaveClass('surface-panel');
        expect(screen.getByTestId('card-child')).toBeInTheDocument();
    });

    test('renders SkeletonRow with optional avatar and trailing action button', () => {
        render(<SkeletonRow hasAvatar trailingAction label="Loading list row" />);

        const row = screen.getByRole('status', { name: 'Loading list row' });
        expect(row).toBeInTheDocument();
        expect(row.querySelector('.rounded-full')).toBeInTheDocument();
    });

    test('renders SkeletonTable with specified columns and rows', () => {
        render(<SkeletonTable columns={4} rows={3} label="Loading reports table" />);

        const table = screen.getByRole('status', { name: 'Loading reports table' });
        expect(table).toBeInTheDocument();
        expect(table.querySelectorAll('thead th')).toHaveLength(4);
        expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
    });

    test('renders SkeletonThumbnail with aspect ratio', () => {
        render(<SkeletonThumbnail aspectRatio="aspect-video" sizeClasses="w-48" label="Loading photo" />);

        const thumbnail = screen.getByRole('status', { name: 'Loading photo' });
        expect(thumbnail).toHaveClass('aspect-video', 'w-48');
    });

    test('renders PageSkeleton with canonical header, metric cards, and content structure', () => {
        render(<PageSkeleton label="Loading incident reports page" metricCount={4} />);

        const page = screen.getByRole('status', { name: 'Loading incident reports page' });
        expect(page).toBeInTheDocument();
        expect(screen.getByText('Loading incident reports page')).toHaveClass('sr-only');
    });
});
