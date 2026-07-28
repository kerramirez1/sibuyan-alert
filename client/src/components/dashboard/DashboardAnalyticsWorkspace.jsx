import { format, formatDistanceToNow, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    HiChevronLeft,
    HiChevronRight,
    HiOutlineBadgeCheck,
    HiOutlineChartBar,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDownload,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineMap,
    HiOutlineTruck,
} from 'react-icons/hi';
import MapView from '../map/MapView';

const MUNICIPALITY_COLORS = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed'];
const STATUS_STYLES = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    verified: 'border-blue-200 bg-blue-50 text-blue-700',
    transferred: 'border-violet-200 bg-violet-50 text-violet-700',
    responding: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-red-200 bg-red-50 text-red-700',
};

const formatActivityTime = (value) => {
    if (!value) return 'Time unavailable';
    const date = parseISO(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return formatDistanceToNow(date, { addSuffix: true });
};

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-sm">
            <p className="mb-2 font-semibold text-gray-700">{payload[0].payload.fullDate || label}</p>
            {payload.map((entry) => (
                <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                    <span className="capitalize text-gray-500">{entry.dataKey}</span>
                    <span className="font-semibold text-gray-900">{entry.value}</span>
                </div>
            ))}
        </div>
    );
};

const MetricCard = ({ label, value, helper, icon: Icon }) => (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        </div>
        <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
        <p className="mt-1 text-[11px] leading-4 text-gray-500">{helper}</p>
    </div>
);

const EmptyChart = ({ message = 'No data for the selected period', detail }) => (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-lg bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm font-medium text-gray-600">{message}</p>
        {detail && <p className="mt-1 max-w-sm text-xs leading-5 text-gray-400">{detail}</p>}
    </div>
);

const TrendPanel = ({ chartData, selectedMonth, reportCount }) => {
    const activeDays = chartData.filter((day) => day.total > 0);

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-900">Incident trend</h2>
            <p className="mt-0.5 text-xs text-gray-500">Daily reports for {format(selectedMonth, 'MMMM yyyy')}</p>

            {reportCount === 0 ? (
                <div className="mt-4">
                    <EmptyChart message="No reports in this period" detail="Choose another month or expand the municipality scope." />
                </div>
            ) : reportCount <= 2 ? (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4" role="status">
                    <p className="text-sm font-semibold text-blue-950">
                        {reportCount} {reportCount === 1 ? 'report' : 'reports'} recorded
                    </p>
                    <div className="mt-3 space-y-2">
                        {activeDays.map((day) => (
                            <div key={day.fullDate} className="flex items-center justify-between gap-4 text-sm">
                                <span className="text-blue-800">{day.fullDate}</span>
                                <span className="font-semibold text-blue-950">{day.total}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-4 h-56 w-full" role="img" aria-label={`Daily incident report trend for ${format(selectedMonth, 'MMMM yyyy')}`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} dy={8} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="total" name="Reports" stroke="#3b82f6" strokeWidth={2} fill="var(--chart-fill)" activeDot={{ r: 4, strokeWidth: 0 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

const LifecyclePanel = ({ statusData, totalReports }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900">Report lifecycle</h2>
        <p className="mt-0.5 text-xs text-gray-500">Status distribution for the selected month</p>
        {statusData.length ? (
            <div className="mt-5 space-y-3" aria-label="Report lifecycle distribution">
                {statusData.map((item) => {
                    const percentage = totalReports ? Math.round((item.value / totalReports) * 100) : 0;
                    return (
                        <div key={item.name}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-medium text-gray-700">{item.name}</span>
                                <span className="text-gray-500">{item.value} · {percentage}%</span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: item.color }} />
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
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
            {data.length ? (
                <div className="mt-4 w-full" style={{ height: chartHeight }} role="img" aria-label={`${title}: ${description}`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-axis-strong)', fontSize: 11 }} width={labelWidth} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" name="Reports" radius={[0, 4, 4, 0]} barSize={16}>
                                {data.map((entry, index) => <Cell key={entry.name} fill={colors ? MUNICIPALITY_COLORS[index % MUNICIPALITY_COLORS.length] : '#2563eb'} />)}
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
        const [XLSX, fileSaver] = await Promise.all([
            import('xlsx'),
            import('file-saver'),
        ]);
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

        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        const incidentSheet = XLSX.utils.json_to_sheet(incidentData);
        const zoneSheet = XLSX.utils.json_to_sheet(zoneData);
        summarySheet['!cols'] = [{ wch: 34 }, { wch: 22 }];
        incidentSheet['!cols'] = Array.from({ length: 12 }, () => ({ wch: 20 }));
        zoneSheet['!cols'] = Array.from({ length: 7 }, () => ({ wch: 22 }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Dashboard Summary');
        XLSX.utils.book_append_sheet(workbook, incidentSheet, 'Incident Reports');
        XLSX.utils.book_append_sheet(workbook, zoneSheet, 'High Risk Zones');
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        fileSaver.saveAs(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `Sibuyan_Alert_Analytics_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
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

    if (loading) {
        return (
            <div className="mx-auto max-w-7xl space-y-5 animate-pulse" aria-label="Loading analytics">
                <div className="h-16 rounded-xl bg-gray-100" />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
                    {[0, 1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-28 rounded-xl bg-gray-100" />)}
                </div>
                <div className="h-72 rounded-xl bg-gray-100" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-5">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                        <HiOutlineChartBar className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Operational analytics</p>
                        <h1 className="text-2xl font-display font-bold text-gray-900 sm:text-3xl">Incident overview</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {hasMunicipality ? `${user?.assignedMunicipality} performance and incident trends.` : 'Performance and incident trends across Sibuyan Island.'}
                        </p>
                    </div>
                </div>

                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center" role="toolbar" aria-label="Analytics controls">
                    <div className="flex min-h-11 w-full items-center justify-between rounded-lg border border-gray-300 bg-white p-1 lg:w-52">
                        <button type="button" onClick={() => setSelectedMonth((current) => subMonths(current, 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400" aria-label="Previous month">
                            <HiChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setSelectedMonth(new Date())} className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400" aria-label="Return to current month">{format(selectedMonth, 'MMM yyyy')}</button>
                        <button
                            type="button"
                            onClick={() => {
                                const nextMonth = addMonths(selectedMonth, 1);
                                if (nextMonth <= new Date()) setSelectedMonth(nextMonth);
                            }}
                            disabled={isSameMonth(selectedMonth, new Date())}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Next month"
                        >
                            <HiChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <button type="button" onClick={onOpenMap} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 lg:w-auto lg:min-w-28">
                        <HiOutlineMap className="h-4 w-4" aria-hidden="true" />
                        Map
                    </button>
                    <button type="button" onClick={exportDashboard} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 lg:w-auto lg:min-w-28" aria-label="Export dashboard to Excel">
                        <HiOutlineDownload className="h-4 w-4" aria-hidden="true" />
                        Export
                    </button>
                </div>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3" aria-label="Analytics summary">
                {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </section>

            <section className="grid gap-4 lg:grid-cols-3" aria-label="Monthly insights">
                <TrendPanel chartData={chartData} selectedMonth={selectedMonth} reportCount={reports.length} />
                <LifecyclePanel statusData={statusData} totalReports={reports.length} />
            </section>

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

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Analytics map">
                <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Incident map</h2>
                        <p className="mt-0.5 text-xs text-gray-500">Current pending, verified, transferred, and responding incidents</p>
                    </div>
                    <button type="button" onClick={onOpenMap} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 sm:w-auto">
                        <HiOutlineMap className="h-4 w-4" aria-hidden="true" />
                        Open full map
                    </button>
                </div>
                <div className="h-[300px] sm:h-[360px] lg:h-[400px]">
                    <MapView reports={dashboardReports} highRiskZones={highRiskZones} showPending enable3D className="h-full w-full" focusLocation={focusLocation} />
                </div>
            </section>

            <section ref={historySectionRef} className="rounded-xl border border-gray-200 bg-white" aria-label="Recent activity">
                <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
                        <p className="mt-0.5 text-xs text-gray-500">Latest report updates across the current scope</p>
                    </div>
                    <button type="button" onClick={onOpenReports} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 sm:w-auto">
                        View incident queue
                    </button>
                </div>
                {recentReports.length ? (
                    <div className="divide-y divide-gray-200">
                        {recentReports.map((report) => {
                            const status = (report.status || 'pending').toLowerCase();
                            return (
                                <article key={report._id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                                    <div className="min-w-0">
                                        <p className="line-clamp-2 text-sm font-medium leading-5 text-gray-900">{report.address || report.title || 'Location unavailable'}</p>
                                        <p className="mt-1 text-xs leading-5 text-gray-500">
                                            {report.municipalityName || 'Unknown municipality'}
                                            <span aria-hidden="true"> · </span>
                                            {report.incidentType ? String(report.incidentType).replace(/[_-]+/g, ' ') : 'Unclassified incident'}
                                            <span aria-hidden="true"> · </span>
                                            {formatActivityTime(report.updatedAt || report.createdAt)}
                                        </p>
                                    </div>
                                    <span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[status] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>{status}</span>
                                </article>
                            );
                        })}
                    </div>
                ) : <EmptyState />}
            </section>
        </div>
    );
};

const EmptyState = () => <div className="px-5 py-10 text-center text-sm text-gray-500">No recent activity available.</div>;

export default DashboardAnalyticsWorkspace;
