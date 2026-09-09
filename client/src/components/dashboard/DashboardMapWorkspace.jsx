import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    HiChevronRight,
    HiOutlineBadgeCheck,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineFilter,
    HiOutlineLightningBolt,
    HiOutlineTruck,
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
import { getPhysicalMunicipality } from '../../utils/incidentDetails';
import { getMapRiskTypeConfig, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getMapExperience } from '../../config/mapExperience';

const STATUS_CONFIG = MAP_STATUS_CONFIG;
const MAP_SUMMARY_PANEL_ID = 'dashboard-map-summary-panel';
const OVERVIEW_PANEL_PREFIX = 'overview:';
const formatDate = (value, pattern = 'MMM d, h:mm a') => {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : format(date, pattern);
};

const formatIncidentType = (report) => (
    (report?.incidentType || report?.accidentType || 'Incident')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const EmptyState = ({ title, description }) => (
    <div className="px-4 py-10 text-center sm:px-5">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
            <HiOutlineCheckCircle className="h-5 w-5" />
        </div>
        <h3 className="mt-2.5 text-xs sm:text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{description}</p>
    </div>
);

const IncidentList = ({ reports, emptyTitle, emptyDescription, onLocate, canLocate, onInspect }) => {
    if (!reports.length) {
        return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {reports.map((report) => {
                const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                const coordinates = getMapCoordinates(report);
                const locateAvailable = Boolean(coordinates && onLocate && (!canLocate || canLocate(report)));
                const location = report.address || report.title || report.barangay || report.municipalityName || 'Location unavailable';
                return (
                    <article key={report._id || report.id} className="group px-4 py-3 sm:px-5 hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-semibold text-gray-950 dark:text-white break-words leading-snug">
                                {location}
                            </h3>
                            <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300 break-words leading-normal">
                                {formatIncidentType(report)} <span aria-hidden="true">·</span> {status.label}
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

const RiskZoneList = ({ zones, onInspect, onLocate, loading = false, error = '', onRetry }) => {
    if (loading && zones.length === 0) {
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

    if (!zones.length) {
        return <EmptyState title="No active risk zones" description="No high-risk areas are currently listed." />;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {zones.map((zone) => {
                const config = getMapRiskTypeConfig(zone.type);
                const coordinates = getMapCoordinates(zone);
                return (
                    <article key={zone._id || zone.id} className="group px-4 py-3 sm:px-5 hover:bg-gray-50 dark:hover:bg-white/[0.02]">
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
        className={`group min-w-0 cursor-pointer rounded-xl px-3 py-2.5 text-left shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-4 sm:py-3.5 ${selected
            ? 'border border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:border-brand-500 dark:bg-white/5'
            : 'border-2 border-brand-700 bg-brand-100/80 shadow hover:border-brand-800 hover:bg-brand-100 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]'
            }`}
    >
        <span className="flex w-full items-center gap-1.5">
            <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-semibold uppercase whitespace-nowrap tracking-wide sm:text-[11px] ${selected ? 'text-brand-800 dark:text-sky-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {statusDot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />}
                <span>{label}</span>
            </span>
            <HiChevronRight className="h-4 w-4 shrink-0 text-brand-500 transition-all group-hover:translate-x-0.5 group-hover:text-brand-700 dark:text-gray-600" aria-hidden="true" />
        </span>
        <span className="mt-0.5 block text-xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-2xl dark:text-white">
            {value}
        </span>
        <p className="mt-0 block break-words text-[11px] leading-tight text-gray-500 sm:text-xs dark:text-gray-400">
            {helper}
        </p>
    </button>
);

const DashboardMapWorkspace = ({
    user,
    isAuthenticated,
    isAdmin,
    isResponder,
    loading,
    error,
    reports,
    pendingReports,
    respondingReports,
    resolvedTodayReports,
    highRiskZones,
    highRiskZonesLoading = false,
    highRiskZonesError = '',
    onRetryHighRiskZones,
    reporterOverviewReportsLoading = false,
    onLoadReporterOverviewReports,
    focusLocation,
    focusedReport,
    focusedRiskZone,
    onReturnToReport,
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
}) => {
    const focusRequestSequenceRef = useRef(0);
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const mobileFilterTriggerRef = useRef(null);
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
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

    const activeReports = getVisibleMapReports(reports);
    const displayedMapReports = getFilteredMapReports(reports, {
        includePending: mapExperience.showPendingReports,
        statusFilter: mapExperience.filters.length > 0 ? responderMapFilter : null,
        filterMode: mapExperience.filterMode,
    });
    const allMappedReports = getVisibleMapReports(reports, { includePending: true });
    const adminPendingReports = allMappedReports.filter((report) => report.status === 'pending');
    const dispatchableReports = activeReports.filter((report) => ['verified', 'transferred'].includes(report.status));
    const activeResponseReports = activeReports.filter((report) => report.status === 'responding');
    const transferredReports = activeReports.filter((report) => report.status === 'transferred');
    const publicActiveReports = activeReports.filter((report) => ['verified', 'transferred', 'responding'].includes(report.status));
    const publicActiveLocationCount = groupReportsByMapLocation(publicActiveReports).length;


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
        setMapSummaryPanel(panel);
    }, [setMapSummaryPanel]);

    const handleMapInspectorOpen = useCallback(() => {
        closeMapSummaryPanel();
    }, [closeMapSummaryPanel]);

    const metrics = isResponder
        ? [
            {
                id: 'responder-awaiting', label: 'Awaiting response', value: pendingReports.length,
                helper: 'Unassigned or transferred', icon: HiOutlineClock, panelType: 'incidents',
                panelTitle: 'Awaiting response', panelDescription: `${pendingReports.length} ${pendingReports.length === 1 ? 'incident' : 'incidents'} available for response`,
                records: pendingReports, mapFilter: 'pending', emptyTitle: 'No incidents awaiting response',
                emptyDescription: 'All available incidents are assigned or already resolved.',
                statusDot: 'bg-amber-500',
            },
            {
                id: 'responder-active', label: 'Active response', value: respondingReports.length,
                helper: 'Assigned incidents', icon: HiOutlineTruck, panelType: 'incidents',
                panelTitle: 'Active responses', panelDescription: `${respondingReports.length} assigned ${respondingReports.length === 1 ? 'incident' : 'incidents'}`,
                records: respondingReports, mapFilter: 'responding', emptyTitle: 'No active responses',
                emptyDescription: 'No incidents are currently assigned or in active response.',
                statusDot: 'bg-cyan-500',
            },
            {
                id: 'responder-resolved-today', label: 'Resolved today', value: resolvedTodayReports.length,
                helper: 'Incidents you handled', icon: HiOutlineBadgeCheck, panelType: 'incidents',
                panelTitle: 'Resolved today', panelDescription: `${resolvedTodayReports.length} ${resolvedTodayReports.length === 1 ? 'incident' : 'incidents'} resolved today`,
                records: resolvedTodayReports, mapFilter: 'resolved', emptyTitle: 'No incidents resolved today',
                emptyDescription: 'You have not resolved any incidents today.',
                statusDot: 'bg-emerald-500',
            },
            {
                id: 'responder-risk-zones', label: 'Risk zones', value: highRiskZones.length,
                helper: 'Mapped hazards', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
                panelTitle: 'Active risk zones', records: highRiskZones, mapFilter: 'risk-zones',
                loading: highRiskZonesLoading, error: highRiskZonesError,
                statusDot: 'bg-red-500',
            },
        ]
        : isAdmin
            ? [
                {
                    id: 'admin-pending', label: 'Pending', value: adminPendingReports.length,
                    helper: 'Awaiting review', icon: HiOutlineClock, panelType: 'incidents',
                    panelTitle: 'Pending incidents', panelDescription: `${adminPendingReports.length} ${adminPendingReports.length === 1 ? 'report' : 'reports'} awaiting municipal review`,
                    records: adminPendingReports, mapFilter: 'pending', emptyTitle: 'No pending incidents',
                    emptyDescription: 'No incidents are currently awaiting municipal review.',
                    statusDot: 'bg-amber-500',
                },
                {
                    id: 'admin-dispatchable', label: 'Verified / transferred', value: dispatchableReports.length,
                    helper: 'Available for dispatch', icon: HiOutlineCheckCircle, panelType: 'incidents',
                    panelTitle: 'Verified / transferred incidents', panelDescription: `${dispatchableReports.length} ${dispatchableReports.length === 1 ? 'incident' : 'incidents'} available for dispatch`,
                    records: dispatchableReports, mapFilter: 'all', emptyTitle: 'No incidents available for dispatch',
                    emptyDescription: 'No verified or transferred incidents are currently available for dispatch.',
                    statusDot: 'bg-blue-500',
                },
                {
                    id: 'admin-responding', label: 'Responding', value: activeResponseReports.length,
                    helper: 'Active field response', icon: HiOutlineTruck, panelType: 'incidents',
                    panelTitle: 'Responding incidents', panelDescription: `${activeResponseReports.length} ${activeResponseReports.length === 1 ? 'incident' : 'incidents'} in active response`,
                    records: activeResponseReports, mapFilter: 'responding', emptyTitle: 'No responding incidents',
                    emptyDescription: 'No incidents are currently in active response.',
                    statusDot: 'bg-cyan-500',
                },
                {
                    id: 'admin-resolved-today', label: 'Resolved today', value: resolvedTodayReports.length,
                    helper: 'Closed incidents', icon: HiOutlineBadgeCheck, panelType: 'incidents',
                    panelTitle: 'Resolved today', panelDescription: `${resolvedTodayReports.length} ${resolvedTodayReports.length === 1 ? 'incident' : 'incidents'} resolved today`,
                    records: resolvedTodayReports, mapFilter: 'resolved', emptyTitle: 'No incidents resolved today',
                    emptyDescription: 'No incidents have been resolved today.',
                    statusDot: 'bg-emerald-500',
                },
            ]

            : [
                {
                    id: 'public-active', label: 'Active incidents', value: publicActiveReports.length,
                    helper: publicActiveReports.length === publicActiveLocationCount
                        ? 'Verified in community'
                        : `Across ${publicActiveLocationCount} map locations`,
                    icon: HiOutlineCheckCircle, panelType: 'incidents', panelTitle: 'Active incidents',
                    panelDescription: `${publicActiveReports.length} ${publicActiveReports.length === 1 ? 'incident' : 'incidents'} currently active`,
                    records: publicActiveReports,
                    // 'incidents' shows the same active report set as 'all' but
                    // suppresses the hazard layer, isolating incident pins.
                    mapFilter: 'incidents',
                    emptyTitle: 'No active incidents', emptyDescription: 'No verified, transferred, or responding incidents are currently active.',
                    statusDot: 'bg-blue-500',
                },
                {
                    id: 'public-responding', label: 'Active response', value: activeResponseReports.length,
                    helper: 'Being handled now', icon: HiOutlineTruck, panelType: 'incidents',
                    panelTitle: 'Active response', panelDescription: `${activeResponseReports.length} ${activeResponseReports.length === 1 ? 'incident' : 'incidents'} being handled now`,
                    records: activeResponseReports,
                    mapFilter: 'responding',
                    emptyTitle: 'No active responses',
                    emptyDescription: 'No public incidents are currently in active response.',
                    statusDot: 'bg-cyan-500',
                },
                {
                    id: 'public-transferred', label: 'Transferred', value: transferredReports.length,
                    helper: 'Forwarded to another area', icon: HiOutlineExclamation, panelType: 'incidents',
                    panelTitle: 'Transferred incidents', panelDescription: `${transferredReports.length} transferred ${transferredReports.length === 1 ? 'incident' : 'incidents'}`,
                    records: transferredReports,
                    mapFilter: 'transferred',
                    emptyTitle: 'No transferred incidents',
                    emptyDescription: 'No public incidents are currently transferred to another area.',
                    statusDot: 'bg-violet-500',
                },
                {
                    id: 'public-risk-zones', label: 'Risk zones', value: highRiskZones.length,
                    helper: 'Mapped hazards', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
                    panelTitle: 'Active risk zones', records: highRiskZones, mapFilter: 'risk-zones',
                    loading: highRiskZonesLoading, error: highRiskZonesError,
                    statusDot: 'bg-red-500',
                },
            ];

    const activeOverviewMetric = metrics.find(
        (metric) => `${OVERVIEW_PANEL_PREFIX}${metric.id}` === mapSummaryPanel,
    ) || null;
    const isIncidentSummaryPanel = mapSummaryPanel === 'incidents' || activeOverviewMetric?.panelType === 'incidents';
    const isRiskZoneSummaryPanel = mapSummaryPanel === 'zones' || activeOverviewMetric?.panelType === 'risk-zones';
    const isTrustPointsPanel = activeOverviewMetric?.panelType === 'trust-points';
    const hasSummaryPanel = Boolean(isIncidentSummaryPanel || isRiskZoneSummaryPanel || isTrustPointsPanel);

    const panelIncidentReports = mapSummaryPanel === 'incidents'
        ? displayedMapReports
        : activeOverviewMetric?.panelType === 'incidents'
            ? activeOverviewMetric.records
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
        if (mapExperience.filters.length > 0 && !displayedMapReportIds.has(String(report._id || report.id))) {
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
                    || `${highRiskZones.length} monitored ${highRiskZones.length === 1 ? 'zone' : 'zones'}`
            : mapSummaryPanel === 'incidents'
                ? `${displayedMapReports.length} currently visible`
                : highRiskZonesLoading
                    ? 'Loading monitored zones'
                    : highRiskZonesError
                        ? 'Risk zone data unavailable'
                        : `${highRiskZones.length} monitored ${highRiskZones.length === 1 ? 'zone' : 'zones'}`;
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
        if (!user?.assignedMunicipality) return true;
        if (!report?.municipalityName) return true;
        const assigned = user.assignedMunicipality.trim().toLowerCase();
        const incidentMuni = report.municipalityName.trim().toLowerCase();
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
            return highRiskZones.length;
        }
        return getFilteredMapReports(reports, {
            includePending: mapExperience.showPendingReports,
            statusFilter: filterValue,
            filterMode: mapExperience.filterMode,
        }).length;
    };

    return (
        <div className="mx-auto w-full max-w-[1500px] space-y-3 sm:space-y-5">
            <header>
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400">
                        {mapExperience.eyebrow}
                    </p>
                    <h1 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white break-words">
                        {mapExperience.title}
                    </h1>
                    <p className="hidden sm:block mt-0.5 max-w-2xl text-sm text-gray-600 dark:text-gray-300 break-words">
                        {mapExperience.description}
                    </p>
                </div>
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

            {focusedReport && (
                <section className="flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/5" aria-label="Focused incident context">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-sky-400">Focused incident</p>
                        <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{focusedReport.address || 'Selected incident'}</p>
                    </div>
                    {onReturnToReport && (
                        <Button
                            onClick={onReturnToReport}
                            variant="secondary"
                            icon={HiOutlineArrowLeft}
                            className="rounded-lg text-xs min-h-[44px] sm:min-h-9 px-3 py-1.5"
                        >
                            Back to incident
                        </Button>
                    )}
                </section>
            )}

            <section ref={mapSectionRef} className="scroll-mt-20 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Live incident map">
                <div className="flex flex-col gap-1.5 p-1.5 sm:gap-2 sm:p-2.5">
                    {mapExperience.filters.length > 0 && (() => {
                        const isFiltered = responderMapFilter && responderMapFilter !== 'all';
                        const currentFilterObj = mapExperience.filters.find((f) => f.value === responderMapFilter);
                        const activeFilterLabel = currentFilterObj ? currentFilterObj.label : (responderMapFilter === 'risk-zones' ? 'Risk Zones' : 'Active Incidents');
                        const activeFilterCount = getFilterCount(responderMapFilter);
                        const activeFilterSummary = `${activeFilterLabel} · ${activeFilterCount}`;
                        const activeStatusDotClass = responderMapFilter === 'risk-zones'
                            ? 'bg-red-500'
                            : (MAP_STATUS_CONFIG[responderMapFilter]?.dot || (responderMapFilter === 'all' ? 'bg-emerald-500' : 'bg-gray-400'));

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
                                        className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer ${isFiltered
                                            ? 'border-brand-700 bg-brand-700 text-white dark:border-brand-500 dark:bg-brand-600 dark:text-white'
                                            : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-white/15 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-white/5'
                                            }`}
                                    >
                                        <HiOutlineFilter className={`h-3.5 w-3.5 ${isFiltered ? 'text-brand-100 dark:text-white' : 'text-brand-700 dark:text-sky-400'}`} aria-hidden="true" />
                                        <span>Filters</span>
                                        {isFiltered && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white text-brand-800 px-1 text-[10px] font-bold tabular-nums dark:bg-white dark:text-brand-800">
                                                1
                                            </span>
                                        )}
                                    </button>

                                    {/* Active Filter Summary (plain text) and Clear Action */}
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                        <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px] text-gray-600 sm:text-xs dark:text-gray-400">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeStatusDotClass}`} aria-hidden="true" />
                                            <span className="truncate">{activeFilterSummary}</span>
                                        </p>

                                        {isFiltered && (
                                            <button
                                                type="button"
                                                onClick={() => setResponderMapFilter('all')}
                                                aria-label="Clear active filter and show all"
                                                className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200 cursor-pointer"
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
                                    {mapExperience.filters.map((filter) => {
                                        const count = getFilterCount(filter.value);
                                        const isSelected = responderMapFilter === filter.value;
                                        const statusCfg = filter.value === 'risk-zones'
                                            ? { dot: 'bg-red-500' }
                                            : MAP_STATUS_CONFIG[filter.value] || { dot: 'bg-gray-400' };
                                        const isRiskZoneTab = filter.value === 'risk-zones';
                                        const tooltip = filter.value === 'all'
                                            ? 'Active ongoing incidents'
                                            : filter.value === 'risk-zones'
                                                ? 'Mapped hazard and risk zones'
                                                : filter.value === 'resolved'
                                                    ? 'Resolved incident archive'
                                                    : `${filter.label} incidents`;

                                        return (
                                            <Fragment key={filter.value}>
                                                {isRiskZoneTab && (
                                                    <span className="h-4 w-px bg-gray-200 dark:bg-white/10 self-center -mb-2" aria-hidden="true" />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setResponderMapFilter(filter.value)}
                                                    aria-pressed={isSelected}
                                                    title={tooltip}
                                                    aria-label={`${filter.label} filter (${count} ${count === 1 ? 'record' : 'records'})${isSelected ? ', selected' : ''}`}
                                                    className={`relative -mb-px inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 pb-2 pt-1.5 px-2 rounded-t-md text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 before:absolute before:-inset-1 before:content-[''] ${isSelected
                                                        ? 'border-brand-600 bg-brand-50/70 font-semibold text-brand-800 dark:border-brand-500 dark:bg-white/5 dark:text-sky-300'
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
                                            </Fragment>
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="relative h-[46svh] min-h-[280px] max-h-[380px] w-full overflow-hidden rounded-lg sm:h-[460px] sm:max-h-none lg:h-[500px]">
                    {loading && reports.length === 0 && (
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
                        showPending={mapExperience.showPendingReports}
                        filterStatus={mapExperience.filters.length > 0 ? responderMapFilter : null}
                        filterMode={mapExperience.filterMode}
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
                        showDataState
                        enable3D
                        showDesktopLegend={false}
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
                            {isIncidentSummaryPanel && !selectedActiveIncident && !activeOverviewMetric?.loading && !activeOverviewMetric?.error && (
                                <IncidentList
                                    reports={panelIncidentReports}
                                    emptyTitle={activeOverviewMetric?.emptyTitle || 'No active incidents'}
                                    emptyDescription={activeOverviewMetric?.emptyDescription
                                        || (mapExperience.filters.length > 0 && responderMapFilter !== 'all'
                                            ? 'No incidents match the selected map filter.'
                                            : 'There are no verified, transferred, or responding incidents on the map.')}
                                    onInspect={(report) => setSelectedActiveIncidentId(String(report._id || report.id))}
                                    onLocate={locateActiveIncident}
                                    canLocate={canLocatePanelReport}
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
                                    <HighRiskZoneDetails
                                        zone={selectedActiveRiskZone}
                                        viewerRole={user?.role || 'guest'}
                                    />
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

            <section className="space-y-2 sm:space-y-2.5" aria-label="Map summary">
                <div className="flex items-baseline justify-between gap-2 px-1">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Current overview</h2>
                    <p className="shrink-0 text-[11px] text-gray-400 sm:text-xs dark:text-gray-500">
                        <span className="hidden sm:inline">Select any metric to view matching records</span>
                        <span className="sm:hidden">Tap to view records</span>
                    </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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
