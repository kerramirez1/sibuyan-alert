import { useId } from 'react';
import { format, formatDistanceToNow, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
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
    HiOutlineBadgeCheck,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDownload,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineMap,
    HiOutlineTruck,
} from 'react-icons/hi';
import MapView from '../map/MapView';
import { buildCsvDocument } from '../../utils/csvExport';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';

const MUNICIPALITY_COLORS = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed'];
const TREND_SERIES = Object.freeze({
    daily: Object.freeze({ label: 'Daily reports' }),
});

const PANEL_CLASS = 'rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90';

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
        <div className="rounded-xl border border-gray-200/90 bg-white/95 p-3 text-xs shadow-md backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95">
            <p className="mb-1.5 font-bold text-gray-900 dark:text-white">{payload[0].payload.fullDate || label}</p>
            {payload.map((entry) => (
                <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{entry.name || entry.dataKey}</span>
                    <span className="font-bold text-gray-900 dark:text-white tabular-nums">{entry.value}</span>
                </div>
            ))}
        </div>
    );
};

const MetricCard = ({ label, value, helper, icon: Icon }) => (
    <article className="flex min-w-0 flex-col justify-between rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-4.5 shadow-2xs transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-[#0c1813]/90 dark:hover:border-white/20">
        <div>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
                <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold leading-none tracking-tight text-gray-950 sm:text-3xl dark:text-white tabular-nums">{value}</p>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{helper}</p>
    </article>
);

const EmptyChart = ({ message = 'No data for the selected period', detail }) => (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-xl bg-gray-50/80 px-4 py-6 text-center dark:bg-white/[0.02]">
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
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">Incident trend</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Daily reports for {format(selectedMonth, 'MMMM yyyy')}</p>
                </div>
            </div>

            {!hasTrendData ? (
                <div className="mt-4">
                    <EmptyChart
                        message={reportCount === 0 ? 'No reports in this period' : 'No valid report dates in this period'}
                        detail={reportCount === 0
                            ? 'Choose another month.'
                            : 'Some reports could not be plotted because their timestamps are missing or invalid.'}
                    />
                </div>
            ) : (
                <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400" aria-hidden="true">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-500" />
                            {TREND_SERIES.daily.label}
                        </span>
                        <span className="tabular-nums">{reportLabel} recorded</span>
                    </div>
                    <p id={summaryId} className="sr-only">
                        {reportLabel} recorded. Reports by active day: {activeDaySummary}.
                    </p>
                    <div
                        className="mt-3 h-52 min-w-0 w-full sm:h-56"
                        role="img"
                        aria-label={`Daily incident report trend for ${format(selectedMonth, 'MMMM yyyy')}`}
                        aria-describedby={summaryId}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 4" vertical stroke="var(--chart-grid)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
                                    tickFormatter={formatXAxisDay}
                                    interval="preserveStartEnd"
                                    minTickGap={16}
                                    dy={8}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
                                    allowDecimals={false}
                                    width={30}
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
        <h2 className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">Report lifecycle</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Status distribution for the selected month</p>
        {statusData.length ? (
            <div className="mt-4 space-y-3" aria-label="Report lifecycle distribution">
                {statusData.map((item) => {
                    const percentage = totalReports ? Math.round((item.value / totalReports) * 100) : 0;
                    return (
                        <div key={item.name}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</span>
                                <span className="font-bold text-gray-700 dark:text-gray-300 tabular-nums">{item.value} · {percentage}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, backgroundColor: item.color }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="mt-4"><EmptyChart message="No lifecycle data" detail="No reports were created in the selected month." /></div>
        )}
    </div>
);

const BreakdownCard = ({ title, description, data, labelWidth = 100, colors = false, emptyDetail }) => {
    const chartHeight = Math.max(160, Math.min(260, data.length * 38 + 40));
    return (
        <div className={PANEL_CLASS}>
            <h2 className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
            {data.length ? (
                <div className="mt-4 w-full" style={{ height: chartHeight }} role="img" aria-label={`${title}: ${description}`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-axis-strong)', fontSize: 11 }} width={labelWidth} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" name="Reports" radius={[0, 4, 4, 0]} barSize={16}>
                                {data.map((entry, index) => <Cell key={entry.name} fill={colors ? MUNICIPALITY_COLORS[index % MUNICIPALITY_COLORS.length] : '#059669'} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="mt-4"><EmptyChart message={`No ${title.toLowerCase()} data`} detail={emptyDetail} /></div>
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
    dashboardReports,
    focusLocation,
    historySectionRef,
    loading,
    error,
    onOpenMap,
    onOpenReports,
}) => {
    const activeRiskZoneCount = highRiskZones.filter((zone) => zone.isActive !== false).length;
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

    const metrics = [
        { label: 'New reports', value: reports.length, helper: format(selectedMonth, 'MMMM yyyy'), icon: HiOutlineClipboardList },
        { label: 'Pending review', value: performanceMetrics.pendingCount, helper: 'Awaiting administrator review', icon: HiOutlineExclamation },
        { label: 'Dispatch ready', value: performanceMetrics.dispatchReadyCount, helper: 'Verified or transferred, unassigned', icon: HiOutlineMap },
        { label: 'Responding', value: performanceMetrics.respondingCount, helper: 'Active field response', icon: HiOutlineTruck },
        { label: 'Resolved', value: performanceMetrics.resolvedCount, helper: `${performanceMetrics.resolutionRate}% resolution rate`, icon: HiOutlineBadgeCheck },
        {
            label: 'Median response',
            value: performanceMetrics.medianResponseMin === null ? '—' : `${performanceMetrics.medianResponseMin}m`,
            helper: performanceMetrics.responseSampleCount
                ? `${performanceMetrics.responseSampleCount} responded incident${performanceMetrics.responseSampleCount === 1 ? '' : 's'}`
                : 'No responded incidents',
            icon: HiOutlineClock,
        },
        { label: 'Active risk zones', value: activeRiskZoneCount, helper: 'Currently mapped hazards', icon: HiOutlineLightningBolt },
    ];

    const primaryMetrics = metrics.slice(0, 4);
    const secondaryMetrics = metrics.slice(4);

    if (loading) {
        return (
            <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5 animate-pulse" aria-label="Loading analytics">
                <div className="h-20 rounded-2xl bg-gray-100 dark:bg-white/5" />
                <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {[0, 1, 2, 3].map((item) => (
                            <div key={item} className="h-28 rounded-2xl bg-gray-100 dark:bg-white/5" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
                        {[4, 5, 6].map((item) => (
                            <div key={item} className="h-28 rounded-2xl bg-gray-100 dark:bg-white/5" />
                        ))}
                    </div>
                </div>
                <div className="h-72 rounded-2xl bg-gray-100 dark:bg-white/5" />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5">
            <header className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Operational analytics
                        </p>
                        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                            Incident overview
                        </h1>
                        <p className="mt-0.5 max-w-2xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                            {hasMunicipality ? `${user?.assignedMunicipality} performance and incident trends.` : 'Performance and incident trends across Sibuyan Island.'}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Sibuyan Island · Alert System Active</span>
                        </div>
                    </div>
                </div>

                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center" role="toolbar" aria-label="Analytics controls">
                    <div className="flex min-h-10 w-full items-center justify-between rounded-xl border border-gray-200/90 bg-gray-100/80 p-0.5 dark:border-white/10 dark:bg-white/5 lg:w-52">
                        <button
                            type="button"
                            onClick={() => setSelectedMonth((current) => subMonths(current, 1))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-gray-950 hover:shadow-2xs dark:text-gray-400 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            aria-label="Previous month"
                        >
                            <HiChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedMonth(new Date())}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-800 hover:bg-white hover:text-gray-950 hover:shadow-2xs dark:text-gray-200 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-white hover:text-gray-950 hover:shadow-2xs dark:text-gray-400 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Next month"
                        >
                            <HiChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenMap}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 lg:w-auto lg:min-w-28"
                    >
                        <HiOutlineMap className="h-4 w-4" aria-hidden="true" />
                        Map
                    </button>
                    <button
                        type="button"
                        onClick={exportDashboard}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:w-auto lg:min-w-28"
                        aria-label="Export dashboard data as CSV"
                    >
                        <HiOutlineDownload className="h-4 w-4" aria-hidden="true" />
                        Export
                    </button>
                </div>
            </header>

            {error && <div role="alert" className="rounded-xl border border-red-200/90 bg-red-50/80 px-4 py-3 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

            {/* Top Stat Cards Grid (2 Rows) */}
            <section className="space-y-3 sm:space-y-4" aria-label="Analytics summary">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {primaryMetrics.map((metric) => (
                        <MetricCard key={metric.label} {...metric} />
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
                    {secondaryMetrics.map((metric) => (
                        <MetricCard key={metric.label} {...metric} />
                    ))}
                </div>
            </section>

            {/* Monthly Insights Section */}
            <section className="grid gap-4 lg:grid-cols-3" aria-label="Monthly insights">
                <TrendPanel chartData={chartData} selectedMonth={selectedMonth} reportCount={reports.length} />
                <LifecyclePanel statusData={statusData} totalReports={reports.length} />
            </section>

            {/* Operational Breakdown Section */}
            <section className="grid gap-4 lg:grid-cols-2" aria-label="Operational breakdown">
                {hasMunicipality ? (
                    <>
                        <BreakdownCard
                            title="By barangay"
                            description={`Reports within ${user?.assignedMunicipality || 'the assigned municipality'}`}
                            data={barangayBarData.slice(0, 8)}
                            labelWidth={112}
                            emptyDetail="Barangay information was not supplied for reports in this period."
                        />
                        <BreakdownCard
                            title="By incident type"
                            description="Most reported incident classifications"
                            data={incidentTypeBarData.slice(0, 8)}
                            labelWidth={112}
                            emptyDetail="Incident type information is unavailable for this period."
                        />
                    </>
                ) : (
                    <>
                        <BreakdownCard
                            title="By municipality"
                            description="Reports per municipality"
                            data={municipalityBarData}
                            colors
                            emptyDetail="No municipality totals are available for this period."
                        />
                        <BreakdownCard
                            title="By barangay"
                            description="Top barangays by report count"
                            data={barangayBarData.slice(0, 8)}
                            labelWidth={120}
                            emptyDetail="Barangay information was not supplied for reports in this period."
                        />
                    </>
                )}
            </section>

            {/* Map Preview Section */}
            <section className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Analytics map">
                <div className="flex flex-col gap-2.5 border-b border-gray-200/80 bg-gray-50/70 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Incident map</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Current pending, verified, transferred, and responding incidents</p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenMap}
                        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200/90 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
                    >
                        <HiOutlineMap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        Open full map
                    </button>
                </div>
                <div className="aspect-square w-full sm:aspect-auto sm:h-[360px] lg:h-[400px]">
                    <MapView
                        reports={dashboardReports}
                        highRiskZones={highRiskZones}
                        showPending
                        filterMode="review"
                        viewerRole={user?.role || 'guest'}
                        showDataState
                        enable3D
                        className="h-full w-full"
                        focusLocation={focusLocation}
                    />
                </div>
            </section>

            {/* Recent Activity Section */}
            <section ref={historySectionRef} className="rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Recent activity">
                <div className="flex flex-col gap-2.5 border-b border-gray-200/80 bg-gray-50/70 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Recent activity</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Latest report updates across the current scope</p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenReports}
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-gray-200/90 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
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
                                    className="grid grid-cols-[minmax(0,1fr)_108px] items-center gap-3 px-4 py-3 sm:px-5 transition-colors hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                                >
                                    <div className="min-w-0">
                                        <p className="line-clamp-2 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {reportItem.address || reportItem.title || 'Location unavailable'}
                                        </p>
                                        <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                                            {reportItem.municipalityName || 'Unknown municipality'}
                                            <span aria-hidden="true"> · </span>
                                            {reportItem.incidentType ? String(reportItem.incidentType).replace(/[_-]+/g, ' ') : 'Unclassified incident'}
                                            <span aria-hidden="true"> · </span>
                                            {formatActivityTime(reportItem.updatedAt || reportItem.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="inline-flex h-6 w-[104px] items-center justify-center gap-1.5 rounded-full border border-gray-200/90 bg-gray-50/80 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                            <span className="truncate">{statusConfig.label || status}</span>
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

const EmptyState = () => <div className="px-5 py-10 text-center text-xs text-gray-500 dark:text-gray-400">No recent activity available.</div>;

export default DashboardAnalyticsWorkspace;
