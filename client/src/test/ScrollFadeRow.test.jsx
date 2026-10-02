import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ScrollFadeRow from '../components/ui/ScrollFadeRow';

const designSystemCss = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles/design-system.css'),
    'utf8',
);

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

    describe('hint nudge', () => {
        let scrollToMock;
        const savedDescriptors = {};

        const shadowPrototype = (name, descriptor) => {
            savedDescriptors[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
            Object.defineProperty(HTMLElement.prototype, name, { configurable: true, ...descriptor });
        };

        beforeEach(() => {
            vi.useFakeTimers();
            window.sessionStorage.clear();
            scrollToMock = vi.fn();
            // The nudge decision runs in the mount effect, so the metrics must
            // read scrollable before render.
            shadowPrototype('scrollTo', { writable: true, value: scrollToMock });
            shadowPrototype('scrollWidth', { get: () => 500 });
            shadowPrototype('clientWidth', { get: () => 300 });
            vi.stubGlobal('matchMedia', () => ({ matches: false }));
        });

        afterEach(() => {
            vi.useRealTimers();
            Object.entries(savedDescriptors).forEach(([name, original]) => {
                if (original) {
                    Object.defineProperty(HTMLElement.prototype, name, original);
                } else {
                    delete HTMLElement.prototype[name];
                }
            });
        });

        test('nudges once per session when scrollable at position 0', () => {
            const { unmount } = renderRow();

            expect(scrollToMock).toHaveBeenCalledTimes(1);
            expect(scrollToMock).toHaveBeenCalledWith({ left: 32, behavior: 'smooth' });
            expect(window.sessionStorage.getItem('scrollfade-hint-shown')).toBe('1');

            vi.advanceTimersByTime(500);
            expect(scrollToMock).toHaveBeenCalledTimes(2);
            expect(scrollToMock).toHaveBeenNthCalledWith(2, { left: 0, behavior: 'smooth' });
            unmount();
        });

        test('fires the nudge only once per session', () => {
            const { unmount } = renderRow();
            expect(scrollToMock).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(600);
            unmount();

            scrollToMock.mockClear();
            renderRow();
            expect(scrollToMock).not.toHaveBeenCalled();
        });

        test('does not nudge when prefers-reduced-motion is set', () => {
            vi.stubGlobal('matchMedia', () => ({ matches: true }));

            renderRow();

            expect(scrollToMock).not.toHaveBeenCalled();
            expect(window.sessionStorage.getItem('scrollfade-hint-shown')).toBeNull();
        });

        test('does not nudge when the row is not scrollable', () => {
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
                configurable: true,
                get: () => 600,
            });

            renderRow();

            expect(scrollToMock).not.toHaveBeenCalled();
        });

        test('does not nudge when hint={false}', () => {
            renderRow({ hint: false });

            expect(scrollToMock).not.toHaveBeenCalled();
            expect(window.sessionStorage.getItem('scrollfade-hint-shown')).toBeNull();
        });

        test('does not nudge when the session flag is already set', () => {
            window.sessionStorage.setItem('scrollfade-hint-shown', '1');

            renderRow();

            expect(scrollToMock).not.toHaveBeenCalled();
        });

        test('does not scroll back after unmount', () => {
            const { unmount } = renderRow();
            expect(scrollToMock).toHaveBeenCalledTimes(1);

            unmount();
            vi.advanceTimersByTime(600);

            expect(scrollToMock).toHaveBeenCalledTimes(1);
        });
    });

    test('fade CSS uses a 40px edge', () => {
        const fadeRules = designSystemCss.match(/\.scroll-fade\.is-scrollable[^{]*\{[^}]*\}/g);
        expect(fadeRules).toHaveLength(3);
        fadeRules.forEach((rule) => {
            expect(rule).toContain('40px');
            expect(rule).not.toContain('28px');
        });
    });
});
