import { useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
    HiOutlineBadgeCheck,
    HiOutlineArrowLeft,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
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
import { MAP_FOCUS_PRESETS, scheduleElementScroll } from '../../utils/mapNavigation';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';

const STATUS_CONFIG = MAP_STATUS_CONFIG;
const INCIDENT_PANEL_SIZE = 'lg';

const ZONE_CONFIG = {
    accident_prone: { label: 'Accident prone', badge: 'border-red-200 bg-red-50 text-red-700' },
    fire_hazard: { label: 'Fire hazard', badge: 'border-orange-200 bg-orange-50 text-orange-700' },
    landslide_prone: { label: 'Landslide prone', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
    flood_prone: { label: 'Flood prone', badge: 'border-blue-200 bg-blue-50 text-blue-700' },
};

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
        <div className="divide-y divide-gray-200">
            {reports.map((report) => {
                const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                const coordinates = getMapCoordinates(report);
                return (
                    <article key={report._id} className="flex flex-col gap-3 px-1 py-4 first:pt-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-gray-900">{formatIncidentType(report)}</h4>
                                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${status.badge}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                                    {status.label}
                                </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-gray-600">{report.address || report.barangay || report.municipalityName || 'Location unavailable'}</p>
                            {onInspect && (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                                    {report.description?.trim() || 'No additional public details were provided.'}
                                </p>
                            )}
                            <p className="mt-1 text-xs text-gray-400">{report.municipalityName || 'Municipality unavailable'} · {formatDate(report.resolvedAt || report.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                            {onInspect && (
                                <button
                                    type="button"
                                    onClick={() => onInspect(report)}
                                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none"
                                >
                                    View details
                                </button>
                            )}
                            {coordinates && onLocate && (
                                <button
                                    type="button"
                                    onClick={() => onLocate(report)}
                                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-none"
                                >
                                    <HiOutlineLocationMarker className="h-4 w-4" aria-hidden="true" />
                                    Locate
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
        <div className="divide-y divide-gray-200">
            {zones.map((zone) => {
                const config = ZONE_CONFIG[zone.type] || { label: 'Risk zone', badge: 'border-gray-200 bg-gray-50 text-gray-700' };
                return (
                    <article key={zone._id} className="flex flex-col gap-3 px-1 py-4 first:pt-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-gray-900">{zone.name || 'Unnamed zone'}</h4>
                                <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${config.badge}`}>{config.label}</span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600">{zone.description || zone.address || 'No description provided'}</p>
                            <p className="mt-1 text-xs text-gray-400">{zone.municipality || zone.municipalityName || 'Municipality unavailable'} · {zone.radius || 0} m radius</p>
                        </div>
                        {getMapCoordinates(zone) && (
                            <button
                                type="button"
                                onClick={() => onLocate(zone)}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-200 hover:text-gray-900"
                            >
                                <HiOutlineLocationMarker className="h-4 w-4" />
                                Locate
                            </button>
                        )}
                    </article>
                );
            })}
        </div>
    );
};

const MapActionButton = ({ onClick, icon: Icon, iconClassName, label, count, countClassName }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="group inline-flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border border-transparent bg-gray-100 px-3.5 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.97] dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10 lg:w-auto lg:shrink-0"
    >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${iconClassName}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 whitespace-nowrap text-left">{label}</span>
        <span aria-hidden="true" className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold ${countClassName}`}>
            {count}
        </span>
    </button>
);

const MetricCard = ({ label, value, helper, icon: Icon, onClick }) => {
    const content = (
        <>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <Icon className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
            <p className="mt-1 text-[11px] text-gray-400">{helper}</p>
        </>
    );

    return onClick ? (
        <button
            type="button"
            onClick={onClick}
            className="rounded-xl border border-transparent bg-gray-100 p-4 text-left shadow-sm transition hover:bg-gray-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
            {content}
        </button>
    ) : (
        <div className="rounded-xl border border-transparent bg-gray-100 p-4 shadow-sm">{content}</div>
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
    onReturnToReport,
    responderMapFilter,
    setResponderMapFilter,
    canCurrentResponderResolve,
    handleMapRespond,
    handleMapResolve,
    setSearchParams,
    showZoneModal,
    setShowZoneModal,
    showIncidentModal,
    setShowIncidentModal,
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
    const createFocusRequestId = () => {
        focusRequestSequenceRef.current += 1;
        return `${Date.now()}-${focusRequestSequenceRef.current}`;
    };
    const scrollMapIntoView = () => {
        mapScrollCleanupRef.current?.();
        mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current);
    };

    useEffect(() => {
        if (!focusLocation?.requestId) return undefined;
        mapScrollCleanupRef.current?.();
        mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current, { delay: 180 });
        return () => mapScrollCleanupRef.current?.();
    }, [focusLocation?.requestId]);

    const roleLabel = isResponder
        ? `${user?.agency || 'Responder'} operations`
        : isAdmin
            ? 'Administrative map'
            : isReporter
                ? 'Reporter map'
                : 'Public safety map';

    const pageTitle = isResponder
        ? `${user?.assignedMunicipality || 'Area'} incident map`
        : isAdmin
            ? 'Administrative map'
            : 'Incident map';

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

    const metrics = isResponder
        ? [
            { label: 'Awaiting response', value: pendingReports.length, helper: 'Unassigned or transferred', icon: HiOutlineClock, onClick: () => { setResponderMapFilter('pending'); setShowMapPendingModal(true); } },
            { label: 'Active response', value: respondingReports.length, helper: 'Assigned incidents', icon: HiOutlineTruck, onClick: () => { setResponderMapFilter('responding'); setShowMapRespondingModal(true); } },
            { label: 'Resolved today', value: resolvedTodayReports.length, helper: 'Incidents you handled', icon: HiOutlineBadgeCheck, onClick: () => setShowMapResolvedModal(true) },
            { label: 'Risk zones', value: highRiskZones.length, helper: 'Mapped hazards', icon: HiOutlineLightningBolt, onClick: () => setShowZoneModal(true) },
        ]
        : isAdmin
            ? [
                { label: 'Pending', value: pendingCount, helper: 'Awaiting review', icon: HiOutlineClock },
                { label: 'Verified / transferred', value: dispatchableCount, helper: 'Available for dispatch', icon: HiOutlineCheckCircle, onClick: () => setShowIncidentModal(true) },
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
                    onClick: () => setShowIncidentModal(true),
                },
                { label: 'Active response', value: respondingCount, helper: 'Being handled now', icon: HiOutlineTruck },
                { label: 'Transferred', value: transferredCount, helper: 'Forwarded to another area', icon: HiOutlineExclamation },
                { label: 'Risk zones', value: highRiskZones.length, helper: 'Mapped hazards', icon: HiOutlineLightningBolt, onClick: () => setShowZoneModal(true) },
                ];

    const locateReport = (report, closeModal) => {
        const coordinates = getMapCoordinates(report);
        if (!coordinates) return;
        // A top-down camera keeps the incident pin visually aligned with its
        // stored coordinates. The previous pitched, maximum-zoom view made the
        // pin appear offset and removed useful street-level context.
        setSearchParams({
            view: 'map',
            lat: coordinates.lat,
            lng: coordinates.lng,
            ...MAP_FOCUS_PRESETS.list,
            focus: createFocusRequestId(),
        });
        closeModal(false);
        scrollMapIntoView();
    };

    const locateZone = (zone) => {
        const coordinates = getMapCoordinates(zone);
        if (!coordinates) return;
        setSearchParams({
            view: 'map',
            lat: coordinates.lat,
            lng: coordinates.lng,
            ...MAP_FOCUS_PRESETS.list,
            focus: createFocusRequestId(),
        });
        setShowZoneModal(false);
        scrollMapIntoView();
    };

    const closeActiveIncidents = () => {
        setSelectedActiveIncidentId('');
        setShowIncidentModal(false);
        if (activePanel === 'incidents') setSearchParams({ view: 'map' });
    };

    const locateActiveIncident = (report) => {
        setSelectedActiveIncidentId('');
        locateReport(report, setShowIncidentModal);
    };

    return (
        <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white dark:bg-emerald-950 dark:text-emerald-300 dark:border dark:border-emerald-800/40">
                        <HiOutlineMap className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{roleLabel}</p>
                        <h1 className="text-2xl font-display font-bold text-gray-900 sm:text-3xl dark:text-white">{pageTitle}</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                            {isResponder
                                ? `Monitor and respond to incidents in ${user?.assignedMunicipality || 'your assigned area'}.`
                                : 'Verified incidents and high-risk zones across Sibuyan Island.'}
                        </p>
                    </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-nowrap lg:items-center lg:self-center">
                    <MapActionButton
                        onClick={() => setShowIncidentModal(true)}
                        icon={HiOutlineExclamation}
                        iconClassName="bg-red-100 text-red-600 group-hover:bg-red-200/70 dark:bg-red-900/40 dark:text-red-400"
                        label="Incidents"
                        count={activeReports.length}
                        countClassName="bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/40 dark:text-red-300"
                    />
                    <MapActionButton
                        onClick={() => setShowZoneModal(true)}
                        icon={HiOutlineLightningBolt}
                        iconClassName="bg-amber-100 text-amber-600 group-hover:bg-amber-200/70 dark:bg-amber-900/40 dark:text-amber-400"
                        label="Risk zones"
                        count={highRiskZones.length}
                        countClassName="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/40 dark:text-amber-300"
                    />
                    {isReporter && (
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

            <section ref={mapSectionRef} className="scroll-mt-20 overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Live incident map">
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
                    {(isResponder || isAdmin) && (
                        <div className="flex items-center gap-1 overflow-x-auto" aria-label="Map status filter">
                            {[
                                { value: 'all', label: 'All active' },
                                { value: 'pending', label: 'Awaiting' },
                                { value: 'responding', label: 'Responding' },
                            ].map((filter) => (
                                <button
                                    key={filter.value}
                                    type="button"
                                    onClick={() => setResponderMapFilter(filter.value)}
                                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${responderMapFilter === filter.value
                                        ? 'bg-gray-900 text-white'
                                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
                        className="h-full w-full"
                        focusLocation={focusLocation}
                        showPending={isResponder || isAdmin}
                        filterStatus={(isResponder || isAdmin) ? responderMapFilter : null}
                        canRespond={isResponder}
                        onRespondToReport={isResponder ? handleMapRespond : null}
                        canResolve={isResponder}
                        canResolveReport={isResponder ? canCurrentResponderResolve : null}
                        onResolveReport={isResponder ? handleMapResolve : null}
                        viewerRole={user?.role || 'guest'}
                        enable3D
                    />
                </div>
            </section>

            <section className="space-y-3" aria-label="Map summary">
                <div>
                    <h2 className="text-sm font-semibold text-gray-900">Current overview</h2>
                    <p className="mt-0.5 text-xs text-gray-500">Key incident and response totals for the current map view.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
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

            {showZoneModal && (
                <MapOverlayPanel onClose={() => setShowZoneModal(false)} title="High-risk zones">
                    <div className="px-4 py-2 sm:px-5">
                        <RiskZoneList zones={highRiskZones} onLocate={locateZone} />
                    </div>
                </MapOverlayPanel>
            )}

            {showIncidentModal && (
                <MapOverlayPanel
                    onClose={closeActiveIncidents}
                    title={selectedActiveIncident ? 'Incident details' : 'Active incidents'}
                    size={INCIDENT_PANEL_SIZE}
                >
                    {selectedActiveIncident ? (
                        <MapIncidentDetails
                            report={selectedActiveIncident}
                            viewerRole={user?.role || 'guest'}
                            onLocate={locateActiveIncident}
                        />
                    ) : (
                        <div className="px-4 py-2 sm:px-5">
                            <IncidentList
                                reports={activeReports}
                                emptyTitle="No active incidents"
                                emptyDescription="There are no verified, transferred, or responding incidents on the map."
                                onInspect={(report) => setSelectedActiveIncidentId(String(report._id || report.id))}
                                onLocate={locateActiveIncident}
                            />
                        </div>
                    )}
                </MapOverlayPanel>
            )}

            {showMapPendingModal && (
                <MapOverlayPanel
                    onClose={() => { setShowMapPendingModal(false); setResponderMapFilter('all'); }}
                    title="Awaiting response"
                    size={INCIDENT_PANEL_SIZE}
                >
                    <div className="px-4 py-2 sm:px-5">
                        <IncidentList
                            reports={pendingReports}
                            emptyTitle="No incidents awaiting response"
                            emptyDescription="All visible incidents are assigned or already resolved."
                            onLocate={(report) => locateReport(report, setShowMapPendingModal)}
                        />
                    </div>
                </MapOverlayPanel>
            )}

            {showMapRespondingModal && (
                <MapOverlayPanel
                    onClose={() => { setShowMapRespondingModal(false); setResponderMapFilter('all'); }}
                    title="Active responses"
                    size={INCIDENT_PANEL_SIZE}
                >
                    <div className="px-4 py-2 sm:px-5">
                        <IncidentList
                            reports={respondingReports}
                            emptyTitle="No active responses"
                            emptyDescription="No incidents are currently assigned or in responding state."
                            onLocate={(report) => locateReport(report, setShowMapRespondingModal)}
                        />
                    </div>
                </MapOverlayPanel>
            )}

            {showMapResolvedModal && (
                <MapOverlayPanel
                    onClose={() => setShowMapResolvedModal(false)}
                    title="Resolved today"
                    size={INCIDENT_PANEL_SIZE}
                >
                    <div className="px-4 py-2 sm:px-5">
                        <IncidentList
                            reports={resolvedTodayReports}
                            emptyTitle="No incidents resolved today"
                            emptyDescription="No resolved incidents are available for the current view."
                        />
                    </div>
                </MapOverlayPanel>
            )}
        </div>
    );
};

export default DashboardMapWorkspace;
