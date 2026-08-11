import { useEffect, useId, useRef, useState } from 'react';
import { HiOutlineLightningBolt, HiOutlineMap } from 'react-icons/hi';
import {
    getMapLegendStatusKeys,
    MAP_RISK_ZONE_CONFIG,
    MAP_STATUS_CONFIG,
} from '../../config/mapVisuals';

const LegendSymbol = ({ shape, color }) => {
    if (shape === 'risk') {
        return (
            <span
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-white text-white shadow-sm ring-1 ring-gray-200"
                style={{ backgroundColor: color }}
                aria-hidden="true"
            >
                <HiOutlineLightningBolt className="h-2 w-2" />
            </span>
        );
    }

    if (shape === 'diamond') {
        return (
            <span
                className="h-1.5 w-1.5 shrink-0 rotate-45 rounded-[1px]"
                style={{ backgroundColor: color }}
                aria-hidden="true"
            />
        );
    }

    if (shape === 'pulse') {
        return (
            <span className="relative flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden="true">
                <span className="absolute h-3 w-3 rounded-full opacity-20" style={{ backgroundColor: color }} />
                <span className="relative h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            </span>
        );
    }

    return (
        <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
        />
    );
};

const GroupedMarkerSymbol = () => (
    <span
        className="inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full border border-white bg-gray-900 px-0.5 text-[7px] font-bold leading-none text-white shadow-sm ring-1 ring-gray-200"
        aria-hidden="true"
    >
        2
    </span>
);

const LegendItems = ({ statusKeys, hasGroupedReports = false, compact = false }) => (
    <div className={compact ? 'space-y-1.5' : 'flex flex-wrap items-center gap-x-3 gap-y-1'}>
        <div className="flex min-h-5 items-center gap-2 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-700">
            <LegendSymbol shape="risk" color={MAP_RISK_ZONE_CONFIG.markerColor} />
            <span>{MAP_RISK_ZONE_CONFIG.label}</span>
        </div>
        {statusKeys.map((status) => {
            const config = MAP_STATUS_CONFIG[status];
            return (
                <div key={status} className="flex min-h-5 items-center gap-2 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-700">
                    <LegendSymbol shape={config.legendShape} color={config.markerColor} />
                    <span>{config.label}</span>
                </div>
            );
        })}
        {hasGroupedReports && (
            <div className="flex min-h-5 items-center gap-2 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-700">
                <GroupedMarkerSymbol />
                <span>Multiple incidents</span>
            </div>
        )}
    </div>
);

const MapLegend = ({ showPending = false, filterStatus = null, filterMode = 'public', hasGroupedReports = false }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const popoverId = useId();
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const statusKeys = getMapLegendStatusKeys({ showPending, filterStatus, filterMode });

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

    return (
        <>
            <section
                aria-label="Map legend"
                className="pointer-events-auto absolute left-1/2 top-2 z-20 hidden w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-sm border border-gray-300 bg-white px-2.5 py-1.5 shadow-sm sm:block sm:px-3 sm:py-2"
            >
                <LegendItems statusKeys={statusKeys} hasGroupedReports={hasGroupedReports} />
            </section>

            <div ref={containerRef} className="pointer-events-auto absolute left-2 top-2 z-20 sm:hidden">
                <button
                    ref={triggerRef}
                    type="button"
                    aria-expanded={mobileOpen}
                    aria-controls={popoverId}
                    onClick={() => setMobileOpen((current) => !current)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                    <HiOutlineMap className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
                    Map legend
                </button>
                {mobileOpen && (
                    <section
                        id={popoverId}
                        aria-label="Map legend details"
                        className="absolute left-0 top-10 w-48 max-w-[calc(100vw-1rem)] rounded-sm border border-gray-300 bg-white p-2.5 shadow-md sm:p-4"
                    >
                        <p className="pb-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 sm:text-[10px] sm:pb-2">Map legend</p>
                        <LegendItems statusKeys={statusKeys} hasGroupedReports={hasGroupedReports} compact />
                    </section>
                )}
            </div>
        </>
    );
};

export default MapLegend;
