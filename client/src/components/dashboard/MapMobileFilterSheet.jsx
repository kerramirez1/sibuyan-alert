import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiCheck,
    HiOutlineX,
} from 'react-icons/hi';
import { MAP_ACTIVE_INCIDENT_CONFIG, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { FOCUSABLE_SELECTOR } from '../../utils/focusableElements';

// One row shape and one selected state for every option in the sheet, so the
// three sections cannot drift into three different treatments of "chosen".
const FILTER_ROW_CLASS = 'flex min-h-[48px] w-full cursor-pointer items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
const FILTER_ROW_STATE_CLASS = (isSelected) => (isSelected
    ? 'bg-brand-50/80 text-brand-900 dark:bg-white/5 dark:text-sky-300'
    : 'text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-white/5');

// Dots double as map-legend swatches: each option shares its marker color.
// 'all' is a scope rather than a status, so it keeps the neutral dot the rail
// gives it instead of borrowing the brand colour.
const getStatusDotClass = (filterValue) => {
    // 'all' is a scope rather than a status, so it keeps the neutral dot the rail
    // gives it. Everything else — including the folded 'active' set — reads the
    // shared palette instead of restating a blue that could drift from it.
    if (filterValue === 'all') return 'bg-gray-400';
    if (filterValue === 'active') return MAP_ACTIVE_INCIDENT_CONFIG.dot;
    return MAP_STATUS_CONFIG[filterValue]?.dot || 'bg-gray-400';
};

// Layer options arrive with the same `group` label the desktop rail reads, so
// the sheet cannot classify them by hand and drift from it. Each one supplies
// the line under its name, because a layer's meaning is not obvious from a
// count: a hazard zone and an archived incident are not the same kind of thing.
const LAYER_PRESENTATION = {
    'risk-zones': {
        dot: 'bg-red-500',
        description: 'High-risk hazards and monitored risk zones',
    },
    resolved: {
        dot: MAP_STATUS_CONFIG.resolved.dot,
        description: 'Closed incidents kept for the record',
    },
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

    // Classify filter options into the same 3 sections the desktop rail draws,
    // reading each option's own `group` instead of a hardcoded list of values.
    // The hand-written version classified the second layers option (the resolved
    // archive) as a status, so a guest was offered "Incident status: Resolved
    // archive" while the desktop rail filed the same control under "Layers &
    // archive".
    const scopeOption = filters.find((f) => f.group === 'status' && f.value === 'all');
    const layerOptions = filters.filter((f) => f.group === 'layers');
    const statusOptions = filters.filter((f) => f.group === 'status' && f.value !== 'all');

    // Compute live summary string
    const activeFilterObj = filters.find((f) => f.value === pendingFilter);
    const activeLabel = activeFilterObj ? activeFilterObj.label : 'All open';
    const activeCount = getFilterCount(pendingFilter);
    const countNoun = pendingFilter === 'risk-zones'
        ? (activeCount === 1 ? 'mapped zone' : 'mapped zones')
        : (activeCount === 1 ? 'incident' : 'incidents');
    const summaryText = `Showing ${activeLabel.toLowerCase()} · ${activeCount} ${countNoun}`;

    // Compute Apply button label
    const applyLabel = pendingFilter === 'risk-zones'
        ? `Show ${activeCount} ${activeCount === 1 ? 'zone' : 'zones'}`
        : `Show ${activeCount} ${activeCount === 1 ? 'incident' : 'incidents'}`;

    return createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4 lg:hidden">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-gray-950/60"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Bottom Sheet / Tablet Modal */}
            <section
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="relative z-10 flex max-h-[88vh] w-full flex-col rounded-t-2xl border-t border-gray-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:border sm:max-w-lg sm:pb-0 dark:border-white/10 dark:bg-[#0c1813]"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 px-4 py-3.5">
                    <div>
                        <h2
                            id={titleId}
                            className="text-sm font-semibold text-gray-900 dark:text-white"
                        >
                            Map filters
                        </h2>
                        <p id={descriptionId} className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            Control which incidents and hazard layers appear on the map.
                        </p>
                    </div>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close filter sheet"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors cursor-pointer"
                    >
                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Screen Reader Live Announcement */}
                <div className="sr-only" aria-live="polite">
                    {summaryText}
                </div>

                {/* Scrollable Edge-to-Edge Content List */}
                <div
                    className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100 dark:divide-white/5"
                    role="radiogroup"
                    aria-label="Incident filter options"
                >
                    {/* 1. Incident Scope Section */}
                    {scopeOption && (() => {
                        const isSelected = pendingFilter === 'all';
                        const count = getFilterCount('all');
                        return (
                            <div>
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-4 pt-4 pb-2">
                                    Incident scope
                                </h3>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    aria-label={scopeOption?.label || 'Active Incidents'}
                                    onClick={() => setPendingFilter('all')}
                                    className={`${FILTER_ROW_CLASS} ${FILTER_ROW_STATE_CLASS(isSelected)}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                                        <div>
                                            <span className={`text-sm block ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                                                {scopeOption?.label || 'All open'}
                                            </span>
                                            {/* Guests carry a shorter rail, so their
                                                one scope row is the active set
                                                itself and says so. */}
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block leading-tight">
                                                {scopeOption?.value === 'all' && statusOptions.length > 0
                                                    ? 'Pending + being handled'
                                                    : 'Verified, responding, and active emergency operations'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 ml-3">
                                        <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                            {count}
                                        </span>
                                        {isSelected && (
                                            <HiCheck className="h-4 w-4 text-brand-700 dark:text-sky-400 shrink-0" aria-hidden="true" />
                                        )}
                                    </div>
                                </button>
                            </div>
                        );
                    })()}

                    {/* 2. Incident Status Section */}
                    {statusOptions.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-4 pt-4 pb-2">
                                Incident status
                            </h3>
                            <div className="divide-y divide-gray-100 dark:divide-white/5">
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
                                            className={`${FILTER_ROW_CLASS} ${FILTER_ROW_STATE_CLASS(isSelected)}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                                                <span className={`text-sm break-words leading-tight flex-1 ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                                                    {filter.label}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 ml-3">
                                                <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                                    {count}
                                                </span>
                                                {isSelected && (
                                                    <HiCheck className="h-4 w-4 text-brand-700 dark:text-sky-400 shrink-0" aria-hidden="true" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 3. Map Layers Section */}
                    {layerOptions.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-4 pt-4 pb-2">
                                Map layers
                            </h3>
                            <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {layerOptions.map((filter) => {
                                    const isSelected = pendingFilter === filter.value;
                                    const count = getFilterCount(filter.value);
                                    const presentation = LAYER_PRESENTATION[filter.value] || {};

                                    return (
                                        <button
                                            key={filter.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            aria-label={filter.label}
                                            onClick={() => setPendingFilter(filter.value)}
                                            className={`${FILTER_ROW_CLASS} ${FILTER_ROW_STATE_CLASS(isSelected)}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${presentation.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                                <div>
                                                    <span className={`text-sm block ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                                                        {filter.label}
                                                    </span>
                                                    {presentation.description && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 block leading-tight">
                                                            {presentation.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 ml-3">
                                                <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                                    {count}
                                                </span>
                                                {isSelected && (
                                                    <HiCheck className="h-4 w-4 text-brand-700 dark:text-sky-400 shrink-0" aria-hidden="true" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Action Bar */}
                <div className="shrink-0 flex items-center gap-3 border-t border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#0c1813]">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-lg cursor-pointer"
                    >
                        Clear all
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        className="flex-1 min-h-[44px] rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:bg-brand-600 dark:hover:bg-brand-500 cursor-pointer"
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
