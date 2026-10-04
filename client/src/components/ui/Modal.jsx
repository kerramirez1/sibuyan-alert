import { HiOutlineX } from 'react-icons/hi';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FOCUSABLE_SELECTOR } from '../../utils/focusableElements';
import { useClosingDelay } from '../../hooks/useClosingDelay';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true,
}) => {
    const titleId = useId();
    const closeButtonRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const contentRef = useRef(null);
    const previouslyFocusedRef = useRef(null);
    // Exit fade without framer-motion: when isOpen turns false the dialog
    // stays mounted for 150ms with the is-closing class (which swaps the
    // enter keyframes for exit keyframes), then unmounts.
    const { shouldRender, isClosing } = useClosingDelay(isOpen);
    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        full: 'max-w-4xl',
    };

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        previouslyFocusedRef.current = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        (closeButtonRef.current || contentRef.current)?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current();
            if (event.key !== 'Tab') return;

            const focusable = contentRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
            if (!focusable?.length) {
                event.preventDefault();
                contentRef.current?.focus();
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
            document.body.style.overflow = previousBodyOverflow;
            previouslyFocusedRef.current?.focus?.();
        };
    }, [isOpen]);

    const modalElement = (
        <>
            {shouldRender && (
                <div className={`modal-overlay${isClosing ? ' is-closing' : ''}`}>
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 overlay-fade-in"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Modal Content */}
                    <div
                        ref={contentRef}
                        tabIndex={-1}
                        className={`surface-panel relative w-full ${sizes[size]} max-h-[90dvh] overflow-hidden shadow-[var(--shadow-lg)] modal-panel-enter`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={title ? titleId : undefined}
                    >
                        {/* Header */}
                        {(title || showCloseButton) && (
                            <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
                                {title && (
                                    <h2 id={titleId} className="section-title">
                                        {title}
                                    </h2>
                                )}
                                {showCloseButton && (
                                    <button
                                        type="button"
                                        ref={closeButtonRef}
                                        onClick={onClose}
                                        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
                                        aria-label="Close modal"
                                    >
                                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Body */}
                        <div className="max-h-[calc(90dvh-5rem)] overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                            {children}
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    return typeof document !== 'undefined' ? createPortal(modalElement, document.body) : modalElement;
};

export default Modal;
