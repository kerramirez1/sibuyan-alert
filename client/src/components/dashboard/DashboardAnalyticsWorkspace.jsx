import { useEffect, useId, useMemo, useState } from 'react';
import { formatDistanceToNow, addMonths, isSameMonth, parseISO, subMonths } from 'date-fns';
import toast from '../../utils/appToast';
import { toSafeArray, safeCount } from '../../utils/safeCollection';
import { formatMonthLabel, toValidDate } from '../../utils/safeDate';
import useReachData from '../../hooks/useReachData';
import ReachPanel, { REACH_EXPLANATION } from './ReachPanel';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    HiCheck,
    HiChevronLeft,
    HiChevronRight,
    HiOutlineArrowRight,
    HiOutlineCalendar,
    HiOutlineChartBar,
    HiOutlineClock,
    HiOutlineDownload,
    HiOutlineExclamationCircle,
    HiOutlineLocationMarker,
    HiOutlineX,
} from 'react-icons/hi';
import MapView from '../map/MapView';
import Button from '../ui/Button';
import ScrollFadeRow from '../ui/ScrollFadeRow';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';
import { ANALYTICS_SCOPE, countReportsInMonth, filterReportsByPeriodKey, getManilaMonthKey, getTrendInsight, MANILA_OFFSET_MS } from '../../utils/analyticsTrend';
import { getPhysicalMunicipality } from '../../utils/incidentDetails';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import MapFilterRail, { getRailDotClass } from './MapFilterRail';
import { getFilteredMapReports } from '../../utils/mapReports';
import { getMapExperience } from '../../config/mapExperience';
import { getMunicipalityMapFocus } from '../../utils/sibuyanLocations';
import styles from './DashboardAnalyticsWorkspace.module.css';

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
    Object.freeze({ value: 'all', label: 'All reports', group: 'status', title: "This period's reports — pending, being handled, and closed" }),
    Object.freeze({ value: 'pending', label: 'Pending review', group: 'status', title: 'Unverified reports awaiting review' }),
    Object.freeze({ value: 'active', label: 'Active incidents', group: 'status', title: 'Verified, transferred, and responding incidents' }),
    // Resolved is a status here, not the operations rail's archive layer: this
    // view is one month, and that month's closed incidents are part of it — they
    // sit inside All reports, and this tab is how a viewer isolates them. The rail's
    // Resolved archive is a different set (every closed record, whatever month),
    // which is why the label differs.
    Object.freeze({ value: 'resolved', label: MAP_STATUS_CONFIG.resolved.label, group: 'status', title: "This month's closed incidents" }),
    // Deliberately no hazard layer. Risk zones are not part of a month's incident
    // distribution, and the tab that showed them made one rail read as the legend
    // for two unlike things — a hazard area and a record. Their count still opens
    // the summary's "Active risk zones" line below.
]);

const SEVERITY_SERIES = Object.freeze([
    Object.freeze({ key: 'minor', label: 'Minor', fill: '#818CF8' }),
    Object.freeze({ key: 'moderate', label: 'Moderate', fill: '#F59E0B' }),
    Object.freeze({ key: 'severe', label: 'Severe', fill: '#EA580C' }),
    Object.freeze({ key: 'critical', label: 'Critical', fill: '#DC2626' }),
    Object.freeze({ key: 'unknown', label: 'Unknown', fill: '#94A3B8' }),
]);

/**
 * The three reporting scopes, in the order they widen. Each option carries its
 * own `title` so the control explains itself on hover without a legend beside it.
 */
const SCOPE_OPTIONS = Object.freeze([
    Object.freeze({ value: ANALYTICS_SCOPE.MONTHLY, label: 'Monthly', title: 'Show one month at a time' }),
    Object.freeze({ value: ANALYTICS_SCOPE.YEARLY, label: 'Yearly', title: 'Show one year at a time' }),
    Object.freeze({ value: ANALYTICS_SCOPE.ALL_TIME, label: 'All time', title: 'Show every recorded incident, with no month or year filter' }),
]);

/**
 * Per-scope wording for the trend panel. The scope decides the bucket size, so
 * it also decides what a bucket is called and what a drill-down selects.
 */
const SCOPE_TREND_COPY = Object.freeze({
    [ANALYTICS_SCOPE.MONTHLY]: Object.freeze({
        volumePrefix: 'Daily volume for',
        trendNoun: 'Daily incident report trend for',
        bucketNoun: 'day',
        selectLabel: 'Filter map by day',
        selectHeading: 'Map day',
        allOptionLabel: 'All days',
        emptyDetail: 'Choose another month.',
    }),
    [ANALYTICS_SCOPE.YEARLY]: Object.freeze({
        volumePrefix: 'Monthly volume for',
        trendNoun: 'Monthly incident report trend for',
        bucketNoun: 'month',
        selectLabel: 'Filter map by month',
        selectHeading: 'Map month',
        allOptionLabel: 'All months',
        emptyDetail: 'Choose another year.',
    }),
    [ANALYTICS_SCOPE.ALL_TIME]: Object.freeze({
        volumePrefix: 'Yearly volume across',
        trendNoun: 'Yearly incident report trend across',
        bucketNoun: 'year',
        selectLabel: 'Filter map by year',
        selectHeading: 'Map year',
        allOptionLabel: 'All years',
        emptyDetail: 'No reports have been recorded yet.',
    }),
});

const SCOPE_MAP_HEADING = Object.freeze({
    [ANALYTICS_SCOPE.MONTHLY]: 'Monthly incident map',
    [ANALYTICS_SCOPE.YEARLY]: 'Yearly incident map',
    [ANALYTICS_SCOPE.ALL_TIME]: 'All-time incident map',
});

// Related panels share one surface; typography and theme tokens stay local to analytics.
const PANEL_SURFACE = styles.surface;
const PANEL_CLASS = styles.panel;
const PANEL_HEADER_CLASS = styles.panelHeader;
const PANEL_TITLE_CLASS = styles.title;
const PANEL_DESCRIPTION_CLASS = styles.description;
const PANEL_META_CLASS = styles.meta;
const SECTION_LABEL_CLASS = styles.sectionLabel;

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
    const total = Math.max(Math.round(Number(firstPayload?.total) || 0), 0);
    return (
        <div className={styles.tooltip}>
            <p className="mb-2 font-semibold">{firstPayload?.fullDate || label}</p>
            {payload.map((entry) => (
                <div key={String(entry?.dataKey ?? entry?.name ?? Math.random())} className="flex items-center justify-between gap-3 py-0.5">
                    <span className={`inline-flex items-center gap-2 ${styles.secondary}`}>
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                        {entry.name || entry.dataKey}
                    </span>
                    <span className="font-semibold tabular-nums">{entry.value}</span>
                </div>
            ))}
            {/* The bucket total in one place, so a count hidden from a crowded
                plot is still exact on hover. */}
            {total > 0 && (
                <div className={`mt-1.5 flex items-center justify-between gap-3 border-t pt-1.5 ${styles.rule}`}>
                    <span className="font-medium">Total</span>
                    <span className="font-semibold tabular-nums">{total}</span>
                </div>
            )}
        </div>
    );
};

const EmptyChart = ({ message = 'No data for the selected period', detail }) => (
    <div className={styles.empty}>
        <HiOutlineChartBar className={`mb-3 h-7 w-7 ${styles.subtle}`} aria-hidden="true" />
        <p className="text-sm font-semibold">{message}</p>
        {detail && <p className="mt-1.5 max-w-sm text-xs leading-relaxed">{detail}</p>}
    </div>
);

const SEVERITY_STACK_ORDER = ['minor', 'moderate', 'severe', 'critical', 'unknown'];

const TREND_CHART_MARGIN = Object.freeze({ top: 16, right: 4, left: 0, bottom: 0 });

/**
 * The trend plot's own geometry, which is what turns a count into pixels: the
 * panel's h-52 is 208px, the chart's top margin takes 16px and recharts keeps
 * 30px for the x axis, leaving 162px of plot. A bucket total is drawn 4px above
 * its bar and its digits need about 10px more, so the count axis has to keep a
 * little over 14px of headroom above the tallest bar. Without it the top bar
 * reaches the top of the plot and the label above it is drawn past the bar
 * layer's clip path — which is where a peak of 4, 8, 12 or 100 used to lose its
 * own count, because recharts' nice ticks land exactly on those values.
 */
const TREND_PLOT_HEIGHT_PX = 162;
const TOTAL_LABEL_HEADROOM_PX = 14;
const AXIS_HEADROOM_RATIO = 1 / (1 - TOTAL_LABEL_HEADROOM_PX / TREND_PLOT_HEIGHT_PX);
const MAX_AXIS_TICKS = 7;
const TOTAL_LABEL_DIGIT_WIDTH_PX = 7;
const TOTAL_LABEL_MIN_GAP_PX = 4;
const Y_AXIS_MIN_WIDTH = 28;

/**
 * The 1-2-5 ladder: the smallest round step that is at least `value`, so the
 * interval widens as the counts grow instead of the tick count piling up.
 */
const axisIntervalFor = (value) => {
    const target = Math.max(Number(value) || 0, 1);
    const decade = 10 ** Math.floor(Math.log10(target));
    const mantissa = target / decade;
    return (mantissa > 5 ? 10 : mantissa > 2 ? 5 : mantissa > 1 ? 2 : 1) * decade;
};

/**
 * The count axis for the trend plot, sized to the tallest bucket: zero-based,
 * integer, and always clear of the peak by TOTAL_LABEL_HEADROOM_PX of the plot
 * so the total label above the tallest bar lands inside the plot. Explicit ticks
 * rather than recharts' own, so the maximum is ours to guarantee.
 */
export const buildIncidentCountAxis = (totals = []) => {
    const peak = toSafeArray(totals).reduce((highest, value) => {
        const count = Number(value);
        return Number.isFinite(count) && count > highest ? count : highest;
    }, 0);
    const wholePeak = Math.ceil(peak);
    if (wholePeak <= 0) return { max: 0, interval: 0, ticks: [0] };

    const padded = Math.ceil(wholePeak * AXIS_HEADROOM_RATIO);
    const interval = axisIntervalFor(padded / (MAX_AXIS_TICKS - 1));
    const max = Math.ceil(padded / interval) * interval;
    const ticks = Array.from({ length: max / interval + 1 }, (_, index) => index * interval);
    return { max, interval, ticks };
};

/**
 * Formats a duration in minutes into a human-readable string (e.g. 422m -> 7h 2m).
 */
export const formatHumanDuration = (minutes) => {
    if (minutes === null || minutes === undefined) return '—';
    const min = Number(minutes);
    if (!Number.isFinite(min) || min < 0) return '—';
    const wholeMinutes = Math.round(min);
    if (wholeMinutes < 60) return `${wholeMinutes}m`;
    const hours = Math.floor(wholeMinutes / 60);
    const rem = wholeMinutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
};

/**
 * Normalizes text to sentence-case, converting underscores/hyphens to spaces.
 */
export const toSentenceCase = (text) => {
    if (!text) return '';
    const str = String(text).trim();
    if (/[_-]/.test(str)) {
        const words = str.replace(/[_-]+/g, ' ').trim().toLowerCase();
        return words.charAt(0).toUpperCase() + words.slice(1);
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * A total is drawn only where its digits fit the bucket's own slot on the plot.
 * Labels that would overprint their neighbour are dropped instead, and the exact
 * counts stay in the tooltip, the day list and the chart's description. An
 * unmeasured width — the first paint — keeps every label rather than guessing.
 */
const labelFitsSlot = (text, slotWidth) => {
    const width = Number(slotWidth);
    if (!(width > 0)) return true;
    return width >= String(text).length * TOTAL_LABEL_DIGIT_WIDTH_PX + TOTAL_LABEL_MIN_GAP_PX;
};

/**
 * What every bucket's total label needs, and where recharts will hand it over.
 * A label list sits on each severity series and recharts skips the segments it
 * cannot draw, so the `index` a label receives counts only the buckets that
 * series actually draws — `drawnByKey` maps that index back to the bucket.
 * `total` rides along so the renderer can refuse a total the list and the plan
 * disagree about instead of drawing the wrong one.
 */
export const buildTotalLabelPlans = (chartData = [], { slotWidth = 0 } = {}) => {
    const days = toSafeArray(chartData);
    const buckets = [];
    const drawnByKey = Object.fromEntries(SEVERITY_STACK_ORDER.map((key) => [key, []]));

    days.forEach((day, bucketIndex) => {
        let topKey = null;
        for (const { key } of SEVERITY_SERIES) {
            const value = Number(day?.[key]) || 0;
            if (value <= 0) continue;
            drawnByKey[key].push(bucketIndex);
            // Severity series are stacked in this order, so the last positive
            // segment is the one the total is drawn above.
            topKey = key;
        }
        const total = Math.max(Math.round(Number(day?.total) || 0), 0);
        const text = String(total);
        buckets.push({
            topKey,
            total,
            text,
            show: total > 0 && labelFitsSlot(text, slotWidth),
        });
    });

    return { buckets, drawnByKey };
};

/**
 * Draws a bucket's total once, on top of the highest non-zero stack segment,
 * from that bucket's plan. Returns null for empty buckets, for segments that are
 * not the top of their stack, and for any rect the plan cannot place.
 */
const renderStackTotalLabel = (barKey, plans) => ({
    x, y, width, value, index,
}) => {
    const bucketIndex = plans?.drawnByKey?.[barKey]?.[index];
    if (bucketIndex === undefined || typeof x !== 'number' || typeof y !== 'number') return null;
    const plan = plans.buckets[bucketIndex];
    if (!plan?.show || plan.topKey !== barKey || Number(value) !== plan.total) return null;
    return (
        <text x={x + (width || 0) / 2} y={Math.max(y - 4, 9)} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--chart-axis)">
            {plan.text}
        </text>
    );
};

const MetricTile = ({ label, value, helper, status, accent = null }) => {
    // A zero is a real reading, not a missing one, so it keeps its place and its
    // size but drops one step of emphasis. The amber "Pending review" value is
    // exempt: it is the strongest number on the row by design.
    const isZero = !accent && (Number(value) || 0) === 0;

    return (
        <div className={`${styles.metric} ${accent ? styles.metricAttention : ''}`}>
            <dt className={styles.metricLabel}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${MAP_STATUS_CONFIG[status]?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                {label}
            </dt>
            <dd className={`${styles.metricValue} ${accent ? 'text-amber-800 dark:text-amber-400' : isZero ? 'text-slate-400 dark:text-slate-500' : ''}`}>{value}</dd>
            <dd className={`mt-1.5 text-xs leading-relaxed ${styles.secondary}`}>{helper}</dd>
            {accent && (
                <dd className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-400">
                    <HiOutlineExclamationCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {accent}
                </dd>
            )}
        </div>
    );
};

const TrendPanel = ({
    chartData = [],
    selectedMonth,
    reportCount = 0,
    prevMonthCount = 0,
    prevLabel = null,
    selectedDay,
    onSelectDay,
    scope = ANALYTICS_SCOPE.MONTHLY,
    periodLabel = '',
}) => {
    const safeChartData = toSafeArray(chartData);
    const safeReportCount = Number.isFinite(Number(reportCount)) ? Number(reportCount) : 0;
    const activeDays = safeChartData.filter((day) => Number(day?.total) > 0);
    const [chartWidth, setChartWidth] = useState(0);
    const summaryId = useId();
    const daySelectId = useId();
    const copy = SCOPE_TREND_COPY[scope] || SCOPE_TREND_COPY[ANALYTICS_SCOPE.MONTHLY];
    const hasTrendData = activeDays.length > 0;
    const insight = getTrendInsight(safeChartData, { selectedMonth, prevMonthCount, prevLabel });
    const presentSeverities = SEVERITY_SERIES.filter(({ key }) => safeChartData.some((day) => (Number(day?.[key]) || 0) > 0));
    // The count axis is sized from the buckets themselves, and its width grows
    // with the largest tick so a four-digit count is not cut off at the left
    // edge. The plot is what is left of the measured container after the axis and
    // the right margin, and each bucket's slot on it decides whether that
    // bucket's total fits (see buildTotalLabelPlans).
    const countAxis = buildIncidentCountAxis(safeChartData.map((day) => day?.total));
    const yAxisWidth = Math.max(
        Y_AXIS_MIN_WIDTH,
        String(countAxis.max).length * TOTAL_LABEL_DIGIT_WIDTH_PX + 8
    );
    const plotWidth = Math.max(
        chartWidth - yAxisWidth - TREND_CHART_MARGIN.left - TREND_CHART_MARGIN.right,
        0
    );
    const labelPlans = buildTotalLabelPlans(safeChartData, {
        slotWidth: plotWidth / Math.max(safeChartData.length, 1),
    });
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

    // recharts reports the measured plot width here, which is how the total
    // labels know whether a bucket is wide enough to carry its count.
    const handleChartResize = (nextWidth) => {
        const rounded = Math.max(Math.round(Number(nextWidth) || 0), 0);
        setChartWidth((current) => (current === rounded ? current : rounded));
    };

    return (
        <div className={`${PANEL_CLASS} xl:col-span-3`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 sm:shrink-0">
                    <p className={SECTION_LABEL_CLASS}>Trend analysis</p>
                    <h2 className={PANEL_TITLE_CLASS}>Incident trend</h2>
                    <p className={PANEL_DESCRIPTION_CLASS}>{copy.volumePrefix} {periodLabel}</p>
                </div>
                {presentSeverities.length > 0 && (
                    <div className={`min-w-0 text-[11px] ${styles.secondary}`}>
                        <p className={`mb-1.5 font-medium sm:text-right ${styles.subtle}`}>Severity</p>
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:justify-end" aria-label="Severity legend">
                            {presentSeverities.map(({ key, label, fill }) => (
                                <span key={key} className="inline-flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: fill }} aria-hidden="true" />
                                    {label}
                                </span>
                            ))}
                        </p>
                    </div>
                )}
            </div>

            <div data-testid="trend-insight" className={styles.trendInsight}>
                <span className={styles.insightItem}>
                    <span className={`font-semibold ${styles.accent}`}>{reportLabel}</span>
                </span>
                {insight.delta && (
                    <>
                        <span className={styles.insightDivider} aria-hidden="true" />
                        <span className={styles.insightItem}>
                            <span className={styles.deltaBadge}>{insight.delta.label}</span>
                        </span>
                    </>
                )}
                {insight.peak && (
                    <>
                        <span className={styles.insightDivider} aria-hidden="true" />
                        <span className={styles.insightItem}>
                            <span>Peak</span>
                            <button
                                type="button"
                                onClick={() => onSelectDay?.(insight.peak.dayKey)}
                                title={`Filter map to ${insight.peak.fullDate}`}
                                aria-label={`Filter map to ${insight.peak.fullDate}`}
                                aria-pressed={selectedDay === insight.peak.dayKey}
                                className={styles.peakButton}
                            >
                                <HiOutlineCalendar className="h-3.5 w-3.5" aria-hidden="true" />
                                {insight.peak.label}
                            </button>
                            <span className={styles.subtle}>({insight.peak.count})</span>
                        </span>
                    </>
                )}
                {insight.total > 0 && insight.quietDays > 0 && (
                    <>
                        <span className={styles.insightDivider} aria-hidden="true" />
                        <span className={styles.insightItem}>
                            <span>
                                {insight.quietDays} quiet {insight.quietDays === 1 ? copy.bucketNoun : `${copy.bucketNoun}s`} of {safeChartData.length}
                            </span>
                        </span>
                    </>
                )}
            </div>

            {!hasTrendData ? (
                <div className="py-4">
                    <EmptyChart
                        message={safeReportCount === 0 ? 'No reports in this period' : 'No valid report dates in this period'}
                        detail={safeReportCount === 0
                            ? copy.emptyDetail
                            : 'Some reports could not be plotted because their timestamps are missing or invalid.'}
                    />
                </div>
            ) : (
                <div className="mt-3">
                    <p id={summaryId} className="sr-only">
                        {reportLabel} recorded. Reports by active {copy.bucketNoun}: {activeDaySummary}. {insightSummary}.
                    </p>
                    <div
                        className="h-52 min-w-0 w-full sm:h-56"
                        role="img"
                        aria-label={`${copy.trendNoun} ${periodLabel}`}
                        aria-describedby={summaryId}
                    >
                        <ResponsiveContainer width="100%" height="100%" onResize={handleChartResize}>
                            <BarChart data={safeChartData} data-testid="incident-bar-chart" margin={TREND_CHART_MARGIN} barCategoryGap="30%" accessibilityLayer>
                                <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                                    tickFormatter={(value, index) => (scope === ANALYTICS_SCOPE.MONTHLY ? (index === 0 ? value : formatXAxisDay(value)) : value)}
                                    interval="preserveStartEnd"
                                    minTickGap={20}
                                    dy={6}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                                    allowDecimals={false}
                                    width={yAxisWidth}
                                    domain={[0, countAxis.max]}
                                    ticks={countAxis.ticks}
                                />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--analytics-accent-soft)' }} />
                                {SEVERITY_SERIES.map(({ key, label, fill }) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        name={label}
                                        stackId="incidents"
                                        fill={fill}
                                        // Monthly draws 28-31 categories, so its bars are
                                        // already ~15px and this never bites. It exists for
                                        // the scopes that draw few buckets — a Yearly plot is
                                        // 12 bars and an All-time plot can be one, where an
                                        // uncapped bar would fill a third of the panel.
                                        maxBarSize={56}
                                        isAnimationActive={false}
                                        onClick={handleBarClick}
                                    >
                                        {safeChartData.map((day, index) => (
                                            <Cell
                                                key={day.dayKey || index}
                                                cursor={day.total > 0 ? 'pointer' : 'default'}
                                                fillOpacity={selectedDay && day.dayKey !== selectedDay ? 0.3 : 1}
                                            />
                                        ))}
                                        <LabelList dataKey="total" content={renderStackTotalLabel(key, labelPlans)} />
                                    </Bar>
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
            {hasTrendData && (
                <div className={`mt-4 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${styles.rule}`}>
                    <p className={`text-xs ${styles.subtle}`}>Select a bar or a {copy.bucketNoun} to filter the map.</p>
                    <div className="flex min-w-0 items-center gap-2">
                        <label htmlFor={daySelectId} className={`shrink-0 text-xs font-medium ${styles.secondary}`}>{copy.selectHeading}</label>
                        <select
                            id={daySelectId}
                            aria-label={copy.selectLabel}
                            value={selectedDay || ''}
                            onChange={(event) => onSelectDay?.(event.target.value || null)}
                            className={`flex-1 sm:flex-initial ${styles.daySelect}`}
                        >
                            <option value="">{copy.allOptionLabel || 'All days'}</option>
                            {activeDays.map((day, index) => (
                                <option key={day.dayKey || index} value={day.dayKey}>
                                    {day.fullDate} · {day.total} {day.total === 1 ? 'report' : 'reports'}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
};

const LifecyclePanel = ({ statusData = [], totalReports = 0, periodLabel = '' }) => {
    const safeStatus = toSafeArray(statusData);
    const safeTotal = Number.isFinite(Number(totalReports)) ? Number(totalReports) : 0;
    return (
    <div className={`${PANEL_CLASS} border-t xl:col-span-2 xl:border-l xl:border-t-0 ${styles.rule}`}>
        <div className={PANEL_HEADER_CLASS}>
            <div className="min-w-0">
                <p className={SECTION_LABEL_CLASS}>Lifecycle</p>
                <h2 className={PANEL_TITLE_CLASS}>Report lifecycle</h2>
                <p className={PANEL_DESCRIPTION_CLASS}>Status distribution for {periodLabel}</p>
            </div>
            {safeTotal > 0 && (
                <span className={PANEL_META_CLASS}>
                    {safeTotal} total
                </span>
            )}
        </div>
        {safeStatus.length ? (
            <div className="mt-5" aria-label="Report lifecycle distribution">
                <div className={`flex h-2.5 w-full overflow-hidden rounded-full ${styles.track}`} aria-hidden="true">
                    {safeStatus.map((item) => {
                        const pct = safeTotal ? (Number(item?.value || 0) / safeTotal) * 100 : 0;
                        if (pct <= 0) return null;
                        return (
                            <div
                                key={String(item?.name || Math.random())}
                                style={{ width: `${pct}%`, backgroundColor: item.color }}
                                className="h-full"
                                title={`${item.name}: ${item.value}`}
                            />
                        );
                    })}
                </div>

                <div className={`mt-5 flex items-center justify-between text-[11px] font-medium ${styles.subtle}`} aria-hidden="true">
                    <span>Status</span>
                    <span className="flex gap-4"><span className="w-10 text-right">Reports</span><span className="w-10 text-right">Share</span></span>
                </div>
                <dl className="mt-1">
                    {safeStatus.map((item) => {
                        const percentage = safeTotal ? Math.round((Number(item?.value || 0) / safeTotal) * 100) : 0;
                        return (
                            <div key={String(item?.name || Math.random())} className={`flex items-center justify-between gap-2 border-b py-3 text-[13px] last:border-0 ${styles.rule}`}>
                                <dt className="flex min-w-0 items-center gap-2">
                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                                    <span className="font-medium">{item.name}</span>
                                </dt>
                                <dd className="flex shrink-0 items-center gap-4 tabular-nums">
                                    <span className="w-10 text-right font-semibold">{item.value}<span className="sr-only"> reports, </span></span>
                                    <span className={`w-10 text-right text-xs ${styles.secondary}`}>{percentage}%</span>
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            </div>
        ) : (
            <div className="mt-3"><EmptyChart message="No lifecycle data" detail={`No reports were created in ${periodLabel}.`} /></div>
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
                    <p className={SECTION_LABEL_CLASS}>Distribution</p>
                    <h2 className={PANEL_TITLE_CLASS}>{title}</h2>
                    <p className={PANEL_DESCRIPTION_CLASS}>{description}</p>
                </div>
                {safeData.length > 0 && (
                    <span className={PANEL_META_CLASS}>
                        {safeData.length} {isMunicipality ? 'municipalities' : 'shown'}
                    </span>
                )}
            </div>

            {safeData.length ? (
                <div className="mt-4" role="list" aria-label={`${title}: ${description}`}>
                    {safeData.map((item, index) => {
                        const count = Number(item?.count) || 0;
                        const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                        const isTop = index === 0 && count > 0;

                        return (
                            <div
                                key={String(item?.name ?? `row-${index}`)}
                                className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2.5 py-3"
                                role="listitem"
                            >
                                <span className={`pt-0.5 text-[11px] font-medium tabular-nums ${isTop ? styles.accent : styles.subtle}`} aria-hidden="true">
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <span className="min-w-0 break-words text-[13px] font-medium leading-5">{toSentenceCase(item.name)}</span>
                                <span className="flex items-baseline gap-2 text-[13px] font-semibold tabular-nums">
                                    {count} <span className={`w-9 text-right text-xs font-normal ${styles.secondary}`}>{percentage}%</span>
                                </span>
                                <div className={`col-span-2 col-start-2 mt-2 h-1.5 overflow-hidden rounded-full ${styles.track}`} aria-hidden="true">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${Math.max(percentage, count > 0 ? 4 : 0)}%`,
                                            backgroundColor: isTop ? 'var(--analytics-accent)' : 'var(--analytics-subtle)',
                                            opacity: isTop ? 1 : 0.55,
                                        }}
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
            {safeData.length > 0 && <p className={`mt-3 text-[11px] ${styles.subtle}`}>Share of reports in the displayed breakdown.</p>}
        </div>
    );
};

const DashboardAnalyticsWorkspace = ({
    user,
    hasMunicipality,
    selectedMonth,
    setSelectedMonth,
    analyticsScope = ANALYTICS_SCOPE.MONTHLY,
    setAnalyticsScope,
    selectedYear,
    setSelectedYear,
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
    // Analytics scope for risk zones: the island-wide read model from
    // useGlobalHighRiskZones is correct for the map, but analytics (the
    // on-screen card and the export) must reflect the active municipality.
    // Zones with a missing/unknown municipality are excluded from a
    // municipal scope and kept in the island-wide view.
    const scopedZones = useMemo(() => {
        if (!hasMunicipality || !user?.assignedMunicipality) return safeZones;
        const targetMunicipality = user.assignedMunicipality;
        return safeZones.filter(
            (zone) => (zone?.municipality || zone?.municipalityName) === targetMunicipality,
        );
    }, [safeZones, hasMunicipality, user?.assignedMunicipality]);
    const safeChartData = toSafeArray(chartData);
    const safeMetrics = (performanceMetrics && typeof performanceMetrics === 'object') ? performanceMetrics : {};
    const effectiveMonth = toValidDate(selectedMonth) || new Date();
    const currentYear = new Date().getFullYear();
    const effectiveYear = Number.isFinite(Number(selectedYear)) ? Number(selectedYear) : currentYear;
    const scopeLabelId = useId();
    // One phrase names the active period. The subtitle, the panel descriptions
    // and the export caption all read it, so they cannot describe different
    // periods — and in All time it is the sentence that replaces the picker.
    const periodLabel = analyticsScope === ANALYTICS_SCOPE.ALL_TIME
        ? 'all recorded incidents'
        : analyticsScope === ANALYTICS_SCOPE.YEARLY
            ? String(effectiveYear)
            : formatMonthLabel(effectiveMonth, 'MMMM yyyy', 'selected period');
    const scopeMetaSuffix = analyticsScope === ANALYTICS_SCOPE.ALL_TIME
        ? 'all recorded incidents'
        : `${periodLabel} scope`;
    const insightsLabel = analyticsScope === ANALYTICS_SCOPE.YEARLY
        ? 'Yearly insights'
        : analyticsScope === ANALYTICS_SCOPE.ALL_TIME
            ? 'All-time insights'
            : 'Monthly insights';
    const activeRiskZoneCount = scopedZones.filter((zone) => zone?.isActive !== false).length;
    const [mapStatusFilter, setMapStatusFilter] = useState('all');
    const [selectedDay, setSelectedDay] = useState(null);

    // Reach is admin-only and fetched separately: it comes from the ViewEvent
    // collection, while every other number on this page is derived client-side
    // from the report list. Keeping the two sources apart means a reach failure
    // degrades to "not shown" instead of looking like a report failure.
    const isAdminViewer = user?.role === 'municipal_admin' || user?.role === 'admin';
    const { reach } = useReachData({ enabled: Boolean(isAdminViewer) });

    // Enrich reach reports with barangay and date to distinguish duplicate titles
    const enrichedReportReach = useMemo(() => {
        if (!reach?.reports || !Array.isArray(reach.reports)) return [];
        const reportMap = new Map();
        safeAllReports.forEach((rpt) => {
            if (rpt?._id) reportMap.set(String(rpt._id), rpt);
            if (rpt?.id) reportMap.set(String(rpt.id), rpt);
        });

        return reach.reports.map((row) => {
            const matched = reportMap.get(String(row.id));
            if (!matched) return row;
            const parts = [];
            if (matched.barangay) {
                parts.push(`Brgy. ${matched.barangay}`);
            }
            if (matched.createdAt) {
                const dateObj = toValidDate(matched.createdAt);
                if (dateObj) {
                    parts.push(formatMonthLabel(dateObj, 'MMM d', ''));
                }
            }
            const detail = parts.length > 0 ? parts.join(' · ') : null;
            return {
                ...row,
                detail: detail || row.municipalityName || null,
            };
        });
    }, [reach?.reports, safeAllReports]);

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

    // Bucket drill-downs belong to one period; a new month, year, or scope
    // starts unfiltered.
    useEffect(() => {
        setSelectedDay(null);
    }, [selectedMonth, selectedYear, analyticsScope]);

    // The previous period's count, for the trend's "more/fewer than" line. All
    // time has nothing to compare against, so it reports no delta at all rather
    // than a zero that would read as "no change".
    const { prevPeriodCount, prevPeriodLabel } = useMemo(() => {
        if (analyticsScope === ANALYTICS_SCOPE.ALL_TIME) {
            return { prevPeriodCount: null, prevPeriodLabel: null };
        }
        try {
            if (analyticsScope === ANALYTICS_SCOPE.YEARLY) {
                const previousYear = effectiveYear - 1;
                const count = safeAllReports.filter((item) => {
                    if (!item?.createdAt) return false;
                    const reportedAt = parseISO(item.createdAt);
                    return !Number.isNaN(reportedAt.getTime()) && reportedAt.getFullYear() === previousYear;
                }).length;
                return { prevPeriodCount: count, prevPeriodLabel: String(previousYear) };
            }
            // Pace-fair delta: when viewing the in-progress Manila month, compare
            // against the previous month's first N days — never a partial month
            // against a full one.
            const nowManila = new Date(Date.now() + MANILA_OFFSET_MS);
            const viewingCurrentManilaMonth = getManilaMonthKey(effectiveMonth) === getManilaMonthKey(nowManila);
            const count = countReportsInMonth(
                safeAllReports,
                subMonths(effectiveMonth, 1),
                viewingCurrentManilaMonth
                    ? { throughDayOfMonth: nowManila.getUTCDate() }
                    : {},
            );
            return { prevPeriodCount: count, prevPeriodLabel: null };
        } catch {
            return { prevPeriodCount: 0, prevPeriodLabel: null };
        }
    }, [analyticsScope, effectiveMonth, effectiveYear, safeAllReports]);

    const mapDayReports = selectedDay
        ? filterReportsByPeriodKey(safeReports, { scope: analyticsScope, periodKey: selectedDay })
        : safeReports;
    const selectedDayLabel = safeChartData.find((day) => day?.dayKey === selectedDay)?.date || selectedDay;

    const topMapBarangays = useMemo(() => {
        if (selectedDay) {
            const counts = new Map();
            toSafeArray(mapDayReports).forEach((rpt) => {
                const b = rpt?.barangay || 'Unknown';
                counts.set(b, (counts.get(b) || 0) + 1);
            });
            return Array.from(counts.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 4);
        }
        return toSafeArray(barangayBarData).slice(0, 4);
    }, [selectedDay, mapDayReports, barangayBarData]);

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
            const [{ default: ExcelJS }, { buildAnalyticsWorkbook, writeWorkbookToBuffer, appendSummaryNote }, { default: fileSaver }, { renderTrendChartPng }] = await Promise.all([
                import('exceljs'),
                import('../../utils/excelExport'),
                import('file-saver'),
                import('../../utils/trendChartImage'),
            ]);
            // The caption names whatever period is on screen, so an all-time
            // export cannot be filed as if it were one month's.
            const monthLabel = analyticsScope === ANALYTICS_SCOPE.ALL_TIME ? 'All time' : periodLabel;
            // Cap export rows: a full prod history can OOM the tab on EOC hardware.
            const MAX_EXPORT_ROWS = 5000;
            // The incident list must match the period the title and summary
            // metrics describe (safeReports), not the all-time safeAllReports.
            const exportIncidents = safeReports.slice(0, MAX_EXPORT_ROWS);
            const truncatedNote = safeReports.length > MAX_EXPORT_ROWS
                ? `Incident list truncated to the first ${MAX_EXPORT_ROWS} rows; totals above reflect the full set.`
                : '';
            if (truncatedNote) {
                toast(`Exporting first ${MAX_EXPORT_ROWS} of ${safeReports.length} rows.`, { id: toastId });
            }
            const responseSampleN = safeMetrics.responseSampleCount ?? 0;
            const scopeName = hasMunicipality ? (user?.assignedMunicipality || 'Municipal') : 'Island-wide';
            const workbook = buildAnalyticsWorkbook(ExcelJS, {
                scopeLabel: scopeName,
                monthLabel,
                exportedAt: new Date(),
                truncatedNote,
                summary: [
                    { metric: 'New Reports in Selected Month', value: safeCount(safeReports) },
                    { metric: 'Total Reports in Scope (All Time)', value: safeCount(safeAllReports) },
                    { metric: 'Pending Review', value: safeMetrics.pendingCount ?? 0 },
                    { metric: 'Available for Dispatch', value: safeMetrics.dispatchReadyCount ?? 0 },
                    { metric: 'Active Responses', value: safeMetrics.respondingCount ?? 0 },
                    { metric: 'Resolved Cases', value: safeMetrics.resolvedCount ?? 0 },
                    { metric: 'Resolution Rate', value: `${safeMetrics.resolutionRate ?? 0}%` },
                    { metric: `Average Response Time (Minutes, n=${responseSampleN})`, value: safeMetrics.avgResponseMin ?? 'No data' },
                    { metric: `Median Response Time (Minutes, n=${responseSampleN})`, value: safeMetrics.medianResponseMin ?? 'No data' },
                    { metric: 'Active High-Risk Zones (Current, as of Export)', value: activeRiskZoneCount },
                ],
                incidents: exportIncidents,
                zones: scopedZones,
                trend: safeChartData,
            });

            // Trend chart image: enhancement, never a blocker. The PNG is
            // rasterized from a dedicated export-only SVG (never the live
            // DOM, whose CSS variables would not resolve off-document). Any
            // raster failure skips the image and its note; the workbook
            // still downloads.
            try {
                const trendPng = await renderTrendChartPng(safeChartData);
                const trendImageId = workbook.addImage({ base64: trendPng.split(',')[1], extension: 'png' });
                const summarySheet = workbook.getWorksheet('Summary');
                summarySheet.getColumn(3).width = 3; // visual gutter between the table and the chart
                summarySheet.addImage(trendImageId, { tl: { col: 3, row: 1 }, ext: { width: 640, height: 300 } });
                appendSummaryNote(summarySheet, 'Trend chart (right) and Trend Data sheet reflect the selected period.');
            } catch (chartError) {
                console.warn('Trend chart image skipped:', chartError);
            }

            const buffer = await writeWorkbookToBuffer(workbook);
            // Filename names the reporting period, not the export date.
            const filenamePeriod = analyticsScope === ANALYTICS_SCOPE.ALL_TIME
                ? 'All-time'
                : analyticsScope === ANALYTICS_SCOPE.YEARLY
                    ? String(effectiveYear)
                    : formatMonthLabel(effectiveMonth, 'yyyy-MM', 'period');
            const filenameScope = String(scopeName).replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'Export';
            fileSaver.saveAs(
                new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `Sibuyan_Alert_Analytics_${filenameScope}_${filenamePeriod}.xlsx`
            );
        } catch (exportError) {
            console.error('Dashboard export failed:', exportError);
            toast.error('Export failed. Check your connection and try again.', { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className={`${styles.workspace} mx-auto w-full min-w-0 max-w-[1500px] space-y-5`} role="status" aria-busy="true" aria-label="Loading analytics">
                <span className="sr-only">Loading analytics</span>
                <div className="space-y-3 py-1">
                    <Skeleton variant="text" className="h-3 w-32" />
                    <Skeleton variant="text" className="h-9 w-3/4 max-w-md" />
                    <Skeleton variant="text" className="h-4 w-full max-w-xl" />
                    <Skeleton variant="text" className="h-12 w-64 max-w-full" />
                </div>
                <div className={`${PANEL_SURFACE} grid grid-cols-2 md:grid-cols-4 [&>*:nth-child(even)]:border-l md:[&>*:nth-child(3)]:border-l max-md:[&>*:nth-child(n+3)]:border-t`}>
                    {[0, 1, 2, 3].map((item) => (
                        <div key={item} className={styles.metric}>
                            <Skeleton variant="text" className="h-3 w-20" />
                            <Skeleton variant="text" className="mt-2 h-7 w-12" />
                            <Skeleton variant="text" className="mt-1.5 h-3 w-24 max-w-full" />
                        </div>
                    ))}
                </div>
                {/* Matches the real insights grid: same cap, same 3:2 split, so the
                    cards do not jump sideways when the data lands. */}
                <div className={`${PANEL_SURFACE} mx-auto grid w-full max-w-6xl xl:grid-cols-5`}>
                    <SkeletonCard className="h-80 xl:col-span-3" />
                    <SkeletonCard className="h-80 xl:col-span-2" />
                </div>
                <SkeletonCard className="h-80" />
            </div>
        );
    }

    return (
        <div className={`${styles.workspace} mx-auto w-full min-w-0 max-w-[1500px] space-y-5`}>
            <header className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${styles.accent}`}>
                            {hasMunicipality ? `${user?.assignedMunicipality} EOC` : 'Island-wide Operations'}
                        </p>
                        <h1 className="mt-1.5 font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[28px]">Municipal Situation Overview</h1>
                        <p className={`mt-1.5 max-w-[70ch] text-[13px] leading-relaxed ${styles.secondary}`}>
                            {hasMunicipality
                                ? `${user?.assignedMunicipality} incident status and response readiness for ${periodLabel}.`
                                : `Island-wide incident briefing and municipal comparisons for ${periodLabel}.`}
                        </p>
                    </div>
                    {viewSwitch && <div className="shrink-0 sm:pt-1">{viewSwitch}</div>}
                </div>

                <div className={`flex w-full flex-col gap-3 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${styles.rule}`} role="toolbar" aria-label="Analytics controls">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3">
                        {/* The scope control is a segmented group, not three words in a
                            row: one bounded track holds the options, and the active one
                            is raised, ringed, heavier AND check-marked — so selection
                            never rests on colour alone. `aria-pressed` is the app's own
                            segmented-control convention (see MapFilterRail). */}
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <span id={scopeLabelId} className={`text-xs font-medium ${styles.secondary}`}>Scope</span>
                            <div role="group" aria-labelledby={scopeLabelId} className={styles.scopeControl}>
                                {SCOPE_OPTIONS.map((option) => {
                                    const isActive = option.value === analyticsScope;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={isActive}
                                            title={option.title}
                                            onClick={() => setAnalyticsScope?.(option.value)}
                                            className={`${styles.scopeButton} ${isActive ? styles.scopeButtonActive : ''}`}
                                        >
                                            <span className={styles.scopeIndicator} aria-hidden="true">
                                                {isActive ? <HiCheck className="h-3.5 w-3.5" /> : null}
                                            </span>
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* The period picker is the scope's own detail, so it exists only
                            for the two scopes that have a period to pick. All time has
                            none: the scope control and the page subtitle already say what
                            is on screen, and a disabled-looking date control beside them
                            would only promise a choice that does not exist. */}
                        {analyticsScope === ANALYTICS_SCOPE.MONTHLY && (
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                <span className={`text-xs font-medium ${styles.secondary}`}>Reporting month</span>
                                <div className={`${styles.periodControl} w-full sm:w-64`}>
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
                                        className={styles.periodButton}
                                        aria-label="Previous month"
                                        title="Previous month"
                                    >
                                        <HiChevronLeft className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMonth(new Date())}
                                        className={`${styles.periodButton} flex-1 gap-2 px-2 text-[13px] font-semibold`}
                                        aria-label="Return to current month"
                                        title="Return to current month"
                                    >
                                        <HiOutlineCalendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        <span aria-live="polite" aria-atomic="true">{formatMonthLabel(effectiveMonth, 'MMMM yyyy', '')}</span>
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
                                        className={styles.periodButton}
                                        aria-label="Next month"
                                        title="Next month"
                                    >
                                        <HiChevronRight className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {analyticsScope === ANALYTICS_SCOPE.YEARLY && (
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                <span className={`text-xs font-medium ${styles.secondary}`}>Reporting year</span>
                                <div className={`${styles.periodControl} w-full sm:w-64`}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedYear?.((current) => {
                                            const value = Number(current);
                                            return Number.isFinite(value) ? value - 1 : currentYear;
                                        })}
                                        className={styles.periodButton}
                                        aria-label="Previous year"
                                        title="Previous year"
                                    >
                                        <HiChevronLeft className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedYear?.(currentYear)}
                                        className={`${styles.periodButton} flex-1 gap-2 px-2 text-[13px] font-semibold`}
                                        aria-label="Return to current year"
                                        title="Return to current year"
                                    >
                                        <HiOutlineCalendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        <span aria-live="polite" aria-atomic="true">{effectiveYear}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedYear?.((current) => {
                                            const value = Number(current);
                                            return Number.isFinite(value) ? Math.min(value + 1, currentYear) : currentYear;
                                        })}
                                        disabled={effectiveYear >= currentYear}
                                        className={styles.periodButton}
                                        aria-label="Next year"
                                        title="Next year"
                                    >
                                        <HiChevronRight className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Export is an action, not a period control: it keeps its own cell,
                        and earns a rule only while the toolbar is stacked. */}
                    <div className={`w-full border-t pt-4 sm:w-auto sm:border-t-0 sm:pt-0 ${styles.rule}`}>
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            icon={HiOutlineDownload}
                            onClick={exportDashboard}
                            className={`${styles.exportButton} w-full sm:w-auto`}
                            aria-label="Export dashboard data as Excel"
                        >
                            Export Excel
                        </Button>
                    </div>
                </div>
            </header>

            {error && (
                <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            )}

            <section aria-label="Analytics summary">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div>
                        <p className={SECTION_LABEL_CLASS}>Summary</p>
                        <h2 className="mt-0.5 font-display text-base font-semibold leading-snug text-gray-900 sm:text-[17px] dark:text-white">Incident overview</h2>
                    </div>
                    <p className={`text-[11px] ${styles.subtle}`}>
                        Operational status · {scopeMetaSuffix}
                    </p>
                </div>

                <div className={`${PANEL_SURFACE} mt-2.5 overflow-hidden`}>
                    <dl data-testid="overview-band" className="grid grid-cols-2 md:grid-cols-4 [&>*:nth-child(even)]:border-l md:[&>*:nth-child(3)]:border-l max-md:[&>*:nth-child(n+3)]:border-t">
                        <MetricTile
                            label="Pending review"
                            status="pending"
                            value={safeMetrics.pendingCount ?? 0}
                            helper={(safeMetrics.pendingCount ?? 0) > 0 ? 'Awaiting review' : 'No pending reports'}
                            accent={(safeMetrics.pendingCount ?? 0) > 0 ? 'Action needed' : null}
                        />
                        <MetricTile
                            label="Dispatch ready"
                            status="verified"
                            value={safeMetrics.dispatchReadyCount ?? 0}
                            helper={(safeMetrics.dispatchReadyCount ?? 0) > 0 ? 'Verified, unassigned' : 'No unassigned incidents'}
                        />
                        <MetricTile
                            label="Responding"
                            status="responding"
                            value={safeMetrics.respondingCount ?? 0}
                            helper={(safeMetrics.respondingCount ?? 0) > 0 ? 'Field response active' : 'No active field response'}
                        />
                        <MetricTile
                            label="Resolved"
                            status="resolved"
                            value={safeMetrics.resolvedCount ?? 0}
                            helper={`${safeMetrics.resolutionRate ?? 0}% resolution rate`}
                        />
                    </dl>

                    <dl className={`${styles.summaryFooter} grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-3 sm:px-5`}>
                        <div className="min-w-0">
                            <dt className={`flex items-center gap-1.5 text-xs ${styles.secondary}`}>
                                <HiOutlineChartBar className="h-4 w-4 shrink-0" aria-hidden="true" />New reports
                            </dt>
                            <dd className="mt-1 text-lg font-semibold tabular-nums">{safeCount(safeReports)}</dd>
                            <dd className={`mt-0.5 text-[11px] ${styles.subtle}`}>Created in this period</dd>
                        </div>
                        <div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
                            <dt className={`flex items-center gap-1.5 text-xs ${styles.secondary}`}>
                                <HiOutlineClock className="h-4 w-4 shrink-0" aria-hidden="true" />Median response
                            </dt>
                            <dd
                                className="mt-1 text-lg font-semibold tabular-nums"
                                title={safeMetrics.medianResponseMin !== null && safeMetrics.medianResponseMin !== undefined ? `${safeMetrics.medianResponseMin} minutes exact` : undefined}
                            >
                                {formatHumanDuration(safeMetrics.medianResponseMin)}
                            </dd>
                            <dd className={`mt-0.5 text-[11px] ${styles.subtle}`}>
                                {safeMetrics.responseSampleCount
                                    ? `Based on ${safeMetrics.responseSampleCount} responded incident${safeMetrics.responseSampleCount === 1 ? '' : 's'}${Number.isFinite(Number(safeMetrics.medianResponseMin)) ? ` · ${safeMetrics.medianResponseMin}m exact` : ''}`
                                    : 'No responded incidents'}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className={`flex items-center gap-1.5 text-xs ${styles.secondary}`}>
                                <HiOutlineLocationMarker className="h-4 w-4 shrink-0" aria-hidden="true" />Active risk zones
                            </dt>
                            <dd className="mt-1 text-lg font-semibold tabular-nums">{activeRiskZoneCount}</dd>
                            <dd className={`mt-0.5 text-[11px] ${styles.subtle}`}>Current active zones</dd>
                        </div>
                    </dl>
                </div>
            </section>

            {/* Incident trend & lifecycle. Two columns from xl, not lg: the app's
                sidebar is 240px from lg and the main column keeps 32px of padding,
                so a 1024px viewport leaves 720px for content — the same 720px a
                768px tablet has, where this section has always stacked. Below xl
                the two panels stack full width.

                The xl split is 3:2, not 2:1. The trend is the wider half because
                it carries an axis and a stacked severity bar per bucket, but 2:1
                handed the plot two thirds of the section for twelve bars or fewer
                while the lifecycle card got a column narrower than its own rows.

                The section is capped at 1152px (max-w-6xl) and centred. The
                workspace runs to 1500px, so on a 1920px display an uncapped grid
                gave the trend panel ~1000px — a plot half again wider than the
                ~640px it was tuned at, with every bar spread out to match. 1152px
                puts the trend at ~690px and the lifecycle at ~460px. With 304px of
                chrome from lg (240px sidebar + 2×32px padding) the cap starts to
                bind at ~1456px viewport; below that the section is the content
                width, and on a phone it is the full column. */}
            <section className={`${PANEL_SURFACE} mx-auto grid w-full max-w-6xl xl:grid-cols-5`} aria-label={insightsLabel}>
                <TrendPanel
                    chartData={safeChartData}
                    selectedMonth={effectiveMonth}
                    reportCount={safeCount(safeReports)}
                    prevMonthCount={prevPeriodCount}
                    prevLabel={prevPeriodLabel}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    scope={analyticsScope}
                    periodLabel={periodLabel}
                />
                <LifecyclePanel statusData={toSafeArray(statusData)} totalReports={safeCount(safeReports)} periodLabel={periodLabel} />
            </section>

            <section className={`${PANEL_SURFACE} overflow-hidden`} aria-label="Analytics map">
                <div className="flex flex-col gap-4 px-4 pb-3 pt-5 sm:px-6 sm:pt-6">
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                            <p className={SECTION_LABEL_CLASS}>Geographic distribution</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <h2 className={PANEL_TITLE_CLASS}>{SCOPE_MAP_HEADING[analyticsScope] || SCOPE_MAP_HEADING[ANALYTICS_SCOPE.MONTHLY]}</h2>
                                {selectedDay && (
                                    <span className={styles.mapDayChip} role="status" aria-label={`Active filter: ${selectedDayLabel}`}>
                                        <HiOutlineCalendar className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span>Filtered: {selectedDayLabel}</span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDay(null)}
                                            aria-label={`Clear filter for ${selectedDayLabel}`}
                                            className={styles.mapDayChipClear}
                                        >
                                            <HiOutlineX className="h-3 w-3" aria-hidden="true" />
                                            <span className="sr-only">Clear filter</span>
                                        </button>
                                    </span>
                                )}
                            </div>
                            <p className={PANEL_DESCRIPTION_CLASS}>
                                Geographic incident distribution for {periodLabel}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenMap}
                            className={`${styles.link} shrink-0`}
                        >
                            Open full map
                            <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
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
                    <ScrollFadeRow
                        className={`${styles.mapFilters} no-scrollbar`}
                        aria-label="Map status filter"
                        role="group"
                        tabIndex={0}
                    >
                        <MapFilterRail
                            filters={MAP_STATUS_FILTERS}
                            showPendingReports
                            selectedFilter={mapStatusFilter}
                            onSelectFilter={setMapStatusFilter}
                            getCount={getMapFilterCount}
                        />
                    </ScrollFadeRow>
                    {/* Selected-day drill-down (from trend bars or peak link) */}
                    {selectedDay && (
                        <div className={`${styles.selectedDay} flex flex-wrap items-center justify-between gap-x-3 rounded-md px-3`} role="status">
                            <p className="flex items-center gap-2 py-2 text-xs font-medium">
                                <HiOutlineCalendar className="h-4 w-4" aria-hidden="true" />
                                Showing {selectedDayLabel}
                            </p>
                            <button
                                type="button"
                                onClick={() => setSelectedDay(null)}
                                aria-label={`Clear day filter ${selectedDayLabel}`}
                                className={styles.link}
                            >
                                <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" />
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.mapCardSplit}>
                    <div className={`${styles.mapCanvasWrapper} aspect-[4/3] sm:aspect-[3/2] lg:aspect-[21/9] min-h-[360px] sm:min-h-[400px] lg:min-h-[420px] max-h-[min(640px,65vh)] w-full`}>
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

                    <aside className={styles.mapSidePanel} aria-label="Map distribution and top locations">
                        <div className="flex flex-col gap-4">
                            <div className={styles.mapSideSection}>
                                <div className={styles.mapSideHeader}>
                                    <p className={SECTION_LABEL_CLASS}>Status distribution</p>
                                    <span className={styles.meta}>{safeCount(mapDayReports)} total</span>
                                </div>
                                <div className="flex flex-col gap-1" role="group" aria-label="Map status breakdown">
                                    {MAP_STATUS_FILTERS.map((filter) => {
                                        const count = getMapFilterCount(filter.value);
                                        const total = safeCount(mapDayReports);
                                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                                        const isSelected = mapStatusFilter === filter.value;
                                        const dotClass = getRailDotClass(filter.value);

                                        return (
                                            <button
                                                key={filter.value}
                                                type="button"
                                                onClick={() => setMapStatusFilter(filter.value)}
                                                aria-pressed={isSelected}
                                                className={`${styles.mapStatusRow} ${isSelected ? styles.mapStatusRowActive : ''}`}
                                                title={filter.title}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                                                    <span className="truncate">{filter.label}</span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                                                    <span className="font-semibold">{count}</span>
                                                    <span className={`w-8 text-right text-[11px] ${styles.secondary}`}>{percentage}%</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className={`${styles.mapSideSection} border-t pt-3 ${styles.rule}`}>
                                <div className={styles.mapSideHeader}>
                                    <p className={SECTION_LABEL_CLASS}>Top locations</p>
                                    {topMapBarangays.length > 0 && (
                                        <span className={styles.meta}>{topMapBarangays.length} {topMapBarangays.length === 1 ? 'area' : 'areas'}</span>
                                    )}
                                </div>
                                {topMapBarangays.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {topMapBarangays.map((item, index) => {
                                            const total = safeCount(mapDayReports);
                                            const count = Number(item?.count) || 0;
                                            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                                            const isTop = index === 0 && count > 0;

                                            return (
                                                <div key={item.name || index} className={styles.mapBarangayRow}>
                                                    <span className={`text-[11px] font-medium tabular-nums ${isTop ? styles.accent : styles.subtle}`} aria-hidden="true">
                                                        {String(index + 1).padStart(2, '0')}
                                                    </span>
                                                    <span className="truncate font-medium">{toSentenceCase(item.name)}</span>
                                                    <span className="flex items-baseline gap-1.5 font-semibold tabular-nums">
                                                        {count}
                                                        <span className={`text-[11px] font-normal ${styles.secondary}`}>{percentage}%</span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className={`py-1 text-xs ${styles.subtle}`}>
                                        No location data in this period.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className={`border-t pt-3 text-[11px] ${styles.rule} ${styles.subtle}`}>
                            {selectedDay
                                ? `Filtered to ${selectedDayLabel} · ${safeCount(mapDayReports)} ${safeCount(mapDayReports) === 1 ? 'report' : 'reports'}`
                                : `Showing ${safeCount(mapDayReports)} ${safeCount(mapDayReports) === 1 ? 'report' : 'reports'} · ${hasMunicipality ? (user?.assignedMunicipality || 'Municipal') : 'Island-wide'}`}
                        </div>
                    </aside>
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
            <section className={`${PANEL_SURFACE} ${styles.dividedPanels} grid md:grid-cols-2`} aria-label="Operational breakdown">
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
                <section className={PANEL_SURFACE} aria-label="Reach">
                    <div className={`${styles.dividedPanels} grid md:grid-cols-2`}>
                        <ReachPanel
                            title="Incident reach"
                            description="Distinct viewers who opened each incident"
                            rows={enrichedReportReach}
                            emptyDetail="No incident details have been opened yet."
                        />
                        <ReachPanel
                            title="Risk zone reach"
                            description="Distinct viewers who opened each hazard area"
                            rows={reach.zones}
                            emptyDetail="No hazard area details have been opened yet."
                        />
                    </div>
                        <p className={`border-t px-5 py-3 text-xs leading-relaxed sm:px-6 ${styles.rule} ${styles.secondary}`}>
                            {REACH_EXPLANATION}
                        </p>
                </section>
            ) : null}

            <section ref={historySectionRef} className={`${PANEL_SURFACE} scroll-mt-4`} aria-label="Recent activity">
                <div className="flex flex-col items-start gap-1 px-5 py-5 sm:flex-row sm:justify-between sm:gap-4 sm:px-6">
                    <div>
                        <p className={SECTION_LABEL_CLASS}>Activity feed</p>
                        <h2 className={PANEL_TITLE_CLASS}>Recent activity</h2>
                        <p className={PANEL_DESCRIPTION_CLASS}>
                            {analyticsScope === ANALYTICS_SCOPE.ALL_TIME
                                ? 'Latest updates across all recorded incidents'
                                : `Latest updates across the current scope · ${periodLabel}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenReports}
                        className={`${styles.link} shrink-0`}
                    >
                        View incident queue
                        <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                {recentReports.length ? (
                    <ul className={`border-t ${styles.rule}`}>
                        {recentReports.map((reportItem) => {
                            const status = (reportItem.status || 'pending').toLowerCase();
                            const statusConfig = MAP_STATUS_CONFIG[status] || MAP_STATUS_CONFIG.pending;
                            return (
                                <li key={reportItem._id} className={`border-b last:border-0 ${styles.rule}`}>
                                    <button
                                        type="button"
                                        onClick={onOpenReports}
                                        className={styles.activityRow}
                                        aria-label={`View incident queue: ${reportItem.address || reportItem.title || 'Location unavailable'}, ${statusConfig.label || status}`}
                                    >
                                        <span className="col-span-2 min-w-0 sm:col-span-1">
                                            <span className="block break-words text-sm font-medium leading-relaxed">
                                                {reportItem.address || reportItem.title || 'Location unavailable'}
                                            </span>
                                            <span className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed ${styles.secondary}`}>
                                                <span className="inline-flex items-baseline gap-2">
                                                    <span>{getPhysicalMunicipality(reportItem) || 'Unknown municipality'}</span>
                                                    <span aria-hidden="true">·</span>
                                                </span>
                                                <span className="inline-flex items-baseline gap-2">
                                                    <span>{toSentenceCase(reportItem.incidentType) || 'Unclassified incident'}</span>
                                                    <span aria-hidden="true">·</span>
                                                </span>
                                                <time
                                                    dateTime={reportItem.updatedAt || reportItem.createdAt}
                                                    className={styles.subtle}
                                                    title={toValidDate(reportItem.updatedAt || reportItem.createdAt)?.toLocaleString() || undefined}
                                                >
                                                    {formatActivityTime(reportItem.updatedAt || reportItem.createdAt)}
                                                </time>
                                            </span>
                                        </span>
                                        <span className={`col-span-2 flex items-center gap-2 text-xs font-medium sm:col-span-1 ${styles.secondary}`}>
                                            <span
                                                className="inline-flex items-center gap-1.5"
                                                title={`Status: ${statusConfig.label || status}`}
                                                aria-label={`Status: ${statusConfig.label || status}`}
                                            >
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${statusConfig.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                                {statusConfig.label || status}
                                            </span>
                                            <HiChevronRight className={`ml-auto h-4 w-4 shrink-0 sm:ml-2 ${styles.subtle}`} aria-hidden="true" />
                                        </span>
                                    </button>
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
    <div className={`${styles.empty} border-t ${styles.rule}`}>
        <HiOutlineClock className={`mb-3 h-7 w-7 ${styles.subtle}`} aria-hidden="true" />
        <p className="text-sm font-medium">No recent activity available.</p>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed">Incident updates will appear here as reports are reviewed and handled.</p>
    </div>
);

export default DashboardAnalyticsWorkspace;
