import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import MapScopeControl from '../components/map/MapScopeControl';

const renderControl = (overrides = {}) => {
    const onScopeChange = vi.fn();
    const utils = render(
        <MapScopeControl
            scope="municipality"
            onScopeChange={onScopeChange}
            municipality="Cajidiocan"
            {...overrides}
        />
    );
    return { onScopeChange, ...utils };
};

const getTrigger = () => screen.getByRole('button', { name: /^Map scope:/ });

describe('MapScopeControl', () => {
    test('is one compact icon control, not a panel of scope names', () => {
        renderControl();

        const trigger = getTrigger();
        // An icon, a tooltip and an accessible name — the scope names live in the
        // popover, so nothing is printed on the map until the control is opened.
        expect(trigger.textContent).toBe('');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
        expect(trigger).toHaveAttribute('title', 'Map scope: My Municipality');
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    test('reports the current scope through its own accessible name', () => {
        const { unmount } = renderControl();
        expect(getTrigger()).toHaveAccessibleName('Map scope: My Municipality');
        unmount();

        renderControl({ scope: 'island' });
        expect(getTrigger()).toHaveAccessibleName('Map scope: Entire Sibuyan Island');
        // The active scope is not carried by the fill alone: the button also
        // carries an active treatment and a shape cue, and `aria-expanded` stays
        // on the control rather than on a wrapper.
        expect(getTrigger()).toHaveClass('!bg-emerald-50/95');
    });

    test('opens a popover offering exactly the two scopes, with the current one checked', () => {
        renderControl();

        fireEvent.click(getTrigger());

        const group = screen.getByRole('radiogroup', { name: 'Map scope options' });
        const options = within(group).getAllByRole('radio');
        expect(options.map((option) => option.textContent)).toEqual([
            'My MunicipalityCajidiocan',
            'Entire Sibuyan IslandAll three municipalities',
        ]);
        expect(options[0]).toHaveAttribute('aria-checked', 'true');
        expect(options[1]).toHaveAttribute('aria-checked', 'false');
        // One tab stop for the whole group, on the checked option.
        expect(options[0]).toHaveAttribute('tabindex', '0');
        expect(options[1]).toHaveAttribute('tabindex', '-1');
        expect(options[0]).toHaveFocus();
    });

    test('selecting the other scope reports it, closes, and hands focus back to the control', () => {
        const { onScopeChange } = renderControl();
        const trigger = getTrigger();

        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('radio', { name: /Entire Sibuyan Island/ }));

        expect(onScopeChange).toHaveBeenCalledTimes(1);
        expect(onScopeChange).toHaveBeenCalledWith('island');
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    test('choosing the scope that is already active is a silent close', () => {
        const { onScopeChange } = renderControl();

        fireEvent.click(getTrigger());
        fireEvent.click(screen.getByRole('radio', { name: /My Municipality/ }));

        expect(onScopeChange).not.toHaveBeenCalled();
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    test('Escape closes the popover and returns focus to the control', () => {
        renderControl();
        const trigger = getTrigger();

        fireEvent.click(trigger);
        fireEvent.keyDown(screen.getByRole('radio', { name: /My Municipality/ }), { key: 'Escape' });

        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    test('a press outside the control closes it', () => {
        renderControl();

        fireEvent.click(getTrigger());
        expect(screen.getByRole('radiogroup')).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    test('arrow keys walk the group and select as they go, leaving the list open to look at', () => {
        const { onScopeChange } = renderControl();

        fireEvent.click(getTrigger());
        const [current, other] = screen.getAllByRole('radio');

        fireEvent.keyDown(current, { key: 'ArrowDown' });

        // Radio-group behaviour: landing on an option selects it, and the popover
        // stays open because arrowing is browsing, not committing.
        expect(onScopeChange).toHaveBeenCalledWith('island');
        expect(other).toHaveFocus();
        expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    test('announces the scope in words, for a reader who cannot see the fill', () => {
        const { unmount } = renderControl();

        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Viewing incidents in Cajidiocan');
        // Visually hidden: the announcement replaced the panel's caption rather
        // than rejoining it over the map.
        expect(status).toHaveClass('sr-only');
        unmount();

        renderControl({ scope: 'island' });
        expect(screen.getByRole('status')).toHaveTextContent('Viewing incidents across Sibuyan Island');
    });
});
