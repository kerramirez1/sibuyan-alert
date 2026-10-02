import { useEffect, useRef } from 'react';

/**
 * ScrollFadeRow — a horizontally scrollable row that reveals its
 * scrollability with an edge fade instead of a visible scrollbar.
 *
 * The wrapper forwards className and every other prop (aria-label, role,
 * tabIndex, …) to the scrollable div, and always renders the base
 * `scroll-fade` class. A ref + effect toggles three classes that the
 * `.scroll-fade` CSS rules in design-system.css turn into edge masks:
 *
 * - `is-scrollable` — content overflows (scrollWidth > clientWidth + 1)
 * - `is-at-start`   — scrolled all the way left (scrollLeft <= 1)
 * - `is-at-end`     — scrolled all the way right
 *
 * Recomputed on scroll (passive), on ResizeObserver of the element, and
 * once on mount. Mask, not an overlay, so it works on any background in
 * light/dark mode. Keep `no-scrollbar` on usages — the fade replaces the
 * scrollbar as the affordance, not alongside it.
 *
 * One-time nudge (`hint`, default true): when a scrollable row mounts at
 * position 0, it briefly scrolls right and back once per session so users
 * discover the row scrolls. Skipped for `prefers-reduced-motion`, when the
 * row isn't scrollable, after the first showing (sessionStorage), or when
 * the caller passes `hint={false}` (e.g. a row that already animates itself
 * into view on mount).
 */
const HINT_SESSION_KEY = 'scrollfade-hint-shown';
const HINT_NUDGE_PX = 32;
const HINT_RETURN_DELAY_MS = 500;

const readHintShown = () => {
    try {
        return window.sessionStorage.getItem(HINT_SESSION_KEY) === '1';
    } catch {
        return false;
    }
};

const markHintShown = () => {
    try {
        window.sessionStorage.setItem(HINT_SESSION_KEY, '1');
    } catch {
        // Storage unavailable (private mode): the nudge simply repeats next
        // mount rather than breaking the row.
    }
};

const prefersReducedMotion = () => {
    try {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

const ScrollFadeRow = ({ className = '', hint = true, children, ...props }) => {
    const rowRef = useRef(null);

    useEffect(() => {
        const element = rowRef.current;
        if (!element) return undefined;

        const update = () => {
            const { scrollWidth, clientWidth, scrollLeft } = element;
            element.classList.toggle('is-scrollable', scrollWidth > clientWidth + 1);
            element.classList.toggle('is-at-start', scrollLeft <= 1);
            element.classList.toggle('is-at-end', scrollLeft + clientWidth >= scrollWidth - 1);
        };

        update();
        element.addEventListener('scroll', update, { passive: true });

        let resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(update);
            resizeObserver.observe(element);
        }

        // One-time discoverability nudge. The scroll listener above calls
        // update(), so the fade classes follow the nudge automatically.
        let mounted = true;
        let returnTimer = null;
        const { scrollWidth, clientWidth, scrollLeft } = element;
        if (
            hint
            && typeof element.scrollTo === 'function'
            && scrollWidth > clientWidth + 1
            && scrollLeft <= 1
            && !prefersReducedMotion()
            && !readHintShown()
        ) {
            markHintShown();
            element.scrollTo({ left: HINT_NUDGE_PX, behavior: 'smooth' });
            returnTimer = setTimeout(() => {
                // Guard: the row may have unmounted while the timer waited.
                if (mounted && rowRef.current) {
                    rowRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                }
            }, HINT_RETURN_DELAY_MS);
        }

        return () => {
            mounted = false;
            if (returnTimer) clearTimeout(returnTimer);
            element.removeEventListener('scroll', update);
            if (resizeObserver) resizeObserver.disconnect();
        };
    }, [hint]);

    return (
        <div ref={rowRef} className={`scroll-fade ${className}`.trim()} {...props}>
            {children}
        </div>
    );
};

export default ScrollFadeRow;
