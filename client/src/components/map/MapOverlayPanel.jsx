import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineChevronDown,
    HiOutlineChevronUp,
    HiOutlineX,
} from 'react-icons/hi';

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

    const [isMobileExpanded, setIsMobileExpanded] = useState(false);
    const touchStartY = useRef(null);

    const isMobileExpandedRef = useRef(isMobileExpanded);
    isMobileExpandedRef.current = isMobileExpanded;

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // Reset mobile expansion when switching content/incidents
    useEffect(() => {
        setIsMobileExpanded(false);
    }, [contentKey, title]);

    useEffect(() => {
        previousFocusRef.current = document.activeElement;
        closeButtonRef.current?.focus({ preventScroll: true });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (isContextual && isMobileExpandedRef.current) {
                    setIsMobileExpanded(false);
                } else {
                    onCloseRef.current?.();
                }
                return;
            }

            if ((isContextual && !isMobileExpandedRef.current) || event.key !== 'Tab') return;
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
            previousFocusRef.current?.focus?.({ preventScroll: true });
        };
    }, [isContextual]);

    // Handle body scroll lock
    useEffect(() => {
        if (!isContextual || isMobileExpanded) {
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previousOverflow;
            };
        }
        return undefined;
    }, [isContextual, isMobileExpanded]);

    useEffect(() => {
        if (isContextual && !panelRef.current?.contains(document.activeElement)) {
            previousFocusRef.current = document.activeElement;
        }
        closeButtonRef.current?.focus({ preventScroll: true });
    }, [isContextual, title]);

    useLayoutEffect(() => {
        if (scrollRegionRef.current) scrollRegionRef.current.scrollTop = 0;
    }, [contentKey, title]);

    const handleTouchStart = (e) => {
        if (e.touches && e.touches[0]) {
            touchStartY.current = e.touches[0].clientY;
        }
    };

    const handleTouchEnd = (e) => {
        if (touchStartY.current === null) return;
        const touchEndY = e.changedTouches[0]?.clientY;
        if (typeof touchEndY !== 'number') return;
        const deltaY = touchEndY - touchStartY.current;
        touchStartY.current = null;

        if (deltaY < -35) {
            // Swiped up -> expand
            setIsMobileExpanded(true);
        } else if (deltaY > 35) {
            // Swiped down -> collapse to peek if expanded, or close if already peek
            if (isMobileExpanded) {
                setIsMobileExpanded(false);
            } else {
                onCloseRef.current?.();
            }
        }
    };

    const widthClass = size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
    if (typeof document === 'undefined') return null;

    const panel = (
        <section
            id={id}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal={isContextual ? (isMobileExpanded ? 'true' : undefined) : 'true'}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={isContextual
                ? `pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden bg-white/95 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95
                   max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[80] max-sm:rounded-t-2xl max-sm:border-t max-sm:border-gray-200/90 max-sm:shadow-2xl max-sm:transition-[height,max-height] max-sm:duration-300 max-sm:ease-out
                   sm:max-h-[calc(100%-2rem)] sm:w-[min(24rem,42%)] sm:rounded-2xl sm:border sm:border-gray-200/90 ${widthClass}
                   ${isMobileExpanded ? 'max-sm:h-[90vh] max-sm:max-h-[92vh]' : 'max-sm:h-[40vh] max-sm:max-h-[42vh]'}`
                : `relative flex max-h-[calc(100dvh-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white/95 shadow-2xl backdrop-blur-md sm:h-auto sm:max-h-[calc(100dvh-2rem)] dark:border-white/10 dark:bg-[#0c1813]/95 ${widthClass}`}
        >
            {/* Mobile Drag Handle */}
            {isContextual && (
                <div
                    className="flex cursor-grab touch-none flex-col items-center justify-center pt-2.5 pb-1 sm:hidden active:cursor-grabbing"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onClick={() => setIsMobileExpanded((prev) => !prev)}
                    aria-hidden="true"
                >
                    <div className="h-1.5 w-12 rounded-full bg-gray-300 transition-colors dark:bg-white/20" />
                </div>
            )}

            <header
                className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200/80 bg-gray-50/50 px-4 py-2.5 sm:py-3 dark:border-white/10 dark:bg-white/[0.02] sm:px-5"
                onTouchStart={isContextual ? handleTouchStart : undefined}
                onTouchEnd={isContextual ? handleTouchEnd : undefined}
            >
                <div className="min-w-0 py-0.5">
                    <h2 id={titleId} className="truncate font-display text-sm font-bold uppercase tracking-wider text-gray-950 sm:text-base dark:text-white">
                        {title}
                    </h2>
                    {description && (
                        <p id={descriptionId} className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {description}
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    {/* Expand/Collapse Toggle on Mobile */}
                    {isContextual && (
                        <button
                            type="button"
                            onClick={() => setIsMobileExpanded((prev) => !prev)}
                            className="flex h-9 w-9 sm:hidden shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-500 transition-colors hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-400 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
                            aria-label={isMobileExpanded ? 'Collapse incident details' : 'Expand incident details'}
                            aria-expanded={isMobileExpanded}
                        >
                            {isMobileExpanded ? (
                                <HiOutlineChevronDown className="h-5 w-5" aria-hidden="true" />
                            ) : (
                                <HiOutlineChevronUp className="h-5 w-5" aria-hidden="true" />
                            )}
                        </button>
                    )}

                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={() => onCloseRef.current?.()}
                        className="flex h-9 w-9 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 transition-colors hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
                        aria-label={closeLabel}
                    >
                        <HiOutlineX className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
                    </button>
                </div>
            </header>

            <div
                ref={scrollRegionRef}
                data-testid="map-overlay-scroll-region"
                className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto ${isContextual ? '' : 'overscroll-contain'}`}
            >
                {children}
            </div>
        </section>
    );

    if (isContextual) {
        return (
            <div className="pointer-events-none absolute inset-0 z-[40] flex items-end justify-end p-3 sm:items-start sm:p-4">
                {isMobileExpanded && (
                    <div
                        className="fixed inset-0 z-[75] bg-black/25 backdrop-blur-[1px] transition-opacity duration-200 sm:hidden pointer-events-auto"
                        onClick={() => setIsMobileExpanded(false)}
                        aria-hidden="true"
                    />
                )}
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
