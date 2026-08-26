import { useEffect, useId, useRef, useState } from 'react';
import { HiOutlineMap } from 'react-icons/hi';
import {
    getMapLegendStatusKeys,
    isRiskZoneLayerVisibleForFilter,
    MAP_RISK_ZONE_CONFIG,
    MAP_STATUS_CONFIG,
} from '../../config/mapVisuals';

const LEGEND_RING_CLASSES = {
    risk: 'ring-red-200 dark:ring-red-900',
    pending: 'ring-amber-200 dark:ring-amber-900',
    verified: 'ring-blue-200 dark:ring-blue-900',
    transferred: 'ring-violet-200 dark:ring-violet-900',
    responding: 'ring-cyan-200 dark:ring-cyan-900',
    resolved: 'ring-green-200 dark:ring-green-900',
    rejected: 'ring-gray-300 dark:ring-gray-700',
};

const LegendSymbol = ({ status, color }) => (
    <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-2xs ring-1 ${LEGEND_RING_CLASSES[status] || ''}`}
        style={{ backgroundColor: color }}
        aria-hidden="true"
    />
);

const GroupedMarkerSymbol = () => (
    <span
        className="inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full border border-white bg-slate-900 px-0.5 text-[8px] font-bold leading-none text-white shadow-2xs ring-1 ring-gray-200 dark:border-gray-950 dark:bg-white dark:text-gray-950 dark:ring-gray-800"
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
        ? 'flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200'
        : 'flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] sm:text-[11px] font-medium text-gray-700 dark:text-gray-200';

    return (
        <div className={compact ? 'space-y-2' : 'flex flex-wrap sm:flex-nowrap items-center gap-x-3 sm:gap-x-3.5 gap-y-1'}>
            {showRiskZone && (
                <div className={itemClass}>
                    <LegendSymbol status="risk" color={MAP_RISK_ZONE_CONFIG.markerColor} />
                    <span className="break-words leading-tight">{MAP_RISK_ZONE_CONFIG.label}</span>
                </div>
            )}
            {statusKeys.map((status) => {
                const config = MAP_STATUS_CONFIG[status];
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
    filterMode = 'public',
    hasGroupedReports = false,
    showIncidentStatus = true,
    showRiskZone = true,
}) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const popoverId = useId();
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    // The legend mirrors the canvas: the hazard badge appears only while the
    // hazard layer is actually rendered (aggregate or hazard filter) and the
    // explicit hazard toggle is on.
    const isRiskZoneVisible = showRiskZone && isRiskZoneLayerVisibleForFilter(filterStatus);
    const statusKeys = showIncidentStatus
        ? getMapLegendStatusKeys({ showPending, filterStatus, filterMode })
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
    }, [filterMode, filterStatus, showPending]);

    if (!isRiskZoneVisible && statusKeys.length === 0 && !hasGroupedReports) {
        return null;
    }

    return (
        <>
            <section
                aria-label="Map legend"
                className="pointer-events-auto absolute left-1/2 top-2.5 sm:top-3 z-20 hidden w-fit max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full border border-gray-200/90 bg-white/95 px-3 sm:px-3.5 py-1 backdrop-blur-md shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/95 sm:block"
            >
                <LegendItems statusKeys={statusKeys} hasGroupedReports={hasGroupedReports} showRiskZone={isRiskZoneVisible} />
            </section>

            <div ref={containerRef} className="pointer-events-auto absolute left-3 top-3 z-20 sm:hidden">
                <button
                    ref={triggerRef}
                    type="button"
                    aria-expanded={mobileOpen}
                    aria-controls={popoverId}
                    onClick={() => setMobileOpen((current) => !current)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-gray-200/90 bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-800 backdrop-blur-md shadow-2xs transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813]/95 dark:text-gray-200 dark:hover:bg-[#07130e]"
                >
                    <HiOutlineMap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Map legend
                </button>
                {mobileOpen && (
                    <section
                        id={popoverId}
                        aria-label="Map legend details"
                        className="absolute left-0 top-10 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200/90 bg-white/95 p-3.5 backdrop-blur-md shadow-lg dark:border-white/10 dark:bg-[#0c1813]/95 sm:p-4"
                    >
                        <p className="pb-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 sm:pb-2 sm:text-[10px]">Map legend</p>
                        <LegendItems statusKeys={statusKeys} hasGroupedReports={hasGroupedReports} showRiskZone={isRiskZoneVisible} compact />
                    </section>
                )}
            </div>
        </>
    );
};

export default MapLegend;
