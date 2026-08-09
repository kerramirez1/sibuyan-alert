import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
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
    getMapCoordinates,
    getVisibleMapReports,
    groupReportsByMapLocation,
} from '../../utils/mapReports';
import { scheduleElementScroll } from '../../utils/mapNavigation';
import { getMapRiskTypeConfig, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getMapExperience } from '../../config/mapExperience';

const STATUS_CONFIG = MAP_STATUS_CONFIG;
const INCIDENT_PANEL_SIZE = 'lg';
const MAP_SUMMARY_PANEL_ID = 'dashboard-map-summary-panel';
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

const IncidentList = ({ reports, emptyTitle, emptyDescription, onLocate, onInspect }) => {
    if (!reports.length) {
        return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {reports.map((report) => {
                const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                const coordinates = getMapCoordinates(report);
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
                            {coordinates && onLocate && (
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

const RiskZoneList = ({ zones, onLocate }) => {
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

const MapActionButton = ({ onClick, icon: Icon, label, count, selected = false }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={selected}
        aria-expanded={selected}
        aria-controls={MAP_SUMMARY_PANEL_ID}
        className={`group inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-800 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-100 lg:w-auto lg:shrink-0 ${selected
            ? 'border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
        }`}
    >
        <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 whitespace-nowrap text-left">{label}</span>
        <span aria-hidden="true" className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
            {count}
        </span>
    </button>
);

const MetricStripItem = ({ label, value, helper, icon: Icon, onClick, dividerClass }) => {
    const content = (
        <>
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <p className="mt-2 text-xl font-bold text-gray-950 dark:text-white">{value}</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{helper}</p>
        </>
    );

    return onClick ? (
        <button
            type="button"
            onClick={onClick}
            className={`min-w-0 px-3 py-3 text-left transition-colors duration-150 hover:bg-gray-50 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-gray-800/60 sm:px-4 ${dividerClass}`}
        >
            {content}
        </button>
    ) : (
        <div className={`min-w-0 px-3 py-3 sm:px-4 ${dividerClass}`}>{content}</div>
    );
};

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
    roleStats,
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
    showMapPendingModal,
    setShowMapPendingModal,
    showMapRespondingModal,
    setShowMapRespondingModal,
    showMapResolvedModal,
    setShowMapResolvedModal,
    activePanel,
}) => {
    const focusRequestSequenceRef = useRef(0);
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const [selectedActiveIncidentId, setSelectedActiveIncidentId] = useState('');
    const [mapLocateRequest, setMapLocateRequest] = useState(null);
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
    const selectedActiveIncident = activeReports.find(
        (report) => String(report._id || report.id) === selectedActiveIncidentId,
    ) || null;
    const allMappedReports = getVisibleMapReports(reports, { includePending: true });
    const activeLocationCount = groupReportsByMapLocation(activeReports).length;
    const respondingCount = activeReports.filter((report) => report.status === 'responding').length;
    const transferredCount = activeReports.filter((report) => report.status === 'transferred').length;
    const pendingCount = allMappedReports.filter((report) => report.status === 'pending').length;
    const dispatchableCount = activeReports.filter((report) => ['verified', 'transferred'].includes(report.status)).length;

    const closeMapSummaryPanel = useCallback((options = {}) => {
        setSelectedActiveIncidentId('');
        setMapSummaryPanel('');
        if (!options.preserveNavigation && ['incidents', 'zones'].includes(activePanel)) {
            setSearchParams({ view: 'map' });
        }
    }, [activePanel, setMapSummaryPanel, setSearchParams]);

    const openMapSummaryPanel = useCallback((panel) => {
        setSelectedActiveIncidentId('');
        setMapSummaryPanel(panel);
    }, [setMapSummaryPanel]);

    const handleMapInspectorOpen = useCallback(() => {
        closeMapSummaryPanel();
    }, [closeMapSummaryPanel]);

    const metrics = isResponder
        ? [
            { label: 'Awaiting response', value: pendingReports.length, helper: 'Unassigned or transferred', icon: HiOutlineClock, onClick: () => { setResponderMapFilter('pending'); setShowMapPendingModal(true); } },
            { label: 'Active response', value: respondingReports.length, helper: 'Assigned incidents', icon: HiOutlineTruck, onClick: () => { setResponderMapFilter('responding'); setShowMapRespondingModal(true); } },
            { label: 'Resolved today', value: resolvedTodayReports.length, helper: 'Incidents you handled', icon: HiOutlineBadgeCheck, onClick: () => setShowMapResolvedModal(true) },
            { label: 'Risk zones', value: highRiskZones.length, helper: 'Mapped hazards', icon: HiOutlineLightningBolt, onClick: () => openMapSummaryPanel('zones') },
        ]
        : isAdmin
            ? [
                { label: 'Pending', value: pendingCount, helper: 'Awaiting review', icon: HiOutlineClock },
                { label: 'Verified / transferred', value: dispatchableCount, helper: 'Available for dispatch', icon: HiOutlineCheckCircle, onClick: () => openMapSummaryPanel('incidents') },
                { label: 'Responding', value: respondingCount, helper: 'Active field response', icon: HiOutlineTruck, onClick: () => setShowMapRespondingModal(true) },
                { label: 'Resolved today', value: resolvedTodayReports.length, helper: 'Closed incidents', icon: HiOutlineBadgeCheck, onClick: () => setShowMapResolvedModal(true) },
            ]
            : isReporter
                ? [
                    { label: 'My pending', value: roleStats?.myReports?.pending || 0, helper: 'Waiting for review', icon: HiOutlineClock },
                    { label: 'My verified', value: roleStats?.myReports?.verified || 0, helper: 'Approved submissions', icon: HiOutlineCheckCircle },
                    { label: 'My resolved', value: roleStats?.myReports?.resolved || 0, helper: 'Closed submissions', icon: HiOutlineBadgeCheck },
                    { label: 'Trust points', value: roleStats?.trustPoints || 0, helper: 'Reporter standing', icon: HiOutlineShieldCheck },
                ]
                : [
                {
                    label: 'Active incidents',
                    value: activeReports.length,
                    helper: activeReports.length === activeLocationCount
                        ? 'Visible map reports'
                        : `Across ${activeLocationCount} map locations`,
                    icon: HiOutlineCheckCircle,
                    onClick: () => openMapSummaryPanel('incidents'),
                },
                { label: 'Active response', value: respondingCount, helper: 'Being handled now', icon: HiOutlineTruck },
                { label: 'Transferred', value: transferredCount, helper: 'Forwarded to another area', icon: HiOutlineExclamation },
                { label: 'Risk zones', value: highRiskZones.length, helper: 'Mapped hazards', icon: HiOutlineLightningBolt, onClick: () => openMapSummaryPanel('zones') },
                ];

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
                        count={activeReports.length}
                        selected={mapSummaryPanel === 'incidents'}
                    />
                    <MapActionButton
                        onClick={() => openMapSummaryPanel('zones')}
                        icon={HiOutlineLightningBolt}
                        label="Risk zones"
                        count={highRiskZones.length}
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
                        {activeReports.length > activeLocationCount && (
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
                    {mapSummaryPanel && (
                        <MapOverlayPanel
                            id={MAP_SUMMARY_PANEL_ID}
                            title={selectedActiveIncident
                                ? 'Incident details'
                                : mapSummaryPanel === 'incidents'
                                    ? 'Active incidents'
                                    : 'High-risk zones'}
                            description={selectedActiveIncident
                                ? undefined
                                : mapSummaryPanel === 'incidents'
                                    ? `${activeReports.length} currently active`
                                    : `${highRiskZones.length} monitored ${highRiskZones.length === 1 ? 'zone' : 'zones'}`}
                            onClose={closeMapSummaryPanel}
                            closeLabel={mapSummaryPanel === 'zones' ? 'Close risk zones panel' : 'Close incidents panel'}
                            presentation="contextual"
                        >
                            {mapSummaryPanel === 'incidents' && selectedActiveIncident && (
                                <MapIncidentDetails
                                    report={selectedActiveIncident}
                                    viewerRole={user?.role || 'guest'}
                                    onLocate={locateActiveIncident}
                                />
                            )}
                            {mapSummaryPanel === 'incidents' && !selectedActiveIncident && (
                                <IncidentList
                                    reports={activeReports}
                                    emptyTitle="No active incidents"
                                    emptyDescription="There are no verified, transferred, or responding incidents on the map."
                                    onInspect={(report) => setSelectedActiveIncidentId(String(report._id || report.id))}
                                    onLocate={locateActiveIncident}
                                />
                            )}
                            {mapSummaryPanel === 'zones' && (
                                <RiskZoneList zones={highRiskZones} onLocate={locateZone} />
                            )}
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
                            key={metric.label}
                            {...metric}
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

            {showMapPendingModal && (
                <MapOverlayPanel
                    onClose={() => { setShowMapPendingModal(false); setResponderMapFilter('all'); }}
                    title="Awaiting response"
                    size={INCIDENT_PANEL_SIZE}
                >
                    <IncidentList
                        reports={pendingReports}
                        emptyTitle="No incidents awaiting response"
                        emptyDescription="All visible incidents are assigned or already resolved."
                        onLocate={(report) => locateReport(report, () => setShowMapPendingModal(false))}
                    />
                </MapOverlayPanel>
            )}

            {showMapRespondingModal && (
                <MapOverlayPanel
                    onClose={() => { setShowMapRespondingModal(false); setResponderMapFilter('all'); }}
                    title="Active responses"
                    size={INCIDENT_PANEL_SIZE}
                >
                    <IncidentList
                        reports={respondingReports}
                        emptyTitle="No active responses"
                        emptyDescription="No incidents are currently assigned or in responding state."
                        onLocate={(report) => locateReport(report, () => setShowMapRespondingModal(false))}
                    />
                </MapOverlayPanel>
            )}

            {showMapResolvedModal && (
                <MapOverlayPanel
                    onClose={() => setShowMapResolvedModal(false)}
                    title="Resolved today"
                    size={INCIDENT_PANEL_SIZE}
                >
                    <IncidentList
                        reports={resolvedTodayReports}
                        emptyTitle="No incidents resolved today"
                        emptyDescription="No resolved incidents are available for the current view."
                    />
                </MapOverlayPanel>
            )}
        </div>
    );
};

export default DashboardMapWorkspace;
