import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    HiChevronRight,
    HiOutlineBadgeCheck,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineFilter,
    HiOutlineLightningBolt,
    HiOutlineX,
} from 'react-icons/hi';
import { Link } from '../../router';
import MapView from '../map/MapView';
import MapIncidentDetails from '../map/MapIncidentDetails';
import HighRiskZoneDetails from '../map/HighRiskZoneDetails';
import MapOverlayPanel from '../map/MapOverlayPanel';
import MapMobileFilterSheet from './MapMobileFilterSheet';
import Button from '../ui/Button';
import { SkeletonRow } from '../ui/Skeleton';
import {
    getFilteredMapReports,
    getMapCoordinates,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../../utils/mapReports';
import { scheduleElementScroll } from '../../utils/mapNavigation';
import { toSafeArray, safeCount, normalizeMunicipalityKey, getEntityKey } from '../../utils/safeCollection';
import { getPhysicalMunicipality } from '../../utils/incidentDetails';
import { getMapRiskTypeConfig, MAP_ACTIVE_INCIDENT_CONFIG, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getMapExperience } from '../../config/mapExperience';
import { getReportIncidentTypeLabel } from '../../config/incidentTypes';
import { getMunicipalityMapFocus } from '../../utils/sibuyanLocations';
import { buildActiveIncidentsSummary, buildReporterPendingSummary, countOwnedReports } from '../../utils/dashboardReports';

const STATUS_CONFIG = MAP_STATUS_CONFIG;
const MAP_SUMMARY_PANEL_ID = 'dashboard-map-summary-panel';
const OVERVIEW_PANEL_PREFIX = 'overview:';
const formatDate = (value, pattern = 'MMM d, h:mm a') => {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : format(date, pattern);
};

const formatIncidentType = (report) => getReportIncidentTypeLabel(report);

const EmptyState = ({ title, description }) => (
    <div className="px-4 py-10 text-center sm:px-5">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
            <HiOutlineCheckCircle className="h-5 w-5" />
        </div>
        <h3 className="mt-2.5 text-xs sm:text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{description}</p>
    </div>
);

const IncidentList = ({ reports = [], emptyTitle, emptyDescription, onLocate, canLocate, onInspect, currentUserId = null, showOwnershipBadge = false }) => {
    const safeReports = toSafeArray(reports);
    if (safeReports.length === 0) {
        return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {safeReports.map((report, index) => {
                const status = STATUS_CONFIG[report?.status] || STATUS_CONFIG.pending;
                // MVP reporter-friendly: "Transferred" is operational jargon.
                // Reporters see "Coordinated" with the same dot color.
                const isTransferred = report?.status === 'transferred';
                const statusLabel = showOwnershipBadge && isTransferred ? 'Coordinated' : status.label;
                const coordinates = getMapCoordinates(report);
                const locateAvailable = Boolean(coordinates && onLocate && (!canLocate || canLocate(report)));
                const location = report?.address || report?.title || report?.barangay || report?.municipalityName || 'Location unavailable';
                const ownerId = report?.reporter && typeof report.reporter === 'object'
                    ? report.reporter._id ?? report.reporter.id
                    : report?.reporter ?? report?.reporterId ?? report?.ownerId ?? null;
                const isOwned = showOwnershipBadge && Boolean(currentUserId && ownerId && String(ownerId) === String(currentUserId))
                    || (showOwnershipBadge && report?.isOwnedByCurrentUser === true);
                return (
                    <article key={getEntityKey(report, `report-${index}`)} className="group px-4 py-3 sm:px-5 hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <div className="min-w-0">
                            <h3 className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-950 dark:text-white break-words leading-snug">
                                <span className="min-w-0 break-words">{location}</span>
                                {isOwned && (
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800 dark:bg-brand-500/15 dark:text-sky-300">
                                        Yours
                                    </span>
                                )}
                            </h3>
                            <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300 break-words leading-normal">
                                {formatIncidentType(report)} <span aria-hidden="true">·</span> {statusLabel}
                                {showOwnershipBadge && isTransferred && (
                                    <span className="font-normal text-gray-500 dark:text-gray-400"> · still being handled</span>
                                )}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 break-words leading-normal">
                                {getPhysicalMunicipality(report) || 'Municipality unavailable'} <span aria-hidden="true">·</span> {formatDate(report.incidentTime || report.createdAt || report.resolvedAt)}
                            </p>
                        </div>
                        <div className="mt-2.5 flex min-h-8 items-center justify-between gap-3 border-t border-gray-100/80 pt-2 dark:border-white/5">
                            {onInspect && (
                                <button
                                    type="button"
                                    onClick={() => onInspect(report)}
                                    className="inline-flex min-h-8 items-center rounded-md px-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                                >
                                    View details
                                </button>
                            )}
                            {locateAvailable && (
                                <button
                                    type="button"
                                    onClick={() => onLocate(report)}
                                    className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-sky-400 dark:hover:bg-white/5 cursor-pointer"
                                >
                                    <span>Locate</span>
                                    <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

const PanelLoadingState = ({ label = 'Loading panel content' }) => (
    <div className="divide-y divide-gray-100 dark:divide-white/5 py-1" role="status" aria-busy="true">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} lines={2} trailingAction className="p-3 sm:p-4" role={null} />
        ))}
    </div>
);

const PanelErrorState = ({ title, description, onRetry }) => (
    <div className="px-4 py-8 text-center sm:px-5" role="alert">
        <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400 leading-relaxed break-words">{description}</p>
        {onRetry && (
            <button
                type="button"
                onClick={onRetry}
                className="mt-3.5 inline-flex min-h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer"
            >
                Retry
            </button>
        )}
    </div>
);

const TrustPointsSummary = ({ value = 0 }) => (
    <div className="p-4 sm:p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Current score</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{value}</p>
        <p className="mt-2.5 border-t border-gray-100/80 pt-2.5 text-xs leading-relaxed text-gray-600 dark:border-white/5 dark:text-gray-300">
            Your current reporter standing is calculated from reports that are presently verified or resolved.
        </p>
    </div>
);

const RiskZoneList = ({ zones = [], onInspect, onLocate, loading = false, error = '', onRetry }) => {
    const safeZones = toSafeArray(zones);
    if (loading && safeZones.length === 0) {
        return <PanelLoadingState label="Loading risk zones" />;
    }

    if (error) {
        return (
            <div className="px-4 py-8 text-center sm:px-5" role="alert">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">Risk zones unavailable</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">{error}</p>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-3.5 inline-flex min-h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer"
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    if (!safeZones.length) {
        return <EmptyState title="No active risk zones" description="No high-risk areas are currently listed." />;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {safeZones.map((zone, index) => {
                const config = getMapRiskTypeConfig(zone?.type);
                const coordinates = getMapCoordinates(zone);
                return (
                    <article key={getEntityKey(zone, `zone-${index}`)} className="group px-4 py-3 sm:px-5 hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-semibold text-gray-950 dark:text-white break-words leading-snug">{zone.name || 'Unnamed zone'}</h3>
                            <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 break-words leading-normal">{config.label}</p>
                            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300 break-words">{zone.address || zone.description || 'No description provided.'}</p>
                            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 break-words leading-normal">
                                {zone.municipality || zone.municipalityName || 'Sibuyan Island'}{zone.barangay ? ` · ${zone.barangay}` : ''} <span aria-hidden="true">·</span> {Number.isFinite(Number(zone.radius)) && Number(zone.radius) > 0 ? `${Number(zone.radius)} m radius` : 'Radius unavailable'}
                            </p>
                        </div>
                        <div className="mt-2.5 flex min-h-8 items-center justify-between gap-3 border-t border-gray-100/80 pt-2 dark:border-white/5">
                            {onInspect && (
                                <button
                                    type="button"
                                    onClick={() => onInspect(zone)}
                                    className="inline-flex min-h-8 items-center rounded-md px-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                                >
                                    View details
                                </button>
                            )}
                            {coordinates && (
                                <button
                                    type="button"
                                    onClick={() => onLocate(zone)}
                                    className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-sky-400 dark:hover:bg-white/5 cursor-pointer"
                                >
                                    <span>Locate</span>
                                    <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

/**
 * The card's trailing affordance, and the only thing that tells a reader whether
 * tapping will change the map.
 *
 * A chevron means "this opens the matching set and points the map at it", and
 * now every card does that, so the affordance is unconditional. It used to have
 * a list-icon twin for the two cards that opened a list without touching the
 * map; a second icon is only worth its ink while a card exists that needs it,
 * and the moment one card wore the wrong one the pattern stopped being readable.
 */
const MetricStripAffordance = ({ selected = false }) => (
    <HiChevronRight
        className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 ${selected
            ? 'text-brand-700 dark:text-sky-300'
            : 'text-gray-400 group-hover:text-brand-700 dark:text-gray-500 dark:group-hover:text-sky-300'
            }`}
        aria-hidden="true"
    />
);

const MetricStripItem = ({ label, value, helper, onClick, selected, statusDot, loading = false }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-expanded={selected}
        aria-controls={MAP_SUMMARY_PANEL_ID}
        aria-busy={loading || undefined}
        aria-label={`View ${value} ${label.toLowerCase()}. ${helper}`}
        title={`${value} ${label} — ${helper}`}
        className={`group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl bg-white/95 px-3 py-2 text-left shadow-sm ring-1 ring-gray-200/80 transition duration-150 hover:-translate-y-px hover:shadow-md hover:ring-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-4 sm:py-3.5 dark:bg-white/[0.02] dark:ring-white/10 dark:hover:bg-white/[0.05] dark:hover:ring-white/20 ${selected
            ? 'ring-2 ring-brand-600 dark:ring-brand-400'
            : ''
            }`}
    >
        {/* The selected fill is its own layer instead of a second `bg-*` utility
            on the button. Two reasons: the base stylesheet forces every
            button's border-color transparent, so a border can never carry this
            state, and two competing background utilities on one element resolve
            by stylesheet order rather than by class order. A ring is a
            box-shadow and survives; this tint sits behind the text. */}
        <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 rounded-xl bg-brand-50 transition-opacity duration-150 dark:bg-white/[0.06] ${selected ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Mobile: one compact row per metric, so the whole row of numbers
            still sits above the map on a phone. The supporting line indents to
            the label, clearing the status dot. */}
        <span className="relative flex w-full items-center gap-2 sm:hidden">
            {statusDot && <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {label}
            </span>
            <span className="shrink-0 text-xl font-bold leading-none tabular-nums tracking-tight text-gray-900 dark:text-white">
                {value}
            </span>
            <MetricStripAffordance selected={selected} />
        </span>
        {helper && (
            <span className="relative mt-1 block truncate pl-4 text-[11px] font-normal text-gray-500 sm:hidden dark:text-gray-400">
                {helper}
            </span>
        )}
        {/* Desktop: label, number, supporting line — one reading order, with the
            number carrying the weight. */}
        <span className="relative hidden w-full items-center gap-2 sm:flex">
            {statusDot && <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />}
            {/* Wraps onto a second line rather than truncating or overflowing:
                the label names the set the card opens, so a clipped name is
                worse than a taller card. */}
            <span className={`min-w-0 flex-1 text-[11px] font-semibold uppercase leading-snug tracking-[0.08em] ${selected ? 'text-brand-800 dark:text-sky-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
            </span>
            <MetricStripAffordance selected={selected} />
        </span>
        <span className="relative mt-1.5 hidden text-2xl font-bold leading-none tabular-nums tracking-tight text-gray-900 sm:block dark:text-white">
            {value}
        </span>
        {helper && (
            <span className="relative mt-1.5 hidden truncate text-[11px] font-medium text-gray-500 sm:block dark:text-gray-400" title={helper}>
                {helper}
            </span>
        )}
    </button>
);

/**
 * Rail tones: the colour of a rail tab is the colour of its own status dot —
 * the same dot the overview card prints and the legend swatches — so a tab, a
 * card, and a legend entry for one status cannot drift apart. `all` is a scope
 * rather than a status, so it keeps the neutral tone instead of borrowing the
 * brand colour and implying it filters something.
 */
const RAIL_TONES = {
    neutral: {
        dot: 'bg-gray-400', selectedSurface: 'bg-gray-100/80 dark:bg-white/10', selectedText: 'text-gray-900 dark:text-white', bar: 'bg-gray-500',
    },
    amber: {
        dot: MAP_STATUS_CONFIG.pending.dot, selectedSurface: 'bg-amber-50/80 dark:bg-amber-500/10', selectedText: 'text-amber-900 dark:text-amber-200', bar: MAP_STATUS_CONFIG.pending.dot,
    },
    blue: {
        dot: MAP_ACTIVE_INCIDENT_CONFIG.dot, selectedSurface: 'bg-blue-50/80 dark:bg-blue-500/10', selectedText: 'text-blue-900 dark:text-blue-200', bar: MAP_ACTIVE_INCIDENT_CONFIG.dot,
    },
    red: {
        dot: 'bg-red-500', selectedSurface: 'bg-red-50/80 dark:bg-red-500/10', selectedText: 'text-red-900 dark:text-red-200', bar: 'bg-red-500',
    },
    emerald: {
        dot: MAP_STATUS_CONFIG.resolved.dot, selectedSurface: 'bg-green-50/80 dark:bg-green-500/10', selectedText: 'text-green-900 dark:text-green-200', bar: MAP_STATUS_CONFIG.resolved.dot,
    },
    cyan: {
        dot: MAP_STATUS_CONFIG.responding.dot, selectedSurface: 'bg-cyan-50/80 dark:bg-cyan-500/10', selectedText: 'text-cyan-900 dark:text-cyan-200', bar: MAP_STATUS_CONFIG.responding.dot,
    },
};

// Every value a filter can take, not just the five the rail ships today: these
// same lookups draw the mobile summary line, which renders whatever filter a
// deep link arrived with. An unmapped value would silently fall back to the
// neutral tone — the colour of "no status", which is the drift this table is
// here to prevent.
const RAIL_TONE_BY_FILTER = {
    all: 'neutral',
    pending: 'amber',
    verified: 'blue',
    active: 'blue',
    dispatch: 'blue',
    responding: 'cyan',
    'risk-zones': 'red',
    resolved: 'emerald',
};

const getRailTone = (filterValue) => RAIL_TONE_BY_FILTER[filterValue] || 'neutral';

// One dot per filter, shared by the desktop rail, the mobile summary line and
// the mobile sheet. Three surfaces, one lookup.
const getRailDotClass = (filterValue) => RAIL_TONES[getRailTone(filterValue)].dot;

/**
 * One control in the map rail.
 *
 * The selected state is a tinted surface plus a 2px bar, not a `border-b-2`
 * underline: the base stylesheet forces every button's border-color
 * transparent, so an underline tab rendered with no line at all and the tab
 * that was supposed to read as selected looked exactly like the two beside it.
 */
const MapRailTab = ({ label, count, tone = 'neutral', selected, onClick, title, ariaLabel }) => {
    const styles = RAIL_TONES[tone] || RAIL_TONES.neutral;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            title={title}
            aria-label={ariaLabel}
            className={`relative -mb-px inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg px-2.5 pb-2.5 pt-2 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 before:absolute before:-inset-1 before:content-[''] ${selected
                ? `${styles.selectedSurface} font-semibold ${styles.selectedText}`
                : `font-normal text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white${count === 0 ? ' opacity-60' : ''}`
                }`}
        >
            <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
            <span>{label}</span>
            <span className={`text-[11px] font-medium tabular-nums ${selected ? '' : 'text-gray-400 dark:text-gray-500'}`}>
                {count}
            </span>
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-full ${selected ? styles.bar : 'bg-transparent'}`}
            />
        </button>
    );
};

const DashboardMapWorkspace = ({
    user,
    isAuthenticated,
    isAdmin,
    isResponder,
    loading,
    error,
    reports = [],
    resolvedTodayReports = [],
    highRiskZones = [],
    highRiskZonesLoading = false,
    highRiskZonesError = '',
    onRetryHighRiskZones,
    reporterOverviewReports = [],
    reporterOverviewReportsLoading = false,
    onLoadReporterOverviewReports,
    focusLocation,
    focusedReport,
    focusedRiskZone,
    focusedReportMissing = false,
    responderMapFilter,
    setResponderMapFilter,
    canCurrentResponderResolve,
    handleMapRespond,
    handleMapResolve,
    handleMapVerify,
    handleMapReject,
    setSearchParams,
    mapSummaryPanel,
    setMapSummaryPanel,
    activePanel,
    pulseReportIds = [],
    viewSwitch = null,
}) => {
    const focusRequestSequenceRef = useRef(0);
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const mobileFilterTriggerRef = useRef(null);
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    // Which operational queue the Active incidents panel is narrowed to. Only
    // the roles that dispatch read it (see `activeQueueSegments`); for everyone
    // else it stays 'all' and the panel shows the card's whole set.
    const [activeQueueSegment, setActiveQueueSegment] = useState('all');
    const [selectedActiveIncidentId, setSelectedActiveIncidentId] = useState('');
    const [selectedActiveRiskZoneId, setSelectedActiveRiskZoneId] = useState('');
    const [mapLocateRequest, setMapLocateRequest] = useState(null);
    const [panelActionLoading, setPanelActionLoading] = useState(false);
    const createFocusRequestId = () => {
        focusRequestSequenceRef.current += 1;
        return `${Date.now()}-${focusRequestSequenceRef.current}`;
    };
    const focusedReportId = focusedReport?._id ?? focusedReport?.id;
    const focusedRiskZoneId = focusedRiskZone?._id ?? focusedRiskZone?.id;
    const externalFocusId = focusedReportId
        ? `incident:${focusedReportId}`
        : focusedRiskZoneId
            ? `risk-zone:${focusedRiskZoneId}`
            : focusLocation?.requestId || '';

    const deepLinkedLocateRequest = useMemo(() => {
        if (focusedReportId && focusedReport) {
            return {
                type: 'incident',
                id: String(focusedReportId),
                entity: focusedReport,
                requestId: `incident:${focusedReportId}`,
            };
        }
        if (focusedRiskZoneId && focusedRiskZone) {
            return {
                type: 'risk-zone',
                id: String(focusedRiskZoneId),
                entity: focusedRiskZone,
                requestId: `risk-zone:${focusedRiskZoneId}`,
            };
        }
        return null;
    }, [focusedReport, focusedReportId, focusedRiskZone, focusedRiskZoneId]);

    useEffect(() => {
        if (!externalFocusId) return undefined;
        mapScrollCleanupRef.current?.();
        mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current, { delay: 180 });
        return () => mapScrollCleanupRef.current?.();
    }, [externalFocusId]);

    useEffect(() => {
        if (!mapSummaryPanel) return undefined;
        mapScrollCleanupRef.current?.();
        mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current, { delay: 100, behavior: 'reveal' });
        return () => mapScrollCleanupRef.current?.();
    }, [mapSummaryPanel]);

    useEffect(() => {
        if (focusedReportId || focusedRiskZoneId) setMapLocateRequest(null);
    }, [focusedReportId, focusedRiskZoneId]);

    const mapExperience = getMapExperience({
        role: user?.role,
        agency: user?.agency,
        municipality: user?.assignedMunicipality,
    });

    // A visit to the map starts at the map's own default, not at the last
    // visit's leftovers.
    //
    // This component is mounted exactly while the map view is open, so mounting
    // IS arriving — from another page, from the analytics half of this same
    // route, or from a reload — and every arrival should look like the first
    // one. Two pieces of the view live in the page above (the selected rail tab
    // and the summary panel) and they used to survive a return, so a viewer who
    // left the map on "Risk zones" came back to "Risk zones", while a viewer who
    // had just signed in opened on "All open".
    //
    // The default is the role's own home tab (mapExperience.defaultFilter), so
    // this is a reset to what this account opens on rather than a hard-coded
    // tab that could widen or narrow what a role sees.
    //
    // The URL still outranks it: ?panel=zones is a request to arrive on the
    // hazard list, and this is the arrival that honours it. A layout effect
    // because the reset belongs to the same commit as the arrival — as a passive
    // effect it landed after the first paint and showed the previous visit's tab
    // for one frame.
    //
    // Captured once, in this first render, which is why the effect's dependencies
    // are only the two setters: afterwards a tab is the viewer's choice and a
    // ?panel change is read where the URL is (see the page's panel effect), so
    // letting it re-run would fight both.
    const arrivalRef = useRef(null);
    if (arrivalRef.current === null) {
        const requestedPanel = activePanel === 'incidents' || activePanel === 'zones' ? activePanel : '';
        arrivalRef.current = {
            filter: mapExperience.defaultFilter,
            panel: requestedPanel,
            // Only what actually differs is asked for, so an arrival that already
            // opens on the default leaves the page's state untouched.
            resetFilter: responderMapFilter !== mapExperience.defaultFilter,
            resetPanel: mapSummaryPanel !== requestedPanel,
        };
    }
    useLayoutEffect(() => {
        const arrival = arrivalRef.current;
        if (arrival.resetFilter) setResponderMapFilter(arrival.filter);
        if (arrival.resetPanel) setMapSummaryPanel(arrival.panel);
    }, [setMapSummaryPanel, setResponderMapFilter]);

    const activeReports = getVisibleMapReports(reports);
    const displayedMapReports = getFilteredMapReports(reports, {
        includePending: mapExperience.showPendingReports,
        statusFilter: mapExperience.filters.length > 0 ? responderMapFilter : null,
    });
    const allMappedReports = getVisibleMapReports(reports, { includePending: true });
    // One pending set for every role that receives pending rows. The card, the
    // tab and the panel all read this array, so their three numbers cannot
    // drift — and a guest, who is never sent pending rows, gets no card, no tab
    // and no panel entry rather than a zero.
    const isReporter = user?.role === 'reporter';
    const pendingMappedReports = allMappedReports.filter((report) => report?.status === 'pending');
    const dispatchableReports = activeReports.filter((report) => ['verified', 'transferred'].includes(report.status));
    const activeResponseReports = activeReports.filter((report) => report.status === 'responding');
    // Active incidents is the umbrella set. A transferred report is still an
    // open incident — it has simply been handed to another area — so it is
    // counted here rather than surfaced as a category of its own. Verified and
    // responding sit inside this set too; the responder/response cards are
    // deliberately narrower views of the same population.
    const publicActiveReports = activeReports.filter((report) => ['verified', 'transferred', 'responding'].includes(report.status));
    const publicActiveLocationCount = groupReportsByMapLocation(publicActiveReports).length;

    const currentUserId = user?._id ?? user?.id ?? null;

    // Home viewport: where the map rests when the incidents cannot frame it.
    //
    // This applies to EVERY role with an assignment, not just reporters. A
    // municipal admin's page is literally titled "<Municipality> incident map"
    // and promises activity "in <Municipality>", so a map that showed nothing of
    // theirs hid the very incidents they came to triage. Guests have no
    // assignment, so getMunicipalityMapFocus returns null for them and they keep
    // the island-wide view unchanged.
    //
    // Handed to the map separately from `focusLocation`: this one is a resting
    // camera the map decides when to use, while `focusLocation` is a place a link
    // asked the map to fly to. Conflating them is what let the municipality centre
    // outrank the incidents on a warm cache and lose to them on a cold one.
    const municipalityHomeFocus = useMemo(() => {
        if (focusedReport || focusedRiskZone) return null;
        const home = getMunicipalityMapFocus(user?.assignedMunicipality);
        if (!home) return null;
        return { ...home, requestId: `municipality-home:${user.assignedMunicipality}` };
    }, [focusedReport, focusedRiskZone, user?.assignedMunicipality]);

    // Reporter ownership: prefer the loaded My Reports overview (source of
    // truth for "yours"), fall back to ownership flags on map rows.
    const reporterOwnedPendingCount = useMemo(() => {
        if (!isReporter) return 0;
        const overviewPending = Array.isArray(reporterOverviewReports)
            ? reporterOverviewReports.filter((report) => report?.status === 'pending')
            : [];
        if (overviewPending.length > 0 || reporterOverviewReportsLoading) {
            return countOwnedReports(overviewPending.length > 0 ? overviewPending : pendingMappedReports, currentUserId);
        }
        return countOwnedReports(pendingMappedReports, currentUserId);
    }, [isReporter, reporterOverviewReports, reporterOverviewReportsLoading, pendingMappedReports, currentUserId]);
    const reporterPendingSummary = useMemo(() => buildReporterPendingSummary({
        total: pendingMappedReports.length,
        owned: reporterOwnedPendingCount,
    }), [pendingMappedReports.length, reporterOwnedPendingCount]);
    // The count folds verified + transferred + responding together, so the
    // supporting line is derived from the actual mix. A fixed phrase ("Being
    // handled now") was wrong as soon as one incident still had no responder —
    // which is the normal state early in an incident's life.
    // Shared by the reporter and guest overviews — resolved rows are public.
    // Declared here, above both metric arrays, because a `const` referenced
    // before its declaration throws rather than reading as undefined.
    const resolvedMapReports = allMappedReports.filter((report) => report?.status === 'resolved');
    // The Resolved card and the map's Resolved tab are the same set — every
    // resolved pin this viewer is allowed to see — so the card may point the map
    // at it. Today's closures ride along as supporting text instead of as the
    // card's value: as a value, a time-scoped 0 sat beside a Resolved tab
    // reading 2, two numbers for one word on one screen.
    //
    // The count is clipped to that same array, so if a resolved report has no
    // coordinates (and therefore cannot be a pin) it cannot inflate the
    // supporting line past the number printed next to it either.
    const resolvedTodayMappedIds = new Set(
        toSafeArray(resolvedTodayReports).map((report) => getEntityKey(report)),
    );
    const resolvedTodayMappedCount = resolvedMapReports.filter((report) => {
        const id = getEntityKey(report);
        return Boolean(id) && resolvedTodayMappedIds.has(id);
    }).length;
    const resolvedArchivePanelDescription = `${resolvedMapReports.length} ${resolvedMapReports.length === 1 ? 'incident' : 'incidents'} in the resolved archive`;
    const activeIncidentsSummary = buildActiveIncidentsSummary({
        total: publicActiveReports.length,
        responding: activeResponseReports.length,
        locations: publicActiveLocationCount,
    });


    const closeMapSummaryPanel = useCallback((options = {}) => {
        setSelectedActiveIncidentId('');
        setSelectedActiveRiskZoneId('');
        setMapSummaryPanel('');
        const isOverviewPanel = mapSummaryPanel.startsWith(OVERVIEW_PANEL_PREFIX);
        if (!options.preserveNavigation && !isOverviewPanel && ['incidents', 'zones'].includes(activePanel)) {
            setSearchParams({ view: 'map' });
        }
    }, [activePanel, mapSummaryPanel, setMapSummaryPanel, setSearchParams]);

    const openMapSummaryPanel = useCallback((panel) => {
        setSelectedActiveIncidentId('');
        setSelectedActiveRiskZoneId('');
        // A queue segment belongs to the visit that chose it: reopening the panel
        // must not silently show a narrowed list under the card's full count.
        setActiveQueueSegment('all');
        setMapSummaryPanel(panel);
    }, [setMapSummaryPanel]);

    const handleMapInspectorOpen = useCallback(() => {
        closeMapSummaryPanel();
    }, [closeMapSummaryPanel]);

    const publicMetrics = [
                {
                    id: 'active', label: 'Active incidents', value: publicActiveReports.length,
                    // Derived from the actual verified / transferred /
                    // responding mix, so the supporting line can never
                    // contradict the number above it. The status list that used
                    // to live in the helper moved here: the card line only has
                    // room for one of the two facts, and the mix is the
                    // actionable one.
                    helper: activeIncidentsSummary.helper,
                    icon: HiOutlineCheckCircle, panelType: 'incidents', panelTitle: 'Active incidents',
                    panelDescription: `${activeIncidentsSummary.description} Verified and transferred count too.`,
                    records: publicActiveReports,
                    // 'all' is the guest's active set — see GUEST_FILTERS. The
                    // hazard layer stays hidden for it, exactly as 'incidents'
                    // did, because only 'risk-zones' reveals the hazard layer.
                    mapFilter: 'all',
                    emptyTitle: 'No active incidents', emptyDescription: 'No verified, transferred, or responding incidents are currently active.',
                    statusDot: 'bg-blue-500',
                },
                {
                    // Same card the reporter map shows, minus the pending one.
                    // Resolved rows were always public — guests already had a
                    // Resolved filter tab — so this exposes no new data, it only
                    // stops hiding a lifecycle stage from the overview.
                    id: 'resolved', label: 'Resolved', value: resolvedMapReports.length,
                    helper: 'Completed incidents', icon: HiOutlineCheckCircle, panelType: 'incidents',
                    panelTitle: 'Resolved incidents', panelDescription: `${resolvedMapReports.length} ${resolvedMapReports.length === 1 ? 'incident' : 'incidents'} already resolved`,
                    records: resolvedMapReports,
                    mapFilter: 'resolved',
                    emptyTitle: 'No resolved incidents',
                    emptyDescription: 'No resolved incidents yet.',
                    statusDot: 'bg-emerald-500',
                },
                {
                    id: 'risk-zones', label: 'Risk zones', value: highRiskZones.length,
                    helper: 'Mapped hazards — stay cautious', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
                    panelTitle: 'Active risk zones', records: highRiskZones, mapFilter: 'risk-zones',
                    loading: highRiskZonesLoading, error: highRiskZonesError,
                    statusDot: 'bg-red-500',
                },
            ];

    // A supporting line is the one place a role is still allowed to differ. The
    // value slot answers "how big is the set this card opens" and prints the same
    // number a tab prints; the line under it carries the fact that particular
    // role needs, because it is copy about that set rather than a second count of
    // it. Two roles reading different numbers beside the same label is the bug
    // this row was rebuilt to kill.
    const pendingReviewCopy = isReporter
        ? reporterPendingSummary
        : {
            helper: isResponder ? 'Awaiting response' : 'Awaiting review',
            description: isResponder
                ? `${pendingMappedReports.length} unverified ${pendingMappedReports.length === 1 ? 'incident' : 'incidents'} waiting for a responder.`
                : `${pendingMappedReports.length} ${pendingMappedReports.length === 1 ? 'report' : 'reports'} awaiting municipal review.`,
        };

    const resolvedArchiveCopy = isAdmin || isResponder
        ? {
            helper: isResponder
                ? `Closed incidents · ${resolvedTodayMappedCount} today by you`
                : `Closed incidents · ${resolvedTodayMappedCount} today`,
            description: isResponder
                ? `${resolvedArchivePanelDescription} · ${resolvedTodayMappedCount} resolved by you today`
                : `${resolvedArchivePanelDescription} · ${resolvedTodayMappedCount} today`,
        }
        : {
            helper: 'Completed incidents',
            description: `${resolvedArchivePanelDescription}.`,
        };

    // The signed-in row: four cards, one order, one set of names, for reporter,
    // responder and municipal admin alike. The rail is the same for those roles
    // too (see mapExperience), so each card is simply one of the rail's sets in
    // the viewer's own words — and it opens exactly what it counts.
    //
    // What a role can DO with a record is not visible here on purpose: the
    // verbs live on the panel's buttons, driven by `mapExperience.canRespond` /
    // `canResolve` / `canVerify`, which is why a uniform row cannot widen anyone's
    // permissions.
    const signedInMetrics = [
        {
            id: 'pending', label: 'Pending review', value: pendingMappedReports.length,
            helper: pendingReviewCopy.helper, icon: HiOutlineClock, panelType: 'incidents',
            panelTitle: 'Pending review', panelDescription: pendingReviewCopy.description,
            records: pendingMappedReports,
            mapFilter: 'pending',
            emptyTitle: 'No pending reports',
            emptyDescription: 'No community reports are currently awaiting verification.',
            statusDot: 'bg-amber-500',
        },
        {
            id: 'active', label: 'Active incidents', value: publicActiveReports.length,
            helper: activeIncidentsSummary.helper, icon: HiOutlineCheckCircle, panelType: 'incidents',
            panelTitle: 'Active incidents',
            // The helper is kept short so the card cannot truncate it, so the
            // "pending is counted separately" note lives here instead.
            panelDescription: `${activeIncidentsSummary.description} Pending is counted separately.`,
            records: publicActiveReports,
            mapFilter: 'active',
            emptyTitle: 'No active incidents', emptyDescription: 'No verified or handled incidents are currently active.',
            statusDot: 'bg-blue-500',
        },
        {
            id: 'resolved', label: 'Resolved', value: resolvedMapReports.length,
            helper: resolvedArchiveCopy.helper, icon: HiOutlineBadgeCheck, panelType: 'incidents',
            panelTitle: 'Resolved incidents', panelDescription: resolvedArchiveCopy.description,
            records: resolvedMapReports,
            mapFilter: 'resolved',
            emptyTitle: 'No resolved incidents',
            emptyDescription: 'No resolved incidents yet.',
            statusDot: 'bg-emerald-500',
        },
        {
            id: 'risk-zones', label: 'Risk zones', value: highRiskZones.length,
            helper: 'Mapped hazards — stay cautious', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
            panelTitle: 'Active risk zones', records: highRiskZones, mapFilter: 'risk-zones',
            loading: highRiskZonesLoading, error: highRiskZonesError,
            statusDot: 'bg-red-500',
        },
    ];

    // Everyone signed in reads the same row. The only shorter row is a guest's,
    // and it is shorter because the API does not send an anonymous viewer
    // pending rows — not because a guest should be shown less of the same thing.
    const metrics = (isReporter || isResponder || isAdmin) ? signedInMetrics : publicMetrics;

    // One rule decides what a card is: the number, the list it opens, and the
    // pins the map shows all come from one array, so every card can point the
    // map at the tab it counts. The two cards that could not used to explain
    // themselves in their accessible name instead of in their number —
    // "Resolved today" was time-scoped while the Resolved tab is the archive,
    // so the same screen could read 0 resolved beside a Resolved tab reading 2.
    // A time-scoped or otherwise narrower count now belongs in the supporting
    // line and the panel description, never in the value slot: the value slot is
    // read as "the size of the set this card opens".
    //
    // Match the desktop row to the card count. Guests see 3 cards (the
    // transferred card was folded into active incidents) and signed-in roles
    // see 4; sizing this off metrics.length keeps a trailing empty column from
    // appearing whenever the set changes.
    const overviewGridColumns = metrics.length >= 5
        ? 'lg:grid-cols-5'
        : metrics.length === 4
            ? 'lg:grid-cols-4'
            : 'lg:grid-cols-3';

    const activeOverviewMetric = metrics.find(
        (metric) => `${OVERVIEW_PANEL_PREFIX}${metric.id}` === mapSummaryPanel,
    ) || null;
    const isIncidentSummaryPanel = mapSummaryPanel === 'incidents' || activeOverviewMetric?.panelType === 'incidents';
    const isRiskZoneSummaryPanel = mapSummaryPanel === 'zones' || activeOverviewMetric?.panelType === 'risk-zones';
    const isTrustPointsPanel = activeOverviewMetric?.panelType === 'trust-points';
    const hasSummaryPanel = Boolean(isIncidentSummaryPanel || isRiskZoneSummaryPanel || isTrustPointsPanel);

    // The operational queues, as segments of the panel that already holds those
    // records. The rail used to spend two tabs on them (Ready to dispatch, Active
    // response), which is what made the same incident arrive as a different
    // product per account. Each segment is one of the sets above rather than a
    // new derivation, so a segment's number cannot disagree with the card's.
    const activeQueueSegments = mapExperience.canDispatch
        ? [
            { value: 'all', label: 'All active', records: publicActiveReports },
            { value: 'dispatch', label: 'Ready to dispatch', records: dispatchableReports },
            { value: 'responding', label: 'In response', records: activeResponseReports },
        ]
        : [];
    const activeQueuePanelOpen = Boolean(mapExperience.canDispatch)
        && activeOverviewMetric?.id === 'active';
    const activeQueueSegmentRecords = activeQueueSegments
        .find((segment) => segment.value === activeQueueSegment)?.records || publicActiveReports;

    const panelIncidentReports = mapSummaryPanel === 'incidents'
        ? displayedMapReports
        : activeOverviewMetric?.panelType === 'incidents'
            ? (activeQueuePanelOpen ? activeQueueSegmentRecords : activeOverviewMetric.records)
            : [];
    const selectedActiveIncident = panelIncidentReports.find(
        (report) => String(report._id || report.id) === selectedActiveIncidentId,
    ) || null;
    const selectedActiveRiskZone = isRiskZoneSummaryPanel
        ? highRiskZones.find((zone) => String(zone._id || zone.id) === selectedActiveRiskZoneId) || null
        : null;
    const displayedMapReportIds = new Set(
        displayedMapReports.map((report) => String(report._id || report.id)),
    );
    const canLocatePanelReport = () => true;

    const openOverviewMetric = (metric) => {
        if (metric.mapFilter && mapExperience.filters.length > 0) {
            setResponderMapFilter(metric.mapFilter);
        }
        openMapSummaryPanel(`${OVERVIEW_PANEL_PREFIX}${metric.id}`);
        if (metric.requiresReporterRecords && !reporterRecordsLoaded && !reporterOverviewReportsLoading) {
            onLoadReporterOverviewReports?.();
        }
    };

    const retryReporterOverviewReports = () => onLoadReporterOverviewReports?.({ force: true });

    const locateReport = (report, closeModal) => {
        const coordinates = getMapCoordinates(report);
        if (!coordinates) return;
        // A top-down camera keeps the incident pin visually aligned with its
        // stored coordinates. The previous pitched, maximum-zoom view made the
        // pin appear offset and removed useful street-level context.
        closeModal?.();
        setMapLocateRequest({
            type: 'incident',
            id: String(report._id || report.id),
            entity: report,
            requestId: createFocusRequestId(),
        });
    };

    const locateZone = (zone) => {
        const coordinates = getMapCoordinates(zone);
        if (!coordinates) return;
        setSelectedActiveRiskZoneId('');
        closeMapSummaryPanel({ preserveNavigation: true });
        if (mapExperience.filters.length > 0 && responderMapFilter !== 'risk-zones') {
            setResponderMapFilter('risk-zones');
        }
        setMapLocateRequest({
            type: 'risk-zone',
            id: String(zone._id || zone.id),
            entity: zone,
            requestId: createFocusRequestId(),
        });
    };

    const locateActiveIncident = (report) => {
        setSelectedActiveIncidentId('');
        if (mapExperience.filters.length > 0 && !displayedMapReportIds.has(getEntityKey(report))) {
            setResponderMapFilter('all');
        }
        locateReport(report, () => closeMapSummaryPanel({ preserveNavigation: true }));
    };

    const runPanelIncidentAction = async (action, report, successMessage) => {
        if (!action || panelActionLoading) return;
        setPanelActionLoading(true);
        try {
            const result = await action(report);
            if (result?.ok) toast.success(result.message || successMessage);
            else toast.error(result?.message || 'Unable to complete the incident action.');
        } catch {
            toast.error('Unable to complete the incident action. Please try again.');
        } finally {
            setPanelActionLoading(false);
        }
    };

    const panelTitle = selectedActiveIncident
        ? 'Incident details'
        : selectedActiveRiskZone
            ? 'High-risk zone details'
            : activeOverviewMetric?.panelTitle
            || (mapSummaryPanel === 'incidents' ? 'Active incidents' : 'High-risk zones');
    const panelDescription = (selectedActiveIncident || selectedActiveRiskZone)
        ? undefined
        : activeOverviewMetric
            ? activeOverviewMetric.loading
                ? activeOverviewMetric.panelType === 'risk-zones'
                    ? 'Loading monitored zones'
                    : 'Loading matching records'
                : activeOverviewMetric.error
                    ? 'Metric details unavailable'
                    : activeOverviewMetric.panelDescription
                    || `${safeCount(highRiskZones)} monitored ${safeCount(highRiskZones) === 1 ? 'zone' : 'zones'}`
            : mapSummaryPanel === 'incidents'
                ? `${safeCount(displayedMapReports)} currently visible`
                : highRiskZonesLoading
                    ? 'Loading monitored zones'
                    : highRiskZonesError
                        ? 'Risk zone data unavailable'
                        : `${safeCount(highRiskZones)} monitored ${safeCount(highRiskZones) === 1 ? 'zone' : 'zones'}`;
    const panelCloseLabel = selectedActiveIncident
        ? 'Close incident details'
        : selectedActiveRiskZone
            ? 'Close risk zone details'
            : mapSummaryPanel === 'incidents'
                ? 'Close incidents panel'
                : mapSummaryPanel === 'zones'
                    ? 'Close risk zones panel'
                    : `Close ${activeOverviewMetric?.panelTitle?.toLowerCase() || 'overview'} panel`;
    const isReportInResponderMunicipality = (report) => {
        if (!normalizeMunicipalityKey(user?.assignedMunicipality)) return true;
        if (!normalizeMunicipalityKey(report?.municipalityName)) return true;
        const assigned = normalizeMunicipalityKey(user.assignedMunicipality);
        const incidentMuni = normalizeMunicipalityKey(report.municipalityName);
        return incidentMuni === assigned;
    };
    const selectedIncidentCanRespond = Boolean(
        selectedActiveIncident
        && mapExperience.canRespond
        && isReportInResponderMunicipality(selectedActiveIncident)
        && ['verified', 'transferred'].includes(selectedActiveIncident.status),
    );
    const selectedIncidentCanResolve = Boolean(
        selectedActiveIncident
        && mapExperience.canResolve
        && isReportInResponderMunicipality(selectedActiveIncident)
        && selectedActiveIncident.status === 'responding'
        && (!canCurrentResponderResolve || canCurrentResponderResolve(selectedActiveIncident)),
    );
    // Map review shortcuts: municipal_admin only, same-municipality pending
    // reports. The queue inspector + server re-check on confirm.
    const selectedIncidentCanVerify = Boolean(
        selectedActiveIncident
        && mapExperience.canVerify
        && isReportInResponderMunicipality(selectedActiveIncident)
        && selectedActiveIncident.status === 'pending',
    );
    const selectedIncidentCanReject = Boolean(
        selectedActiveIncident
        && mapExperience.canVerify
        && isReportInResponderMunicipality(selectedActiveIncident)
        && selectedActiveIncident.status === 'pending',
    );

    const getFilterCount = (filterValue) => {
        if (filterValue === 'risk-zones') {
            return safeCount(highRiskZones);
        }
        // The Resolved tab prints the same array the Resolved cards count and
        // open, instead of a second derivation of "resolved" that happens to
        // agree with the first today. One array, one number, whichever surface
        // is asking.
        if (filterValue === 'resolved') {
            return resolvedMapReports.length;
        }
        try {
            return getFilteredMapReports(toSafeArray(reports), {
                includePending: mapExperience.showPendingReports,
                statusFilter: filterValue,
            }).length;
        } catch {
            return 0;
        }
    };

    return (
        <div className="mx-auto w-full max-w-[1500px] space-y-3 sm:space-y-5">
            {/* Title block left, view switch right. The switch used to sit in a
                row of its own above this header, which cost a band of empty
                space on the one page that has both views. */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-sky-400">
                        {mapExperience.eyebrow}
                    </p>
                    <h1 className="mt-1 font-display text-[26px] font-bold leading-[1.15] tracking-tight text-gray-950 sm:text-[32px] dark:text-white break-words">
                        {mapExperience.title}
                    </h1>
                    <p className="hidden sm:block mt-1.5 max-w-[68ch] text-sm leading-relaxed text-gray-600 dark:text-gray-300 break-words">
                        {mapExperience.description}
                    </p>
                </div>
                {viewSwitch && <div className="shrink-0 sm:pt-0.5">{viewSwitch}</div>}
            </header>

            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            )}

            {highRiskZonesError && !highRiskZonesLoading && (
                <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <span>{highRiskZonesError}</span>
                    {onRetryHighRiskZones && (
                        <button
                            type="button"
                            onClick={onRetryHighRiskZones}
                            className="inline-flex min-h-[44px] sm:min-h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
                        >
                            Retry risk zones
                        </button>
                    )}
                </div>
            )}

            {focusedReportMissing && !focusedReport && (
                <section className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30" role="alert" aria-label="Selected incident unavailable">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Selected incident unavailable</p>
                    <p className="text-xs text-amber-700 dark:text-amber-200">It may have been removed or you may not have access. Showing the latest map instead.</p>
                </section>
            )}

            {/* The numbers come first, and that order is the point.
             *
             * These cards used to sit BELOW the map, under a 500px canvas. On a
             * laptop the first thing below the fold was the count that starts the
             * whole triage — "Pending 3" — while the operator saw only terrain.
             * The reporter role never felt that way because they have a separate
             * summary page; the admin and responder only have this screen.
             *
             * The cards are still a summary OF the map (tapping one opens its
             * records and, when the sets agree, points the map at them), so the
             * section keeps its "Map summary" label and the heading below is
             * unchanged — only the reading order moved. */}
            <section className="space-y-2 sm:space-y-2.5" aria-label="Map summary">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Current overview</h2>
                    <p className="shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                        <span className="hidden sm:inline">Select any metric to view matching records</span>
                        <span className="sm:hidden">Tap to view records</span>
                    </p>
                </div>
                <div className={`mt-3 grid grid-cols-1 gap-2 sm:gap-3 ${overviewGridColumns}`}>
                    {metrics.map((metric, index) => (
                        <MetricStripItem
                            key={metric.id}
                            index={index}
                            label={metric.label}
                            value={metric.value}
                            helper={metric.helper}
                            icon={metric.icon}
                            statusDot={metric.statusDot}
                            onClick={() => openOverviewMetric(metric)}
                            selected={mapSummaryPanel === `${OVERVIEW_PANEL_PREFIX}${metric.id}`}
                            loading={metric.loading}
                        />
                    ))}
                </div>
            </section>

            <section ref={mapSectionRef} className="scroll-mt-20 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Live incident map">
                <div className="flex flex-col gap-2 p-2 sm:gap-2.5 sm:p-2.5">
                    {mapExperience.filters.length > 0 && (() => {
                        const isFiltered = responderMapFilter && responderMapFilter !== 'all';
                        const currentFilterObj = mapExperience.filters.find((f) => f.value === responderMapFilter);
                        const activeFilterLabel = currentFilterObj ? currentFilterObj.label : (responderMapFilter === 'risk-zones' ? 'Risk Zones' : 'Active Incidents');
                        const activeFilterCount = getFilterCount(responderMapFilter);
                        const activeFilterSummary = `${activeFilterLabel} · ${activeFilterCount}`;
                        // Config owns which statuses a tab shows, so it owns the dot
                        // too: 'dispatch' is a pair, and reading its colour off
                        // MAP_STATUS_CONFIG directly would have fallen back to gray
                        // — the colour of "unknown state". This is the same lookup
                        // the rail and the sheet read, so the summary dot cannot
                        // name a different colour than the tab it reports on.
                        const activeStatusDotClass = getRailDotClass(responderMapFilter);

                        return (
                            <>
                                {/* 1. Mobile & Tablet Filter Control Bar (< lg / < 1024px) */}
                                <div className="flex w-full items-center gap-2 lg:hidden">
                                    {/* Filters Trigger Button */}
                                    <button
                                        ref={mobileFilterTriggerRef}
                                        type="button"
                                        onClick={() => setIsMobileFilterOpen(true)}
                                        aria-expanded={isMobileFilterOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Filters${isFiltered ? ', 1 filter applied' : ''}`}
                                        className={`inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${isFiltered
                                            ? 'bg-brand-700 text-white ring-brand-700 dark:bg-brand-600 dark:ring-brand-500'
                                            : 'bg-white/95 text-gray-800 ring-gray-200/80 hover:bg-white hover:ring-gray-300 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/10'
                                            }`}
                                    >
                                        <HiOutlineFilter className={`h-3.5 w-3.5 ${isFiltered ? 'text-brand-100 dark:text-white' : 'text-brand-700 dark:text-sky-400'}`} aria-hidden="true" />
                                        <span>Filters</span>
                                        {isFiltered && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold tabular-nums text-brand-800">
                                                1
                                            </span>
                                        )}
                                    </button>

                                    {/* Active Filter Summary (plain text) and Clear Action */}
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                        <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-[11px] font-medium text-gray-600 sm:text-xs dark:text-gray-400">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${activeStatusDotClass}`} aria-hidden="true" />
                                            <span className="truncate">{activeFilterSummary}</span>
                                        </p>

                                        {isFiltered && (
                                            <button
                                                type="button"
                                                onClick={() => setResponderMapFilter('all')}
                                                aria-label="Clear active filter and show all"
                                                className="flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200"
                                                title="Clear filter"
                                            >
                                                <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Mobile & Tablet Filter Bottom Sheet */}
                                <MapMobileFilterSheet
                                    isOpen={isMobileFilterOpen}
                                    onClose={() => setIsMobileFilterOpen(false)}
                                    filters={mapExperience.filters}
                                    selectedFilter={responderMapFilter}
                                    onSelectFilter={setResponderMapFilter}
                                    getFilterCount={getFilterCount}
                                    triggerRef={mobileFilterTriggerRef}
                                />

                                {/* 2. Desktop Status-Filter Tabs (hidden lg:flex) */}
                                <div
                                    className="hidden lg:flex min-w-0 flex-1 flex-wrap items-end gap-5 w-full border-b border-gray-200 dark:border-white/10"
                                    aria-label="Map status filter"
                                    role="group"
                                >
                                    {/* One rail for every role, rendered from one
                                        list. `group` decides the shape: status tabs
                                        first, then the hazard layer and the archive
                                        behind a divider and a label, so a layer can
                                        never read as a fourth status. A role changes
                                        what happens to a record, not what the rail is
                                        called — see mapExperience. */}
                                    {mapExperience.filters
                                        .filter((filter) => filter.group === 'status')
                                        .map((filter) => {
                                            const count = getFilterCount(filter.value);
                                            const isSelected = responderMapFilter === filter.value;
                                            const tooltip = filter.value === 'all'
                                                ? (mapExperience.showPendingReports
                                                    ? 'All open reports (pending + being handled)'
                                                    : 'Active ongoing incidents')
                                                : 'Unverified reports awaiting review';

                                            return (
                                                <MapRailTab
                                                    key={filter.value}
                                                    label={filter.label}
                                                    count={count}
                                                    tone={getRailTone(filter.value)}
                                                    selected={isSelected}
                                                    onClick={() => setResponderMapFilter(filter.value)}
                                                    title={tooltip}
                                                    ariaLabel={`${filter.label} filter (${count} ${count === 1 ? 'record' : 'records'})${isSelected ? ', selected' : ''}`}
                                                />
                                            );
                                        })}
                                    {(() => {
                                        const layerFilters = mapExperience.filters.filter((filter) => filter.group === 'layers');
                                        if (layerFilters.length === 0) return null;
                                        const riskCount = getFilterCount('risk-zones');
                                        const resolvedCount = getFilterCount('resolved');
                                        const isRiskSelected = responderMapFilter === 'risk-zones';
                                        const isResolvedSelected = responderMapFilter === 'resolved';
                                        return (
                                            <Fragment>
                                                <span className="flex shrink-0 items-end gap-5 self-stretch border-l border-gray-200 pl-5 dark:border-white/10" role="group" aria-label="Layers and archive">
                                                    {/* Shown from lg, not xl: this is the one group
                                                        that needs the label, and lg was the
                                                        narrowest range that hid it. */}
                                                    <span className="hidden pb-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 lg:inline dark:text-gray-500" aria-hidden="true">
                                                        Layers &amp; archive
                                                    </span>
                                                <MapRailTab
                                                    label={layerFilters.find((filter) => filter.value === 'risk-zones')?.label || 'Risk zones'}
                                                    count={riskCount}
                                                    tone={getRailTone('risk-zones')}
                                                    selected={isRiskSelected}
                                                    onClick={() => setResponderMapFilter(isRiskSelected ? 'all' : 'risk-zones')}
                                                    title="Toggle the mapped hazard layer"
                                                    ariaLabel={`Risk zones layer (${riskCount} ${riskCount === 1 ? 'zone' : 'zones'})${isRiskSelected ? ', shown' : ''}`}
                                                />
                                                <MapRailTab
                                                    label={layerFilters.find((filter) => filter.value === 'resolved')?.label || 'Resolved archive'}
                                                    count={resolvedCount}
                                                    tone={getRailTone('resolved')}
                                                    selected={isResolvedSelected}
                                                    onClick={() => setResponderMapFilter('resolved')}
                                                    title="View the resolved incident archive"
                                                    ariaLabel={`Resolved archive (${resolvedCount} ${resolvedCount === 1 ? 'record' : 'records'})${isResolvedSelected ? ', selected' : ''}`}
                                                />
                                                </span>
                                            </Fragment>
                                        );
                                    })()}
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="relative h-[46svh] min-h-[280px] max-h-[380px] w-full overflow-hidden rounded-lg sm:h-[460px] sm:max-h-none lg:h-[500px]">
                    {loading && safeCount(reports) === 0 && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-[#0c1813]/80 backdrop-blur-xs" aria-live="polite">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600 dark:border-gray-700 dark:border-t-brand-400" />
                                Loading map data…
                            </div>
                        </div>
                    )}
                    <MapView
                        reports={reports}
                        highRiskZones={highRiskZones}
                        locateRequest={mapLocateRequest || deepLinkedLocateRequest}
                        externalContextPanelOpen={Boolean(mapSummaryPanel)}
                        onEntityInspectorOpen={handleMapInspectorOpen}
                        className="h-full w-full"
                        focusLocation={focusLocation}
                        homeFocus={municipalityHomeFocus}
                        showPending={mapExperience.showPendingReports}
                        dataLoading={loading}
                        filterStatus={mapExperience.filters.length > 0 ? responderMapFilter : null}
                        canRespond={mapExperience.canRespond}
                        onRespondToReport={mapExperience.canRespond ? handleMapRespond : null}
                        canResolve={mapExperience.canResolve}
                        canResolveReport={mapExperience.canResolve ? canCurrentResponderResolve : null}
                        onResolveReport={mapExperience.canResolve ? handleMapResolve : null}
                        canVerify={mapExperience.canVerify}
                        canVerifyReport={isReportInResponderMunicipality}
                        onVerifyToReport={mapExperience.canVerify ? handleMapVerify : null}
                        onRejectToReport={mapExperience.canVerify ? handleMapReject : null}
                        viewerRole={user?.role || 'guest'}
                        viewer={user}
                        showDataState
                        enable3D
                        // Per role: operators open on the incidents in front of
                        // them, guests open on the whole island. The report set
                        // is already role-scoped by the API, so the camera
                        // inherits that boundary rather than needing one of its
                        // own, and the island view is the fallback whenever
                        // there is nothing to frame.
                        frameReportsOnOpen={mapExperience.framesReportsOnOpen}
                        pulseReportIds={pulseReportIds}
                    />
                    {hasSummaryPanel && (
                        <MapOverlayPanel
                            id={MAP_SUMMARY_PANEL_ID}
                            title={panelTitle}
                            description={panelDescription}
                            onClose={closeMapSummaryPanel}
                            closeLabel={panelCloseLabel}
                            presentation="contextual"
                            contentKey={`${mapSummaryPanel}:${selectedActiveIncidentId || selectedActiveRiskZoneId || 'list'}`}
                        >
                            {isIncidentSummaryPanel && selectedActiveIncident && (
                                <>
                                    <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-800 sm:px-5">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedActiveIncidentId('')}
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-xs font-semibold text-gray-700 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-sky-400 cursor-pointer"
                                        >
                                            <HiOutlineArrowLeft className="h-4 w-4" aria-hidden="true" />
                                            Back to {activeOverviewMetric?.label || 'active incidents'}
                                        </button>
                                    </div>
                                    <MapIncidentDetails
                                        report={selectedActiveIncident}
                                        viewerRole={user?.role || 'guest'}
                                        viewer={user}
                                        canRespond={selectedIncidentCanRespond}
                                        canResolve={selectedIncidentCanResolve}
                                        canVerify={selectedIncidentCanVerify}
                                        canReject={selectedIncidentCanReject}
                                        actionLoading={panelActionLoading}
                                        onRespond={selectedIncidentCanRespond
                                            ? (report) => runPanelIncidentAction(handleMapRespond, report, 'Now responding to incident')
                                            : undefined}
                                        onResolve={selectedIncidentCanResolve
                                            ? (report) => runPanelIncidentAction(handleMapResolve, report, 'Opening resolution review')
                                            : undefined}
                                        onVerify={selectedIncidentCanVerify
                                            ? (report) => runPanelIncidentAction(handleMapVerify, report, 'Opening verification review')
                                            : undefined}
                                        onReject={selectedIncidentCanReject
                                            ? (report) => runPanelIncidentAction(handleMapReject, report, 'Opening rejection review')
                                            : undefined}
                                    />
                                </>
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && activeOverviewMetric?.loading && panelIncidentReports.length === 0 && (
                                <PanelLoadingState label="Loading matching reports…" />
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && activeOverviewMetric?.error && !activeOverviewMetric.loading && (
                                <PanelErrorState
                                    title={`Unable to load ${activeOverviewMetric.label.toLowerCase()}`}
                                    description={activeOverviewMetric.error}
                                    onRetry={activeOverviewMetric.requiresReporterRecords ? retryReporterOverviewReports : undefined}
                                />
                            )}
                            {/* The two operational queues, one click deep instead of
                                one tab wide: the panel narrows to a segment of the
                                set the card counts, and the map keeps showing the
                                tab's full set so the two numbers stay honest. */}
                            {activeQueuePanelOpen && activeQueueSegments.length > 0 && (
                                <div
                                    className="flex flex-wrap gap-1.5 border-b border-gray-200 px-4 py-2 dark:border-gray-800 sm:px-5"
                                    role="group"
                                    aria-label="Active incident queue"
                                >
                                    {activeQueueSegments.map((segment) => {
                                        const isSelected = activeQueueSegment === segment.value;
                                        return (
                                            <button
                                                key={segment.value}
                                                type="button"
                                                onClick={() => setActiveQueueSegment(segment.value)}
                                                aria-pressed={isSelected}
                                                aria-label={`${segment.label} (${segment.records.length})`}
                                                className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${isSelected
                                                    ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-white/5 dark:text-sky-300'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-300 dark:hover:bg-white/5'
                                                    }`}
                                            >
                                                <span>{segment.label}</span>
                                                <span className="tabular-nums text-gray-400 dark:text-gray-500">{segment.records.length}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && !activeOverviewMetric?.loading && !activeOverviewMetric?.error && (
                                <IncidentList
                                    reports={panelIncidentReports}
                                    emptyTitle={activeOverviewMetric?.emptyTitle || 'No active incidents'}
                                    emptyDescription={activeOverviewMetric?.emptyDescription
                                        || (mapExperience.filters.length > 0 && responderMapFilter !== 'all'
                                            ? 'No incidents match the selected map filter.'
                                            : 'There are no verified or handled incidents on the map.')}
                                    onInspect={(report) => setSelectedActiveIncidentId(String(report._id || report.id))}
                                    onLocate={locateActiveIncident}
                                    canLocate={canLocatePanelReport}
                                    currentUserId={currentUserId}
                                    showOwnershipBadge={isReporter}
                                />
                            )}
                            {isRiskZoneSummaryPanel && selectedActiveRiskZone && (
                                <>
                                    <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-800 sm:px-5">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedActiveRiskZoneId('')}
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-xs font-semibold text-gray-700 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-sky-400 cursor-pointer"
                                        >
                                            <HiOutlineArrowLeft className="h-4 w-4" aria-hidden="true" />
                                            Back to {activeOverviewMetric?.label || 'active risk zones'}
                                        </button>
                                    </div>
                                    <HighRiskZoneDetails zone={selectedActiveRiskZone} />
                                </>
                            )}
                            {isRiskZoneSummaryPanel && !selectedActiveRiskZone && (
                                <RiskZoneList
                                    zones={highRiskZones}
                                    onInspect={(zone) => setSelectedActiveRiskZoneId(String(zone._id || zone.id))}
                                    onLocate={locateZone}
                                    loading={highRiskZonesLoading}
                                    error={highRiskZonesError}
                                    onRetry={onRetryHighRiskZones}
                                />
                            )}
                            {isTrustPointsPanel && <TrustPointsSummary value={reporterTrustPoints} />}
                        </MapOverlayPanel>
                    )}
                </div>
            </section>

            {!isAuthenticated && (
                <section className="border-t border-gray-200 py-3.5 sm:py-4 dark:border-white/10 sm:flex sm:items-center sm:justify-between sm:gap-4" aria-label="Public safety and reporter registration">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[13px] sm:text-sm font-semibold text-gray-900 dark:text-white break-words">
                            Sibuyan Island Emergency Network
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 break-words">
                            Incident feeds are public. Join as a verified reporter to submit real-time reports.
                        </p>
                    </div>
                    <div className="mt-2.5 flex flex-row flex-wrap items-center gap-x-3 gap-y-2 sm:mt-0 sm:shrink-0">
                        <Button
                            as={Link}
                            to="/register"
                            className="inline-flex items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold px-3.5 min-h-[38px] sm:min-h-9"
                        >
                            <span>Become a reporter</span>
                        </Button>
                        <Link
                            to="/login"
                            className="inline-flex min-h-9 items-center text-xs font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-sky-400"
                        >
                            Sign in
                        </Link>
                    </div>
                </section>
            )}

        </div>
    );
};

export default DashboardMapWorkspace;
