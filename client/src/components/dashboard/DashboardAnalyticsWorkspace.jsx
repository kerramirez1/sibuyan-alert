import { useEffect, useId, useMemo, useState } from 'react';
import { formatDistanceToNow, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import toast from '../../utils/appToast';
import { toSafeArray, safeCount } from '../../utils/safeCollection';
import { formatMonthLabel, toValidDate } from '../../utils/safeDate';
import useReachData from '../../hooks/useReachData';
import ReachPanel from './ReachPanel';
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    HiChevronLeft,
    HiChevronRight,
    HiOutlineDownload,
} from 'react-icons/hi';
import MapView from '../map/MapView';
import Button from '../ui/Button';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';
import { countReportsInMonth, filterReportsByDayKey, getManilaMonthKey, getTrendInsight, MANILA_OFFSET_MS } from '../../utils/analyticsTrend';
import { getPhysicalMunicipality } from '../../utils/incidentDetails';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import MapFilterRail from './MapFilterRail';
import { getFilteredMapReports } from '../../utils/mapReports';
import { getMapExperience } from '../../config/mapExperience';
import { getMunicipalityMapFocus } from '../../utils/sibuyanLocations';

const MAP_STATUS_FILTERS = Object.freeze([
    // The operations rail's own three status tabs, in its wording, because they
    // are the same three sets: this view listed Verified, Active response and
    // Transferred as tabs of their own, which split one operational condition
    // into three — all three answers to "is somebody already handling this?" —
    // and named `all` (pending + all handled) "Active Incidents", the phrase the
    // rail reserves for the pending-excluded subset. One rail, one vocabulary:
    // see SIGNED_IN_FILTERS in config/mapExperience, which this mirrors.
    //
    // `all` is this month's whole record, closed incidents included (see
    // `includeResolved` in getFilteredMapReports): a period's incidents are not
    // only the ones still open, and leaving the closed ones out made this tab a
    // smaller set than the sum of the tabs beside it.
    Object.freeze({ value: 'all', label: 'All open', group: 'status', title: "This month's reports — pending, being handled, and closed" }),
    Object.freeze({ value: 'pending', label: 'Pending review', group: 'status', title: 'Unverified reports awaiting review' }),
    Object.freeze({ value: 'active', label: 'Active incidents', group: 'status', title: 'Verified, transferred, and responding incidents' }),
    // Resolved is a status here, not the operations rail's archive layer: this
    // view is one month, and that month's closed incidents are part of it — they
    // sit inside All open, and this tab is how a viewer isolates them. The rail's
    // Resolved archive is a different set (every closed record, whatever month),
    // which is why the label differs.
    Object.freeze({ value: 'resolved', label: MAP_STATUS_CONFIG.resolved.label, group: 'status', title: "This month's closed incidents" }),
    // Deliberately no hazard layer. Risk zones are not part of a month's incident
    // distribution, and the tab that showed them made one rail read as the legend
    // for two unlike things — a hazard area and a record. Their count still opens
    // the summary's "Active risk zones" line below.
]);

const SEVERITY_SERIES = Object.freeze([
    Object.freeze({ key: 'minor', label: 'Minor', fill: '#10B981' }),
    Object.freeze({ key: 'moderate', label: 'Moderate', fill: '#F59E0B' }),
    Object.freeze({ key: 'severe', label: 'Severe', fill: '#F97316' }),
    Object.freeze({ key: 'critical', label: 'Critical', fill: '#EF4444' }),
    Object.freeze({ key: 'unknown', label: 'Unknown', fill: '#9CA3AF' }),
]);

/**
 * One surface for every card on this page, and the same one the operations map
 * card beside it draws: a single hairline ring plus a real elevation, so the two
 * halves of the dashboard read as one component family. The panels used to pair
 * a border with `shadow-2xs` while the map carried a ring and `shadow-sm`, which
 * is two card styles on one screen.
 */
const PANEL_SURFACE = 'rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 sm:rounded-2xl dark:bg-[#0c1813]/90 dark:ring-white/10';
const PANEL_CLASS = `${PANEL_SURFACE} p-3.5 sm:p-4`;

/**
 * Card chrome, in one place: one title scale, one description scale, one divider
 * tone, one meta treatment. Four panels had drifted into four variants of the
 * same header — `pb-2` here, `items-center` there, a `text-[11px]` meta on one
 * and nothing on the next — which read as four components rather than one card
 * with four contents.
 */
const PANEL_HEADER_CLASS = 'flex items-start justify-between gap-3 border-b border-gray-100 pb-2.5 dark:border-white/5';
const PANEL_TITLE_CLASS = 'font-display text-sm font-bold text-gray-950 dark:text-white';
const PANEL_DESCRIPTION_CLASS = 'mt-0.5 text-xs text-gray-500 dark:text-gray-400';
const PANEL_META_CLASS = 'shrink-0 text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400';

/** The band label above a section — the micro-heading the map column uses. */
const SECTION_LABEL_CLASS = 'text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600 dark:text-gray-300';

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
    const firstPayload = payload[0]?.payload;
    return (
        <div className="rounded-lg border border-gray-200/90 bg-white/95 p-2.5 text-xs shadow-md backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95">
            <p className="mb-1 font-bold text-gray-900 dark:text-white">{firstPayload?.fullDate || label}</p>
            {payload.map((entry) => (
                <div key={String(entry?.dataKey ?? entry?.name ?? Math.random())} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{entry.name || entry.dataKey}</span>
                    <span className="font-bold text-gray-900 dark:text-white tabular-nums">{entry.value}</span>
                </div>
            ))}
        </div>
    );
};

const EmptyChart = ({ message = 'No data for the selected period', detail }) => (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center dark:border-white/10">
        <p className="text-xs font-semibold text-gray-900 sm:text-sm dark:text-white">{message}</p>
        {detail && <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
);

const SEVERITY_STACK_ORDER = ['minor', 'moderate', 'severe', 'critical', 'unknown'];

/**
 * Draws the day total once, on top of the highest non-zero stack segment.
 * Returns null for empty days and for non-top segments so dense months stay
 * readable without duplicated labels.
 */
const renderStackTotalLabel = (barKey) => ({ x, y, width, payload }) => {
    const total = Number(payload?.total) || 0;
    if (total <= 0 || typeof x !== 'number' || typeof y !== 'number') return null;
    const topKey = [...SEVERITY_STACK_ORDER].reverse().find((key) => (Number(payload?.[key]) || 0) > 0);
    if (topKey !== barKey) return null;
    return (
        <text x={x + (width || 0) / 2} y={Math.max(y - 4, 9)} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--chart-axis)">
            {total}
        </text>
    );
};

const dominantSeverityFill = (day) => {
    const top = [...SEVERITY_STACK_ORDER].reverse().find((key) => (Number(day?.[key]) || 0) > 0);
    return SEVERITY_SERIES.find(({ key }) => key === top)?.fill || '#9CA3AF';
};

/**
 * One KPI in the overview band. Equal weight by construction — one label tone,
 * one number size, one helper tone — because a band read at a glance cannot
 * afford a tile that looks more urgent than its neighbour; where a tile sits is
 * what orders them. `accent` is the single exception, and only for a state the
 * reader has to act on.
 */
const MetricTile = ({ label, value, helper, accent = null }) => (
    <div className="flex min-w-0 flex-col px-3 py-3.5 sm:px-4 sm:py-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1.5 text-2xl font-bold leading-none tabular-nums tracking-tight text-gray-900 sm:text-[28px] dark:text-white">
            {value}
        </p>
        <p className="mt-1.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{helper}</p>
        {accent ? <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">{accent}</p> : null}
    </div>
);

const TrendPanel = ({ chartData = [], selectedMonth, reportCount = 0, prevMonthCount = 0, selectedDay, onSelectDay }) => {
    const safeChartData = toSafeArray(chartData);
    const safeReportCount = Number.isFinite(Number(reportCount)) ? Number(reportCount) : 0;
    const activeDays = safeChartData.filter((day) => Number(day?.total) > 0);
    const summaryId = useId();
    const hasTrendData = activeDays.length > 0;
    // A full month with almost nothing in it reads as a broken chart, so list
    // the active days instead. Short excerpts (drill-downs, tests) keep bars.
    const isSparseTrend = hasTrendData && safeChartData.length >= 28 && activeDays.length <= 2;
    const insight = getTrendInsight(safeChartData, { selectedMonth, prevMonthCount });
    const presentSeverities = SEVERITY_SERIES.filter(({ key }) => safeChartData.some((day) => (Number(day?.[key]) || 0) > 0));
    const reportLabel = `${safeReportCount} ${safeReportCount === 1 ? 'report' : 'reports'}`;
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

    const handleDaySelect = (day) => {
        if (!day || typeof onSelectDay !== 'function') return;
        onSelectDay(day.dayKey === selectedDay ? null : day.dayKey);
    };

    return (
        <div className={`${PANEL_CLASS} xl:col-span-2`}>
            {/* The meta column stacks under the title below sm. It carries a full
                insight sentence plus the severity legend and was `shrink-0`
                beside the title, so on a phone it kept its width and pushed the
                panel wider than the viewport — and the page's `overflow-x-hidden`
                then cut the peak link off rather than letting anything scroll.
                One row from sm, where the two can share the width. */}
            <div className="flex flex-col gap-2 border-b border-gray-100 pb-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 dark:border-white/5">
                <div className="min-w-0 sm:shrink-0">
                    <h2 className={PANEL_TITLE_CLASS}>Incident trend</h2>
                    <p className={PANEL_DESCRIPTION_CLASS}>Daily volume for {formatMonthLabel(selectedMonth, 'MMMM yyyy', 'selected period')}</p>
                </div>
                {/* The title keeps its width and the meta absorbs the squeeze —
                    the reverse of what this did. A `shrink-0` item is held at
                    its max-content width, so the insight sentence ("47 reports ·
                    Peak Sep 12 (6) · 30 quiet days of 30 · 12 fewer than Aug"
                    is ~480px) sat at its full width and starved the title beside
                    it, which wrapped to a strip one character wide. The sentence
                    is the part that should wrap; the panel's name is not. */}
                <div className="flex min-w-0 flex-col items-start gap-1 text-[11px] tabular-nums text-gray-500 sm:items-end dark:text-gray-400">
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
                                    className="font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                                >
                                    {insight.peak.label}
                                </button>
                                <span className="tabular-nums"> ({insight.peak.count})</span>
                            </>
                        )}
                        {insight.total > 0 && insight.quietDays > 0 && (
                            <span> · {insight.quietDays} quiet {insight.quietDays === 1 ? 'day' : 'days'} of {safeChartData.length}</span>
                        )}
                        {insight.delta && (
                            <span className="tabular-nums"> · {insight.delta.label}</span>
                        )}
                    </p>
                    {presentSeverities.length > 0 && (
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1" aria-label="Severity legend">
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
                        message={safeReportCount === 0 ? 'No reports in this period' : 'No valid report dates in this period'}
                        detail={safeReportCount === 0
                            ? 'Choose another month.'
                            : 'Some reports could not be plotted because their timestamps are missing or invalid.'}
                    />
                </div>
            ) : isSparseTrend ? (
                <div className="mt-3">
                    <p id={summaryId} className="sr-only">
                        {reportLabel} recorded. Reports by active day: {activeDaySummary}. {insightSummary}.
                    </p>
                    <ul data-testid="incident-days-list" className="divide-y divide-gray-100 dark:divide-white/5">
                        {activeDays.map((day) => {
                            const isSelected = day.dayKey === selectedDay;
                            return (
                                <li key={day.dayKey}>
                                    <button
                                        type="button"
                                        onClick={() => handleDaySelect(day)}
                                        aria-pressed={isSelected}
                                        aria-label={`Filter map to ${day.fullDate}, ${day.total} ${day.total === 1 ? 'report' : 'reports'}`}
                                        className={`flex w-full items-center gap-2.5 py-2.5 text-left ${isSelected ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
                                    >
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dominantSeverityFill(day) }} aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate text-sm">{day.fullDate}</span>
                                        <span className="shrink-0 text-sm tabular-nums">{day.total} {day.total === 1 ? 'report' : 'reports'}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <div className="mt-3">
                    <p id={summaryId} className="sr-only">
                        {reportLabel} recorded. Reports by active day: {activeDaySummary}. {insightSummary}.
                    </p>
                    <div
                        className="h-44 min-w-0 w-full sm:h-48"
                        role="img"
                        aria-label={`Daily incident report trend for ${formatMonthLabel(selectedMonth, 'MMMM yyyy', 'selected period')}`}
                        aria-describedby={summaryId}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={safeChartData} data-testid="incident-bar-chart" margin={{ top: 12, right: 8, left: -24, bottom: 0 }} barCategoryGap="30%">
                                <CartesianGrid strokeDasharray="3 4" vertical stroke="var(--chart-grid)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
                                    tickFormatter={(value, index) => (index === 0 ? value : formatXAxisDay(value))}
                                    interval="preserveStartEnd"
                                    minTickGap={24}
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
                                    >
                                        <LabelList dataKey="total" content={renderStackTotalLabel(key)} />
                                    </Bar>
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                        Select a bar to filter the map.
                    </p>
                </div>
            )}
        </div>
    );
};

const LifecyclePanel = ({ statusData = [], totalReports = 0 }) => {
    const safeStatus = toSafeArray(statusData);
    const safeTotal = Number.isFinite(Number(totalReports)) ? Number(totalReports) : 0;
    return (
    <div className={PANEL_CLASS}>
        <div className={PANEL_HEADER_CLASS}>
            <div className="min-w-0">
                <h2 className={PANEL_TITLE_CLASS}>Report lifecycle</h2>
                <p className={PANEL_DESCRIPTION_CLASS}>Status distribution for the selected month</p>
            </div>
            {safeTotal > 0 && (
                <span className={PANEL_META_CLASS}>
                    {safeTotal} total
                </span>
            )}
        </div>
        {safeStatus.length ? (
            <div className="mt-3.5 space-y-3" aria-label="Report lifecycle distribution">
                {/* Visual Segmented Proportional Distribution Track — one bar, no
                    gaps between segments: the seams this used to draw (`gap-0.5`)
                    cut the bar into tiles and made a continuous share look like
                    separate quantities. */}
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5" aria-hidden="true">
                    {safeStatus.map((item) => {
                        const pct = safeTotal ? (Number(item?.value || 0) / safeTotal) * 100 : 0;
                        if (pct <= 0) return null;
                        return (
                            <div
                                key={String(item?.name || Math.random())}
                                style={{ width: `${pct}%`, backgroundColor: item.color }}
                                className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                                title={`${item.name}: ${item.value}`}
                            />
                        );
                    })}
                </div>

                {/* Status Breakdown Rows */}
                <div className="divide-y divide-gray-100/80 dark:divide-white/5">
                    {safeStatus.map((item) => {
                        const percentage = safeTotal ? Math.round((Number(item?.value || 0) / safeTotal) * 100) : 0;
                        return (
                            <div key={String(item?.name || Math.random())} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                                    <span className="truncate font-semibold text-gray-800 dark:text-gray-200">{item.name}</span>
                                </div>
                                <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-white">
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
};

const RankedBreakdownPanel = ({ title, description, data = [], emptyDetail, isMunicipality = false }) => {
    const safeData = toSafeArray(data);
    const totalCount = safeData.reduce((sum, item) => sum + (Number(item?.count) || 0), 0);

    return (
        <div className={PANEL_CLASS}>
            <div className={PANEL_HEADER_CLASS}>
                <div className="min-w-0">
                    <h2 className={PANEL_TITLE_CLASS}>{title}</h2>
                    <p className={PANEL_DESCRIPTION_CLASS}>{description}</p>
                </div>
                {safeData.length > 0 && (
                    <span className={PANEL_META_CLASS}>
                        {safeData.length} {isMunicipality ? 'municipalities' : 'recorded'}
                    </span>
                )}
            </div>

            {safeData.length ? (
                <div className="mt-3.5 space-y-1" role="list" aria-label={`${title}: ${description}`}>
                    {safeData.map((item, index) => {
                        const count = Number(item?.count) || 0;
                        const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                        const isTop = index === 0 && count > 0;

                        return (
                            <div
                                key={String(item?.name ?? `row-${index}`)}
                                className="group relative rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                                role="listitem"
                            >
                                <div className="relative z-10 flex items-center justify-between gap-2 text-xs">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                                            isTop ? 'text-brand-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500'
                                        }`}>
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <span className="truncate font-semibold text-gray-900 dark:text-gray-100">
                                            {item.name}
                                        </span>
                                    </div>
                                    <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                        {count} <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">({percentage}%)</span>
                                    </span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            isTop ? 'bg-brand-600 dark:bg-brand-500' : 'bg-gray-400 dark:bg-gray-600'
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
    viewSwitch = null,
}) => {
    const safeReports = toSafeArray(reports);
    const safeAllReports = toSafeArray(allReports);
    const safeZones = toSafeArray(highRiskZones);
    const safeChartData = toSafeArray(chartData);
    const safeMetrics = (performanceMetrics && typeof performanceMetrics === 'object') ? performanceMetrics : {};
    const effectiveMonth = toValidDate(selectedMonth) || new Date();
    const activeRiskZoneCount = safeZones.filter((zone) => zone?.isActive !== false).length;
    const [mapStatusFilter, setMapStatusFilter] = useState('all');
    const [selectedDay, setSelectedDay] = useState(null);

    // Reach is admin-only and fetched separately: it comes from the ViewEvent
    // collection, while every other number on this page is derived client-side
    // from the report list. Keeping the two sources apart means a reach failure
    // degrades to "not shown" instead of looking like a report failure.
    const isAdminViewer = user?.role === 'municipal_admin' || user?.role === 'admin';
    const { reach } = useReachData({ enabled: Boolean(isAdminViewer) });

    // The analytics map opens on the same camera as the operations map, because
    // it is the same map shown from a different page. Both were given the same
    // MapView, but only the operations workspace handed it a home camera, so
    // this card alone fell back to the island view — a municipal admin who
    // switched from Map to Analytics watched their own incidents leave the frame
    // for open water. `mapExperience` is read here for the same reason the
    // operations workspace reads it: the home camera is a role decision.
    const mapExperience = getMapExperience({
        role: user?.role,
        agency: user?.agency,
        municipality: user?.assignedMunicipality,
    });

    // Where this map rests when the month's incidents cannot frame it: the
    // viewer's own municipality, or null (island view) for a viewer without an
    // assignment. A deep link to one record owns the camera, so home steps
    // aside for it — the same rule the operations map follows.
    const municipalityHomeFocus = useMemo(() => {
        if (focusLocation) return null;
        return getMunicipalityMapFocus(user?.assignedMunicipality);
    }, [focusLocation, user?.assignedMunicipality]);

    // Day drill-downs belong to one month view; a new month starts unfiltered.
    useEffect(() => {
        setSelectedDay(null);
    }, [selectedMonth]);

    const prevMonthCount = (() => {
        // Pace-fair delta: when viewing the in-progress Manila month, compare
        // against the previous month's first N days — never a partial month
        // against a full one.
        try {
            const nowManila = new Date(Date.now() + MANILA_OFFSET_MS);
            const viewingCurrentManilaMonth = getManilaMonthKey(effectiveMonth) === getManilaMonthKey(nowManila);
            return countReportsInMonth(
                safeAllReports,
                subMonths(effectiveMonth, 1),
                viewingCurrentManilaMonth
                    ? { throughDayOfMonth: nowManila.getUTCDate() }
                    : {},
            );
        } catch {
            return 0;
        }
    })();
    const mapDayReports = selectedDay ? filterReportsByDayKey(safeReports, selectedDay) : safeReports;
    const selectedDayLabel = safeChartData.find((day) => day?.dayKey === selectedDay)?.date || selectedDay;

    // Every tab counts its own set on the month's reports, `all` included — and
    // `all` counts the closed ones too, so the four counts reconcile: All open =
    // Pending review + Active incidents + Resolved.
    const getMapFilterCount = (filterValue) => {
        try {
            return getFilteredMapReports(safeReports, {
                includePending: true,
                statusFilter: filterValue,
                includeResolved: true,
            }).length;
        } catch {
            return 0;
        }
    };

    const recentReports = [...safeAllReports]
        .sort((left, right) => new Date(right?.updatedAt || right?.createdAt) - new Date(left?.updatedAt || left?.createdAt))
        .slice(0, 5);

    const exportDashboard = async () => {
        const toastId = 'dashboard-export';
        try {
            const [{ default: ExcelJS }, { buildAnalyticsWorkbook, writeWorkbookToBuffer }, { default: fileSaver }] = await Promise.all([
                import('exceljs'),
                import('../../utils/excelExport'),
                import('file-saver'),
            ]);
            const monthLabel = formatMonthLabel(effectiveMonth, 'MMMM yyyy', '');
            // Cap export rows: a full prod history can OOM the tab on EOC hardware.
            const MAX_EXPORT_ROWS = 5000;
            const exportIncidents = safeAllReports.slice(0, MAX_EXPORT_ROWS);
            if (safeAllReports.length > MAX_EXPORT_ROWS) {
                toast(`Exporting first ${MAX_EXPORT_ROWS} of ${safeAllReports.length} rows.`, { id: toastId });
            }
            const workbook = buildAnalyticsWorkbook(ExcelJS, {
                scopeLabel: hasMunicipality ? (user?.assignedMunicipality || 'Municipal') : 'Island-wide',
                monthLabel,
                exportedAt: new Date(),
                summary: [
                    { metric: 'New Reports in Selected Month', value: safeCount(safeReports) },
                    { metric: 'Total Reports in Scope', value: safeCount(safeAllReports) },
                    { metric: 'Pending Review', value: safeMetrics.pendingCount ?? 0 },
                    { metric: 'Available for Dispatch', value: safeMetrics.dispatchReadyCount ?? 0 },
                    { metric: 'Active Responses', value: safeMetrics.respondingCount ?? 0 },
                    { metric: 'Resolved Cases', value: safeMetrics.resolvedCount ?? 0 },
                    { metric: 'Resolution Rate', value: `${safeMetrics.resolutionRate ?? 0}%` },
                    { metric: 'Average Response Time (Minutes)', value: safeMetrics.avgResponseMin ?? 'No data' },
                    { metric: 'Median Response Time (Minutes)', value: safeMetrics.medianResponseMin ?? 'No data' },
                    { metric: 'Active High-Risk Zones', value: activeRiskZoneCount },
                ],
                incidents: exportIncidents,
                zones: safeZones,
            });

            const buffer = await writeWorkbookToBuffer(workbook);
            fileSaver.saveAs(
                new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `Sibuyan_Alert_Analytics_${formatMonthLabel(new Date(), 'yyyy-MM-dd', 'export')}.xlsx`
            );
        } catch (exportError) {
            console.error('Dashboard export failed:', exportError);
            toast.error('Export failed. Check your connection and try again.', { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-3.5 sm:space-y-4" role="status" aria-busy="true" aria-label="Loading analytics">
                <span className="sr-only">Loading analytics</span>
                {/* Mirrors the real page's rhythm — header, overview band, the two
                    insight panels, the map — so the skeleton is the layout it is
                    standing in for rather than a stack of unrelated boxes. */}
                <div className="flex flex-col gap-2">
                    <SkeletonCard className="h-14" />
                    <SkeletonCard className="h-9" />
                </div>
                <div className="grid grid-cols-2 divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 md:grid-cols-4 md:rounded-2xl [&>*:nth-child(even)]:border-l md:[&>*:nth-child(3)]:border-l max-md:[&>*:nth-child(n+3)]:border-t">
                    {[0, 1, 2, 3].map((item) => (
                        <div key={item} className="flex flex-col px-3 py-3.5 sm:px-4 sm:py-4">
                            <Skeleton variant="text" className="h-2.5 w-20" />
                            <Skeleton variant="text" className="mt-2 h-7 w-12" />
                            <Skeleton variant="text" className="mt-2 h-2.5 w-24" />
                        </div>
                    ))}
                </div>
                <div className="grid gap-3 xl:grid-cols-3">
                    <SkeletonCard className="h-64 xl:col-span-2" />
                    <SkeletonCard className="h-64" />
                </div>
                <SkeletonCard className="h-64" />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-3.5 sm:space-y-4">
            {/* Header & Controls */}
            <header className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700 dark:text-sky-400">
                            {hasMunicipality ? `${user?.assignedMunicipality} EOC` : 'Island-wide Operations'}
                        </span>
                        {/* This view's subject, printed as nothing — the call the
                            map workspace makes for its own h1, for the same
                            reason. A screen reader still announces "Municipal
                            Situation Overview" on arrival and headings
                            navigation still finds it; what it stops doing is
                            spending the top of the page on a 32px line that the
                            eyebrow above ("<Municipality> EOC") and the sentence
                            below both already say. */}
                        <h1 className="sr-only">Municipal Situation Overview</h1>
                        <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            {hasMunicipality
                                ? `${user?.assignedMunicipality} incident status and response readiness for ${formatMonthLabel(effectiveMonth, 'MMMM yyyy', 'selected period')}.`
                                : `Island-wide incident briefing and municipal comparisons for ${formatMonthLabel(effectiveMonth, 'MMMM yyyy', 'selected period')}.`}
                        </p>
                    </div>
                    {viewSwitch && <div className="shrink-0 sm:pt-0.5">{viewSwitch}</div>}
                </div>

                {/* One column on a phone, one left-aligned row from sm — the
                    same row the toolbar already had from lg. It used to be a
                    two-column grid at sm, which made both controls half the
                    content width: a month stepper ~350px wide with its chevrons
                    at the far edges, and an Export button that, at ~350px of
                    solid brand fill, out-weighed every number on the page. They
                    are a scope control and a secondary action, so they take their
                    own width and line up where lg already put them. */}
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="toolbar" aria-label="Analytics controls">
                    <div className="flex min-h-9 w-full items-center justify-between gap-0.5 rounded-lg bg-gray-100/80 p-1 ring-1 ring-gray-200/80 sm:w-52 dark:bg-white/5 dark:ring-white/10">
                        <button
                            type="button"
                            onClick={() => setSelectedMonth((current) => {
                                try {
                                    const base = toValidDate(current) || new Date();
                                    return subMonths(base, 1);
                                } catch {
                                    return new Date();
                                }
                            })}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-white hover:text-gray-950 dark:text-gray-400 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            aria-label="Previous month"
                        >
                            <HiChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedMonth(new Date())}
                            className="min-w-0 flex-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-800 transition-colors hover:bg-white hover:text-gray-950 dark:text-gray-200 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            aria-label="Return to current month"
                        >
                            {formatMonthLabel(effectiveMonth, 'MMM yyyy', '')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                try {
                                    const base = toValidDate(selectedMonth) || new Date();
                                    const nextMonth = addMonths(base, 1);
                                    if (nextMonth <= new Date()) setSelectedMonth(nextMonth);
                                } catch {
                                    setSelectedMonth(new Date());
                                }
                            }}
                            disabled={(() => {
                                try {
                                    return isSameMonth(effectiveMonth, new Date());
                                } catch {
                                    return false;
                                }
                            })()}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-white hover:text-gray-950 dark:text-gray-400 dark:hover:bg-[#0c1813] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Next month"
                        >
                            <HiChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    {/* Export is the toolbar's only action. It used to sit beside a
                        `Map` button that called the same `onOpenMap` the map card's
                        own "Open full map" already calls — two controls, one
                        destination, on a page whose card announces it. The card's
                        action stays because it sits on the map being opened; the
                        toolbar copy was the duplicate. Uses the app's own Button
                        so hover, focus and disabled behaviour come from one place
                        instead of this file's copy of them. */}
                    <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        icon={HiOutlineDownload}
                        onClick={exportDashboard}
                        className="w-full sm:w-auto sm:min-w-24"
                        aria-label="Export dashboard data as Excel"
                    >
                        Export
                    </Button>
                </div>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200/90 bg-red-50/80 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

            {/* Situation Summary */}
            <section aria-label="Analytics summary">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className={SECTION_LABEL_CLASS}>
                        Incident overview
                    </h2>
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        Operational status
                    </span>
                </div>

                {/* The overview band: one hairline grid, four equal tiles, the same
                    divided-band idiom the operations workspace draws its summary
                    with. It used to be four cells separated by their own
                    hand-placed borders — `border-l` on three of them and a
                    `border-t` on the second row at narrow widths — which left the
                    first cell flush against the panel edge and the rules a pixel
                    off from the row above. A divided grid draws every rule once
                    and stretches the tiles to one height.

                    The rules are `nth-child` widths rather than `divide-x`/
                    `divide-y`, because those two helpers do not know a grid's
                    shape: `divide-y` puts a `border-top` on every child but the
                    first, so in the two-column phone layout it drew a rule above
                    the tile BESIDE the first one — a stray line across the top of
                    the band's second cell. The widths below are the two shapes
                    this band actually takes: 2×2 below md, 1×4 from md. `nth-child(3)`
                    is the tile whose left rule only exists in the four-across
                    layout, and `nth-child(n+3)` are the two bottom tiles whose top
                    rule only exists in the 2×2 one — so that row rule is scoped to
                    `max-md` rather than added and then zeroed at md, which leaves
                    nothing for source order to get wrong.

                    And it is md, not sm, that fits four across: a 640px viewport
                    is 592px of content, which is 148px per tile — narrower than
                    the phone's own two-column tiles, so the desktop layout used to
                    arrive at its most cramped. Four across waits until 768px
                    (720px of content, 180px per tile) and turns the band's
                    narrowest state into its phone state, which is the one that was
                    designed for it. */}
                <div data-testid="overview-band" className="mt-1.5 grid grid-cols-2 divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 md:grid-cols-4 md:rounded-2xl [&>*:nth-child(even)]:border-l md:[&>*:nth-child(3)]:border-l max-md:[&>*:nth-child(n+3)]:border-t">
                    <MetricTile
                        label="Pending review"
                        value={safeMetrics.pendingCount ?? 0}
                        helper={(safeMetrics.pendingCount ?? 0) > 0 ? 'Awaiting review' : 'No pending reports'}
                        accent={(safeMetrics.pendingCount ?? 0) > 0 ? 'Action needed' : null}
                    />
                    <MetricTile
                        label="Dispatch ready"
                        value={safeMetrics.dispatchReadyCount ?? 0}
                        helper={(safeMetrics.dispatchReadyCount ?? 0) > 0 ? 'Verified, unassigned' : 'No unassigned incidents'}
                    />
                    <MetricTile
                        label="Responding"
                        value={safeMetrics.respondingCount ?? 0}
                        helper={(safeMetrics.respondingCount ?? 0) > 0 ? 'Field response active' : 'No active field response'}
                    />
                    <MetricTile
                        label="Resolved"
                        value={safeMetrics.resolvedCount ?? 0}
                        helper={`${safeMetrics.resolutionRate ?? 0}% resolution rate`}
                    />
                </div>

                {/* Integrated Baseline Operational Facts Footer Bar.

                    The three facts and their middots used to be one wrapping flex
                    row. A middot was therefore a flex item of its own, and a flex
                    item can begin a line — so on a phone the row wrapped as a
                    sentence fragment ending in "18m" followed by a line starting
                    with "· ACTIVE RISK ZONES". Below sm the facts are a 2×2 grid of
                    label-over-value cells instead (the same shape the band above
                    it takes), the middots are dropped because a grid separates by
                    position and not by glyph, and the scope label closes the block
                    on its own right-aligned line, which is also where the block
                    already wrapped at sm widths with three facts and a sample
                    clause to fit.

                    From sm it is the one-line row this was, with one change: each
                    middot now trails the fact it follows, inside that fact's own
                    box, instead of standing between them. A separator that is its
                    own flex item can be pushed to the next line on its own, and one
                    did — the row needs ~600px of inline content, so at 640px it
                    wrapped, and that is the same defect as on the phone. Bound to
                    the end of the previous fact it can only ever close a line. */}
                <div className="flex flex-col gap-2 border-t border-gray-200 py-3 text-xs text-gray-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2 sm:py-2.5 dark:border-white/10 dark:text-gray-400">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">New reports</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{safeCount(safeReports)}</span>
                                <span aria-hidden="true" className="hidden pl-1.5 text-gray-300 sm:inline dark:text-gray-600">·</span>
                            </span>
                            {/* Label and value stay on one line in the phone grid;
                                only the sample clause drops to the second line,
                                which is the tier it belongs to. */}
                            <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Median response</span>
                                    <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                        {safeMetrics.medianResponseMin === null || safeMetrics.medianResponseMin === undefined ? '—' : `${safeMetrics.medianResponseMin}m`}
                                    </span>
                                </span>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {safeMetrics.responseSampleCount
                                        ? `(${safeMetrics.responseSampleCount} responded incident${safeMetrics.responseSampleCount === 1 ? '' : 's'})`
                                        : 'No responded incidents'}
                                </span>
                                <span aria-hidden="true" className="hidden pl-1.5 text-gray-300 sm:inline dark:text-gray-600">·</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Active risk zones</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{activeRiskZoneCount}</span>
                            </span>
                        </div>
                        <span className="text-right text-[11px] text-gray-500 dark:text-gray-400 sm:text-left">
                            {formatMonthLabel(effectiveMonth, 'MMMM yyyy', '')} scope
                        </span>
                    </div>
            </section>

            {/* Monthly Insights Section: Incident Trend & Lifecycle */}
            {/* Two columns from xl, not lg. The app's sidebar is 240px from lg
                and the main column keeps 32px of padding, so the width a 1024px
                viewport leaves for content is 720px — the same 720px a 768px
                tablet has, where this section has always stacked. Three columns
                of 226px split that into a 453px trend chart (31 day-bars in
                ~436px) beside a lifecycle card narrower than its own rows. From
                xl the content column is 976px and the same three columns are
                314px each, with the trend at 640px — so the split starts where it
                fits rather than where the viewport name changes. */}
            <section className="grid gap-3 xl:grid-cols-3" aria-label="Monthly insights">
                <TrendPanel chartData={safeChartData} selectedMonth={effectiveMonth} reportCount={safeCount(safeReports)} prevMonthCount={prevMonthCount} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
                <LifecyclePanel statusData={toSafeArray(statusData)} totalReports={safeCount(safeReports)} />
            </section>

            {/* Incident Map Section */}
            {/* Same surface language as the operations map card: one ring, one
                radius, one shadow — a bordered card beside a ringed one read as
                two component families on two pages that show the same map. */}
            <section className={`${PANEL_SURFACE} overflow-hidden`} aria-label="Analytics map">
                <div className="flex flex-col gap-2 p-2 sm:p-2.5">
                    <div className="flex items-center justify-between gap-3 px-1 pt-0.5">
                        <div className="flex min-w-0 items-baseline gap-2">
                            <h2 className={`shrink-0 ${PANEL_TITLE_CLASS}`}>Monthly incident map</h2>
                            <p className="hidden truncate text-xs text-gray-500 sm:block dark:text-gray-400">
                                Geographic incident distribution for {formatMonthLabel(effectiveMonth, 'MMMM yyyy', 'selected period')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenMap}
                            className="inline-flex min-h-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                        >
                            Open full map
                        </button>
                    </div>

                    {/* Status Filter Tabs (also the live legend) — the map's own
                        rail, rendering the map's own status tabs, so this row
                        and the operations rail are one control: same sets, same
                        names, same tone table, same dot, same 2px indicator.

                        The row used to render itself, and its selected state
                        was a `border-b-2`: the base stylesheet zeroes every
                        button's border-color, so the legend had no visible
                        selected tab while the map's rail had one — two pages,
                        one status, two different answers as to whether it was
                        on. `showPendingReports` is true here for the same reason
                        it is true there: only an authenticated viewer reaches
                        this page, so the open set includes pending. */}
                    <div
                        className="flex w-full min-w-0 flex-wrap items-end gap-x-1 gap-y-0.5 border-b border-gray-200 dark:border-white/10"
                        aria-label="Map status filter"
                        role="group"
                    >
                        <MapFilterRail
                            filters={MAP_STATUS_FILTERS}
                            showPendingReports
                            selectedFilter={mapStatusFilter}
                            onSelectFilter={setMapStatusFilter}
                            getCount={getMapFilterCount}
                        />
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
                                className="text-xs font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                {/* The operations map's phone frame: a 4:3 canvas, so a narrow
                    viewport gets a map as wide as it is tall rather than the
                    square this used to be — the ratio the mobile incident map
                    was measured into, so the same map is the same shape on both
                    pages. From sm the flat heights take over, as before. */}
                <div className="aspect-[4/3] w-full sm:aspect-auto sm:h-[360px] lg:h-[400px]">
                    {/* No `highRiskZones`: the hazard layer has no tab here, and
                        the canvas only draws zones for a filter that asks for
                        them — so passing them would load and measure a layer
                        that can never be seen. `allIncludesResolved` is what
                        makes the canvas agree with the All open tab above it:
                        both count the month's closed incidents as well. */}
                    <MapView
                        reports={mapDayReports}
                        showPending
                        filterStatus={mapStatusFilter}
                        allIncludesResolved
                        viewerRole={user?.role || 'guest'}
                        showDataState
                        enable3D
                        className="h-full w-full"
                        focusLocation={focusLocation}
                        homeFocus={municipalityHomeFocus}
                        frameReportsOnOpen={mapExperience.framesReportsOnOpen}
                    />
                </div>
            </section>

            {/* Operational Breakdown Section: Ranked Barangay & Category Lists */}
            {/* Two up from md, which is where 720px of content starts: a 768px
                tablet (no sidebar, 24px of padding) and a 1024px laptop (240px
                sidebar, 32px of padding) both leave exactly 720px, so the
                two-column split belongs at the width the two columns fit rather
                than at the width the sidebar turns on. At lg this section used to
                go two-up at 348px a card while the very same content sat
                one-up at 720px one breakpoint earlier. */}
            <section className="grid gap-3 md:grid-cols-2" aria-label="Operational breakdown">
                {hasMunicipality ? (
                    <>
                        <RankedBreakdownPanel
                            title="By barangay"
                            description={`Reports within ${user?.assignedMunicipality || 'the assigned municipality'}`}
                            data={toSafeArray(barangayBarData).slice(0, 8)}
                            emptyDetail="Barangay information was not supplied for reports in this period."
                        />
                        <RankedBreakdownPanel
                            title="By incident type"
                            description="Most reported incident classifications"
                            data={toSafeArray(incidentTypeBarData).slice(0, 8)}
                            emptyDetail="Incident type information is unavailable for this period."
                        />
                    </>
                ) : (
                    <>
                        <RankedBreakdownPanel
                            title="By municipality"
                            description="Reports per municipality"
                            data={toSafeArray(municipalityBarData)}
                            isMunicipality
                            emptyDetail="No municipality totals are available for this period."
                        />
                        <RankedBreakdownPanel
                            title="By barangay"
                            description="Top barangays by report count"
                            data={toSafeArray(barangayBarData).slice(0, 8)}
                            emptyDetail="Barangay information was not supplied for reports in this period."
                        />
                    </>
                )}
            </section>

            {/* Reach: how many distinct people opened each record's details.
                Admin-only, and rendered only once data exists so a viewer
                without permission never sees an empty shell. */}
            {isAdminViewer && reach ? (
                <section className="grid gap-3 md:grid-cols-2" aria-label="Reach">
                    <ReachPanel
                        title="Incident reach"
                        description="Distinct viewers who opened each incident"
                        rows={reach.reports}
                        emptyDetail="No incident details have been opened yet."
                    />
                    <ReachPanel
                        title="Risk zone reach"
                        description="Distinct viewers who opened each hazard area"
                        rows={reach.zones}
                        emptyDetail="No hazard area details have been opened yet."
                    />
                </section>
            ) : null}

            {/* Recent Operational Activity Section */}
            <section ref={historySectionRef} aria-label="Recent activity">
                <div className="flex items-baseline justify-between gap-2">
                    <div>
                        <h2 className={SECTION_LABEL_CLASS}>Recent activity</h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Latest updates across the current scope</p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenReports}
                        className="inline-flex shrink-0 items-center text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-sm dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                    >
                        View incident queue
                    </button>
                </div>
                {recentReports.length ? (
                    <ul className="mt-2.5 divide-y divide-gray-100 border-t border-gray-200 dark:divide-white/5 dark:border-white/10">
                        {recentReports.map((reportItem) => {
                            const status = (reportItem.status || 'pending').toLowerCase();
                            const statusConfig = MAP_STATUS_CONFIG[status] || MAP_STATUS_CONFIG.pending;
                            return (
                                <li key={reportItem._id}>
                                <article
                                    onClick={onOpenReports}
                                    className="flex cursor-pointer items-center gap-3 py-3 transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03]"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {reportItem.address || reportItem.title || 'Location unavailable'}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                            {getPhysicalMunicipality(reportItem) || 'Unknown municipality'}
                                            <span aria-hidden="true"> · </span>
                                            {reportItem.incidentType ? String(reportItem.incidentType).replace(/[_-]+/g, ' ') : 'Unclassified incident'}
                                            <span aria-hidden="true"> · </span>
                                            {formatActivityTime(reportItem.updatedAt || reportItem.createdAt)}
                                        </p>
                                    </div>
                                    {/* Dot + label, the same status idiom the incident
                                        queue and the reporter workspace use: the colour
                                        carries the state at a glance and the word keeps
                                        it readable without colour. Deliberately not a
                                        pill — this is a row's own state, not a badge
                                        competing with the record for attention. */}
                                    <span
                                        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300"
                                        title={`Status: ${statusConfig.label || status}`}
                                        aria-label={`Status: ${statusConfig.label || status}`}
                                    >
                                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot || 'bg-gray-400'}`} aria-hidden="true" />
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

const EmptyState = () => (
    <div className="mt-2.5 rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
        No recent activity available.
    </div>
);

export default DashboardAnalyticsWorkspace;
