import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX } from 'react-icons/hi';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const MapOverlayPanel = ({
    id,
    title,
    description,
    onClose,
    children,
    size = 'md',
    presentation = 'modal',
    closeLabel = 'Close incident panel',
    contentKey,
}) => {
    const titleId = useId();
    const descriptionId = useId();
    const panelRef = useRef(null);
    const scrollRegionRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previousFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const isContextual = presentation === 'contextual';

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        if (!isContextual) document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current?.();
                return;
            }

            if (isContextual || event.key !== 'Tab') return;
            const focusable = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
            if (!focusable.length) {
                event.preventDefault();
                panelRef.current?.focus();
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
            if (!isContextual) document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [isContextual]);

    useEffect(() => {
        if (isContextual && !panelRef.current?.contains(document.activeElement)) {
            previousFocusRef.current = document.activeElement;
        }
        closeButtonRef.current?.focus();
    }, [isContextual, title]);

    useLayoutEffect(() => {
        if (scrollRegionRef.current) scrollRegionRef.current.scrollTop = 0;
    }, [contentKey, title]);

    const widthClass = size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
    if (typeof document === 'undefined') return null;

    const panel = (
        <section
            id={id}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal={isContextual ? undefined : 'true'}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={isContextual
                ? `pointer-events-auto flex max-h-[75%] min-h-0 w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900 sm:max-h-full sm:w-[min(24rem,42%)] ${widthClass}`
                : `relative flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] min-h-0 w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl ${widthClass}`}
        >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
                <div className="min-w-0 py-0.5">
                    <h2 id={titleId} className="truncate text-base font-display font-bold text-gray-950 sm:text-lg dark:text-white">
                        {title}
                    </h2>
                    {description && (
                        <p id={descriptionId} className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {description}
                        </p>
                    )}
                </div>
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => onCloseRef.current?.()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:bg-gray-800 dark:hover:text-white"
                    aria-label={closeLabel}
                >
                    <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                </button>
            </header>

            <div
                ref={scrollRegionRef}
                data-testid="map-overlay-scroll-region"
                className={`min-h-0 flex-1 overflow-y-auto ${isContextual ? '' : 'overscroll-contain'}`}
            >
                {children}
            </div>
        </section>
    );

    if (isContextual) {
        return (
            <div className="pointer-events-none absolute inset-0 z-[40] flex items-end justify-end p-2 sm:items-start sm:p-3">
                {panel}
            </div>
        );
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-2 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCloseRef.current?.();
            }}
        >
            {panel}
        </div>,
        document.body,
    );
};

export default MapOverlayPanel;
