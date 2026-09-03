import { useId, useState } from 'react';
import { format, formatDistanceToNow, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    HiChevronLeft,
    HiChevronRight,
    HiOutlineCheck,
    HiOutlineDownload,
    HiOutlineFilter,
    HiOutlineMap,
} from 'react-icons/hi';
import MapView from '../map/MapView';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';
import { buildCsvDocument } from '../../utils/csvExport';
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

const TREND_SERIES = Object.freeze({
    daily: Object.freeze({ label: 'Daily reports' }),
});

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

const TrendPanel = ({ chartData, selectedMonth, reportCount }) => {
    const activeDays = chartData.filter((day) => day.total > 0);
    const summaryId = useId();
    const hasTrendData = activeDays.length > 0;
    const reportLabel = `${reportCount} ${reportCount === 1 ? 'report' : 'reports'}`;
    const activeDaySummary = activeDays
        .map((day) => `${day.fullDate}: ${day.total}`)
        .join(', ');

    return (
        <div className={`${PANEL_CLASS} lg:col-span-2`}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-white/5">
                <div>
                    <h2 className="font-display text-sm font-bold text-gray-950 dark:text-white">Incident trend</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Daily volume for {format(selectedMonth, 'MMMM yyyy')}</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-500" />
                        {TREND_SERIES.daily.label}
                    </span>
                    <span>·</span>
                    <span className="tabular-nums font-bold text-gray-700 dark:text-gray-300">{reportLabel}</span>
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
                        {reportLabel} recorded. Reports by active day: {activeDaySummary}.
                    </p>
                    <div
                        className="h-44 min-w-0 w-full sm:h-48"
                        role="img"
                        aria-label={`Daily incident report trend for ${format(selectedMonth, 'MMMM yyyy')}`}
                        aria-describedby={summaryId}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 4" vertical stroke="var(--chart-grid)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
                                    tickFormatter={formatXAxisDay}
                                    interval="preserveStartEnd"
                                    minTickGap={16}
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
                                <Line
                                    type="monotone"
                                    dataKey="total"
                                    name={TREND_SERIES.daily.label}
                                    stroke="#2563EB"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                                    isAnimationActive={false}
                                />
                            </LineChart>
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
        const fileSaver = await import('file-saver');
        const summaryData = [
            { Metric: 'New Reports in Selected Month', Value: reports.length },
            { Metric: 'Total Reports in Scope', Value: allReports.length },
            { Metric: 'Pending Review', Value: performanceMetrics.pendingCount },
            { Metric: 'Available for Dispatch', Value: performanceMetrics.dispatchReadyCount },
            { Metric: 'Active Responses', Value: performanceMetrics.respondingCount },
            { Metric: 'Resolved Cases', Value: performanceMetrics.resolvedCount },
            { Metric: 'Resolution Rate', Value: `${performanceMetrics.resolutionRate}%` },
            { Metric: 'Average Response Time (Minutes)', Value: performanceMetrics.avgResponseMin ?? 'No data' },
            { Metric: 'Median Response Time (Minutes)', Value: performanceMetrics.medianResponseMin ?? 'No data' },
            { Metric: 'Active High-Risk Zones', Value: activeRiskZoneCount },
            { Metric: 'Exported At', Value: format(new Date(), 'MMMM d, yyyy h:mm a') },
        ];
        const incidentData = allReports.map((report) => ({
            'Date Reported': format(new Date(report.createdAt), 'yyyy-MM-dd HH:mm'),
            'Incident Title': report.title || 'Unknown',
            Category: report.incidentCategory || 'accident',
            Type: report.incidentType || 'Unknown',
            Status: (report.status || 'unknown').toUpperCase(),
            Priority: (report.priority || 'unknown').toUpperCase(),
            Municipality: report.municipalityName || 'Unknown',
            Barangay: report.barangay || 'Unknown',
            'Exact Address': report.address || 'Unknown',
            Injuries: report.casualties?.injured || 0,
            Fatalities: report.casualties?.fatalities || 0,
            Reporter: report.reporter?.name || 'Unknown User',
        }));
        const zoneData = highRiskZones.map((zone) => ({
            'Zone Name': zone.name || 'Unnamed Zone',
            Type: (zone.type || 'unknown').replace('_', ' ').toUpperCase(),
            Municipality: zone.municipality || zone.municipalityName || 'Unknown',
            Address: zone.address || 'Unknown',
            Status: zone.isActive ? 'Active' : 'Inactive',
            'Incident Count': zone.stats?.incidentCount || 0,
            'Radius (m)': zone.radius || 0,
        }));

        const csv = buildCsvDocument([
            {
                title: 'Dashboard Summary',
                columns: [
                    { key: 'Metric', label: 'Metric' },
                    { key: 'Value', label: 'Value' },
                ],
                rows: summaryData,
            },
            {
                title: 'Incident Reports',
                columns: [
                    'Date Reported',
                    'Incident Title',
                    'Category',
                    'Type',
                    'Status',
                    'Priority',
                    'Municipality',
                    'Barangay',
                    'Exact Address',
                    'Injuries',
                    'Fatalities',
                    'Reporter',
                ].map((key) => ({ key, label: key })),
                rows: incidentData,
            },
            {
                title: 'High Risk Zones',
                columns: [
                    'Zone Name',
                    'Type',
                    'Municipality',
                    'Address',
                    'Status',
                    'Incident Count',
                    'Radius (m)',
                ].map((key) => ({ key, label: key })),
                rows: zoneData,
            },
        ]);

        fileSaver.saveAs(
            new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
            `Sibuyan_Alert_Analytics_${format(new Date(), 'yyyy-MM-dd')}.csv`
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
                        className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 lg:w-auto lg:min-w-24"
                    >
                        <HiOutlineMap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        Map
                    </button>
                    <button
                        type="button"
                        onClick={exportDashboard}
                        className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-semibold text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:w-auto lg:min-w-24"
                        aria-label="Export dashboard data as CSV"
                    >
                        <HiOutlineDownload className="h-4 w-4" aria-hidden="true" />
                        Export
                    </button>
                </div>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200/90 bg-red-50/80 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

            {/* Situation Summary (Unified Executive Operational Ledger) */}
            <section aria-label="Analytics summary">
                <div className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 dark:border-white/5 dark:bg-white/[0.02]">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                            Incident overview
                        </h2>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                            Operational Status
                        </span>
                    </div>

                    {/* 4-Column Operational Status Grid */}
                    <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-white/5 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
                        {/* 1. Pending Review */}
                        <div className="group relative flex flex-col justify-between p-3.5 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Pending review
                                </span>
                                {performanceMetrics.pendingCount > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        Action needed
                                    </span>
                                )}
                            </div>
                            <div className="my-2 flex items-baseline">
                                <span className="font-display text-2xl sm:text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
                                    {performanceMetrics.pendingCount}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                                {performanceMetrics.pendingCount > 0 ? 'Awaiting review' : 'No pending reports'}
                            </p>
                        </div>

                        {/* 2. Dispatch Ready */}
                        <div className="group relative flex flex-col justify-between p-3.5 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Dispatch ready
                                </span>
                                {performanceMetrics.dispatchReadyCount > 0 && (
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                                )}
                            </div>
                            <div className="my-2 flex items-baseline">
                                <span className="font-display text-2xl sm:text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
                                    {performanceMetrics.dispatchReadyCount}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                                {performanceMetrics.dispatchReadyCount > 0 ? 'Verified, unassigned' : 'No unassigned incidents'}
                            </p>
                        </div>

                        {/* 3. Responding */}
                        <div className="group relative flex flex-col justify-between p-3.5 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Responding
                                </span>
                                {performanceMetrics.respondingCount > 0 ? (
                                    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                                    </span>
                                ) : null}
                            </div>
                            <div className="my-2 flex items-baseline">
                                <span className="font-display text-2xl sm:text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
                                    {performanceMetrics.respondingCount}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                                {performanceMetrics.respondingCount > 0 ? 'Field response active' : 'No active field response'}
                            </p>
                        </div>

                        {/* 4. Resolved */}
                        <div className="group relative flex flex-col justify-between p-3.5 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Resolved
                                </span>
                            </div>
                            <div className="my-2 flex items-baseline">
                                <span className="font-display text-2xl sm:text-3xl font-bold tabular-nums text-gray-800 dark:text-gray-200">
                                    {performanceMetrics.resolvedCount}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                                {performanceMetrics.resolutionRate}% resolution rate
                            </p>
                        </div>
                    </div>

                    {/* Integrated Baseline Operational Facts Footer Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-gray-100 bg-gray-50/70 px-4 py-2 text-xs text-gray-600 dark:border-white/5 dark:bg-white/[0.02] dark:text-gray-400">
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
                </div>
            </section>

            {/* Monthly Insights Section: Incident Trend & Lifecycle */}
            <section className="grid gap-3 lg:grid-cols-3" aria-label="Monthly insights">
                <TrendPanel chartData={chartData} selectedMonth={selectedMonth} reportCount={reports.length} />
                <LifecyclePanel statusData={statusData} totalReports={reports.length} />
            </section>

            {/* Incident Map Section (Live Map with Integrated Status Filter / Legend) */}
            <section className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Analytics map">
                <div className="flex flex-col gap-2 border-b border-gray-200/80 bg-gray-50/70 p-2 sm:p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3 px-1 pt-0.5">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">Monthly incident map</h2>
                            <p className="hidden sm:block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                Geographic incident distribution for {format(selectedMonth, 'MMMM yyyy')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-gray-100/90 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-[11px] font-medium text-gray-700 dark:text-gray-200 shrink-0 select-none">
                                <HiOutlineFilter className="h-3 w-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                <span>Filter by status</span>
                            </div>
                            <button
                                type="button"
                                onClick={onOpenMap}
                                className="inline-flex min-h-7 items-center justify-center gap-1.5 rounded-md border border-gray-200/90 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 cursor-pointer"
                            >
                                <HiOutlineMap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                Open full map
                            </button>
                        </div>
                    </div>

                    {/* Filter Status Control Pills (Acts as Live Legend & Filter) */}
                    <div
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 w-full pt-0.5 px-1 overflow-x-auto custom-scrollbar"
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
                                    className={`group relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-950 ${
                                        isSelected
                                            ? 'border-emerald-700 bg-emerald-700 text-white font-semibold dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                                            : `border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-300 dark:hover:border-white/20 dark:hover:bg-white/5${count === 0 ? ' opacity-60' : ''}`
                                    }`}
                                >
                                    {isSelected ? (
                                        <HiOutlineCheck className="h-3 w-3 shrink-0 text-emerald-100 dark:text-white" aria-hidden="true" />
                                    ) : (
                                        statusCfg?.dot && (
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                                        )
                                    )}
                                    <span>{filter.label}</span>
                                    <span
                                        className={`rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${
                                            isSelected
                                                ? 'bg-black/25 text-white dark:bg-black/25 dark:text-white'
                                                : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200 dark:bg-white/10 dark:text-gray-400 dark:group-hover:bg-white/15'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="aspect-square w-full sm:aspect-auto sm:h-[360px] lg:h-[400px]">
                    <MapView
                        reports={reports}
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
            <section ref={historySectionRef} className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Recent activity">
                <div className="flex flex-col gap-2 border-b border-gray-200/80 bg-gray-50/70 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Recent activity</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Latest updates across the current scope</p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenReports}
                        className="inline-flex min-h-7 items-center justify-center rounded-md border border-gray-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto cursor-pointer"
                    >
                        View incident queue
                    </button>
                </div>
                {recentReports.length ? (
                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                        {recentReports.map((reportItem) => {
                            const status = (reportItem.status || 'pending').toLowerCase();
                            const statusConfig = MAP_STATUS_CONFIG[status] || MAP_STATUS_CONFIG.pending;
                            return (
                                <article
                                    key={reportItem._id}
                                    onClick={onOpenReports}
                                    className="grid grid-cols-[minmax(0,1fr)_108px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_116px] cursor-pointer"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold leading-5 text-gray-900 dark:text-gray-100 sm:text-sm">
                                            {reportItem.address || reportItem.title || 'Location unavailable'}
                                        </p>
                                        <p className="mt-0.5 truncate text-[10px] leading-4 text-gray-500 dark:text-gray-400 sm:text-[11px]">
                                            {reportItem.municipalityName || 'Unknown municipality'}
                                            <span aria-hidden="true"> · </span>
                                            {reportItem.incidentType ? String(reportItem.incidentType).replace(/[_-]+/g, ' ') : 'Unclassified incident'}
                                            <span aria-hidden="true"> · </span>
                                            {formatActivityTime(reportItem.updatedAt || reportItem.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex w-[108px] shrink-0 justify-end sm:w-[116px]">
                                        <span
                                            className="inline-flex h-7 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200/90 bg-gray-50/80 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
                                            title={`Status: ${statusConfig.label || status}`}
                                            aria-label={`Status: ${statusConfig.label || status}`}
                                        >
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                            <span className="whitespace-nowrap">{statusConfig.label || status}</span>
                                        </span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : <EmptyState />}
            </section>
        </div>
    );
};

const EmptyState = () => <div className="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">No recent activity available.</div>;

export default DashboardAnalyticsWorkspace;
