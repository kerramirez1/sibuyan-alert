import { useEffect, useRef, useState } from 'react';
import { HiCheck, HiChevronDown } from 'react-icons/hi';

/**
 * CustomSelect - Accessible, styled dropdown selector with floating menu,
 * semantic option tags, smooth animations, scrollable listbox, and full keyboard navigation.
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
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const listboxRef = useRef(null);
    const hiddenSelectRef = useRef(null);

    // Selected option object
    const selectedIndex = options.findIndex((opt) => String(opt.value) === String(value));
    const selectedOption = (selectedIndex >= 0 ? options[selectedIndex] : null)
        || options[0]
        || { value: '', label: placeholder || 'Select...' };

    // Reset highlighted index when opening
    useEffect(() => {
        if (isOpen) {
            setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        }
    }, [isOpen, selectedIndex]);

    // Scroll highlighted option into view
    useEffect(() => {
        if (isOpen && listboxRef.current && highlightedIndex >= 0) {
            const listbox = listboxRef.current;
            const optionElements = listbox.querySelectorAll('[role="option"]');
            const highlightedEl = optionElements[highlightedIndex];
            if (highlightedEl) {
                highlightedEl.scrollIntoView({ block: 'nearest' });
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

    return (
        <div ref={containerRef} className={`relative inline-block w-full sm:w-auto ${className}`}>
            {/* Underlying select for full test automation & form accessibility */}
            <select
                ref={hiddenSelectRef}
                value={value}
                onChange={(event) => onChange?.(event)}
                aria-label={ariaLabel}
                className="sr-only"
            >
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
                className={`group flex h-9 w-full sm:w-auto min-w-[130px] items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xs outline-none transition-all duration-150 cursor-pointer select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 ${
                    isOpen
                        ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 ring-2 ring-emerald-500/20 dark:border-emerald-500/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : value && value !== 'all'
                            ? 'border-emerald-400/80 bg-emerald-50/20 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                            : 'border-gray-200/90 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50/80 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 dark:hover:bg-white/5'
                }`}
            >
                <div className="flex items-center gap-1.5 truncate">
                    {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" aria-hidden="true" />}
                    {selectedOption?.dot && (
                        <span className={`h-2 w-2 rounded-full shrink-0 ${selectedOption.dot}`} aria-hidden="true" />
                    )}
                    <span className="truncate">{selectedOption.label}</span>
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
                    className={`absolute left-0 right-0 ${alignmentClass} sm:min-w-[190px] max-w-[280px] z-[100] mt-1.5 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-200/90 bg-white/98 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/98 dark:shadow-black/60 focus:outline-none animate-in fade-in zoom-in-95 duration-100`}
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
