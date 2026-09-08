import { Link } from '../../router';
import { buildRiskZoneMapTarget, getRiskZoneId } from '../../utils/riskZoneNavigation';
import { getMapRiskTypeConfig } from '../../config/mapVisuals';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import Button from '../ui/Button';
import { Skeleton, SkeletonCard, SkeletonRow } from '../ui/Skeleton';
import {
    HiOutlineShieldExclamation,
    HiOutlineExclamation,
    HiOutlineMap,
    HiOutlineArrowRight,
    HiOutlineExternalLink,
    HiOutlineTrendingUp,
    HiOutlineRefresh,
} from 'react-icons/hi';

const DASHBOARD_CONTAINER_CLASS = 'mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5';
const PANEL_CLASS = 'rounded-lg border border-gray-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-[#0c1813]/90';

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
                    <p className={`font-display font-bold leading-none tabular-nums tracking-tight ${isHighPriority ? 'text-2xl sm:text-3xl text-gray-950 dark:text-white' : 'text-2xl text-gray-900 dark:text-gray-100'}`}>
                        {loading ? '...' : stat.value}
                    </p>
                    <HiOutlineArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600"
                        aria-hidden="true"
                    />
                </div>
                <h2 className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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

const ResponderDashboardWorkspace = ({
    user,
    stats,
    loading = false,
    error = '',
    onRetry,
}) => {
    const municipalityName = user?.assignedMunicipality || 'Sibuyan Island';
    const agencyName = user?.agency === 'LGU' ? 'MDRRMO' : user?.agency || 'Responder Unit';
    const { isDegraded: systemDegraded } = useSystemHealth();

    const activeEmergencies = toCount(stats?.activeIncidents);
    const availableIncidents = toCount(stats?.availableIncidents);
    const myDeployments = toCount(stats?.myActiveDeployments);
    const resolvedToday = toCount(stats?.resolvedToday);
    const activeRiskZones = toCount(stats?.activeRiskZones);
    const reportsByBarangay = Array.isArray(stats?.reportsByBarangay) ? stats.reportsByBarangay : [];
    const criticalZones = Array.isArray(stats?.criticalHighRiskZones) ? stats.criticalHighRiskZones : [];

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
            subtext: `Resolved in ${municipalityName} today`,
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
                        Barangay incident activity and hazard monitoring.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400" aria-label="Operational context">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${systemDegraded ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${systemDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                            {systemDegraded ? 'System degraded' : 'System active'}
                        </span>
                        <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">·</span>
                        <span>{agencyName} · {municipalityName}</span>
                    </div>
                </div>

                {/* Actions: one row on all screens */}
                <div className="flex flex-row items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
                    <Link
                        to="/admin/reports?view=dispatch-queue"
                        className="inline-flex h-9 min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none sm:gap-2 sm:px-4"
                    >
                        <span>Dispatch queue</span>
                        {availableIncidents > 0 && (
                            <span className="tabular-nums text-xs font-bold text-white/90" aria-label={`${availableIncidents} available incidents`}>
                                {availableIncidents}
                            </span>
                        )}
                        <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>

                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex h-9 min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none sm:px-3.5 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                    >
                        <HiOutlineMap className="h-4 w-4" aria-hidden="true" />
                        <span>Safety map</span>
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

            {/* 1. Operational status strip: spacing-led stats, no container box */}
            <section className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-gray-200 py-2 sm:grid-cols-4 dark:border-white/10 xl:grid-cols-4" aria-label="Operational status">
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
                    <div className="flex flex-col items-start gap-2 border-b border-gray-200 pb-3 dark:border-white/10 xs:flex-row xs:items-center xs:justify-between">
                        <div className="min-w-0">
                            <h2 id="barangay-distribution-title" className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Barangay distribution
                            </h2>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Incident frequency across {municipalityName}
                            </p>
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
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                        {injuredCount} inj.
                                                    </span>
                                                )}
                                                {fatalityCount > 0 && (
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
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
                    <div className="flex flex-col items-start gap-2 border-b border-gray-200 pb-3 dark:border-white/10 xs:flex-row xs:items-center xs:justify-between">
                        <div className="min-w-0">
                            <h2 id="hazard-watchlist-title" className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Hazard watchlist
                            </h2>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Active road & environmental risks in {municipalityName}
                            </p>
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
                                        className="group block py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/[0.02]"
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

                                            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevConfig.dot}`} aria-hidden="true" />
                                                    <span>{sevConfig.label}</span>
                                                </span>
                                                <span>{formatHazardType(zone.type)}</span>
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
        </div>
    );
};

export default ResponderDashboardWorkspace;
