import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    HiOutlineBadgeCheck,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineMap,
    HiOutlinePlus,
    HiOutlineShieldCheck,
    HiOutlineTruck,
} from 'react-icons/hi';
import { Link } from '../../router';
import MapView from '../map/MapView';
import MapIncidentDetails from '../map/MapIncidentDetails';
import MapOverlayPanel from '../map/MapOverlayPanel';
import Button from '../ui/Button';
import {
    getFilteredMapReports,
    getMapCoordinates,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../../utils/mapReports';
import { scheduleElementScroll } from '../../utils/mapNavigation';
import { getMapRiskTypeConfig, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getMapExperience } from '../../config/mapExperience';

const STATUS_CONFIG = MAP_STATUS_CONFIG;
const MAP_SUMMARY_PANEL_ID = 'dashboard-map-summary-panel';
const OVERVIEW_PANEL_PREFIX = 'overview:';
const METRIC_DIVIDER_CLASSES = [
    '',
    'border-l border-gray-200 dark:border-gray-800',
    'border-t border-gray-200 dark:border-gray-800 lg:border-l lg:border-t-0',
    'border-l border-t border-gray-200 dark:border-gray-800 lg:border-t-0',
];

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
    <div className="px-4 py-12 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
            <HiOutlineCheckCircle className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>
    </div>
);

const IncidentList = ({ reports, emptyTitle, emptyDescription, onLocate, canLocate, onInspect }) => {
    if (!reports.length) {
        return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {reports.map((report) => {
                const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                const coordinates = getMapCoordinates(report);
                const locateAvailable = Boolean(coordinates && onLocate && (!canLocate || canLocate(report)));
                const location = report.address || report.title || report.barangay || report.municipalityName || 'Location unavailable';
                return (
                    <article key={report._id || report.id} className="px-4 py-4 sm:px-5">
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold leading-5 text-gray-950 dark:text-white">{location}</h3>
                            <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                                {formatIncidentType(report)} <span aria-hidden="true">·</span> {status.label}
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {report.municipalityName || 'Municipality unavailable'} <span aria-hidden="true">·</span> {formatDate(report.incidentTime || report.createdAt || report.resolvedAt)}
                            </p>
                        </div>
                        <div className="mt-3 flex min-h-10 items-center justify-between gap-3 border-t border-gray-100 pt-2.5 dark:border-gray-800">
                            {onInspect && (
                                <button
                                    type="button"
                                    onClick={() => onInspect(report)}
                                    className="inline-flex min-h-10 items-center rounded-md px-1 text-xs font-semibold text-gray-700 transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-emerald-400"
                                >
                                    View details
                                </button>
                            )}
                            {locateAvailable && (
                                <button
                                    type="button"
                                    onClick={() => onLocate(report)}
                                    className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-md px-1 text-xs font-semibold text-gray-700 transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-emerald-400"
                                >
                                    Locate
                                    <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

const PanelLoadingState = ({ label }) => (
    <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-8 text-sm font-medium text-gray-600 dark:text-gray-300" role="status">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-200" aria-hidden="true" />
        {label}
    </div>
);

const PanelErrorState = ({ title, description, onRetry }) => (
    <div className="px-4 py-8 text-center sm:px-5" role="alert">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
        {onRetry && (
            <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
                Retry
            </button>
        )}
    </div>
);

const TrustPointsSummary = ({ value }) => (
    <div className="px-4 py-5 sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Current score</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{value}</p>
        <p className="mt-3 border-t border-gray-200 pt-3 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:text-gray-300">
            Your current reporter standing is calculated from reports that are presently verified or resolved.
        </p>
    </div>
);

const RiskZoneList = ({ zones, onLocate, loading = false, error = '', onRetry }) => {
    if (loading) {
        return (
            <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-8 text-sm font-medium text-gray-600 dark:text-gray-300" role="status">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-200" aria-hidden="true" />
                Loading risk zones&hellip;
            </div>
        );
    }

    if (error) {
        return (
            <div className="px-4 py-8 text-center sm:px-5" role="alert">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Risk zones unavailable</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{error}</p>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
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
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {zones.map((zone) => {
                const config = getMapRiskTypeConfig(zone.type);
                return (
                    <article key={zone._id || zone.id} className="px-4 py-4 sm:px-5">
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold leading-5 text-gray-950 dark:text-white">{zone.name || 'Unnamed zone'}</h3>
                            <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">{config.label}</p>
                            <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">{zone.address || zone.description || 'Address unavailable'}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {zone.municipality || zone.municipalityName || 'Municipality unavailable'} <span aria-hidden="true">·</span> {Number.isFinite(Number(zone.radius)) ? `${Number(zone.radius)} m radius` : 'Radius unavailable'}
                            </p>
                        </div>
                        {getMapCoordinates(zone) && (
                            <div className="mt-3 flex min-h-10 items-center justify-end border-t border-gray-100 pt-2.5 dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => onLocate(zone)}
                                    className="inline-flex min-h-10 items-center gap-1 rounded-md px-1 text-xs font-semibold text-gray-700 transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-emerald-400"
                                >
                                    Locate
                                    <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
};

const MapActionButton = ({
    onClick,
    icon: Icon,
    label,
    count,
    selected = false,
    loading = false,
    unavailable = false,
}) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={selected}
        aria-expanded={selected}
        aria-controls={MAP_SUMMARY_PANEL_ID}
        aria-busy={loading || undefined}
        className={`group inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-800 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-100 lg:w-auto lg:shrink-0 ${selected
            ? 'border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
        }`}
    >
        <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 whitespace-nowrap text-left">{label}</span>
        <span aria-hidden="true" className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
            {loading ? '…' : unavailable ? '—' : count}
        </span>
    </button>
);

const MetricStripItem = ({ label, value, helper, icon: Icon, onClick, selected, loading = false, dividerClass }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-expanded={selected}
        aria-controls={MAP_SUMMARY_PANEL_ID}
        aria-busy={loading || undefined}
        className={`group min-w-0 px-3 py-3 text-left transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 active:bg-gray-100 dark:active:bg-gray-800 sm:px-4 ${selected
            ? 'bg-gray-50 ring-1 ring-inset ring-gray-300 dark:bg-gray-800/70 dark:ring-gray-700'
            : 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60'
        } ${dividerClass}`}
    >
        <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
            <span className="flex shrink-0 items-center gap-1.5 text-gray-400 dark:text-gray-500" aria-hidden="true">
                <Icon className="h-4 w-4" />
                <HiOutlineArrowRight className="h-3.5 w-3.5 opacity-40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-80" />
            </span>
        </div>
        <p className="mt-2 text-xl font-bold text-gray-950 dark:text-white">{value}</p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{helper}</p>
    </button>
);

const DashboardMapWorkspace = ({
    user,
    isAuthenticated,
    isAdmin,
    isResponder,
    isReporter,
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
    roleStats,
    reporterOverviewReports,
    reporterOverviewReportsLoading = false,
    reporterOverviewReportsError = '',
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
    setSearchParams,
    mapSummaryPanel,
    setMapSummaryPanel,
    activePanel,
}) => {
    const focusRequestSequenceRef = useRef(0);
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const [selectedActiveIncidentId, setSelectedActiveIncidentId] = useState('');
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
    const displayedLocationCount = groupReportsByMapLocation(displayedMapReports).length;
    const adminPendingReports = allMappedReports.filter((report) => report.status === 'pending');
    const dispatchableReports = activeReports.filter((report) => ['verified', 'transferred'].includes(report.status));
    const activeResponseReports = activeReports.filter((report) => report.status === 'responding');
    const transferredReports = activeReports.filter((report) => report.status === 'transferred');
    const reporterRecordsLoaded = Array.isArray(reporterOverviewReports);
    const reporterPendingReports = reporterRecordsLoaded
        ? reporterOverviewReports.filter((report) => report.status === 'pending')
        : [];
    const reporterVerifiedReports = reporterRecordsLoaded
        ? reporterOverviewReports.filter((report) => report.status === 'verified')
        : [];
    const reporterResolvedReports = reporterRecordsLoaded
        ? reporterOverviewReports.filter((report) => report.status === 'resolved')
        : [];
    const reporterTrustPoints = reporterRecordsLoaded
        ? reporterVerifiedReports.length + reporterResolvedReports.length
        : roleStats?.trustPoints || 0;

    const closeMapSummaryPanel = useCallback((options = {}) => {
        setSelectedActiveIncidentId('');
        setMapSummaryPanel('');
        const isOverviewPanel = mapSummaryPanel.startsWith(OVERVIEW_PANEL_PREFIX);
        if (!options.preserveNavigation && !isOverviewPanel && ['incidents', 'zones'].includes(activePanel)) {
            setSearchParams({ view: 'map' });
        }
    }, [activePanel, mapSummaryPanel, setMapSummaryPanel, setSearchParams]);

    const openMapSummaryPanel = useCallback((panel) => {
        setSelectedActiveIncidentId('');
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
            },
            {
                id: 'responder-active', label: 'Active response', value: respondingReports.length,
                helper: 'Assigned incidents', icon: HiOutlineTruck, panelType: 'incidents',
                panelTitle: 'Active responses', panelDescription: `${respondingReports.length} assigned ${respondingReports.length === 1 ? 'incident' : 'incidents'}`,
                records: respondingReports, mapFilter: 'responding', emptyTitle: 'No active responses',
                emptyDescription: 'No incidents are currently assigned or in active response.',
            },
            {
                id: 'responder-resolved-today', label: 'Resolved today', value: resolvedTodayReports.length,
                helper: 'Incidents you handled', icon: HiOutlineBadgeCheck, panelType: 'incidents',
                panelTitle: 'Resolved today', panelDescription: `${resolvedTodayReports.length} ${resolvedTodayReports.length === 1 ? 'incident' : 'incidents'} resolved today`,
                records: resolvedTodayReports, mapFilter: 'all', emptyTitle: 'No incidents resolved today',
                emptyDescription: 'You have not resolved any incidents today.',
            },
            {
                id: 'responder-risk-zones', label: 'Risk zones', value: highRiskZones.length,
                helper: 'Mapped hazards', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
                panelTitle: 'Active risk zones', records: highRiskZones,
                loading: highRiskZonesLoading, error: highRiskZonesError,
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
                },
                {
                    id: 'admin-dispatchable', label: 'Verified / transferred', value: dispatchableReports.length,
                    helper: 'Available for dispatch', icon: HiOutlineCheckCircle, panelType: 'incidents',
                    panelTitle: 'Verified / transferred incidents', panelDescription: `${dispatchableReports.length} ${dispatchableReports.length === 1 ? 'incident' : 'incidents'} available for dispatch`,
                    records: dispatchableReports, mapFilter: 'all', emptyTitle: 'No incidents available for dispatch',
                    emptyDescription: 'No verified or transferred incidents are currently available for dispatch.',
                },
                {
                    id: 'admin-responding', label: 'Responding', value: activeResponseReports.length,
                    helper: 'Active field response', icon: HiOutlineTruck, panelType: 'incidents',
                    panelTitle: 'Responding incidents', panelDescription: `${activeResponseReports.length} ${activeResponseReports.length === 1 ? 'incident' : 'incidents'} in active response`,
                    records: activeResponseReports, mapFilter: 'responding', emptyTitle: 'No responding incidents',
                    emptyDescription: 'No incidents are currently in active response.',
                },
                {
                    id: 'admin-resolved-today', label: 'Resolved today', value: resolvedTodayReports.length,
                    helper: 'Closed incidents', icon: HiOutlineBadgeCheck, panelType: 'incidents',
                    panelTitle: 'Resolved today', panelDescription: `${resolvedTodayReports.length} ${resolvedTodayReports.length === 1 ? 'incident' : 'incidents'} resolved today`,
                    records: resolvedTodayReports, mapFilter: 'all', emptyTitle: 'No incidents resolved today',
                    emptyDescription: 'No incidents have been resolved today.',
                },
            ]
            : isReporter
                ? [
                    {
                        id: 'reporter-pending', label: 'My pending',
                        value: reporterRecordsLoaded ? reporterPendingReports.length : roleStats?.myReports?.pending || 0,
                        helper: 'Waiting for review', icon: HiOutlineClock, panelType: 'incidents',
                        panelTitle: 'My pending reports', panelDescription: `${reporterPendingReports.length} ${reporterPendingReports.length === 1 ? 'report' : 'reports'} awaiting review`,
                        records: reporterPendingReports, requiresReporterRecords: true,
                        loading: reporterOverviewReportsLoading, error: reporterOverviewReportsError,
                        emptyTitle: 'No pending reports', emptyDescription: 'You have no reports currently awaiting review.',
                    },
                    {
                        id: 'reporter-verified', label: 'My verified',
                        value: reporterRecordsLoaded ? reporterVerifiedReports.length : roleStats?.myReports?.verified || 0,
                        helper: 'Approved submissions', icon: HiOutlineCheckCircle, panelType: 'incidents',
                        panelTitle: 'My verified reports', panelDescription: `${reporterVerifiedReports.length} verified ${reporterVerifiedReports.length === 1 ? 'report' : 'reports'}`,
                        records: reporterVerifiedReports, requiresReporterRecords: true,
                        loading: reporterOverviewReportsLoading, error: reporterOverviewReportsError,
                        emptyTitle: 'No verified reports', emptyDescription: 'You have no reports currently marked as verified.',
                    },
                    {
                        id: 'reporter-resolved', label: 'My resolved',
                        value: reporterRecordsLoaded ? reporterResolvedReports.length : roleStats?.myReports?.resolved || 0,
                        helper: 'Closed submissions', icon: HiOutlineBadgeCheck, panelType: 'incidents',
                        panelTitle: 'My resolved reports', panelDescription: `${reporterResolvedReports.length} resolved ${reporterResolvedReports.length === 1 ? 'report' : 'reports'}`,
                        records: reporterResolvedReports, requiresReporterRecords: true,
                        loading: reporterOverviewReportsLoading, error: reporterOverviewReportsError,
                        emptyTitle: 'No resolved reports', emptyDescription: 'You have no reports currently marked as resolved.',
                    },
                    {
                        id: 'reporter-trust-points', label: 'Trust points', value: reporterTrustPoints,
                        helper: 'Reporter standing', icon: HiOutlineShieldCheck, panelType: 'trust-points',
                        panelTitle: 'Trust points', panelDescription: 'Reporter standing',
                    },
                ]
                : [
                    {
                        id: 'public-active', label: 'Active incidents', value: displayedMapReports.length,
                        helper: displayedMapReports.length === displayedLocationCount
                            ? 'Visible map reports'
                            : `Across ${displayedLocationCount} map locations`,
                        icon: HiOutlineCheckCircle, panelType: 'incidents', panelTitle: 'Active incidents',
                        panelDescription: `${displayedMapReports.length} currently visible`, records: displayedMapReports,
                        emptyTitle: 'No active incidents', emptyDescription: 'No verified, transferred, or responding incidents are currently visible.',
                    },
                    {
                        id: 'public-responding', label: 'Active response', value: activeResponseReports.length,
                        helper: 'Being handled now', icon: HiOutlineTruck, panelType: 'incidents',
                        panelTitle: 'Active response', panelDescription: `${activeResponseReports.length} ${activeResponseReports.length === 1 ? 'incident' : 'incidents'} being handled now`,
                        records: activeResponseReports, emptyTitle: 'No active responses',
                        emptyDescription: 'No public incidents are currently in active response.',
                    },
                    {
                        id: 'public-transferred', label: 'Transferred', value: transferredReports.length,
                        helper: 'Forwarded to another area', icon: HiOutlineExclamation, panelType: 'incidents',
                        panelTitle: 'Transferred incidents', panelDescription: `${transferredReports.length} transferred ${transferredReports.length === 1 ? 'incident' : 'incidents'}`,
                        records: transferredReports, emptyTitle: 'No transferred incidents',
                        emptyDescription: 'No public incidents are currently transferred to another area.',
                    },
                    {
                        id: 'public-risk-zones', label: 'Risk zones', value: highRiskZones.length,
                        helper: 'Mapped hazards', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
                        panelTitle: 'Active risk zones', records: highRiskZones,
                        loading: highRiskZonesLoading, error: highRiskZonesError,
                    },
                ];

    const activeOverviewMetric = metrics.find(
        (metric) => `${OVERVIEW_PANEL_PREFIX}${metric.id}` === mapSummaryPanel,
    ) || null;
    const panelIncidentReports = mapSummaryPanel === 'incidents'
        ? displayedMapReports
        : activeOverviewMetric?.panelType === 'incidents'
            ? activeOverviewMetric.records
            : [];
    const selectedActiveIncident = panelIncidentReports.find(
        (report) => String(report._id || report.id) === selectedActiveIncidentId,
    ) || null;
    const displayedMapReportIds = new Set(
        displayedMapReports.map((report) => String(report._id || report.id)),
    );
    const canLocatePanelReport = (report) => displayedMapReportIds.has(String(report._id || report.id));

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
        closeMapSummaryPanel({ preserveNavigation: true });
        setMapLocateRequest({
            type: 'risk-zone',
            id: String(zone._id || zone.id),
            entity: zone,
            requestId: createFocusRequestId(),
        });
    };

    const locateActiveIncident = (report) => {
        setSelectedActiveIncidentId('');
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

    const isIncidentSummaryPanel = mapSummaryPanel === 'incidents' || activeOverviewMetric?.panelType === 'incidents';
    const isRiskZoneSummaryPanel = mapSummaryPanel === 'zones' || activeOverviewMetric?.panelType === 'risk-zones';
    const isTrustPointsPanel = activeOverviewMetric?.panelType === 'trust-points';
    const hasSummaryPanel = Boolean(isIncidentSummaryPanel || isRiskZoneSummaryPanel || isTrustPointsPanel);
    const panelTitle = selectedActiveIncident
        ? 'Incident details'
        : activeOverviewMetric?.panelTitle
            || (mapSummaryPanel === 'incidents' ? 'Active incidents' : 'High-risk zones');
    const panelDescription = selectedActiveIncident
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
    const panelCloseLabel = mapSummaryPanel === 'incidents'
        ? 'Close incidents panel'
        : mapSummaryPanel === 'zones'
            ? 'Close risk zones panel'
            : `Close ${activeOverviewMetric?.panelTitle?.toLowerCase() || 'overview'} panel`;
    const selectedIncidentCanRespond = Boolean(
        selectedActiveIncident
        && mapExperience.canRespond
        && ['verified', 'transferred'].includes(selectedActiveIncident.status),
    );
    const selectedIncidentCanResolve = Boolean(
        selectedActiveIncident
        && mapExperience.canResolve
        && selectedActiveIncident.status === 'responding'
        && (!canCurrentResponderResolve || canCurrentResponderResolve(selectedActiveIncident)),
    );

    return (
        <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-5">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <HiOutlineMap className="h-3.5 w-3.5" aria-hidden="true" />
                        {mapExperience.eyebrow}
                    </p>
                    <h1 className="mt-1 text-2xl font-display font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">{mapExperience.title}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-300">{mapExperience.description}</p>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-nowrap lg:items-center lg:self-center">
                    <MapActionButton
                        onClick={() => openMapSummaryPanel('incidents')}
                        icon={HiOutlineExclamation}
                        label="Incidents"
                        count={displayedMapReports.length}
                        selected={mapSummaryPanel === 'incidents'}
                    />
                    <MapActionButton
                        onClick={() => openMapSummaryPanel('zones')}
                        icon={HiOutlineLightningBolt}
                        label="Risk zones"
                        count={highRiskZones.length}
                        loading={highRiskZonesLoading}
                        unavailable={Boolean(highRiskZonesError)}
                        selected={mapSummaryPanel === 'zones'}
                    />
                    {mapExperience.showSubmitReport && (
                        <Button
                            as={Link}
                            to="/report"
                            icon={HiOutlinePlus}
                            className="col-span-2 w-full lg:w-auto"
                        >
                            Submit report
                        </Button>
                    )}
                </div>
            </header>

            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {highRiskZonesError && !highRiskZonesLoading && (
                <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <span>{highRiskZonesError}</span>
                    {onRetryHighRiskZones && (
                        <button
                            type="button"
                            onClick={onRetryHighRiskZones}
                            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
                        >
                            Retry risk zones
                        </button>
                    )}
                </div>
            )}

            {focusedReport && (
                <section className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Focused incident context">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Focused incident</p>
                        <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-gray-900">{focusedReport.address || 'Selected incident'}</p>
                    </div>
                    {onReturnToReport && (
                        <Button
                            onClick={onReturnToReport}
                            variant="secondary"
                            icon={HiOutlineArrowLeft}
                        >
                            Back to incident
                        </Button>
                    )}
                </section>
            )}

            <section ref={mapSectionRef} className="scroll-mt-20 overflow-hidden border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:rounded-lg sm:border" aria-label="Live incident map">
                <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Live map</h2>
                        <p className="mt-0.5 text-xs text-gray-500">Map markers update automatically when report status changes.</p>
                        {displayedMapReports.length > displayedLocationCount && (
                            <p className="mt-1 text-[11px] font-medium text-gray-500">
                                A numbered marker groups incidents reported at the same location.
                            </p>
                        )}
                    </div>
                    {mapExperience.filters.length > 0 && (
                        <div className="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800" aria-label="Map status filter">
                            {mapExperience.filters.map((filter) => (
                                <button
                                    key={filter.value}
                                    type="button"
                                    onClick={() => setResponderMapFilter(filter.value)}
                                    className={`min-h-9 shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${responderMapFilter === filter.value
                                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                                        : 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                                    }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="relative aspect-square w-full sm:aspect-auto sm:h-[480px] lg:h-[560px]">
                    {loading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80" aria-live="polite">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
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
                        viewerRole={user?.role || 'guest'}
                        showDataState
                        enable3D
                    />
                    {hasSummaryPanel && (
                        <MapOverlayPanel
                            id={MAP_SUMMARY_PANEL_ID}
                            title={panelTitle}
                            description={panelDescription}
                            onClose={closeMapSummaryPanel}
                            closeLabel={panelCloseLabel}
                            presentation="contextual"
                            contentKey={`${mapSummaryPanel}:${selectedActiveIncidentId || 'list'}`}
                        >
                            {isIncidentSummaryPanel && selectedActiveIncident && (
                                <>
                                    <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-800 sm:px-5">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedActiveIncidentId('')}
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-xs font-semibold text-gray-700 transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-emerald-400"
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
                                        actionLoading={panelActionLoading}
                                        onLocate={canLocatePanelReport(selectedActiveIncident) ? locateActiveIncident : undefined}
                                        onRespond={selectedIncidentCanRespond
                                            ? (report) => runPanelIncidentAction(handleMapRespond, report, 'Now responding to incident')
                                            : undefined}
                                        onResolve={selectedIncidentCanResolve
                                            ? (report) => runPanelIncidentAction(handleMapResolve, report, 'Opening resolution review')
                                            : undefined}
                                    />
                                </>
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && activeOverviewMetric?.loading && (
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
                            {isRiskZoneSummaryPanel && (
                                <RiskZoneList
                                    zones={highRiskZones}
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

            <section className="space-y-2" aria-label="Map summary">
                <div>
                    <h2 className="text-sm font-semibold text-gray-900">Current overview</h2>
                    <p className="mt-0.5 text-xs text-gray-500">Key incident and response totals for the current map view.</p>
                </div>
                <div className="grid grid-cols-2 overflow-hidden border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-4">
                    {metrics.map((metric, index) => (
                        <MetricStripItem
                            key={metric.id}
                            label={metric.label}
                            value={metric.value}
                            helper={metric.helper}
                            icon={metric.icon}
                            onClick={() => openOverviewMetric(metric)}
                            selected={mapSummaryPanel === `${OVERVIEW_PANEL_PREFIX}${metric.id}`}
                            loading={metric.loading}
                            dividerClass={METRIC_DIVIDER_CLASSES[index]}
                        />
                    ))}
                </div>
            </section>

            {!isAuthenticated && (
                <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Report incidents in your community</h2>
                        <p className="mt-1 text-sm text-gray-500">Create and verify a reporter account to submit incident reports.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button as={Link} to="/login" variant="secondary">Sign in</Button>
                        <Button as={Link} to="/register">Register</Button>
                    </div>
                </section>
            )}

        </div>
    );
};

export default DashboardMapWorkspace;
