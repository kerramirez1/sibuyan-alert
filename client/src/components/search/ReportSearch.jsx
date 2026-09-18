import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from '../../router';
import { HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { reportsAPI } from '../../services/api';
import { formatMonthLabel } from '../../utils/safeDate';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT = 8;

const STATUS_LABELS = Object.freeze({
    pending: 'Pending review',
    verified: 'Verified',
    transferred: 'Transferred',
    // One lifecycle state, one name: taken from the same source the map legend
    // and the status badges read, so a search result never disagrees with them.
    responding: MAP_STATUS_CONFIG.responding.label,
    resolved: 'Resolved',
    rejected: 'Rejected',
});

const ZONE_SEVERITY_LABELS = Object.freeze({
    low: 'Low risk',
    medium: 'Medium risk',
    high: 'High risk',
    critical: 'Critical risk',
});

/**
 * MVP RBAC search box (Facebook-style, scoped).
 *
 * The server filters by role/municipality/ownership and returns redacted rows
 * only; this component never sees private fields. Every row lands on the
 * operational map — accidents via ?report=, zones via ?riskZone= — and the
 * map re-checks RBAC (DashboardPage falls back to a direct fetch when the id
 * is outside the preloaded list, and shows a notice when it is unavailable).
 */
const buildResultTarget = (result) => {
    const id = result?._id ? String(result._id) : '';
    if (!id) return null;
    if (result?.kind === 'zone') {
        return `/dashboard?view=map&riskZone=${encodeURIComponent(id)}`;
    }
    return `/dashboard?view=map&report=${encodeURIComponent(id)}`;
};

/** Bolds the first case-insensitive match so users see why a row matched. */
const highlightMatch = (text, needle) => {
    const haystack = text === null || text === undefined ? '' : String(text);
    const query = String(needle || '').trim();
    if (!haystack || !query) return haystack;
    const index = haystack.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return haystack;
    return (
        <>
            {haystack.slice(0, index)}
            <strong className="font-bold text-gray-950 dark:text-white">{haystack.slice(index, index + query.length)}</strong>
            {haystack.slice(index + query.length)}
        </>
    );
};

const ReportSearch = ({ id, placeholder = 'Search accidents, places…', className = '' }) => {
    const reactId = useId();
    const inputId = id || `report-search-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
    const listboxId = `${inputId}-results`;
    const navigate = useNavigate();
    const containerRef = useRef(null);
    const abortRef = useRef(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const trimmed = query.trim();
    const canSearch = trimmed.length >= SEARCH_MIN_CHARS;

    // Owned accident rows first; zones follow in their own labeled section.
    // Stable partition: concatenation preserves the server's recency order.
    const { flatReports, flatItems, showSectionHeaders } = useMemo(() => {
        const owned = [];
        const shared = [];
        results.forEach((result) => {
            if (result?.isOwnedByCurrentUser) owned.push(result);
            else shared.push(result);
        });
        const flat = [...owned, ...shared];
        const items = [...flat, ...zones];
        return {
            flatReports: flat,
            flatItems: items,
            showSectionHeaders: flat.length > 0 && zones.length > 0,
        };
    }, [results, zones]);

    useEffect(() => {
        if (!canSearch) {
            abortRef.current?.abort?.();
            setResults([]);
            setZones([]);
            setLoading(false);
            setActiveIndex(-1);
            return undefined;
        }

        setLoading(true);
        const timer = setTimeout(async () => {
            abortRef.current?.abort?.();
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            abortRef.current = controller;
            try {
                const response = await reportsAPI.search(trimmed, {
                    limit: SEARCH_LIMIT,
                    ...(controller ? { signal: controller.signal } : {}),
                });
                const list = response?.data?.data?.results;
                const zoneList = response?.data?.data?.zones;
                setResults(Array.isArray(list) ? list.filter((r) => r && typeof r === 'object') : []);
                setZones(Array.isArray(zoneList) ? zoneList.filter((z) => z && typeof z === 'object') : []);
                setActiveIndex(-1);
                setOpen(true);
            } catch (error) {
                // Aborts and transient failures clear quietly; the box stays usable.
                if (error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
                    setResults([]);
                    setZones([]);
                }
            } finally {
                setLoading(false);
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [trimmed, canSearch]);

    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open ]);

    useEffect(() => () => abortRef.current?.abort?.(), []);

    const goToResult = (result) => {
        const target = buildResultTarget(result);
        if (!target) return;
        setOpen(false);
        navigate(target);
    };

    const seeAllResults = () => {
        setOpen(false);
        navigate(`/accident-history?q=${encodeURIComponent(trimmed)}`);
    };

    const handleInputKeyDown = (event) => {
        if (event.key === 'ArrowDown' && flatItems.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % flatItems.length);
        } else if (event.key === 'ArrowUp' && flatItems.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current <= 0 ? flatItems.length - 1 : current - 1));
        } else if (event.key === 'Enter' && activeIndex >= 0 && flatItems[activeIndex]) {
            event.preventDefault();
            goToResult(flatItems[activeIndex]);
        }
    };

    const renderZoneRow = (zone, flatIndex) => {
        const metaParts = [
            [zone.barangay, zone.municipalityName].filter(Boolean).join(', ') || 'Sibuyan Island',
            ZONE_SEVERITY_LABELS[zone.severity] || '',
        ].filter(Boolean);
        return (
            <li key={`zone-${String(zone._id)}`} id={`${listboxId}-option-${flatIndex}`} role="option" aria-selected={flatIndex === activeIndex}>
                <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => goToResult({ ...zone, kind: 'zone' })}
                    className={`block w-full truncate px-4 py-2 text-left transition-colors focus-visible:outline-none ${flatIndex === activeIndex ? 'bg-gray-100 dark:bg-white/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                >
                    <span className="block truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                        {highlightMatch(zone.title || 'Unnamed zone', trimmed)}
                    </span>
                    <span className="mt-px block truncate text-[11px] font-normal text-gray-500 dark:text-gray-400">
                        {highlightMatch(metaParts.join(' · '), trimmed)}
                    </span>
                </button>
            </li>
        );
    };

    const renderRow = (result, flatIndex) => {
        const metaParts = [
            [result.barangay, result.municipalityName].filter(Boolean).join(', ') || 'Sibuyan Island',
            result.incidentTime ? formatMonthLabel(result.incidentTime, 'MMM d, yyyy', '') : '',
            STATUS_LABELS[result.status] || result.status || '',
        ].filter(Boolean);
        return (
            <li key={String(result._id)} id={`${listboxId}-option-${flatIndex}`} role="option" aria-selected={flatIndex === activeIndex}>
                <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => goToResult(result)}
                    className={`block w-full truncate px-4 py-2 text-left transition-colors focus-visible:outline-none ${flatIndex === activeIndex ? 'bg-gray-100 dark:bg-white/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                >
                    <span className="block truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                        {highlightMatch(result.title || 'Untitled report', trimmed)}
                    </span>
                    <span className="mt-px block truncate text-[11px] font-normal text-gray-500 dark:text-gray-400">
                        {highlightMatch(metaParts.join(' · '), trimmed)}
                        {result.isOwnedByCurrentUser && <span> · Yours</span>}
                    </span>
                </button>
            </li>
        );
    };

    const renderSectionHeader = (heading) => (
        <li key={heading} role="presentation" aria-hidden="true" className="px-4 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {heading}
        </li>
    );

    let runningIndex = -1;
    const renderReportRows = () => flatReports.map((result) => {
        runningIndex += 1;
        return renderRow(result, runningIndex);
    });
    const renderZoneRows = () => zones.map((zone) => {
        runningIndex += 1;
        return renderZoneRow(zone, runningIndex);
    });

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <label htmlFor={inputId} className="sr-only">Search incident reports</label>
            <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
                id={inputId}
                type="search"
                role="combobox"
                aria-expanded={open && canSearch}
                aria-controls={listboxId}
                aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                autoComplete="off"
                value={query}
                placeholder={placeholder}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setOpen(true);
                }}
                onFocus={() => {
                    if (flatItems.length > 0) setOpen(true);
                }}
                onKeyDown={handleInputKeyDown}
                className="h-10 w-full rounded-xl border border-gray-200/90 bg-white pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500"
            />
            {query && (
                <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                        setQuery('');
                        setResults([]);
                        setZones([]);
                        setOpen(false);
                    }}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                >
                    <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
            {open && canSearch && (
                <div className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-md dark:border-white/10 dark:bg-[#0c1813]">
                    {loading && flatItems.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400" role="status">Searching…</p>
                    ) : flatItems.length === 0 && !loading ? (
                        <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400" role="status">
                            No matching reports or zones for &ldquo;{trimmed}&rdquo;.
                        </p>
                    ) : (
                        <>
                            <ul id={listboxId} role="listbox" aria-label={`Matching incidents and zones for ${trimmed}`} className="max-h-72 overflow-y-auto py-1">
                                {showSectionHeaders && renderSectionHeader('Reports')}
                                {renderReportRows()}
                                {showSectionHeaders && renderSectionHeader('High-risk zones')}
                                {renderZoneRows()}
                            </ul>
                            <div className="border-t border-gray-100 dark:border-white/10">
                                <button
                                    type="button"
                                    onClick={seeAllResults}
                                    className="flex w-full items-center justify-center px-4 py-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:bg-white/5"
                                >
                                    See all results for &ldquo;{trimmed}&rdquo;
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportSearch;
