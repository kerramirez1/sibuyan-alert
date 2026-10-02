import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ScrollFadeRow from '../components/ui/ScrollFadeRow';

// jsdom reports 0 for scroll metrics; define them per-test on the element.
const setScrollMetrics = (element, { scrollWidth, clientWidth, scrollLeft }) => {
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
    Object.defineProperty(element, 'scrollLeft', { configurable: true, value: scrollLeft, writable: true });
};

let resizeCallbacks;
let disconnectSpy;

beforeEach(() => {
    resizeCallbacks = [];
    disconnectSpy = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback) {
            this.callback = callback;
        }
        observe() {
            resizeCallbacks.push(this.callback);
        }
        disconnect() {
            disconnectSpy();
        }
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const renderRow = (props = {}) => render(
    <ScrollFadeRow aria-label="Chip row" {...props}>
        <span>chip one</span>
        <span>chip two</span>
    </ScrollFadeRow>,
);

describe('ScrollFadeRow', () => {
    test('renders the scroll-fade base class and forwards className and props', () => {
        renderRow({ className: 'my-row', role: 'toolbar', tabIndex: 0 });

        const row = screen.getByLabelText('Chip row');
        expect(row).toHaveClass('scroll-fade', 'my-row');
        expect(row).toHaveAttribute('role', 'toolbar');
        expect(row).toHaveAttribute('tabindex', '0');
        expect(row).toHaveTextContent('chip one');
    });

    test('marks a non-overflowing row as not scrollable', () => {
        renderRow();
        const row = screen.getByLabelText('Chip row');

        setScrollMetrics(row, { scrollWidth: 200, clientWidth: 300, scrollLeft: 0 });
        fireEvent.scroll(row);

        expect(row).not.toHaveClass('is-scrollable');
    });

    test('marks a scrollable row at the start with a trailing fade only', () => {
        renderRow();
        const row = screen.getByLabelText('Chip row');

        setScrollMetrics(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 });
        fireEvent.scroll(row);

        expect(row).toHaveClass('is-scrollable', 'is-at-start');
        expect(row).not.toHaveClass('is-at-end');
    });

    test('marks a scrollable row in the middle with fades on both edges', () => {
        renderRow();
        const row = screen.getByLabelText('Chip row');

        setScrollMetrics(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 100 });
        fireEvent.scroll(row);

        expect(row).toHaveClass('is-scrollable');
        expect(row).not.toHaveClass('is-at-start');
        expect(row).not.toHaveClass('is-at-end');
    });

    test('marks a scrollable row at the end with a leading fade only', () => {
        renderRow();
        const row = screen.getByLabelText('Chip row');

        setScrollMetrics(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 200 });
        fireEvent.scroll(row);

        expect(row).toHaveClass('is-scrollable', 'is-at-end');
        expect(row).not.toHaveClass('is-at-start');
    });

    test('updates the fade classes as the row scrolls', () => {
        renderRow();
        const row = screen.getByLabelText('Chip row');
        setScrollMetrics(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 });
        fireEvent.scroll(row);
        expect(row).toHaveClass('is-at-start');

        row.scrollLeft = 120;
        fireEvent.scroll(row);
        expect(row).not.toHaveClass('is-at-start');
        expect(row).not.toHaveClass('is-at-end');

        row.scrollLeft = 200;
        fireEvent.scroll(row);
        expect(row).toHaveClass('is-at-end');
    });

    test('recomputes on resize and cleans up on unmount', () => {
        const { unmount } = renderRow();
        const row = screen.getByLabelText('Chip row');
        expect(resizeCallbacks).toHaveLength(1);

        // Content grew past the viewport: the resize callback picks it up.
        setScrollMetrics(row, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
        resizeCallbacks.forEach((callback) => callback());
        expect(row).toHaveClass('is-scrollable', 'is-at-start');

        unmount();
        expect(disconnectSpy).toHaveBeenCalled();
    });
});
