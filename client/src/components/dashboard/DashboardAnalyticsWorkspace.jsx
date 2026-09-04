import { useEffect, useId, useState } from 'react';
import { format, formatDistanceToNow, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    HiChevronLeft,
    HiChevronRight,
} from 'react-icons/hi';
import MapView from '../map/MapView';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';
import { countReportsInMonth, filterReportsByDayKey, getTrendInsight } from '../../utils/analyticsTrend';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getFilteredMapReports } from '../../utils/mapReports';

const MAP_STATUS_FILTERS = Object.freeze([
    Object.freeze({ value: 'all', label: 'All Active' }),
    Object.freeze({ value: 'pending', label: 'Pending' }),
    Object.freeze({ value: 'verified', label: 'Verified' }),
    Object.freeze({ value: 'responding', label: 'Responding' }),
    Object.freeze({ value: 'transferred', label: 'Transferred' }),
    Object.freeze({ value: 'resolved', label: 'Resolved' }),
    Object.freeze({ value: 'risk-zones', label: 'Risk Zones' }),
]);

const SEVERITY_SERIES = Object.freeze([
    Object.freeze({ key: 'minor', label: 'Minor', fill: '#10B981' }),
    Object.freeze({ key: 'moderate', label: 'Moderate', fill: '#F59E0B' }),
    Object.freeze({ key: 'severe', label: 'Severe', fill: '#F97316' }),
    Object.freeze({ key: 'critical', label: 'Critical', fill: '#EF4444' }),
]);

const PANEL_CLASS = 'rounded-xl border border-gray-200/90 bg-white p-3.5 sm:p-4 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90';

const formatActivityTime = (value) => {
    if (!value) return 'Time unavailable';
    const date = parseISO(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return formatDistanceToNow(date, { addSuffix: true });
};

export const formatXAxisDay = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    const str = String(value).trim();
    const match = str.match(/\d+$/);
    if (match) return match[0];
    const date = new Date(str);
    if (!Number.isNaN(date.getTime())) {
        return String(date.getDate());
    }
    return str;
};

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-gray-200/90 bg-white/95 p-2.5 text-xs shadow-md backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95">
            <p className="mb-1 font-bold text-gray-900 dark:text-white">{payload[0].payload.fullDate || label}</p>
            {payload.map((entry) => (
                <div key={entry.dataKey} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{entry.name || entry.dataKey}</span>
                    <span className="font-bold text-gray-900 dark:text-white tabular-nums">{entry.value}</span>
                </div>
            ))}
        </div>
    );
};

const EmptyChart = ({ message = 'No data for the selected period', detail }) => (
    <div className="flex min-h-24 flex-col items-center justify-center rounded-lg bg-gray-50/80 px-4 py-5 text-center dark:bg-white/[0.02]">
        <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{message}</p>
        {detail && <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
);

const TrendPanel = ({ chartData, selectedMonth, reportCount, prevMonthCount, selectedDay, onSelectDay }) => {
    const activeDays = chartData.filter((day) => day.total > 0);
    const summaryId = useId();
    const hasTrendData = activeDays.length > 0;
    const insight = getTrendInsight(chartData, { selectedMonth, prevMonthCount });
    const presentSeverities = SEVERITY_SERIES.filter(({ key }) => chartData.some((day) => (Number(day?.[key]) || 0) > 0));
    const reportLabel = `${reportCount} ${reportCount === 1 ? 'report' : 'reports'}`;
    const activeDaySummary = activeDays
        .map((day) => `${day.fullDate}: ${day.total}`)
        .join(', ');
    const insightSummary = [
        reportLabel,
        insight.peak ? `peak ${insight.peak.fullDate} (${insight.peak.count})` : '',
        insight.delta ? insight.delta.label : '',
    ].filter(Boolean).join(', ');

    const handleBarClick = (datum) => {
        if (!datum || (Number(datum.total) || 0) <= 0 || typeof onSelectDay !== 'function') return;
        onSelectDay(datum.dayKey === selectedDay ? null : datum.dayKey);
    };

    return (
        <div className={`${PANEL_CLASS} lg:col-span-2`}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 dark:border-white/5">
                <div>
                    <h2 className="font-display text-sm font-bold text-gray-950 dark:text-white">Incident trend</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Daily volume for {format(selectedMonth, 'MMMM yyyy')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                    <p data-testid="trend-insight">
                        <span className="tabular-nums font-bold text-gray-700 dark:text-gray-300">{reportLabel}</span>
                        {insight.peak && (
                            <>
                                <span aria-hidden="true"> · Peak </span>
                                <button
                                    type="button"
                                    onClick={() => onSelectDay?.(insight.peak.dayKey)}
                                    title={`Filter map to ${insight.peak.fullDate}`}
                                    aria-label={`Filter map to ${insight.peak.fullDate}`}
                                    className="font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                                >
                                    {insight.peak.label}
                                </button>
                            </>
                        )}
                        {insight.total > 0 && insight.quietDays > 0 && (
                            <span> · {insight.quietDays} quiet {insight.quietDays === 1 ? 'day' : 'days'}</span>
                        )}
                        {insight.delta && (
                            <span className="tabular-nums"> · {insight.delta.label}</span>
                        )}
                    </p>
                    {presentSeverities.length > 0 && (
                        <p className="flex items-center gap-2.5" aria-label="Severity legend">
                            {presentSeverities.map(({ key, label, fill }) => (
                                <span key={key} className="inline-flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: fill }} aria-hidden="true" />
                                    <span>{label}</span>
                                </span>
                            ))}
                        </p>
                    )}
                </div>
            </div>

            {!hasTrendData ? (
                <div className="mt-3">
                    <EmptyChart
                        message={reportCount === 0 ? 'No reports in this period' : 'No valid report dates in this period'}
                        detail={reportCount === 0
                            ? 'Choose another month.'
                            : 'Some reports could not be plotted because their timestamps are missing or invalid.'}
                    />
                </div>
            ) : (
                <div className="mt-3">
                    <p id={summaryId} className="sr-only">
                        {reportLabel} recorded. Reports by active day: {activeDaySummary}. {insightSummary}.
                    </p>
                    <div
                        className="h-44 min-w-0 w-full sm:h-48"
                        role="img"
                        aria-label={`Daily incident report trend for ${format(selectedMonth, 'MMMM yyyy')}`}
                        aria-describedby={summaryId}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} data-testid="incident-bar-chart" margin={{ top: 6, right: 8, left: -24, bottom: 0 }} barCategoryGap="30%">
                                <CartesianGrid strokeDasharray="3 4" vertical stroke="var(--chart-grid)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
                                    tickFormatter={formatXAxisDay}
                                    interval={6}
                                    dy={6}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
                                    allowDecimals={false}
                                    width={28}
                                />
                                <Tooltip content={<ChartTooltip />} />
                                {SEVERITY_SERIES.map(({ key, label, fill }) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        name={label}
                                        stackId="incidents"
                                        fill={fill}
                                        isAnimationActive={false}
                                        onClick={handleBarClick}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};

const LifecyclePanel = ({ statusData, totalReports }) => (
    <div className={PANEL_CLASS}>
        <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-white/5">
            <div>
                <h2 className="font-display text-sm font-bold text-gray-950 dark:text-white">Report lifecycle</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Status distribution for the selected month</p>
            </div>
            {totalReports > 0 && (
                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                    {totalReports} total
                </span>
            )}
        </div>
        {statusData.length ? (
            <div className="mt-3 space-y-3" aria-label="Report lifecycle distribution">
                {/* Visual Segmented Proportional Distribution Track */}
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5 gap-0.5" aria-hidden="true">
                    {statusData.map((item) => {
                        const pct = totalReports ? (item.value / totalReports) * 100 : 0;
                        if (pct <= 0) return null;
                        return (
                            <div
                                key={item.name}
                                style={{ width: `${pct}%`, backgroundColor: item.color }}
                                className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                                title={`${item.name}: ${item.value}`}
                            />
                        );
                    })}
                </div>

                {/* Status Breakdown Rows */}
                <div className="divide-y divide-gray-100/80 dark:divide-white/5">
                    {statusData.map((item) => {
                        const percentage = totalReports ? Math.round((item.value / totalReports) * 100) : 0;
                        return (
                            <div key={item.name} className="flex items-center justify-between py-2 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                                    <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                                </div>
                                <span className="font-bold text-gray-700 dark:text-gray-300 tabular-nums shrink-0">
                                    {item.value} · {percentage}%
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        ) : (
            <div className="mt-3"><EmptyChart message="No lifecycle data" detail="No reports were created in the selected month." /></div>
        )}
    </div>
);

const RankedBreakdownPanel = ({ title, description, data, emptyDetail, isMunicipality = false }) => {
    const totalCount = data.reduce((sum, item) => sum + (item.count || 0), 0);

    return (
        <div className={PANEL_CLASS}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-white/5">
                <div>
                    <h2 className="font-display text-sm font-bold text-gray-950 dark:text-white">{title}</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                {data.length > 0 && (
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        {data.length} {isMunicipality ? 'municipalities' : 'recorded'}
                    </span>
                )}
            </div>

            {data.length ? (
                <div className="mt-3 space-y-1.5" role="list" aria-label={`${title}: ${description}`}>
                    {data.map((item, index) => {
                        const count = item.count || 0;
                        const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                        const isTop = index === 0 && count > 0;

                        return (
                            <div
                                key={item.name}
                                className="group relative rounded-lg px-2.5 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                                role="listitem"
                            >
                                <div className="flex items-center justify-between gap-2 text-xs relative z-10">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className={`font-mono text-[11px] font-semibold shrink-0 ${
                                            isTop ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
                                        }`}>
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <span className="truncate font-semibold text-gray-900 dark:text-gray-100">
                                            {item.name}
                                        </span>
                                    </div>
                                    <span className="shrink-0 font-bold tabular-nums text-gray-700 dark:text-gray-300">
                                        {count} <span className="text-[10px] font-normal text-gray-400">({percentage}%)</span>
                                    </span>
                                </div>
                                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            isTop ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600'
                                        }`}
                                        style={{ width: `${Math.max(percentage, count > 0 ? 4 : 0)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="mt-3">
                    <EmptyChart message={`No ${title.toLowerCase()} data`} detail={emptyDetail} />
                </div>
            )}
        </div>
    );
};

const DashboardAnalyticsWorkspace = ({
    user,
    hasMunicipality,
    selectedMonth,
    setSelectedMonth,
    reports,
    allReports,
    highRiskZones,
    performanceMetrics,
    chartData,
    statusData,
    municipalityBarData,
    barangayBarData,
    incidentTypeBarData,
    dashboardReports: _dashboardReports,
    focusLocation,
    historySectionRef,
    loading,
    error,
    onOpenMap,
    onOpenReports,
}) => {
    const activeRiskZoneCount = highRiskZones.filter((zone) => zone.isActive !== false).length;
    const [mapStatusFilter, setMapStatusFilter] = useState('all');
    const [selectedDay, setSelectedDay] = useState(null);

    // Day drill-downs belong to one month view; a new month starts unfiltered.
    useEffect(() => {
        setSelectedDay(null);
    }, [selectedMonth]);

    const prevMonthCount = countReportsInMonth(allReports, subMonths(selectedMonth, 1));
    const mapDayReports = selectedDay ? filterReportsByDayKey(reports, selectedDay) : reports;
    const selectedDayLabel = (chartData || []).find((day) => day?.dayKey === selectedDay)?.date || selectedDay;

    const getMapFilterCount = (filterValue) => {
        if (filterValue === 'risk-zones') {
            return activeRiskZoneCount;
        }
        return getFilteredMapReports(reports, {
            includePending: true,
            statusFilter: filterValue,
            filterMode: 'review',
        }).length;
    };

    const recentReports = [...allReports]
        .sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt))
        .slice(0, 5);

    const exportDashboard = async () => {
        const [{ default: ExcelJS }, { buildAnalyticsWorkbook, writeWorkbookToBuffer }, { default: fileSaver }] = await Promise.all([
            import('exceljs'),
            import('../../utils/excelExport'),
            import('file-saver'),
        ]);
        const monthLabel = format(selectedMonth, 'MMMM yyyy');
        const workbook = buildAnalyticsWorkbook(ExcelJS, {
            scopeLabel: hasMunicipality ? (user?.assignedMunicipality || 'Municipal') : 'Island-wide',
            monthLabel,
            exportedAt: new Date(),
            summary: [
                { metric: 'New Reports in Selected Month', value: reports.length },
                { metric: 'Total Reports in Scope', value: allReports.length },
                { metric: 'Pending Review', value: performanceMetrics.pendingCount },
                { metric: 'Available for Dispatch', value: performanceMetrics.dispatchReadyCount },
                { metric: 'Active Responses', value: performanceMetrics.respondingCount },
                { metric: 'Resolved Cases', value: performanceMetrics.resolvedCount },
                { metric: 'Resolution Rate', value: `${performanceMetrics.resolutionRate}%` },
                { metric: 'Average Response Time (Minutes)', value: performanceMetrics.avgResponseMin ?? 'No data' },
                { metric: 'Median Response Time (Minutes)', value: performanceMetrics.medianResponseMin ?? 'No data' },
                { metric: 'Active High-Risk Zones', value: activeRiskZoneCount },
            ],
            incidents: allReports,
            zones: highRiskZones,
        });

        const buffer = await writeWorkbookToBuffer(workbook);
        fileSaver.saveAs(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `Sibuyan_Alert_Analytics_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
        );
    };

    if (loading) {
        return (
            <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-3 sm:space-y-4" role="status" aria-busy="true" aria-label="Loading analytics">
                <span className="sr-only">Loading analytics</span>
                <SkeletonCard className="h-16" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                    {[0, 1, 2, 3].map((item) => (
                        <SkeletonCard key={item} className="h-24 p-3 sm:p-4 flex flex-col justify-between">
                            <Skeleton variant="text" className="h-3 w-16" />
                            <Skeleton variant="text" className="h-6 w-10 mt-1" />
                        </SkeletonCard>
                    ))}
                </div>
                <SkeletonCard className="h-64" />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-3.5 sm:space-y-4">
            {/* Header & Controls */}
            <header className="flex flex-col gap-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            {hasMunicipality ? `${user?.assignedMunicipality} EOC` : 'Island-wide Operations'}
                        </span>
                        <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                            Municipal Situation Overview
                        </h1>
                        <p className="mt-0.5 max-w-2xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                            {hasMunicipality
                                ? `${user?.assignedMunicipality} incident status and response readiness for ${format(selectedMonth, 'MMMM yyyy')}.`
                                : `Island-wide incident briefing and municipal comparisons for ${format(selectedMonth, 'MMMM yyyy')}.`}
                        </p>
                    </div>
                </div>

                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center" role="toolbar" aria-label="Analytics controls">
                    <div className="flex min-h-9 w-full items-center justify-between rounded-lg border border-gray-200/90 bg-gray-100/80 p-0.5 dark:border-white/10 dark:bg-white/5 lg:w-52">
                        <button
                            type="button"
                            onClick={() => setSelectedMonth((current) => subMonths(current, 1))}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-950 hover:shadow-2xs dark:text-gray-400 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            aria-label="Previous month"
                        >
                            <HiChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedMonth(new Date())}
                            className="min-w-0 flex-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-800 hover:bg-white hover:text-gray-950 hover:shadow-2xs dark:text-gray-200 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            aria-label="Return to current month"
                        >
                            {format(selectedMonth, 'MMM yyyy')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const nextMonth = addMonths(selectedMonth, 1);
                                if (nextMonth <= new Date()) setSelectedMonth(nextMonth);
                            }}
                            disabled={isSameMonth(selectedMonth, new Date())}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-gray-600 hover:bg-white hover:text-gray-950 hover:shadow-2xs dark:text-gray-400 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Next month"
                        >
                            <HiChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenMap}
                        className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 lg:w-auto lg:min-w-24"
                    >
                        Map
                    </button>
                    <button
                        type="button"
                        onClick={exportDashboard}
                        className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-semibold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:w-auto lg:min-w-24"
                        aria-label="Export dashboard data as Excel"
                    >
                        Export
                    </button>
                </div>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200/90 bg-red-50/80 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

            {/* Situation Summary */}
            <section aria-label="Analytics summary">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Incident overview
                    </h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        Operational status
                    </span>
                </div>

                {/* 4-Column Operational Status Grid */}
                <div className="mt-1 grid grid-cols-2 lg:grid-cols-4">
                    {/* 1. Pending Review */}
                    <div className="px-1 py-4 sm:px-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Pending review
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                            {performanceMetrics.pendingCount}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {performanceMetrics.pendingCount > 0 ? 'Awaiting review' : 'No pending reports'}
                        </p>
                        {performanceMetrics.pendingCount > 0 && (
                            <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                Action needed
                            </p>
                        )}
                    </div>

                    {/* 2. Dispatch Ready */}
                    <div className="border-l border-gray-200 px-1 py-4 pl-4 sm:px-4 dark:border-white/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Dispatch ready
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                            {performanceMetrics.dispatchReadyCount}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {performanceMetrics.dispatchReadyCount > 0 ? 'Verified, unassigned' : 'No unassigned incidents'}
                        </p>
                    </div>

                    {/* 3. Responding */}
                    <div className="border-gray-200 px-1 py-4 max-lg:border-t max-lg:border-gray-200 sm:px-4 max-lg:dark:border-white/10 lg:border-l lg:pl-4 dark:border-white/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Responding
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                            {performanceMetrics.respondingCount}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {performanceMetrics.respondingCount > 0 ? 'Field response active' : 'No active field response'}
                        </p>
                    </div>

                    {/* 4. Resolved */}
                    <div className="border-l border-gray-200 px-1 py-4 pl-4 sm:px-4 max-lg:border-t max-lg:border-gray-200 max-lg:dark:border-white/10 dark:border-white/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Resolved
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                            {performanceMetrics.resolvedCount}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {performanceMetrics.resolutionRate}% resolution rate
                        </p>
                    </div>
                </div>

                {/* Integrated Baseline Operational Facts Footer Bar */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-gray-200 py-2 text-xs text-gray-600 dark:border-white/10 dark:text-gray-400">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">New reports</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{reports.length}</span>
                            </span>
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Median response</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {performanceMetrics.medianResponseMin === null ? '—' : `${performanceMetrics.medianResponseMin}m`}
                                </span>
                                <span className="text-[11px] text-gray-400">
                                    {performanceMetrics.responseSampleCount
                                        ? `(${performanceMetrics.responseSampleCount} responded incident${performanceMetrics.responseSampleCount === 1 ? '' : 's'})`
                                        : 'No responded incidents'}
                                </span>
                            </span>
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Active risk zones</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{activeRiskZoneCount}</span>
                            </span>
                        </div>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {format(selectedMonth, 'MMMM yyyy')} scope
                        </span>
                    </div>
            </section>

            {/* Monthly Insights Section: Incident Trend & Lifecycle */}
            <section className="grid gap-3 lg:grid-cols-3" aria-label="Monthly insights">
                <TrendPanel chartData={chartData} selectedMonth={selectedMonth} reportCount={reports.length} prevMonthCount={prevMonthCount} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
                <LifecyclePanel statusData={statusData} totalReports={reports.length} />
            </section>

            {/* Incident Map Section */}
            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Analytics map">
                <div className="flex flex-col gap-2 p-2 sm:p-2.5">
                    <div className="flex items-center justify-between gap-3 px-1 pt-0.5">
                        <div className="flex min-w-0 items-baseline gap-2">
                            <h2 className="shrink-0 text-xs font-semibold text-gray-900 sm:text-sm dark:text-white">Monthly incident map</h2>
                            <p className="hidden truncate text-[11px] text-gray-500 sm:block dark:text-gray-400">
                                Geographic incident distribution for {format(selectedMonth, 'MMMM yyyy')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenMap}
                            className="inline-flex min-h-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                        >
                            Open full map
                        </button>
                    </div>

                    {/* Status Filter Tabs (also the live legend) */}
                    <div
                        className="flex min-w-0 flex-1 flex-wrap items-end gap-x-5 gap-y-1 w-full border-b border-gray-200 px-1 dark:border-white/10"
                        aria-label="Map status filter"
                        role="group"
                    >
                        {MAP_STATUS_FILTERS.map((filter) => {
                            const count = getMapFilterCount(filter.value);
                            const isSelected = mapStatusFilter === filter.value;
                            const statusCfg = filter.value === 'risk-zones'
                                ? { dot: 'bg-red-500' }
                                : MAP_STATUS_CONFIG[filter.value] || { dot: 'bg-gray-400' };

                            return (
                                <button
                                    key={filter.value}
                                    type="button"
                                    onClick={() => setMapStatusFilter(filter.value)}
                                    aria-pressed={isSelected}
                                    aria-label={`${filter.label} filter (${count} ${count === 1 ? 'record' : 'records'})${isSelected ? ', selected' : ''}`}
                                    className={`relative -mb-px inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 pb-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${isSelected
                                        ? 'border-emerald-600 font-semibold text-emerald-800 dark:border-emerald-500 dark:text-emerald-300'
                                        : `border-transparent font-normal text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white${count === 0 ? ' opacity-60' : ''}`
                                    }`}
                                >
                                    {statusCfg?.dot && (
                                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                                    )}
                                    <span>{filter.label}</span>
                                    <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {/* Selected-day drill-down (from trend bars or peak link) */}
                    {selectedDay && (
                        <div className="flex items-center gap-2 px-1">
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                Showing {selectedDayLabel}
                            </p>
                            <button
                                type="button"
                                onClick={() => setSelectedDay(null)}
                                aria-label={`Clear day filter ${selectedDayLabel}`}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                <div className="aspect-square w-full sm:aspect-auto sm:h-[360px] lg:h-[400px]">
                    <MapView
                        reports={mapDayReports}
                        highRiskZones={highRiskZones}
                        showPending
                        filterMode="review"
                        filterStatus={mapStatusFilter}
                        viewerRole={user?.role || 'guest'}
                        showDataState
                        enable3D
                        showLegend={false}
                        className="h-full w-full"
                        focusLocation={focusLocation}
                    />
                </div>
            </section>

            {/* Operational Breakdown Section: Ranked Barangay & Category Lists */}
            <section className="grid gap-3 lg:grid-cols-2" aria-label="Operational breakdown">
                {hasMunicipality ? (
                    <>
                        <RankedBreakdownPanel
                            title="By barangay"
                            description={`Reports within ${user?.assignedMunicipality || 'the assigned municipality'}`}
                            data={barangayBarData.slice(0, 8)}
                            emptyDetail="Barangay information was not supplied for reports in this period."
                        />
                        <RankedBreakdownPanel
                            title="By incident type"
                            description="Most reported incident classifications"
                            data={incidentTypeBarData.slice(0, 8)}
                            emptyDetail="Incident type information is unavailable for this period."
                        />
                    </>
                ) : (
                    <>
                        <RankedBreakdownPanel
                            title="By municipality"
                            description="Reports per municipality"
                            data={municipalityBarData}
                            isMunicipality
                            emptyDetail="No municipality totals are available for this period."
                        />
                        <RankedBreakdownPanel
                            title="By barangay"
                            description="Top barangays by report count"
                            data={barangayBarData.slice(0, 8)}
                            emptyDetail="Barangay information was not supplied for reports in this period."
                        />
                    </>
                )}
            </section>

            {/* Recent Operational Activity Section */}
            <section ref={historySectionRef} aria-label="Recent activity">
                <div className="flex items-baseline justify-between gap-2">
                    <div>
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Recent activity</h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Latest updates across the current scope</p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenReports}
                        className="inline-flex shrink-0 items-center text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                    >
                        View incident queue
                    </button>
                </div>
                {recentReports.length ? (
                    <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-200 dark:divide-white/5 dark:border-white/10">
                        {recentReports.map((reportItem) => {
                            const status = (reportItem.status || 'pending').toLowerCase();
                            const statusConfig = MAP_STATUS_CONFIG[status] || MAP_STATUS_CONFIG.pending;
                            return (
                                <li key={reportItem._id}>
                                <article
                                    onClick={onOpenReports}
                                    className="flex items-center gap-3 py-3 transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] cursor-pointer"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {reportItem.address || reportItem.title || 'Location unavailable'}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                            {reportItem.municipalityName || 'Unknown municipality'}
                                            <span aria-hidden="true"> · </span>
                                            {reportItem.incidentType ? String(reportItem.incidentType).replace(/[_-]+/g, ' ') : 'Unclassified incident'}
                                            <span aria-hidden="true"> · </span>
                                            {formatActivityTime(reportItem.updatedAt || reportItem.createdAt)}
                                        </p>
                                    </div>
                                    <span
                                        className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                                        title={`Status: ${statusConfig.label || status}`}
                                        aria-label={`Status: ${statusConfig.label || status}`}
                                    >
                                        {statusConfig.label || status}
                                    </span>
                                </article>
                                </li>
                            );
                        })}
                    </ul>
                ) : <EmptyState />}
            </section>
        </div>
    );
};

const EmptyState = () => <div className="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">No recent activity available.</div>;

export default DashboardAnalyticsWorkspace;
