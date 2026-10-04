import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Modal from '../components/ui/Modal';

describe('Modal CSS enter/exit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('renders the dialog with enter classes while open', () => {
        render(
            <Modal isOpen onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveClass('modal-panel-enter');
        expect(dialog.closest('.modal-overlay')).not.toHaveClass('is-closing');
        expect(dialog.closest('.modal-overlay')?.querySelector('.overlay-fade-in')).toBeInTheDocument();
    });

    test('does not render on initial mount when closed', () => {
        render(
            <Modal isOpen={false} onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('stays mounted ~150ms after close for the exit fade, then unmounts', async () => {
        const { rerender } = render(
            <Modal isOpen onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        rerender(
            <Modal isOpen={false} onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );

        // Still mounted immediately so the exit keyframes can play.
        const dialog = screen.getByRole('dialog');
        expect(dialog.closest('.modal-overlay')).toHaveClass('is-closing');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(149);
        });
        expect(screen.queryByRole('dialog')).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('reopening mid-close cancels the unmount', async () => {
        const { rerender } = render(
            <Modal isOpen onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );

        rerender(
            <Modal isOpen={false} onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );
        expect(screen.getByRole('dialog').closest('.modal-overlay')).toHaveClass('is-closing');

        rerender(
            <Modal isOpen onClose={() => {}} title="Test modal">
                <p>Body</p>
            </Modal>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog.closest('.modal-overlay')).not.toHaveClass('is-closing');
    });
});
