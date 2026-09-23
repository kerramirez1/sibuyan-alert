import { useEffect, useRef } from 'react';
import { getFocusableElements } from '../utils/focusableElements';

/**
 * Keyboard and focus behavior for a portaled dialog or bottom sheet.
 *
 * Every dialog in this app is rendered into `document.body`, so "modal" here
 * means the four things a screen-reader user actually depends on:
 *
 * 1. focus moves into the dialog when it opens (otherwise the dialog is open
 *    but the next Tab walks the page behind it),
 * 2. Tab and Shift+Tab cycle inside it,
 * 3. Escape closes it,
 * 4. focus returns to whatever opened it.
 *
 * Callers keep their own markup and animation; this hook only moves focus, so
 * the same dialog semantics cannot drift between surfaces.
 *
 * @param {object}   options
 * @param {boolean}  options.isOpen            Whether the dialog is mounted.
 * @param {Function} options.onClose           Called on Escape. Read through a
 *                                             ref, so an inline arrow function
 *                                             does not re-run the effect.
 * @param {object}   options.containerRef      Ref to the dialog element.
 * @param {object}   [options.restoreFocusRef] Element to focus on close.
 *                                             Defaults to whatever was focused
 *                                             before the dialog opened.
 * @param {boolean}  [options.lockScroll]      Also freeze `body` scrolling.
 *                                             Off by default: this app scrolls
 *                                             an inner `<main>`, so locking the
 *                                             body would not stop it — and on a
 *                                             sheet it would only hide the
 *                                             address bar for no benefit.
 */
const useDialogA11y = ({
    isOpen,
    onClose,
    containerRef,
    restoreFocusRef,
    lockScroll = false,
}) => {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const previouslyFocused = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        if (lockScroll) document.body.style.overflow = 'hidden';

        const container = containerRef?.current;
        const initialFocus = getFocusableElements(container)[0] || container;
        initialFocus?.focus?.({ preventScroll: true });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current?.();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = getFocusableElements(containerRef?.current);
            if (focusable.length === 0) {
                event.preventDefault();
                containerRef?.current?.focus?.({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (lockScroll) document.body.style.overflow = previousOverflow;
            const restoreTarget = restoreFocusRef?.current || previouslyFocused;
            restoreTarget?.focus?.({ preventScroll: true });
        };
    }, [isOpen, containerRef, restoreFocusRef, lockScroll]);
};

export default useDialogA11y;
