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
    // A 2px tone rule on the panel's leading edge. Callers that own a status
    // colour pass it so the panel carries the colour of the thing that opened
    // it; a caller that does not gets no rule.
    accentClassName = '',
    // The same tone as a dot beside the title. The rule sits at the far end of a
    // pane whose first screenful can be a long list, so once the reader has
    // scrolled past it the dot is what still says which set — which status, which
    // card — this pane is showing. Optional for the same reason the rule is: a
    // caller with no tone to carry prints neither.
    accentDotClassName = '',
    // Where a contextual panel belongs once the page has a column for it. See
    // `isDocked` below; passing no target leaves this component exactly as it
    // shipped.
    dockTarget = null,
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
    const [isMobileViewport, setIsMobileViewport] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia ? window.matchMedia('(max-width: 639px)').matches : false;
    });

    // Docked: a contextual panel with a box to live in, so it is not an overlay
    // at all — it is portalled into that box and fills it, the same space the
    // cards that opened it were standing in. Nothing moves: the box keeps its
    // width and its height, so the records neither overshoot the space they were
    // given nor shrink inside it, and the map beside them keeps its own column
    // untouched.
    //
    // A slot is offered at every width — below lg it is the card box, which is
    // the map's own height — so the pane docks at every width too. The bottom
    // sheet is now only for a contextual panel with no box to stand in, such as
    // the map's own inspector: it has no card box to fill, so it stays an
    // overlay over the map that opened it.
    //
    // Docked is also deliberately NOT modal. No backdrop, no scroll lock, no
    // focus trap: a reader who opens a metric's records can keep panning and
    // zooming the map those records are about, and nothing else on the page
    // stops responding. Escape is handled on the panel itself, so it only
    // closes while the reader is in it rather than from anywhere on the page.
    const isDocked = isContextual && Boolean(dockTarget);

    const touchStartY = useRef(null);
    const touchStartTime = useRef(0);
    // Tap on the drag handle fires touchend (delta ~0, no-op) then click (toggle once).
    // Swipe fires touchend (expand/collapse) AND a follow-up click — without this
    // guard the click toggles straight back, looking like a laggy flicker.
    const suppressNextToggleRef = useRef(false);

    const isMobileExpandedRef = useRef(isMobileExpanded);
    isMobileExpandedRef.current = isMobileExpanded;

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const mediaQuery = window.matchMedia('(max-width: 639px)');
        const handler = (e) => setIsMobileViewport(e.matches);
        setIsMobileViewport(mediaQuery.matches);
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
        mediaQuery.addListener(handler);
        return () => mediaQuery.removeListener(handler);
    }, []);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const isExpandedMobileSheet = isMobileViewport && isMobileExpanded;

    // Sheet height follows the user's choice within one open session (e.g.
    // incident list -> incident details keeps the expanded sheet). Fresh panel
    // mounts always start compact via the useState(false) initial value above,
    // so no reset is needed when contentKey/title change.

    useEffect(() => {
        previousFocusRef.current = document.activeElement;
        // A docked panel neither takes focus nor traps it: the card that opened
        // it keeps the reader's place, and the map beside it stays usable.
        if (isDocked) return undefined;
        // Skip autofocus on small screens: focusing the close button forces the
        // mobile browser to scroll/zoom, which reads as an expand lag.
        const isSmallScreen = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 639px)').matches;
        if (!isSmallScreen) closeButtonRef.current?.focus({ preventScroll: true });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (isContextual && isMobileViewport && isMobileExpandedRef.current) {
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
    }, [isContextual, isDocked, isMobileViewport]);

    // Handle body scroll lock. A docked panel holds no lock: the page beside it
    // is the page the reader is still working on.
    useEffect(() => {
        if (isDocked) return undefined;
        if (!isContextual || isExpandedMobileSheet) {
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previousOverflow;
            };
        }
        return undefined;
    }, [isContextual, isDocked, isExpandedMobileSheet]);

    useEffect(() => {
        if (isContextual && !panelRef.current?.contains(document.activeElement)) {
            previousFocusRef.current = document.activeElement;
        }
        // Same no-autofocus rule on content switches (list -> details) so the
        // sheet never yanks focus mid-gesture on mobile.
        const isSmallScreen = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 639px)').matches;
        if (!isSmallScreen && !isDocked) closeButtonRef.current?.focus({ preventScroll: true });
    }, [isContextual, isDocked, title]);

    useLayoutEffect(() => {
        if (scrollRegionRef.current) scrollRegionRef.current.scrollTop = 0;
    }, [contentKey, title]);

    const handleTouchStart = (e) => {
        if (e.touches && e.touches[0]) {
            touchStartY.current = e.touches[0].clientY;
            touchStartTime.current = Date.now();
        }
    };

    const handleTouchEnd = (e) => {
        if (touchStartY.current === null) return;
        const touchEndY = e.changedTouches[0]?.clientY;
        if (typeof touchEndY !== 'number') return;
        const deltaY = touchEndY - touchStartY.current;
        touchStartY.current = null;

        if (deltaY < -35) {
            // Swiped up -> expand (suppress the click that follows a swipe)
            suppressNextToggleRef.current = true;
            setIsMobileExpanded(true);
        } else if (deltaY > 35) {
            // Swiped down -> collapse to peek if expanded, or close if already peek
            suppressNextToggleRef.current = true;
            if (isMobileExpanded) {
                setIsMobileExpanded(false);
            } else {
                onCloseRef.current?.();
            }
        }
    };

    const handleToggleExpand = () => {
        if (suppressNextToggleRef.current) {
            suppressNextToggleRef.current = false;
            return;
        }
        setIsMobileExpanded((prev) => !prev);
    };

    const widthClass = size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
    if (typeof document === 'undefined') return null;

    const panel = (
        <section
            id={id}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal={isContextual
                ? (isExpandedMobileSheet ? 'true' : undefined)
                : 'true'}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            onKeyDown={isDocked
                ? (event) => {
                    if (event.key !== 'Escape') return;
                    event.stopPropagation();
                    onCloseRef.current?.();
                }
                : undefined}
            className={isDocked
                ? 'pane-enter relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl bg-white ring-1 ring-gray-200/80 dark:bg-[#0c1813]/90 dark:ring-white/10'
                : isContextual
                ? `pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden bg-white shadow-xl max-sm:backdrop-blur-none sm:bg-white/95 sm:backdrop-blur-md dark:bg-[#0c1813] sm:dark:bg-[#0c1813]/95 dark:border-white/10
                   max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[80] max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] max-sm:rounded-t-2xl max-sm:border-t max-sm:border-gray-200/90 max-sm:shadow-2xl
                   max-sm:transition-[height] max-sm:duration-200 max-sm:ease-out motion-reduce:max-sm:transition-none max-sm:will-change-[height] max-sm:[contain:layout_style]
                   sm:translate-y-0 sm:transition-none sm:h-auto sm:max-h-[calc(100%-2rem)] sm:w-[min(24rem,42%)] sm:rounded-2xl sm:border sm:border-gray-200/90 ${widthClass}
                    ${isMobileExpanded ? 'max-sm:h-[88dvh]' : 'max-sm:h-[38dvh]'}`
                : `relative flex max-h-[calc(100dvh-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white/95 shadow-2xl backdrop-blur-md sm:h-auto sm:max-h-[calc(100dvh-2rem)] dark:border-white/10 dark:bg-[#0c1813]/95 ${widthClass}`}
        >
            {/* The selected card's own tone, carried onto the panel's leading
                edge: the card that opened these records and the records
                themselves are one thing, and on a screen where the panel is a
                dialog at the far right the colour is what still says so. */}
            {accentClassName && (
                <span
                    aria-hidden="true"
                    className={`h-[2px] w-full shrink-0 ${accentClassName}`}
                />
            )}
            {/* Mobile Drag Handle */}
            {isContextual && !isDocked && (
                <div
                    className="flex cursor-grab touch-none flex-col items-center justify-center pt-2.5 pb-1 sm:hidden active:cursor-grabbing"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onClick={handleToggleExpand}
                    aria-hidden="true"
                >
                    <div className="h-1.5 w-12 rounded-full bg-gray-300 transition-colors dark:bg-white/20" />
                </div>
            )}

            <header
                className="flex shrink-0 flex-col border-b border-gray-200/80 bg-gray-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03] sm:px-5 max-sm:cursor-pointer select-none"
                onClick={(e) => {
                    if (isContextual && !isDocked && isMobileViewport && !e.defaultPrevented) {
                        handleToggleExpand();
                    }
                }}
                onTouchStart={isContextual && !isDocked ? handleTouchStart : undefined}
                onTouchEnd={isContextual && !isDocked ? handleTouchEnd : undefined}
            >
                {/* Heading and description set the panel's hierarchy: the title is
                    the subject, the description is one sentence of context. The
                    description is sentence case on purpose — it carries full
                    sentences ("3 active: 1 responding, 2 waiting…"), and setting
                    them in the uppercase tracking that suits a two-word label
                    turned the panel's context into a wall of capitalised text
                    that read as a second heading. */}
                {/* Row 1: the subject on the left, the controls on the right. */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
                        {accentDotClassName && (
                            <span
                                aria-hidden="true"
                                className={`h-2 w-2 shrink-0 rounded-full ${accentDotClassName}`}
                            />
                        )}
                        <h2 id={titleId} className="min-w-0 font-display text-[15px] font-semibold leading-snug tracking-tight text-gray-950 sm:text-base dark:text-white break-words">
                            {title}
                        </h2>
                    </div>

                    <div
                        className="flex shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                    >
                        {/* Expand/Collapse Toggle on Mobile */}
                        {isContextual && !isDocked && (
                            <button
                                type="button"
                                onClick={handleToggleExpand}
                                className="flex h-10 w-10 sm:hidden shrink-0 items-center justify-center rounded-xl border border-transparent text-gray-500 transition-colors hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-400 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white cursor-pointer"
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
                            className="flex h-10 w-10 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-colors hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white cursor-pointer"
                            aria-label={closeLabel}
                        >
                            <HiOutlineX className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Row 2, and it is a row of the header itself, not a cell of
                    row 1: the close button is a cell of row 1 and of nothing
                    else, so its box no longer takes ~50px off every line of a
                    sentence that has nothing to do with it. Full width of the
                    header's own content box (the padding above and beside this
                    row is the header's), so the description wraps where the
                    sentence does, and the header grows by the lines it took. */}
                {description && (
                    // 12px at gray-600 rather than 11px at gray-500: this line
                    // carries whole sentences ("3 active: 1 responding, 2
                    // waiting (1 transferred). Pending is counted separately.")
                    // and is read as the pane's context, so it is set for
                    // reading — one step below the title in size, one step
                    // above the supporting text inside the pane below it.
                    <p id={descriptionId} className="mt-1 w-full text-xs leading-relaxed text-gray-600 dark:text-gray-500 break-words">
                        {description}
                    </p>
                )}
            </header>

            {/* `scrollbar-gutter: stable` so the pane's content does not shift
                sideways the moment a long list starts to scroll: the reader is
                reading a column of rows, and a 6px jump mid-list reads as the
                rows moving rather than as a scrollbar arriving. */}
            <div
                ref={scrollRegionRef}
                data-testid="map-overlay-scroll-region"
                className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
                {children}
            </div>
        </section>
    );

    // Docked comes first, and that ordering is the whole feature: a docked
    // panel IS contextual, so testing `isContextual` first would send it down
    // the overlay path below and back across the map. The overlay wrapper is
    // only ever for a contextual panel with no column to live in.
    if (isDocked) {
        return createPortal(panel, dockTarget);
    }

    if (isContextual) {
        if (isMobileViewport) {
            return createPortal(
                <div className="pointer-events-none fixed inset-0 z-[80] flex items-end justify-center">
                    {isExpandedMobileSheet && (
                        <div
                            className="fixed inset-0 z-[75] bg-black/35 transition-opacity duration-200 sm:hidden pointer-events-auto"
                            onClick={() => setIsMobileExpanded(false)}
                            aria-hidden="true"
                        />
                    )}
                    {panel}
                </div>,
                document.body,
            );
        }

        return (
            <div className="pointer-events-none absolute inset-0 z-[40] flex items-end justify-end p-0 sm:items-start sm:p-4 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[80]">
                {isExpandedMobileSheet && (
                    <div
                        className="fixed inset-0 z-[75] bg-black/35 transition-opacity duration-200 sm:hidden pointer-events-auto"
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
