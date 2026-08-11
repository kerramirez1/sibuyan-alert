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
        closeButtonRef.current?.focus({ preventScroll: true });

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
            previousFocusRef.current?.focus?.({ preventScroll: true });
        };
    }, [isContextual]);

    useEffect(() => {
        if (isContextual && !panelRef.current?.contains(document.activeElement)) {
            previousFocusRef.current = document.activeElement;
        }
        closeButtonRef.current?.focus({ preventScroll: true });
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
                ? `pointer-events-auto flex max-h-[calc(100%-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-sm border-2 border-gray-300 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:max-h-[calc(100%-2rem)] sm:w-[min(24rem,42%)] ${widthClass}`
                : `relative flex max-h-[calc(100dvh-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-sm border-2 border-gray-300 bg-white shadow-xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] dark:border-gray-700 dark:bg-gray-800 ${widthClass}`}
        >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 sm:px-5">
                <div className="min-w-0 py-0.5">
                    <h2 id={titleId} className="truncate text-sm font-bold uppercase tracking-wider text-gray-950 sm:text-base dark:text-white">
                        {title}
                    </h2>
                    {description && (
                        <p id={descriptionId} className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {description}
                        </p>
                    )}
                </div>
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => onCloseRef.current?.()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-transparent text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                    aria-label={closeLabel}
                >
                    <HiOutlineX className="h-4 w-4" aria-hidden="true" />
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
            <div className="pointer-events-none absolute inset-0 z-[40] flex items-end justify-end p-3 sm:items-start sm:p-4">
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
