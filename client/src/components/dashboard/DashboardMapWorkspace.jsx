import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
    HiOutlineBadgeCheck,
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
import MapView from '../map/MapView';
import Modal from '../ui/Modal';

const STATUS_CONFIG = {
    pending: { label: 'Pending', badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    verified: { label: 'Verified', badge: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
    transferred: { label: 'Transferred', badge: 'border-violet-200 bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
    responding: { label: 'Responding', badge: 'border-indigo-200 bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
    resolved: { label: 'Resolved', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    rejected: { label: 'Rejected', badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
};

const ZONE_CONFIG = {
    accident_prone: { label: 'Accident prone', badge: 'border-red-200 bg-red-50 text-red-700' },
    fire_hazard: { label: 'Fire hazard', badge: 'border-orange-200 bg-orange-50 text-orange-700' },
    landslide_prone: { label: 'Landslide prone', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
    flood_prone: { label: 'Flood prone', badge: 'border-blue-200 bg-blue-50 text-blue-700' },
};

const getCoordinates = (item) => {
    const lat = Number(item?.coordinates?.lat ?? item?.location?.coordinates?.[1] ?? item?.lat);
    const lng = Number(item?.coordinates?.lng ?? item?.location?.coordinates?.[0] ?? item?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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

const IncidentList = ({ reports, emptyTitle, emptyDescription, onLocate }) => {
    if (!reports.length) {
        return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <div className="max-h-[65vh] divide-y divide-gray-200 overflow-y-auto">
            {reports.map((report) => {
                const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                const coordinates = getCoordinates(report);
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
                            <p className="mt-1 text-xs text-gray-400">{report.municipalityName || 'Municipality unavailable'} · {formatDate(report.resolvedAt || report.createdAt)}</p>
                        </div>
                        {coordinates && onLocate && (
                            <button
                                type="button"
                                onClick={() => onLocate(report)}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
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

const RiskZoneList = ({ zones, onLocate }) => {
    if (!zones.length) {
        return <EmptyState title="No active risk zones" description="No high-risk areas are currently listed." />;
    }

    return (
        <div className="max-h-[65vh] divide-y divide-gray-200 overflow-y-auto">
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
                        {getCoordinates(zone) && (
                            <button
                                type="button"
                                onClick={() => onLocate(zone)}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
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
        <button type="button" onClick={onClick} className="rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2">
            {content}
        </button>
    ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4">{content}</div>
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
}) => {
    const roleLabel = isResponder
        ? `${user?.agency || 'Responder'} operations`
        : isAdmin
            ? 'Administrative map'
            : isReporter
                ? 'Reporter map'
                : 'Public safety map';

    const respondingCount = reports.filter((report) => report.status === 'responding').length;
    const transferredCount = reports.filter((report) => report.status === 'transferred').length;
    const pendingCount = reports.filter((report) => report.status === 'pending').length;
    const activeReports = reports.filter((report) => ['verified', 'transferred', 'responding'].includes(report.status));
    const dispatchableCount = reports.filter((report) => ['verified', 'transferred'].includes(report.status)).length;

    const metrics = isResponder
        ? [
            { label: 'Awaiting response', value: pendingReports.length, helper: 'Unassigned or transferred', icon: HiOutlineClock, onClick: () => { setResponderMapFilter('pending'); setShowMapPendingModal(true); } },
            { label: 'Active response', value: respondingReports.length, helper: 'Assigned incidents', icon: HiOutlineTruck, onClick: () => { setResponderMapFilter('responding'); setShowMapRespondingModal(true); } },
            { label: 'Resolved today', value: resolvedTodayReports.length, helper: 'Closed by your view', icon: HiOutlineBadgeCheck, onClick: () => setShowMapResolvedModal(true) },
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
                { label: 'Active incidents', value: activeReports.length, helper: 'Visible map reports', icon: HiOutlineCheckCircle, onClick: () => setShowIncidentModal(true) },
                { label: 'Active response', value: respondingCount, helper: 'Being handled now', icon: HiOutlineTruck },
                { label: 'Transferred', value: transferredCount, helper: 'Forwarded to another area', icon: HiOutlineExclamation },
                { label: 'Risk zones', value: highRiskZones.length, helper: 'Mapped hazards', icon: HiOutlineLightningBolt, onClick: () => setShowZoneModal(true) },
                ];

    const locateReport = (report, closeModal) => {
        const coordinates = getCoordinates(report);
        if (!coordinates) return;
        setSearchParams({ view: 'map', lat: coordinates.lat, lng: coordinates.lng, zoom: 17 });
        closeModal(false);
    };

    const locateZone = (zone) => {
        const coordinates = getCoordinates(zone);
        if (!coordinates) return;
        setSearchParams({ view: 'map', lat: coordinates.lat, lng: coordinates.lng, zoom: 16 });
        setShowZoneModal(false);
    };

    return (
        <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                        <HiOutlineMap className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{roleLabel}</p>
                        <h1 className="text-2xl font-display font-bold text-gray-900 sm:text-3xl">Incident map</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {isResponder
                                ? `Monitor and respond to incidents in ${user?.assignedMunicipality || 'your assigned area'}.`
                                : 'View verified incidents, active responses, and high-risk zones across Sibuyan Island.'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowIncidentModal(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 sm:flex-none">
                        <HiOutlineExclamation className="h-4 w-4" />
                        Incidents
                    </button>
                    <button type="button" onClick={() => setShowZoneModal(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 sm:flex-none">
                        <HiOutlineLightningBolt className="h-4 w-4" />
                        Risk zones
                    </button>
                    {isReporter && (
                        <Link to="/report" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 sm:w-auto">
                            <HiOutlinePlus className="h-4 w-4" />
                            Submit report
                        </Link>
                    )}
                </div>
            </header>

            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Map summary">
                {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </section>

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Live incident map">
                <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Live map</h2>
                        <p className="mt-0.5 text-xs text-gray-500">Map markers update automatically when report status changes.</p>
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

                <div className="relative h-[360px] sm:h-[480px] lg:h-[560px]">
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
                        enable3D
                        className="h-full w-full"
                        focusLocation={focusLocation}
                        showPending={isResponder || isAdmin}
                        filterStatus={(isResponder || isAdmin) ? responderMapFilter : null}
                        canRespond={isResponder}
                        onRespondToReport={isResponder ? handleMapRespond : null}
                        canResolve={isResponder}
                        canResolveReport={isResponder ? canCurrentResponderResolve : null}
                        onResolveReport={isResponder ? handleMapResolve : null}
                    />
                </div>
            </section>

            {!isAuthenticated && (
                <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Report incidents in your community</h2>
                        <p className="mt-1 text-sm text-gray-500">Create and verify a reporter account to submit incident reports.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/login" className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-400">Sign in</Link>
                        <Link to="/register" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Register</Link>
                    </div>
                </section>
            )}

            <Modal isOpen={showZoneModal} onClose={() => setShowZoneModal(false)} title="High-risk zones">
                <RiskZoneList zones={highRiskZones} onLocate={locateZone} />
            </Modal>

            <Modal isOpen={showIncidentModal} onClose={() => setShowIncidentModal(false)} title="Active incidents">
                <IncidentList
                    reports={activeReports}
                    emptyTitle="No active incidents"
                    emptyDescription="There are no verified, transferred, or responding incidents on the map."
                    onLocate={(report) => locateReport(report, setShowIncidentModal)}
                />
            </Modal>

            <Modal
                isOpen={showMapPendingModal}
                onClose={() => { setShowMapPendingModal(false); setResponderMapFilter('all'); }}
                title="Awaiting response"
            >
                <IncidentList
                    reports={pendingReports}
                    emptyTitle="No incidents awaiting response"
                    emptyDescription="All visible incidents are assigned or already resolved."
                    onLocate={(report) => locateReport(report, setShowMapPendingModal)}
                />
            </Modal>

            <Modal
                isOpen={showMapRespondingModal}
                onClose={() => { setShowMapRespondingModal(false); setResponderMapFilter('all'); }}
                title="Active responses"
            >
                <IncidentList
                    reports={respondingReports}
                    emptyTitle="No active responses"
                    emptyDescription="No incidents are currently assigned or in responding state."
                    onLocate={(report) => locateReport(report, setShowMapRespondingModal)}
                />
            </Modal>

            <Modal isOpen={showMapResolvedModal} onClose={() => setShowMapResolvedModal(false)} title="Resolved today">
                <IncidentList
                    reports={resolvedTodayReports}
                    emptyTitle="No incidents resolved today"
                    emptyDescription="No resolved incidents are available for the current view."
                />
            </Modal>
        </div>
    );
};

export default DashboardMapWorkspace;
