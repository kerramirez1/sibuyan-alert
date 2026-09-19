import { useEffect, useId, useRef, useState } from 'react';
import { HiChevronDown, HiOutlineMap } from 'react-icons/hi';
import { RESPONDING_DOT_LEGEND_SIZE } from '../../utils/mapMarkerVisuals';
import {
    getMapLegendStatusKeys,
    isRiskZoneLayerVisibleForFilter,
    MAP_ACTIVE_INCIDENT_CONFIG,
    MAP_RESPONDING_INCIDENT_CONFIG,
    MAP_RISK_ZONE_CONFIG,
    MAP_STATUS_CONFIG,
    RESPONDING_INCIDENT_STATUS_KEY,
} from '../../config/mapVisuals';

const LEGEND_RING_CLASSES = {
    risk: 'ring-red-200 dark:ring-red-900',
    active: 'ring-blue-200 dark:ring-blue-900',
    pending: 'ring-amber-200 dark:ring-amber-900',
    verified: 'ring-blue-200 dark:ring-blue-900',
    transferred: 'ring-violet-200 dark:ring-violet-900',
    responding: 'ring-cyan-200 dark:ring-cyan-900',
    resolved: 'ring-green-200 dark:ring-green-900',
    rejected: 'ring-gray-300 dark:ring-gray-700',
};

const LegendSymbol = ({ status, color }) => (
    <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full border border-white/90 shadow-2xs ring-1 ${LEGEND_RING_CLASSES[status] || ''}`}
        style={{ backgroundColor: color }}
        aria-hidden="true"
    />
);

/**
 * The responding dot, at legend scale.
 *
 * Same pulse kit as the map marker (see `index.css`), just smaller: reusing the
 * classes rather than approximating the effect with a static dot is what keeps
 * the legend honest, and it inherits the reduced-motion fallback for free. It
 * carries one ring while the marker runs three: three rings inside a 12px swatch
 * is a blur, and a legend symbol has nowhere to travel and no reason to be
 * urgent.
 *
 * Its size comes from `RESPONDING_DOT_LEGEND_SIZE` rather than from hand-tuned
 * numbers, because the thing it has to match is the row it sits in: the pin
 * symbols here are 8px circles, so the dot's core is 8px too. A hand-tuned 14px
 * swatch next to them was the legend's version of the too-big marker.
 */
const RespondingDotSymbol = () => (
    <span
        className="pulse-marker shrink-0"
        style={{
            '--pulse-color': MAP_RESPONDING_INCIDENT_CONFIG.markerColor,
            '--pulse-size': `${RESPONDING_DOT_LEGEND_SIZE.footprint}px`,
            '--pulse-core': `${RESPONDING_DOT_LEGEND_SIZE.core}px`,
        }}
        aria-hidden="true"
    >
        <span className="pulse-marker__wave" />
        <span className="pulse-marker__core" />
    </span>
);

const GroupedMarkerSymbol = () => (
    <span
        className="inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full border border-white/90 bg-slate-900 px-0.5 text-[8px] font-bold leading-none text-white shadow-2xs ring-1 ring-gray-200 dark:border-gray-950 dark:bg-white dark:text-gray-950 dark:ring-gray-800"
        aria-hidden="true"
    >
        2
    </span>
);

const LegendItems = ({ statusKeys, hasGroupedReports = false, compact = false, showRiskZone = true }) => {
    if (!showRiskZone && statusKeys.length === 0 && !hasGroupedReports) {
        return null;
    }

    const itemClass = compact
        ? 'flex items-center gap-1.5 text-[11px] font-semibold text-gray-800 dark:text-gray-100'
        : 'flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-gray-700 dark:text-gray-200';

    return (
        <div className={compact ? 'space-y-1.5' : 'flex flex-wrap sm:flex-nowrap items-center gap-x-2.5 sm:gap-x-3 gap-y-1'}>
            {showRiskZone && (
                <div className={itemClass}>
                    <LegendSymbol status="risk" color={MAP_RISK_ZONE_CONFIG.markerColor} />
                    <span className="break-words leading-tight">{MAP_RISK_ZONE_CONFIG.label}</span>
                </div>
            )}
            {statusKeys.map((status) => {
                if (status === RESPONDING_INCIDENT_STATUS_KEY) {
                    // The entry names the marker: every rail folds verified,
                    // transferred and responding into one active set and draws
                    // this one as a dot, so "Being responded to" is what the
                    // viewer is looking at on any map (see mapExperience).
                    return (
                        <div key={status} className={itemClass}>
                            <RespondingDotSymbol />
                            <span className="break-words leading-tight">{MAP_RESPONDING_INCIDENT_CONFIG.label}</span>
                        </div>
                    );
                }
                const config = MAP_STATUS_CONFIG[status]
                    || (status === 'active' ? MAP_ACTIVE_INCIDENT_CONFIG : null);
                if (!config) return null;
                return (
                    <div key={status} className={itemClass}>
                        <LegendSymbol status={status} color={config.markerColor} />
                        <span className="break-words leading-tight">{config.label}</span>
                    </div>
                );
            })}
            {hasGroupedReports && (
                <div className={itemClass}>
                    <GroupedMarkerSymbol />
                    <span className="break-words leading-tight">Multiple incidents</span>
                </div>
            )}
        </div>
    );
};

const MapLegend = ({
    showPending = false,
    filterStatus = null,
    hasGroupedReports = false,
    showIncidentStatus = true,
    showRiskZone = true,
    showDesktopLegend = true,
}) => {
    const [desktopCollapsed, setDesktopCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const popoverId = useId();
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    // The legend mirrors the canvas: the hazard badge appears only while the
    // hazard layer is actually rendered (aggregate or hazard filter) and the
    // explicit hazard toggle is on.
    const isRiskZoneVisible = showRiskZone && isRiskZoneLayerVisibleForFilter(filterStatus);
    const statusKeys = showIncidentStatus
        ? getMapLegendStatusKeys({ showPending, filterStatus })
        : [];

    useEffect(() => {
        if (!mobileOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) setMobileOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setMobileOpen(false);
            triggerRef.current?.focus();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [mobileOpen]);

    useEffect(() => {
        setMobileOpen(false);
    }, [filterStatus, showPending]);

    if (!isRiskZoneVisible && statusKeys.length === 0 && !hasGroupedReports) {
        return null;
    }

    return (
        <>
            {showDesktopLegend && (
                desktopCollapsed ? (
                    <button
                        type="button"
                        onClick={() => setDesktopCollapsed(false)}
                        aria-label="Expand map legend"
                        title="Show map legend"
                        className="pointer-events-auto absolute left-2.5 bottom-9 z-20 hidden items-center gap-1.5 rounded-lg border border-gray-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:border-white/10 dark:bg-[#0c1813]/95 dark:text-gray-200 dark:hover:bg-[#0c1813] sm:inline-flex cursor-pointer"
                    >
                        <HiOutlineMap className="h-3.5 w-3.5 text-brand-600 dark:text-sky-400" aria-hidden="true" />
                        <span>Legend</span>
                    </button>
                ) : (
                    <section
                        aria-label="Map legend"
                        className="pointer-events-auto absolute left-2.5 bottom-9 z-20 hidden w-fit max-w-[calc(100%-2rem)] rounded-lg border border-gray-200/90 bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95 sm:block"
                    >
                        <div className="flex items-center gap-2">
                            <LegendItems statusKeys={statusKeys} hasGroupedReports={hasGroupedReports} showRiskZone={isRiskZoneVisible} />
                            <button
                                type="button"
                                onClick={() => setDesktopCollapsed(true)}
                                aria-label="Collapse map legend"
                                title="Collapse map legend"
                                className="ml-1 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                            >
                                <HiChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </div>
                    </section>
                )
            )}

            <div ref={containerRef} className="pointer-events-auto absolute left-2 top-2 z-20 sm:hidden">
                <button
                    ref={triggerRef}
                    type="button"
                    aria-expanded={mobileOpen}
                    aria-controls={popoverId}
                    aria-label="Map legend"
                    onClick={() => setMobileOpen((current) => !current)}
                    className="relative inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-gray-200/90 bg-white/95 backdrop-blur-md px-2 text-[10px] font-bold uppercase tracking-wider text-gray-800 shadow-2xs transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813]/95 dark:text-gray-200 dark:hover:bg-[#07130e] cursor-pointer before:absolute before:-inset-1.5 before:content-['']"
                >
                    <HiOutlineMap className="h-3 w-3 text-brand-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
                    <span>Map legend</span>
                </button>
                {mobileOpen && (
                    <section
                        id={popoverId}
                        role="region"
                        aria-label="Map legend details"
                        className="absolute left-0 top-10 w-40 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200/90 bg-white/95 p-2 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95 z-30"
                    >
                        <LegendItems statusKeys={statusKeys} hasGroupedReports={hasGroupedReports} showRiskZone={isRiskZoneVisible} compact />
                    </section>
                )}
            </div>
        </>
    );
};

export default MapLegend;

