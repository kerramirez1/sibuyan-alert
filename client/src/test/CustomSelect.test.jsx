import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CustomSelect from '../components/ui/CustomSelect';

/**
 * The dropdown's placement.
 *
 * The menu is absolutely positioned inside the caller's container, so it cannot
 * escape a scroll area — it can only be clipped by one. These cases pin down the
 * rule that decides which side it opens on, because the failure it prevents
 * (options outside the visible box, so nothing to click) is invisible to every
 * assertion about state: the value would still be correct, only unreachable.
 */

const OPTIONS = [
    { value: 'landslide_prone', label: 'Landslide Prone', dot: 'bg-amber-500' },
    { value: 'accident_prone', label: 'Accident Prone', dot: 'bg-red-500' },
    { value: 'other', label: 'Other Hazard', dot: 'bg-gray-500' },
];

const rect = (top, bottom, left = 0, right = 200) => ({
    top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top,
    toJSON() { return this; },
});

// jsdom lays nothing out, so both the boxes and the menu's own height have to be
// handed to the component for the room check to have anything to measure. The
// menu is identified by the role it will always have.
const withGeometry = ({ clip, trigger, menuHeight }) => {
    const originalRect = Element.prototype.getBoundingClientRect;
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

    Element.prototype.getBoundingClientRect = function rectOf() {
        if (this.getAttribute('data-testid') === 'scroller') return rect(...clip);
        if (this.getAttribute('aria-haspopup') === 'listbox') return rect(...trigger);
        return rect(0, 768);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.getAttribute('role') === 'listbox' ? menuHeight : 0; },
    });

    return () => {
        Element.prototype.getBoundingClientRect = originalRect;
        if (originalOffsetHeight) {
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
        } else {
            delete HTMLElement.prototype.offsetHeight;
        }
    };
};

const renderInScroller = (opts = {}) => {
    const restore = withGeometry({
        clip: opts.clip ?? [100, 700],
        trigger: opts.trigger ?? [300, 336],
        menuHeight: opts.menuHeight ?? 140,
    });
    render(
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
            <CustomSelect
                value=""
                onChange={vi.fn()}
                options={OPTIONS}
                ariaLabel="Zone type"
                placeholder="Select a zone type"
                className="w-full"
            />
        </div>,
    );
    return restore;
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('CustomSelect menu placement', () => {
    test('opens below the trigger when the room below can hold it', async () => {
        const restore = renderInScroller({ clip: [100, 700], trigger: [300, 336], menuHeight: 140 });
        try {
            fireEvent.click(screen.getByRole('button', { name: /Select a zone type/i }));

            const menu = await screen.findByRole('listbox', { name: 'Zone type' });
            // 700 - 336 - 6 = 358px of room for a 140px menu: plenty, and the
            // familiar downward menu is what every caller gets.
            expect(menu.className).toContain('mt-1.5');
            expect(menu.className).not.toContain('bottom-full');
        } finally {
            restore();
        }
    });

    test('opens upward when the room below cannot, instead of being clipped away', async () => {
        // The trigger sits 24px above the bottom edge of the scroll area — less
        // than the menu needs, which is exactly the case that leaves a caller's
        // options unreachable if the menu insists on opening downward.
        const restore = renderInScroller({ clip: [100, 360], trigger: [300, 336], menuHeight: 140 });
        try {
            fireEvent.click(screen.getByRole('button', { name: /Select a zone type/i }));

            const menu = await screen.findByRole('listbox', { name: 'Zone type' });
            expect(menu.className).toContain('bottom-full');
            expect(menu.className).not.toContain('mt-1.5');

            // And it is still the same menu: the options are clickable, and
            // choosing one is what the component is for.
            fireEvent.click(within(menu).getByRole('option', { name: /Other Hazard/i }));
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        } finally {
            restore();
        }
    });

    test('stays below when the space above is the smaller one', async () => {
        // Nowhere to put it, and less room above than below: the menu keeps the
        // side it was designed for rather than trading down.
        const restore = renderInScroller({ clip: [320, 340], trigger: [300, 336], menuHeight: 140 });
        try {
            fireEvent.click(screen.getByRole('button', { name: /Select a zone type/i }));

            const menu = await screen.findByRole('listbox', { name: 'Zone type' });
            expect(menu.className).toContain('mt-1.5');
            expect(menu.className).not.toContain('bottom-full');
        } finally {
            restore();
        }
    });
});
