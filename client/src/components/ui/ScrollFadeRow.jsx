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
 */
const ScrollFadeRow = ({ className = '', children, ...props }) => {
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

        return () => {
            element.removeEventListener('scroll', update);
            if (resizeObserver) resizeObserver.disconnect();
        };
    }, []);

    return (
        <div ref={rowRef} className={`scroll-fade ${className}`.trim()} {...props}>
            {children}
        </div>
    );
};

export default ScrollFadeRow;
