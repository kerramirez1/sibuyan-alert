import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineCheck,
    HiOutlineFilter,
    HiOutlineShieldExclamation,
    HiOutlineX,
} from 'react-icons/hi';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const getStatusDotClass = (filterValue) => {
    if (filterValue === 'risk-zones') return 'bg-red-500';
    if (filterValue === 'all') return 'bg-emerald-500';
    return MAP_STATUS_CONFIG[filterValue]?.dot || 'bg-gray-400';
};

const MapMobileFilterSheet = ({
    isOpen,
    onClose,
    filters = [],
    selectedFilter = 'all',
    onSelectFilter,
    getFilterCount = () => 0,
    triggerRef = null,
}) => {
    const titleId = useId();
    const descriptionId = useId();
    const sheetRef = useRef(null);
    const closeBtnRef = useRef(null);
    const [pendingFilter, setPendingFilter] = useState(selectedFilter);

    // Sync pending filter with selectedFilter when sheet opens
    useEffect(() => {
        if (isOpen) {
            setPendingFilter(selectedFilter);
        }
    }, [isOpen, selectedFilter]);

    // Focus management, ESC key, and body scroll lock
    useEffect(() => {
        if (!isOpen) return undefined;

        const previousActiveElement = document.activeElement;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus close button initially
        closeBtnRef.current?.focus({ preventScroll: true });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key === 'Tab') {
                const focusableElements = Array.from(
                    sheetRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []
                );
                if (!focusableElements.length) {
                    event.preventDefault();
                    sheetRef.current?.focus();
                    return;
                }

                const first = focusableElements[0];
                const last = focusableElements[focusableElements.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = originalOverflow;
            if (triggerRef?.current) {
                triggerRef.current.focus({ preventScroll: true });
            } else if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                previousActiveElement.focus({ preventScroll: true });
            }
        };
    }, [isOpen, onClose, triggerRef]);

    if (!isOpen || typeof document === 'undefined') return null;

    const handleApply = () => {
        onSelectFilter(pendingFilter);
        onClose();
    };

    const handleClear = () => {
        setPendingFilter('all');
        onSelectFilter('all');
        onClose();
    };

    // Classify filter options into 3 distinct operational sections
    const scopeOption = filters.find((f) => f.value === 'all');
    const layerOption = filters.find((f) => f.value === 'risk-zones');
    const statusOptions = filters.filter((f) => f.value !== 'all' && f.value !== 'risk-zones');

    // Compute live summary string
    const activeFilterObj = filters.find((f) => f.value === pendingFilter);
    const activeLabel = activeFilterObj ? activeFilterObj.label : 'Active incidents';
    const activeCount = getFilterCount(pendingFilter);
    const summaryText = pendingFilter === 'risk-zones'
        ? `Showing risk zones · ${activeCount} ${activeCount === 1 ? 'mapped zone' : 'mapped zones'}`
        : pendingFilter === 'all'
            ? `Showing all active · ${activeCount} ${activeCount === 1 ? 'incident' : 'incidents'}`
            : `Showing ${activeLabel.toLowerCase()} · ${activeCount} ${activeCount === 1 ? 'incident' : 'incidents'}`;

    // Compute Apply button label
    const applyLabel = pendingFilter === 'risk-zones'
        ? `Show ${activeCount} ${activeCount === 1 ? 'zone' : 'zones'}`
        : `Show ${activeCount} ${activeCount === 1 ? 'incident' : 'incidents'}`;

    return createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:hidden">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-gray-950/60 backdrop-blur-xs transition-opacity duration-200 animate-fadeIn"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Bottom Sheet Modal */}
            <section
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="relative z-10 flex max-h-[88vh] w-full flex-col rounded-t-2xl border-t border-gray-200/90 bg-white pb-safe shadow-2xl transition-transform dark:border-white/10 dark:bg-[#0c1813]"
            >
                {/* Drag Handle */}
                <div className="flex w-full items-center justify-center pt-3 pb-1">
                    <div className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-white/20" aria-hidden="true" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between border-b border-gray-200/80 px-4 py-3 dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <HiOutlineFilter className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div>
                            <h2
                                id={titleId}
                                className="font-display text-sm font-bold uppercase tracking-wider text-gray-950 dark:text-white"
                            >
                                Map filters
                            </h2>
                            <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400">
                                Control which incidents and hazard layers appear on the map.
                            </p>
                        </div>
                    </div>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close filter sheet"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                    >
                        <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                {/* Live Status Summary Subhead */}
                <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 dark:border-white/5 dark:bg-white/[0.02]">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                        {summaryText}
                    </p>
                </div>

                {/* Scrollable Grouped Content */}
                <div className="overflow-y-auto px-4 py-3 space-y-4" role="radiogroup" aria-label="Incident filter options">
                    {/* 1. Incident Scope Section */}
                    {scopeOption && (() => {
                        const isSelected = pendingFilter === 'all';
                        const count = getFilterCount('all');
                        return (
                            <div>
                                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    Incident scope
                                </h3>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    aria-label="All active"
                                    onClick={() => setPendingFilter('all')}
                                    className={`group flex min-h-[48px] w-full cursor-pointer items-center justify-between rounded-xl border p-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                        isSelected
                                            ? 'border-brand-700 bg-brand-50/90 text-brand-950 ring-1 ring-brand-700/50 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-600/40'
                                            : 'border-gray-200/90 bg-white text-gray-800 hover:bg-gray-50/80 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                                        <div>
                                            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider block">
                                                All active
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block leading-normal">
                                                Verified, responding, and active emergency operations
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span
                                            className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                                                isSelected
                                                    ? 'bg-brand-900/15 text-brand-900 dark:bg-white/15 dark:text-emerald-100'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                                            }`}
                                        >
                                            {count}
                                        </span>
                                        <div
                                            className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                                isSelected
                                                    ? 'border-brand-800 bg-brand-800 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-gray-950'
                                                    : 'border-gray-300 bg-transparent dark:border-white/20'
                                            }`}
                                            aria-hidden="true"
                                        >
                                            {isSelected && <HiOutlineCheck className="h-3 w-3 stroke-[3]" />}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        );
                    })()}

                    {/* 2. Incident Status Section */}
                    {statusOptions.length > 0 && (
                        <div>
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                Incident status
                            </h3>
                            <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-200/90 dark:border-white/10 overflow-hidden bg-white dark:bg-[#07130e]">
                                {statusOptions.map((filter) => {
                                    const count = getFilterCount(filter.value);
                                    const isSelected = pendingFilter === filter.value;
                                    const dotClass = getStatusDotClass(filter.value);

                                    return (
                                        <button
                                            key={filter.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            aria-label={filter.label}
                                            onClick={() => setPendingFilter(filter.value)}
                                            className={`group flex min-h-[48px] w-full cursor-pointer items-center justify-between px-3.5 py-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                                isSelected
                                                    ? 'bg-emerald-50/80 text-emerald-950 border-l-4 border-l-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-l-emerald-500'
                                                    : 'text-gray-800 hover:bg-gray-50/80 dark:text-gray-200 dark:hover:bg-white/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                                                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider break-words leading-tight flex-1">
                                                    {filter.label}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span
                                                    className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                                                        isSelected
                                                            ? 'bg-emerald-900/15 text-emerald-900 dark:bg-white/15 dark:text-emerald-100'
                                                            : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                                                    }`}
                                                >
                                                    {count}
                                                </span>
                                                <div
                                                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                                        isSelected
                                                            ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-gray-950'
                                                            : 'border-gray-300 bg-transparent dark:border-white/20'
                                                    }`}
                                                    aria-hidden="true"
                                                >
                                                    {isSelected && <HiOutlineCheck className="h-3 w-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 3. Map Layers Section */}
                    {layerOption && (() => {
                        const isSelected = pendingFilter === 'risk-zones';
                        const count = getFilterCount('risk-zones');
                        return (
                            <div>
                                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    Map layers
                                </h3>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    aria-label="Risk zones"
                                    onClick={() => setPendingFilter('risk-zones')}
                                    className={`group flex min-h-[48px] w-full cursor-pointer items-center justify-between rounded-xl border p-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                        isSelected
                                            ? 'border-brand-700 bg-brand-50/90 text-brand-950 ring-1 ring-brand-700/50 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-600/40'
                                            : 'border-gray-200/90 bg-white text-gray-800 hover:bg-gray-50/80 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                                            <HiOutlineShieldExclamation className="h-4 w-4" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider block">
                                                Risk zones
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block leading-normal">
                                                High-risk hazards and monitored risk zones
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span
                                            className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                                                isSelected
                                                    ? 'bg-brand-900/15 text-brand-900 dark:bg-white/15 dark:text-emerald-100'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                                            }`}
                                        >
                                            {count}
                                        </span>
                                        <div
                                            className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                                isSelected
                                                    ? 'border-brand-800 bg-brand-800 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-gray-950'
                                                    : 'border-gray-300 bg-transparent dark:border-white/20'
                                            }`}
                                            aria-hidden="true"
                                        >
                                            {isSelected && <HiOutlineCheck className="h-3 w-3 stroke-[3]" />}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        );
                    })()}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center gap-3 border-t border-gray-200/80 bg-gray-50/90 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-lg cursor-pointer"
                    >
                        Clear all
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        className="flex-1 min-h-[44px] rounded-xl border border-brand-800 bg-brand-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-emerald-600 dark:bg-emerald-700 dark:text-white dark:hover:bg-emerald-600 cursor-pointer"
                    >
                        {applyLabel}
                    </button>
                </div>
            </section>
        </div>,
        document.body
    );
};

export default MapMobileFilterSheet;
