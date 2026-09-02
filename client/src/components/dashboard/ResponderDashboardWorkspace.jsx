import { Link } from '../../router';
import { resolveAssetUrl } from '../../utils/assets';
import { buildRiskZoneMapTarget, getRiskZoneId } from '../../utils/riskZoneNavigation';
import { getMapRiskTypeConfig } from '../../config/mapVisuals';
import Button from '../ui/Button';
import { Skeleton, SkeletonCard, SkeletonRow } from '../ui/Skeleton';
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

const DASHBOARD_CONTAINER_CLASS = 'mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5';
const PANEL_CLASS = 'rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90';

const toCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const DashboardEmptyState = ({ icon: Icon, title, description }) => (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
    </div>
);

const KpiCard = ({ stat, loading }) => {
    const isHighPriority = stat.priority === 'primary' || stat.priority === 'secondary';
    return (
        <article className="min-w-0">
            <Link
                to={stat.link}
                aria-label={`${stat.title}: ${loading ? 'loading' : stat.value}. ${stat.actionLabel}`}
                className="group block h-full min-h-[6.5rem] cursor-pointer bg-white p-4 sm:p-5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-[#0c1813]/90 dark:hover:bg-white/[0.02]"
            >
                <div className="flex items-start justify-between gap-3">
                    <p className={`font-display font-bold leading-none tracking-tight ${isHighPriority ? 'text-2xl sm:text-3xl text-gray-950 dark:text-white' : 'text-2xl text-gray-900 dark:text-gray-100'}`}>
                        {loading ? '...' : stat.value}
                    </p>
                    <HiOutlineArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-700 dark:text-gray-500 dark:group-hover:text-emerald-400"
                        aria-hidden="true"
                    />
                </div>
                <h2 className="mt-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {stat.title}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                    {stat.subtext}
                </p>
            </Link>
        </article>
    );
};

const ResponderDashboardSkeleton = () => (
    <div
        className={DASHBOARD_CONTAINER_CLASS}
        role="status"
        aria-live="polite"
        aria-label="Loading responder operations dashboard"
    >
        <span className="sr-only">Loading responder operations dashboard</span>
        <SkeletonCard className="h-20" />
        <div className="grid grid-cols-2 divide-y divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:rounded-2xl">
            {[0, 1, 2, 3].map((item) => (
                <div key={item} className="p-3 sm:p-4 min-h-[88px] sm:min-h-[104px] flex flex-col justify-between bg-white dark:bg-[#0c1813]/90">
                    <Skeleton variant="text" className="h-3 w-20 rounded" />
                    <Skeleton variant="text" className="h-7 w-12 rounded mt-1" />
                    <Skeleton variant="text" className="h-2.5 w-24 rounded mt-1 opacity-70" />
                </div>
            ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <SkeletonCard className="h-64 space-y-3">
                <Skeleton variant="text" className="h-4 w-44" />
                <SkeletonRow lines={2} className="px-0 py-2" />
                <SkeletonRow lines={2} className="px-0 py-2" />
            </SkeletonCard>
            <SkeletonCard className="h-64 space-y-3">
                <Skeleton variant="text" className="h-4 w-44" />
                <SkeletonRow lines={2} className="px-0 py-2" />
                <SkeletonRow lines={2} className="px-0 py-2" />
            </SkeletonCard>
        </div>
    </div>
);

const ResponderDashboardError = ({ message, onRetry }) => (
    <div className={`${DASHBOARD_CONTAINER_CLASS} rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/70 dark:bg-red-950/30`} role="alert">
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

const getSeverityBadgeConfig = (severity) => {
    switch (severity?.toLowerCase()) {
        case 'critical':
            return { label: 'Critical', dot: 'bg-red-500' };
        case 'high':
            return { label: 'High', dot: 'bg-orange-500' };
        case 'medium':
        case 'moderate':
            return { label: 'Medium', dot: 'bg-amber-500' };
        case 'low':
        default:
            return { label: 'Low', dot: 'bg-emerald-500' };
    }
};

const formatHazardType = (type) => getMapRiskTypeConfig(type).label.replace(/\b\w/g, (letter) => letter.toUpperCase());

const getAgencyBadge = (role, agency) => {
    if (role === 'municipal_admin') {
        return {
            label: 'Mun. Admin',
            dot: 'bg-indigo-500',
        };
    }
    const cleanAgency = (agency || '').toUpperCase();
    if (cleanAgency.includes('PNP') || cleanAgency.includes('POLICE')) {
        return {
            label: 'PNP Police',
            dot: 'bg-blue-500',
        };
    }
    if (cleanAgency.includes('BFP') || cleanAgency.includes('FIRE')) {
        return {
            label: 'BFP Fire',
            dot: 'bg-amber-500',
        };
    }
    if (cleanAgency.includes('SDH') || cleanAgency.includes('HOSPITAL') || cleanAgency.includes('HEALTH')) {
        return {
            label: 'SDH Health',
            dot: 'bg-emerald-500',
        };
    }
    return {
        label: agency === 'LGU' ? 'MDRRMO' : agency || 'Responder',
        dot: 'bg-orange-500',
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
            actionLabel: "View today's records",
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

    const sortedBarangays = [...reportsByBarangay].sort(
        (a, b) => toCount(b?.count) - toCount(a?.count),
    );

    const maxBarangayCount = sortedBarangays.reduce(
        (highest, report) => Math.max(highest, toCount(report?.count)),
        1,
    );

    return (
        <div className={DASHBOARD_CONTAINER_CLASS}>
            {/* Header Area */}
            <header className="flex flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-white/10 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Responder operations
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Operations dashboard
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl">
                        Operational readiness, barangay incident activity, and multi-agency coordination.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400" aria-label="Operational context">
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                            System active
                        </span>
                        <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">·</span>
                        <span>{agencyName} · {municipalityName}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center w-full lg:w-auto">
                    <Link
                        to="/admin/reports?view=dispatch-queue"
                        className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 w-full sm:w-auto"
                    >
                        <span>Dispatch Queue</span>
                        {availableIncidents > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-white/20 px-1.5 text-[10px] font-bold text-white" aria-label={`${availableIncidents} available incidents`}>
                                {availableIncidents}
                            </span>
                        )}
                        <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>

                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs font-semibold uppercase tracking-wider text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10 w-full sm:w-auto"
                    >
                        <HiOutlineMap className="h-4 w-4" aria-hidden="true" />
                        <span>Safety Map</span>
                    </Link>
                </div>
            </header>

            {error && (
                <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between" role="alert">
                    <span>{error}</span>
                    <Button size="sm" variant="dangerOutline" icon={HiOutlineRefresh} onClick={onRetry}>
                        Retry analytics
                    </Button>
                </div>
            )}

            {/* 1. Operational status strip */}
            <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-gray-200/90 bg-gray-200/90 shadow-2xs dark:border-white/10 dark:bg-white/10 xl:grid-cols-4 gap-px" aria-label="Operational status">
                {kpiCards.map((stat) => (
                    <KpiCard
                        key={stat.title}
                        stat={stat}
                        loading={loading}
                    />
                ))}
            </section>

            {/* 2 & 3: Two-Column Operational Layout */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                {/* 2. Barangay Incident Distribution & Hotspots Breakdown */}
                <section className={PANEL_CLASS} aria-labelledby="barangay-distribution-title">
                    <div className="flex flex-col items-start gap-2 border-b border-gray-200/80 pb-3 dark:border-white/10 xs:flex-row xs:items-center xs:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                            <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                            <div>
                                <h2 id="barangay-distribution-title" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                    Barangay distribution
                                </h2>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    Incident frequency across {municipalityName}
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {sortedBarangays.length} {sortedBarangays.length === 1 ? 'barangay' : 'barangays'}
                        </span>
                    </div>

                    <div className="mt-2 max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1 dark:divide-white/5">
                        {sortedBarangays.length === 0 ? (
                            <DashboardEmptyState
                                icon={HiOutlineTrendingUp}
                                title="No incident hotspots recorded"
                                description="No verified incidents have been reported for this municipality yet."
                            />
                        ) : (
                            sortedBarangays.map((item, idx) => {
                                const incidentCount = toCount(item?.count);
                                const injuredCount = toCount(item?.injured);
                                const fatalityCount = toCount(item?.fatalities);
                                const pct = Math.round((incidentCount / maxBarangayCount) * 100);
                                return (
                                    <div key={item?.barangay || idx} className="py-3">
                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                            <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                                                {item?.barangay || 'Unspecified barangay'}
                                            </p>

                                            <div className="flex shrink-0 items-center gap-2 text-xs">
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    {incidentCount} {incidentCount === 1 ? 'incident' : 'incidents'}
                                                </span>
                                                {injuredCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/90 bg-amber-50/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                                                        {injuredCount} inj.
                                                    </span>
                                                )}
                                                {fatalityCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 rounded-md border border-red-200/90 bg-red-50/80 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                                                        {fatalityCount} fatal
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5" role="img" aria-label={`${item?.barangay || 'Unspecified barangay'}: ${incidentCount} ${incidentCount === 1 ? 'incident' : 'incidents'}`}>
                                            <div
                                                className="h-full rounded-full bg-brand-600 dark:bg-brand-500 transition-[width] duration-500"
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
                <section className={PANEL_CLASS} aria-labelledby="hazard-watchlist-title">
                    <div className="flex flex-col items-start gap-2 border-b border-gray-200/80 pb-3 dark:border-white/10 xs:flex-row xs:items-center xs:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                            <HiOutlineShieldExclamation className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                            <div>
                                <h2 id="hazard-watchlist-title" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                    Hazard watchlist
                                </h2>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    Active road & environmental risks in {municipalityName}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/dashboard?view=map"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                            <span>Map view</span>
                            <HiOutlineExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>

                    <div className="mt-2 max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1 dark:divide-white/5">
                        {criticalZones.length === 0 ? (
                            <DashboardEmptyState
                                icon={HiOutlineShieldExclamation}
                                title="No critical or high-priority zones"
                                description="No active critical or high-severity zones are registered in this municipality."
                            />
                        ) : (
                            criticalZones.map((zone) => {
                                const sevConfig = getSeverityBadgeConfig(zone.severity);
                                return (
                                    <Link
                                        key={getRiskZoneId(zone) || zone.name}
                                        to={buildRiskZoneMapTarget(zone)}
                                        className="group block rounded-xl p-2.5 transition-colors hover:bg-gray-50/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/[0.02]"
                                        aria-label={`View ${zone.name || 'risk zone'} on map`}
                                    >
                                        <div className="flex flex-col items-start justify-between gap-2 xs:flex-row">
                                            <div className="min-w-0">
                                                <p className="truncate font-display text-xs font-bold text-gray-950 dark:text-white">
                                                    {zone.name}
                                                </p>
                                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                    {zone.barangay ? `Brgy. ${zone.barangay}` : municipalityName}
                                                    {zone.radius ? ` · ${zone.radius}m perimeter` : ''}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                                <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/90 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevConfig.dot}`} aria-hidden="true" />
                                                    <span>{sevConfig.label}</span>
                                                </span>
                                                <span className="inline-flex items-center rounded-md border border-gray-200/90 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                    {formatHazardType(zone.type)}
                                                </span>
                                            </div>
                                        </div>

                                        {zone.description && (
                                            <p className="mt-1.5 text-xs leading-relaxed text-gray-600 line-clamp-2 dark:text-gray-400">
                                                {zone.description}
                                            </p>
                                        )}
                                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:text-emerald-800 dark:text-emerald-400 dark:group-hover:text-emerald-300">
                                            View on map
                                            <HiOutlineArrowRight className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                                        </span>
                                    </Link>
                                );
                            })
                        )}
                    </div>
                </section>
            </div>

            {/* 4. Multi-Agency Readiness & On-Duty Units (Active Now) */}
            <section className={PANEL_CLASS} aria-labelledby="readiness-title">
                <div className="flex flex-col items-start gap-2 border-b border-gray-200/80 pb-3 dark:border-white/10 xs:flex-row xs:items-center xs:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                        <HiOutlineUsers className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <div>
                            <h2 id="readiness-title" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                Multi-agency readiness
                            </h2>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Online response units & coordination personnel
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                        <span className={`h-1.5 w-1.5 rounded-full ${operationalUsers.length > 0 ? 'bg-emerald-500' : 'bg-gray-400'}`} aria-hidden="true" />
                        {onlineUsersLoading && operationalUsers.length === 0 ? '...' : operationalUsers.length} online
                    </span>
                </div>

                <div className="mt-2">
                    {onlineUsersLoading && operationalUsers.length === 0 ? (
                        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading operational presence">
                            {[0, 1, 2].map((item) => (
                                <div key={item} className="py-2.5">
                                    <div className="h-4 w-2/3 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
                                    <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
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
                        <p className="py-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            No operational personnel currently online in {municipalityName}.
                        </p>
                    ) : (
                        <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3 divide-y divide-gray-100 dark:divide-white/5 sm:divide-y-0">
                            {operationalUsers.map((activeUser) => {
                                const agencyMeta = getAgencyBadge(activeUser.role, activeUser.agency);
                                return (
                                    <li
                                        key={activeUser.userId}
                                        className="flex items-center gap-3 py-2.5"
                                    >
                                        <div className="relative shrink-0">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-700 dark:bg-white/10 dark:text-gray-200">
                                                {activeUser.avatar ? (
                                                    <img
                                                        src={resolveAssetUrl(activeUser.avatar)}
                                                        alt=""
                                                        className="h-full w-full rounded-lg object-cover"
                                                    />
                                                ) : (
                                                    activeUser.name?.charAt(0).toUpperCase() || 'R'
                                                )}
                                            </div>
                                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#0c1813]"></span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold text-gray-950 dark:text-white">
                                                {activeUser.name}
                                            </p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/90 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${agencyMeta.dot}`} aria-hidden="true" />
                                                    {agencyMeta.label}
                                                </span>
                                                {activeUser.assignedMunicipality && (
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
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
                </div>
            </section>
        </div>
    );
};

export default ResponderDashboardWorkspace;
