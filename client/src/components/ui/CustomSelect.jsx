import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HiCheck, HiChevronDown } from 'react-icons/hi';

/**
 * CustomSelect - Accessible, styled dropdown selector with floating menu,
 * semantic option tags, smooth animations, scrollable listbox, and full keyboard navigation.
 *
 * A value that no option names is shown as the placeholder and left unselected:
 * this control reports the state it was given, it never substitutes one.
 */
const CustomSelect = ({
    value,
    onChange,
    options = [],
    ariaLabel,
    placeholder,
    className = '',
    icon: Icon,
    renderOption,
    align = 'left',
    // Form fields (e.g. zone type) must read as plain inputs: white surface and
    // body text even when filled. Filter chips keep the default emerald tint.
    tone = 'auto',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    // Which side of the trigger the menu opens on. Below is the default, and the
    // only side the filter rows ever need.
    const [opensAbove, setOpensAbove] = useState(false);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const listboxRef = useRef(null);
    const hiddenSelectRef = useRef(null);

    // The option the value names.
    //
    // `null` when the value is not in `options` at all, and that is deliberate: the
    // closed field must not show an option the control is not actually on. The
    // previous fallback was `options[0]`, which meant a value the list no longer
    // offered — a zone type that has been retired, a barangay outside the selected
    // municipality — was displayed as whatever happened to be first, and the field
    // and the form state then disagreed without either of them saying so. With no
    // match the field states the placeholder instead, and the caller keeps the
    // value it holds.
    const selectedIndex = options.findIndex((opt) => String(opt.value) === String(value));
    const selectedOption = selectedIndex >= 0
        ? options[selectedIndex]
        : { value: '', label: placeholder || 'Select...', dot: null, isPlaceholder: true };

    // Reset highlighted index when opening
    useEffect(() => {
        if (isOpen) {
            setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        }
    }, [isOpen, selectedIndex]);

    // Room check: open upward when there is none below.
    //
    // The menu is absolutely positioned inside whatever container the caller
    // hands us, and in a form that container is a scroll area that clips its own
    // overflow — so a menu with nowhere to go is a menu whose options cannot be
    // clicked at all. If the space below the trigger cannot hold the menu, it
    // opens upward instead, the one direction that container can actually give
    // it. The clipping boxes are found by walking up the ancestor chain, so the
    // measurement is the real one rather than the viewport's.
    //
    // `useLayoutEffect`, because a menu that opens down and then jumps up is
    // worse than either: this settles before the frame is painted.
    useLayoutEffect(() => {
        if (!isOpen) return;
        const trigger = triggerRef.current;
        const menu = listboxRef.current;
        if (!trigger || !menu) return;

        const gap = 6;
        const triggerRect = trigger.getBoundingClientRect();
        let clipTop = 0;
        let clipBottom = window.innerHeight;
        for (let node = trigger.parentElement; node; node = node.parentElement) {
            if (window.getComputedStyle(node).overflowY !== 'visible') {
                const rect = node.getBoundingClientRect();
                clipTop = Math.max(clipTop, rect.top);
                clipBottom = Math.min(clipBottom, rect.bottom);
            }
        }

        const roomBelow = clipBottom - triggerRect.bottom - gap;
        const roomAbove = triggerRect.top - clipTop - gap;
        setOpensAbove(roomBelow < menu.offsetHeight && roomAbove > roomBelow);
    }, [isOpen]);

    // Scroll highlighted option into view
    useEffect(() => {
        if (isOpen && listboxRef.current && highlightedIndex >= 0) {
            const listbox = listboxRef.current;
            const optionElements = listbox.querySelectorAll('[role="option"]');
            const highlightedEl = optionElements[highlightedIndex];
            // Optional call: scrolling the menu is a nicety, and the one
            // environment that has no `scrollIntoView` at all (jsdom, where every
            // component test runs) must not lose the whole render over it.
            if (highlightedEl) {
                highlightedEl.scrollIntoView?.({ block: 'nearest' });
            }
        }
    }, [isOpen, highlightedIndex]);

    // Close on click outside or escape
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleSelect = (optionValue) => {
        setIsOpen(false);
        triggerRef.current?.focus();
        if (onChange) {
            onChange({ target: { value: optionValue } });
        }
    };

    const handleKeyDown = (event) => {
        if (!isOpen) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
                break;
            case 'ArrowUp':
                event.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < options.length) {
                    handleSelect(options[highlightedIndex].value);
                }
                break;
            case 'Escape':
                event.preventDefault();
                setIsOpen(false);
                triggerRef.current?.focus();
                break;
            case 'Tab':
                setIsOpen(false);
                break;
            default:
                break;
        }
    };

    const alignmentClass = align === 'right'
        ? 'sm:left-auto sm:right-0'
        : 'sm:left-0 sm:right-auto';

    // Neutral tone skips the emerald "has value" tint so a filled form field
    // looks exactly like its sibling inputs.
    const hasValueTone = value && value !== 'all' && tone !== 'neutral';
    const triggerToneClass = isOpen
        ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 ring-2 ring-emerald-500/20 dark:border-emerald-500/70 dark:bg-emerald-950/40 dark:text-emerald-200'
        : hasValueTone
            ? 'border-emerald-400/80 bg-emerald-50/20 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-200'
            : 'border-gray-200/90 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50/80 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 dark:hover:bg-white/5';

    return (
        <div ref={containerRef} className={`relative inline-block w-full sm:w-auto ${className}`}>
            {/* Underlying select for full test automation & form accessibility */}
            <select
                ref={hiddenSelectRef}
                value={selectedIndex >= 0 ? value : ''}
                onChange={(event) => onChange?.(event)}
                aria-label={ariaLabel}
                className="sr-only"
            >
                {/* The placeholder doubles as "nothing in this list is selected",
                    so a value the options cannot name still reads as unselected
                    rather than silently becoming the first option. */}
                {selectedIndex < 0 && <option value="">{placeholder || 'Select...'}</option>}
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {/* Custom Visual Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                onKeyDown={handleKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className={`group flex h-9 w-full sm:w-auto min-w-[130px] items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xs outline-none transition-all duration-150 cursor-pointer select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 ${triggerToneClass}`}
            >
                <div className="flex items-center gap-1.5 truncate">
                    {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" aria-hidden="true" />}
                    {selectedOption?.dot && (
                        <span className={`h-2 w-2 rounded-full shrink-0 ${selectedOption.dot}`} aria-hidden="true" />
                    )}
                    <span className={`truncate ${selectedOption.isPlaceholder ? 'font-normal text-gray-500 dark:text-gray-400' : ''}`}>
                        {selectedOption.label}
                    </span>
                </div>
                <HiChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
                        isOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : 'group-hover:text-gray-600 dark:group-hover:text-gray-300'
                    }`}
                    aria-hidden="true"
                />
            </button>

            {/* Custom Floating Listbox Menu with max-height & scroll support */}
            {isOpen && (
                <div
                    ref={listboxRef}
                    role="listbox"
                    aria-label={ariaLabel}
                    className={`absolute left-0 right-0 ${alignmentClass} sm:min-w-[190px] max-w-[280px] z-[100] max-h-64 overflow-y-auto ${opensAbove ? 'bottom-full mb-1.5' : 'mt-1.5'} overscroll-contain rounded-xl border border-gray-200/90 bg-white/98 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/98 dark:shadow-black/60 focus:outline-none animate-in fade-in zoom-in-95 duration-100`}
                    style={{
                        maxHeight: '280px',
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-y',
                    }}
                >
                    {options.map((opt, index) => {
                        const isSelected = String(opt.value) === String(value);
                        const isHighlighted = index === highlightedIndex;
                        return (
                            <div
                                key={opt.value}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => handleSelect(opt.value)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-100 cursor-pointer select-none ${
                                    isSelected
                                        ? 'bg-emerald-500/10 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-bold'
                                        : isHighlighted
                                            ? 'bg-gray-100/80 text-gray-950 dark:bg-white/5 dark:text-white'
                                            : 'text-gray-700 hover:bg-gray-100/80 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white'
                                }`}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {opt.dot && (
                                        <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} aria-hidden="true" />
                                    )}
                                    {renderOption ? renderOption(opt) : <span className="truncate">{opt.label}</span>}
                                </div>
                                {isSelected && (
                                    <HiCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
