import { format, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    HiOutlineBadgeCheck,
    HiOutlineChartBar,
    HiOutlineClock,
    HiOutlineDownload,
    HiOutlineExclamation,
    HiOutlineGlobe,
    HiOutlineLightningBolt,
    HiOutlineMap,
    HiOutlineTruck,
} from 'react-icons/hi';
import MapView from '../map/MapView';

const MUNICIPALITY_COLORS = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed'];

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

const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.08) return null;
    const radians = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    return (
        <text
            x={cx + radius * Math.cos(-midAngle * radians)}
            y={cy + radius * Math.sin(-midAngle * radians)}
            fill="white"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[10px] font-semibold"
        >
            {`${Math.round(percent * 100)}%`}
        </text>
    );
};

const MetricCard = ({ label, value, helper, icon: Icon }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <Icon className="h-4 w-4 text-gray-400" />
        </div>
        <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
        <p className="mt-1 text-[11px] text-gray-400">{helper}</p>
    </div>
);

const EmptyChart = ({ message = 'No data for the selected period' }) => (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">{message}</div>
);

const DashboardAnalyticsWorkspace = ({
    user,
    hasMunicipality,
    showAll,
    setShowAll,
    selectedMonth,
    setSelectedMonth,
    stats,
    reports,
    allReports,
    highRiskZones,
    performanceMetrics,
    chartData,
    statusData,
    municipalityBarData,
    barangayBarData,
    dashboardReports,
    focusLocation,
    historySectionRef,
    loading,
    error,
    onOpenMap,
}) => {
    const exportDashboard = () => {
        const summaryData = [
            { Metric: 'Total Accidents', Value: reports.length },
            { Metric: 'Total Reports in Scope', Value: stats?.totalReports || reports.length },
            { Metric: 'Active Responses', Value: performanceMetrics.respondingCount },
            { Metric: 'Resolved Cases', Value: performanceMetrics.resolvedCount },
            { Metric: 'Resolution Rate', Value: `${performanceMetrics.resolutionRate}%` },
            { Metric: 'Average Response Time (Minutes)', Value: performanceMetrics.avgResponseMin },
            { Metric: 'High-Risk Zones', Value: highRiskZones.length },
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
        saveAs(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `Sibuyan_Alert_Analytics_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
        );
    };

    const metrics = [
        { label: 'Reports this month', value: reports.length, helper: format(selectedMonth, 'MMMM yyyy'), icon: HiOutlineExclamation },
        { label: 'Responding', value: performanceMetrics.respondingCount, helper: 'Active field response', icon: HiOutlineTruck },
        { label: 'Resolved', value: performanceMetrics.resolvedCount, helper: `${performanceMetrics.resolutionRate}% resolution rate`, icon: HiOutlineBadgeCheck },
        { label: 'Average response', value: performanceMetrics.avgResponseMin > 0 ? `${performanceMetrics.avgResponseMin}m` : '—', helper: 'Report to first response', icon: HiOutlineClock },
        { label: 'Risk zones', value: highRiskZones.length, helper: 'Mapped hazards', icon: HiOutlineLightningBolt },
    ];

    if (loading) {
        return (
            <div className="mx-auto max-w-7xl space-y-5 animate-pulse" aria-label="Loading analytics">
                <div className="h-16 rounded-xl bg-gray-100" />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-xl bg-gray-100" />)}
                </div>
                <div className="h-72 rounded-xl bg-gray-100" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                        <HiOutlineChartBar className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Operational analytics</p>
                        <h1 className="text-2xl font-display font-bold text-gray-900 sm:text-3xl">Incident overview</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {hasMunicipality && !showAll ? `${user?.assignedMunicipality} performance and incident trends.` : 'Performance and incident trends across Sibuyan Island.'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {hasMunicipality && (
                        <button type="button" onClick={() => setShowAll(!showAll)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${showAll ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}>
                            <HiOutlineGlobe className="h-4 w-4" />
                            {showAll ? 'All Sibuyan' : user?.assignedMunicipality}
                        </button>
                    )}
                    <div className="flex items-center rounded-lg border border-gray-300 bg-white p-1">
                        <button type="button" onClick={() => setSelectedMonth((current) => subMonths(current, 1))} className="rounded-md px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100" aria-label="Previous month">‹</button>
                        <button type="button" onClick={() => setSelectedMonth(new Date())} className="min-w-24 rounded-md px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">{format(selectedMonth, 'MMM yyyy')}</button>
                        <button
                            type="button"
                            onClick={() => {
                                const nextMonth = addMonths(selectedMonth, 1);
                                if (nextMonth <= new Date()) setSelectedMonth(nextMonth);
                            }}
                            disabled={isSameMonth(selectedMonth, new Date())}
                            className="rounded-md px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Next month"
                        >›</button>
                    </div>
                    <button type="button" onClick={onOpenMap} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-400">
                        <HiOutlineMap className="h-4 w-4" />
                        Map
                    </button>
                    <button type="button" onClick={exportDashboard} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700" aria-label="Export dashboard to Excel">
                        <HiOutlineDownload className="h-4 w-4" />
                        Export
                    </button>
                </div>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Analytics summary">
                {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </section>

            <section className="grid gap-4 lg:grid-cols-3" aria-label="Monthly charts">
                <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 lg:col-span-2">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Incident trend</h2>
                        <p className="mt-0.5 text-xs text-gray-500">Daily accident reports for {format(selectedMonth, 'MMMM yyyy')}</p>
                    </div>
                    <div className="mt-4 h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} dy={8} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Area type="monotone" dataKey="accidents" stroke="#2563eb" strokeWidth={2} fill="#eff6ff" activeDot={{ r: 4, strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                    <h2 className="text-sm font-semibold text-gray-900">Report lifecycle</h2>
                    <p className="mt-0.5 text-xs text-gray-500">Status distribution for the selected month</p>
                    <div className="mt-3 h-44 w-full">
                        {statusData.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={2} dataKey="value" labelLine={false} label={renderPieLabel}>
                                        {statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <EmptyChart />}
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                        {statusData.map((item) => (
                            <span key={item.name} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                {item.name} ({item.value})
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2" aria-label="Location breakdown">
                {[
                    { title: 'By municipality', description: 'Reports per municipality', data: municipalityBarData, width: 90, colors: true },
                    { title: 'By barangay', description: 'Top barangays by report count', data: barangayBarData.slice(0, 8), width: 120 },
                ].map((chart) => (
                    <div key={chart.title} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                        <h2 className="text-sm font-semibold text-gray-900">{chart.title}</h2>
                        <p className="mt-0.5 text-xs text-gray-500">{chart.description}</p>
                        <div className="mt-4 h-56 w-full">
                            {chart.data.length ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chart.data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#374151', fontSize: 11 }} width={chart.width} />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                                            {chart.data.map((entry, index) => <Cell key={entry.name} fill={chart.colors ? MUNICIPALITY_COLORS[index % MUNICIPALITY_COLORS.length] : '#dc2626'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyChart />}
                        </div>
                    </div>
                ))}
            </section>

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Analytics map">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
                    <h2 className="text-sm font-semibold text-gray-900">Incident map</h2>
                    <p className="mt-0.5 text-xs text-gray-500">Current verified, transferred, and responding incidents</p>
                </div>
                <div className="h-[360px] sm:h-[480px]">
                    <MapView reports={dashboardReports} highRiskZones={highRiskZones} showPending enable3D className="h-full w-full" focusLocation={focusLocation} />
                </div>
            </section>

            <section ref={historySectionRef} className="rounded-xl border border-gray-200 bg-white" aria-label="Recent activity">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
                    <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
                    <p className="mt-0.5 text-xs text-gray-500">Latest five report updates</p>
                </div>
                {allReports.length ? (
                    <div className="divide-y divide-gray-200">
                        {allReports.slice(0, 5).map((report) => (
                            <article key={report._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-gray-900">{report.address || report.title || 'Location unavailable'}</p>
                                    <p className="mt-0.5 text-xs text-gray-500">{report.municipalityName || 'Unknown municipality'} · {format(parseISO(report.createdAt), 'MMM d, HH:mm')}</p>
                                </div>
                                <span className="self-start rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold capitalize text-gray-600 sm:self-auto">{report.status}</span>
                            </article>
                        ))}
                    </div>
                ) : <EmptyState />}
            </section>
        </div>
    );
};

const EmptyState = () => <div className="px-5 py-10 text-center text-sm text-gray-500">No recent activity available.</div>;

export default DashboardAnalyticsWorkspace;
