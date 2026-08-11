import { Link } from '../../router';
import { resolveAssetUrl } from '../../utils/assets';
import { buildRiskZoneMapTarget, getRiskZoneId } from '../../utils/riskZoneNavigation';
import { getMapRiskTypeConfig } from '../../config/mapVisuals';
import Button from '../ui/Button';
import {
    HiOutlineShieldExclamation,
    HiOutlineLocationMarker,
    HiOutlineExclamation,
    HiOutlineMap,
    HiOutlineArrowRight,
    HiOutlineExternalLink,
    HiOutlineUsers,
    HiOutlineTrendingUp,
    HiOutlineRefresh,
} from 'react-icons/hi';

const DASHBOARD_CONTAINER_CLASS = 'mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden';
const PANEL_CLASS = 'rounded-sm border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900';
const KPI_DIVIDER_CLASSES = [
    '',
    'border-l border-gray-300 dark:border-gray-700',
    'border-t border-gray-300 dark:border-gray-700 xl:border-l xl:border-t-0',
    'border-l border-t border-gray-300 dark:border-gray-700 xl:border-t-0',
];

const toCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const DashboardEmptyState = ({ icon: Icon, title, description }) => (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">{title}</p>
        <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
    </div>
);

const KpiCard = ({ stat, loading, dividerClass }) => {
    return (
        <article className={`min-w-0 ${dividerClass}`}>
            <Link
                to={stat.link}
                aria-label={`${stat.title}: ${loading ? 'loading' : stat.value}. ${stat.actionLabel}`}
                className="group block h-full min-h-[6.5rem] cursor-pointer bg-white px-4 py-4 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
                <div className="flex items-start justify-between gap-3">
                    <p className="text-3xl font-bold leading-none tracking-tight text-gray-900 dark:text-white">
                        {loading ? '...' : stat.value}
                    </p>
                    <HiOutlineArrowRight
                        className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gray-600 group-focus-visible:text-brand-700 dark:text-gray-600 dark:group-hover:text-gray-300 dark:group-focus-visible:text-emerald-400"
                        aria-hidden="true"
                    />
                </div>
                <h2 className="mt-3 text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                    {stat.title}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {stat.subtext}
                </p>
            </Link>
        </article>
    );
};

const ResponderDashboardSkeleton = () => (
    <div
        className={`${DASHBOARD_CONTAINER_CLASS} space-y-4 animate-pulse`}
        role="status"
        aria-live="polite"
        aria-label="Loading responder operations dashboard"
    >
        <span className="sr-only">Loading responder operations dashboard</span>
        <div className="h-20 rounded-lg bg-gray-100 dark:bg-gray-900" />
        <div className="grid grid-cols-2 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
                <div key={item} className={`h-24 bg-gray-50 dark:bg-gray-900 ${KPI_DIVIDER_CLASSES[item]}`} />
            ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <div className="h-56 rounded-lg bg-gray-100 dark:bg-gray-900" />
            <div className="h-48 rounded-lg bg-gray-100 dark:bg-gray-900" />
        </div>
    </div>
);

const ResponderDashboardError = ({ message, onRetry }) => (
    <div className={`${DASHBOARD_CONTAINER_CLASS} rounded-lg border border-red-200 bg-red-50 p-5 text-center dark:border-red-900/70 dark:bg-red-950/30`} role="alert">
        <HiOutlineExclamation className="mx-auto h-10 w-10 text-red-600 dark:text-red-400" aria-hidden="true" />
        <h1 className="mt-3 font-display text-xl font-bold text-gray-950 dark:text-white">
            Responder dashboard unavailable
        </h1>
        <p className="mx-auto mt-1 max-w-lg text-sm text-red-800 dark:text-red-300">{message}</p>
        <Button className="mt-5" variant="dangerOutline" icon={HiOutlineRefresh} onClick={onRetry}>
            Try again
        </Button>
    </div>
);

const getSeverityBadgeClass = (severity) => {
    switch (severity?.toLowerCase()) {
        case 'critical':
            return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60';
        case 'high':
            return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60';
        case 'medium':
            return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
        case 'low':
        default:
            return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
};

const formatHazardType = (type) => getMapRiskTypeConfig(type).label.replace(/\b\w/g, (letter) => letter.toUpperCase());

const getAgencyBadge = (role, agency) => {
    if (role === 'municipal_admin') {
        return {
            label: 'Mun. Admin',
            badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
        };
    }
    const cleanAgency = (agency || '').toUpperCase();
    if (cleanAgency.includes('PNP') || cleanAgency.includes('POLICE')) {
        return {
            label: 'PNP Police',
            badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
        };
    }
    if (cleanAgency.includes('BFP') || cleanAgency.includes('FIRE')) {
        return {
            label: 'BFP Fire',
            badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
        };
    }
    if (cleanAgency.includes('SDH') || cleanAgency.includes('HOSPITAL') || cleanAgency.includes('HEALTH')) {
        return {
            label: 'SDH Health',
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
        };
    }
    return {
        label: agency === 'LGU' ? 'MDRRMO' : agency || 'Responder',
        badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60',
    };
};

const ResponderDashboardWorkspace = ({
    user,
    stats,
    onlineUsers = [],
    loading = false,
    error = '',
    onRetry,
    onlineUsersLoading = false,
    onlineUsersError = '',
    onRetryOnlineUsers,
}) => {
    const municipalityName = user?.assignedMunicipality || 'Sibuyan Island';
    const agencyName = user?.agency === 'LGU' ? 'MDRRMO' : user?.agency || 'Responder Unit';

    const activeEmergencies = toCount(stats?.activeIncidents);
    const availableIncidents = toCount(stats?.availableIncidents);
    const myDeployments = toCount(stats?.myActiveDeployments);
    const resolvedToday = toCount(stats?.resolvedToday);
    const activeRiskZones = toCount(stats?.activeRiskZones);
    const reportsByBarangay = Array.isArray(stats?.reportsByBarangay) ? stats.reportsByBarangay : [];
    const criticalZones = Array.isArray(stats?.criticalHighRiskZones) ? stats.criticalHighRiskZones : [];
    const operationalUsers = Array.isArray(onlineUsers)
        ? onlineUsers.filter((activeUser) => (
            activeUser?.userId
            && ['municipal_admin', 'responder'].includes(activeUser.role)
        ))
        : [];

    if (loading && !stats) return <ResponderDashboardSkeleton />;
    if (error && !stats) return <ResponderDashboardError message={error} onRetry={onRetry} />;

    const kpiCards = [
        {
            title: 'Active emergencies',
            value: activeEmergencies,
            subtext: 'Verified, transferred & responding',
            link: '/admin/reports?view=active-incidents',
            actionLabel: 'View municipal incidents',
            priority: 'primary',
        },
        {
            title: 'My active responses',
            value: myDeployments,
            subtext: 'Missions assigned to your unit',
            link: '/admin/reports?view=active-responses',
            actionLabel: 'Open my responses',
            priority: 'secondary',
        },
        {
            title: 'Resolved today',
            value: resolvedToday,
            subtext: 'Completed missions today',
            link: '/accident-history?date=today',
            actionLabel: 'View today\'s records',
            priority: 'quiet',
        },
        {
            title: 'Monitored risk zones',
            value: activeRiskZones,
            subtext: 'Active hazard zones in municipality',
            link: '/dashboard?view=map',
            actionLabel: 'Review safety map',
            priority: 'quiet',
        },
    ];

    const maxBarangayCount = reportsByBarangay.reduce(
        (highest, report) => Math.max(highest, toCount(report?.count)),
        1,
    );

    return (
        <div className={`${DASHBOARD_CONTAINER_CLASS} space-y-5 sm:space-y-6`}>
            {/* Header Area */}
            <header className="flex min-w-0 flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-gray-800 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Responder operations
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                        Operations dashboard
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
                        Operational readiness, barangay incident activity, and multi-agency coordination.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400" aria-label="Operational context">
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                            System active
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{agencyName} · {municipalityName}</span>
                    </div>
                </div>

                {/* Quick Launch Buttons */}
                <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 lg:w-auto lg:grid-flow-col lg:auto-cols-max lg:grid-cols-none">
                    <Button
                        as={Link}
                        to="/admin/reports?view=dispatch-queue"
                        fullWidth
                        className="!rounded-sm min-h-[42px] font-bold uppercase tracking-wider text-[11px] !bg-gray-900 !text-white hover:!bg-gray-800 dark:!bg-gray-800 dark:hover:!bg-gray-700"
                    >
                        <span>Dispatch Queue</span>
                        {availableIncidents > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-white px-1.5 text-[10px] font-bold text-gray-900" aria-label={`${availableIncidents} available incidents`}>
                                {availableIncidents}
                            </span>
                        )}
                        <HiOutlineArrowRight className="ml-0.5 h-4 w-4" aria-hidden="true" />
                    </Button>

                    <Button
                        as={Link}
                        to="/dashboard?view=map"
                        variant="secondary"
                        fullWidth
                        icon={HiOutlineMap}
                        className="!rounded-sm border-2 border-gray-300 dark:border-gray-600 min-h-[42px] font-bold uppercase tracking-wider text-[11px]"
                    >
                        <span>Safety Map</span>
                    </Button>
                </div>
            </header>

            {error && (
                <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between" role="alert">
                    <span>{error}</span>
                    <Button size="sm" variant="dangerOutline" icon={HiOutlineRefresh} onClick={onRetry}>
                        Retry analytics
                    </Button>
                </div>
            )}

            {/* 1. Operational status strip */}
            <section className="grid grid-cols-2 overflow-hidden rounded-sm border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900 xl:grid-cols-4" aria-label="Operational status">
                {kpiCards.map((stat, idx) => (
                    <KpiCard
                        key={stat.title}
                        stat={stat}
                        loading={loading}
                        dividerClass={KPI_DIVIDER_CLASSES[idx]}
                    />
                ))}
            </section>

            {/* 2 & 3: Two-Column Operational Layout */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                {/* 2. Barangay Incident Distribution & Hotspots Breakdown */}
                <section className={`${PANEL_CLASS} w-full p-4`} aria-labelledby="barangay-distribution-title">
                    <div className="flex flex-col items-start gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 xs:flex-row xs:items-center xs:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                            <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                            <div>
                                <h2 id="barangay-distribution-title" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                    Barangay distribution
                                </h2>
                                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Incident frequency across {municipalityName}
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {reportsByBarangay.length} {reportsByBarangay.length === 1 ? 'barangay' : 'barangays'}
                        </span>
                    </div>

                    <div className="mt-1 max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1 dark:divide-gray-800">
                        {reportsByBarangay.length === 0 ? (
                            <DashboardEmptyState
                                icon={HiOutlineTrendingUp}
                                title="No incident hotspots recorded"
                                description="No verified incidents have been reported for this municipality yet."
                            />
                        ) : (
                            reportsByBarangay.map((item, idx) => {
                                const incidentCount = toCount(item?.count);
                                const injuredCount = toCount(item?.injured);
                                const fatalityCount = toCount(item?.fatalities);
                                const pct = Math.round((incidentCount / maxBarangayCount) * 100);
                                return (
                                    <div key={item?.barangay || idx} className="py-3">
                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                                                    {item?.barangay || 'Unspecified barangay'}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs">
                                                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                                    {incidentCount} {incidentCount === 1 ? 'incident' : 'incidents'}
                                                </span>
                                                {injuredCount > 0 && (
                                                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                                                        {injuredCount} inj.
                                                    </span>
                                                )}
                                                {fatalityCount > 0 && (
                                                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60">
                                                        {fatalityCount} fatal
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="h-1 w-full overflow-hidden bg-gray-100 dark:bg-gray-800" role="img" aria-label={`${item?.barangay || 'Unspecified barangay'}: ${incidentCount} ${incidentCount === 1 ? 'incident' : 'incidents'}`}>
                                            <div
                                                className="h-full bg-gray-700 transition-[width] duration-500 dark:bg-gray-300"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>

                {/* 3. Critical High-Risk Zones Watchlist (Hazard Watch) */}
                <section className={`${PANEL_CLASS} w-full p-4`} aria-labelledby="hazard-watchlist-title">
                    <div className="flex flex-col items-start gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 xs:flex-row xs:items-center xs:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                            <HiOutlineShieldExclamation className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                            <div>
                                <h2 id="hazard-watchlist-title" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                    Hazard watchlist
                                </h2>
                                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Active road & environmental risks in {municipalityName}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/dashboard?view=map"
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                            <span>Map view</span>
                            <HiOutlineExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>

                    <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1 dark:divide-gray-800">
                        {criticalZones.length === 0 ? (
                            <DashboardEmptyState
                                icon={HiOutlineShieldExclamation}
                                title="No critical or high-priority zones"
                                description="No active critical or high-severity zones are registered in this municipality."
                            />
                        ) : (
                            criticalZones.map((zone) => (
                                <Link
                                    key={getRiskZoneId(zone) || zone.name}
                                    to={buildRiskZoneMapTarget(zone)}
                                    className="group block rounded-lg px-2 py-3 transition-colors duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:hover:bg-gray-800/60 dark:focus-visible:ring-emerald-500"
                                    aria-label={`View ${zone.name || 'risk zone'} on map`}
                                >
                                    <div className="flex flex-col items-start justify-between gap-2 xs:flex-row">
                                        <div className="min-w-0">
                                            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                                {zone.name}
                                            </p>
                                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                {zone.barangay ? `Brgy. ${zone.barangay}` : municipalityName}
                                                {zone.radius ? ` · ${zone.radius}m perimeter` : ''}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getSeverityBadgeClass(zone.severity)}`}>
                                                {zone.severity || 'Medium'}
                                            </span>
                                            <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                                {formatHazardType(zone.type)}
                                            </span>
                                        </div>
                                    </div>

                                    {zone.description && (
                                        <p className="mt-2 text-xs leading-relaxed text-gray-600 line-clamp-2 dark:text-gray-400">
                                            {zone.description}
                                        </p>
                                    )}
                                    <span className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-semibold text-brand-700 group-hover:text-brand-800 dark:text-emerald-400 dark:group-hover:text-emerald-300">
                                        View on map
                                        <HiOutlineArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                </section>
            </div>

            {/* 4. Multi-Agency Readiness & On-Duty Units (Active Now) */}
            <section className={`${PANEL_CLASS} p-4`} aria-labelledby="readiness-title">
                <div className="mb-3 flex flex-col items-start gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 xs:flex-row xs:items-center xs:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                        <HiOutlineUsers className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                        <div>
                            <h2 id="readiness-title" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                Multi-agency readiness
                            </h2>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Online response units & coordination personnel
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                        {onlineUsersLoading && operationalUsers.length === 0 ? '...' : operationalUsers.length} online
                    </span>
                </div>

                {onlineUsersLoading && operationalUsers.length === 0 ? (
                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading operational presence">
                        {[0, 1, 2].map((item) => (
                            <div key={item} className="border-t border-gray-100 py-3 dark:border-gray-800">
                                <div className="h-4 w-2/3 animate-pulse bg-gray-100 dark:bg-gray-800" />
                                <div className="mt-2 h-3 w-1/3 animate-pulse bg-gray-100 dark:bg-gray-800" />
                            </div>
                        ))}
                    </div>
                ) : onlineUsersError ? (
                    <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between" role="alert">
                        <p className="text-sm text-red-700 dark:text-red-300">{onlineUsersError}</p>
                        <Button size="sm" variant="dangerOutline" icon={HiOutlineRefresh} onClick={onRetryOnlineUsers}>
                            Retry presence
                        </Button>
                    </div>
                ) : operationalUsers.length === 0 ? (
                    <p className="py-2 text-sm text-gray-600 dark:text-gray-400">
                        No operational personnel currently online in {municipalityName}.
                    </p>
                ) : (
                    <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                        {operationalUsers.map((activeUser) => {
                            const agencyMeta = getAgencyBadge(activeUser.role, activeUser.agency);
                            return (
                                <li
                                    key={activeUser.userId}
                                    className="flex items-center gap-3 border-t border-gray-100 py-3 dark:border-gray-800"
                                >
                                    <div className="relative shrink-0">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-white dark:bg-gray-600">
                                            {activeUser.avatar ? (
                                                <img
                                                    src={resolveAssetUrl(activeUser.avatar)}
                                                    alt=""
                                                    className="h-full w-full rounded-full object-cover"
                                                />
                                            ) : (
                                                activeUser.name?.charAt(0).toUpperCase() || 'R'
                                            )}
                                        </div>
                                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-gray-900"></span>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                            {activeUser.name}
                                        </p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${agencyMeta.badgeClass}`}>
                                                {agencyMeta.label}
                                            </span>
                                            {activeUser.assignedMunicipality && (
                                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                                    · {activeUser.assignedMunicipality}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default ResponderDashboardWorkspace;
