import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineGlobe } from 'react-icons/hi';
import MapToolButton from './MapToolButton';
import {
    MAP_SCOPE_ISLAND,
    MAP_SCOPE_OPTIONS,
    getMapScopeCaption,
    isIslandMapScope,
    normalizeMapScope,
} from '../../utils/mapScope';

/**
 * Map scope as one control in the map's own tool rail.
 *
 * It was a floating panel carrying both scope names: two labels wide, sitting in
 * the corner of a canvas whose whole job is to show incidents, and reading as
 * page furniture rather than as a map control. Scope is one setting with two
 * values, so it is now one compact icon button in the rail the zoom, layer and
 * location tools already live in — same 28px footprint, same surface, same hover
 * and focus treatment, same `active` fill the layer toggle uses when it is on.
 *
 * The values moved into a popover, which is where a map control's options
 * belong: the rail stays as small as the other controls, and the names are one
 * click away instead of permanently on screen. The island fill is the visible
 * difference between the two states, and the button's own label states the
 * current scope for anyone who cannot see the fill.
 *
 * This is a scope control and nothing more: it reports a choice to its caller.
 * It does not fetch, does not read a report, and cannot widen what the account
 * may see or do — see `utils/mapScope`.
 */
const OPTION_CLASS_BASE = 'flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

const MapScopeControl = ({ scope, onScopeChange, municipality = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const optionRefs = useRef([]);

    const activeScope = normalizeMapScope(scope);
    const isIsland = isIslandMapScope(activeScope);

    const options = MAP_SCOPE_OPTIONS.map((option) => ({
        ...option,
        description: option.value === MAP_SCOPE_ISLAND
            ? 'All three municipalities'
            : (municipality || 'Your municipality'),
    }));
    // Read through a ref so the focus effect can depend on the open transition
    // alone: keying it on the scope would pull focus back to the newly selected
    // option while the reader is still arrowing through the group.
    const selectedOptionIndexRef = useRef(0);
    selectedOptionIndexRef.current = Math.max(0, options.findIndex((option) => option.value === activeScope));

    const closeAndRestoreFocus = useCallback(() => {
        setIsOpen(false);
        triggerRef.current?.focus();
    }, []);

    // Close on a click outside the control and on Escape. `mousedown` rather than
    // `click` so the trigger's own click (which toggles) is never what closes it.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handlePointerDown = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isOpen]);

    // Focus the current option when the popover opens, so the list is reachable by
    // keyboard the moment it appears — and so the reader lands on the answer to
    // the question the button asked.
    useEffect(() => {
        if (!isOpen) return;
        optionRefs.current[selectedOptionIndexRef.current]?.focus();
    }, [isOpen]);

    const selectScope = useCallback((value, { commit = true } = {}) => {
        if (value !== activeScope) onScopeChange?.(value);
        if (commit) closeAndRestoreFocus();
    }, [activeScope, closeAndRestoreFocus, onScopeChange]);

    /**
     * Arrow keys walk the group, as they do in any radio group — and, also as in
     * a radio group, landing on an option selects it. The popover stays open while
     * arrowing: that is a reader looking through the options, not committing to
     * one, and it is the click or Enter press (below) that closes the menu.
     */
    const handleOptionKeyDown = (event, index) => {
        const count = options.length;
        let nextIndex = null;

        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % count;
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
        else if (event.key === 'Escape') {
            event.preventDefault();
            closeAndRestoreFocus();
            return;
        } else if (event.key === 'Tab') {
            // Tabbing away is a dismissal, not a trap.
            setIsOpen(false);
            return;
        }

        if (nextIndex === null) return;
        event.preventDefault();
        optionRefs.current[nextIndex]?.focus();
        selectScope(options[nextIndex].value, { commit: false });
    };

    return (
        <div ref={containerRef} className="relative">
            <MapToolButton
                ref={triggerRef}
                label={`Map scope: ${isIsland ? 'Entire Sibuyan Island' : 'My Municipality'}`}
                icon={HiOutlineGlobe}
                active={isIsland}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                onClick={() => setIsOpen((current) => !current)}
            >
                {/* A second, shape-based cue that the wider scope is on: the fill
                    says it in colour, this says it without colour. */}
                {isIsland && (
                    <span
                        aria-hidden="true"
                        className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-600 ring-1 ring-white dark:bg-emerald-400 dark:ring-[#0c1813]"
                    />
                )}
            </MapToolButton>

            {isOpen && (
                /* Opens to the LEFT, level with its own button.

                   The rail sits on the canvas's bottom-right corner, so this is
                   the only direction with room to spare: rightwards would leave
                   the canvas immediately, and upwards runs out of map on the
                   smallest phone canvas — a 4:3 frame only ~216px tall, where the
                   rail's three controls leave less headroom than the menu needs
                   and the canvas clips what does not fit. Leftwards it is bounded
                   by the canvas's width instead (~300px even at a 320px
                   viewport), which is the dimension this layout actually has. */
                <div
                    role="dialog"
                    aria-label="Map scope"
                    className="absolute bottom-0 right-full z-30 mr-2 w-52 rounded-lg border border-gray-200/90 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#0c1813]"
                >
                    <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        Map scope
                    </p>
                    <div role="radiogroup" aria-label="Map scope options" className="flex flex-col gap-0.5">
                        {options.map((option, index) => {
                            const isSelected = option.value === activeScope;

                            return (
                                <button
                                    key={option.value}
                                    ref={(node) => { optionRefs.current[index] = node; }}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    // Roving tabindex, the standard radio-group
                                    // pattern: one stop for the whole group.
                                    tabIndex={isSelected ? 0 : -1}
                                    onClick={() => selectScope(option.value)}
                                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                                    className={`${OPTION_CLASS_BASE} ${isSelected
                                        ? 'bg-brand-50 dark:bg-brand-500/10'
                                        : 'hover:bg-gray-50 dark:hover:bg-white/5'
                                        }`}
                                >
                                    {/* A filled dot for the selection, with the
                                        check mark of the chosen option beside it —
                                        the state is legible without relying on the
                                        tint. */}
                                    <span
                                        aria-hidden="true"
                                        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${isSelected
                                            ? 'border-brand-700 bg-brand-700 dark:border-brand-500 dark:bg-brand-500'
                                            : 'border-gray-300 dark:border-white/25'
                                            }`}
                                    >
                                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-xs ${isSelected
                                            ? 'font-bold text-gray-950 dark:text-white'
                                            : 'font-medium text-gray-700 dark:text-gray-200'
                                            }`}
                                        >
                                            {option.label}
                                        </span>
                                        <span className="mt-0.5 block truncate text-[10px] text-gray-500 dark:text-gray-400">
                                            {option.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* The scope change, announced. Visual chrome was exactly what this
                control stopped carrying, so the announcement lives here instead —
                and it is present from mount, which is what makes a change to it a
                change rather than an appearance. */}
            <span className="sr-only" role="status" aria-live="polite">
                {getMapScopeCaption(activeScope, municipality)}
            </span>
        </div>
    );
};

export default MapScopeControl;
