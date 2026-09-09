import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { adminAPI, analyticsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
    QUERY_CACHE_TTLS,
    getCachedData,
    getStaleData,
    setCachedData,
} from '../utils/queryCache';
import { formatIncidentRelativeTime } from '../utils/dateTimeUtils';
import {
    HiOutlineArrowRight,
    HiOutlineExclamation,
    HiOutlineRefresh,
} from 'react-icons/hi';
import { Skeleton, SkeletonCard, SkeletonRow } from '../components/ui/Skeleton';
import { useSystemHealth } from '../hooks/useSystemHealth';
import ResponderDashboardWorkspace from '../components/dashboard/ResponderDashboardWorkspace';

const DASHBOARD_CONTAINER_CLASS = 'mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5';
const PANEL_CLASS = 'rounded-lg border border-gray-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-[#0c1813]/90';
const SECTION_TITLE_CLASS = 'text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white';
const SECTION_META_CLASS = 'text-xs text-gray-500 dark:text-gray-400';

const MAX_ACTIVITY_ITEMS = 8;

const ACTIVITY_LABELS = {
    newReport: 'New report submitted',
    reportDeleted: 'Report removed',
    reportVerified: 'Report verified',
    reportResponded: 'Responder dispatched',
    reportResolved: 'Incident resolved',
    reportUpdatedByReporter: 'Reporter situation update',
    reportTransferred: 'Incident transferred',
    highRiskZoneCreated: 'High-risk zone created',
    highRiskZoneUpdated: 'High-risk zone updated',
    highRiskZoneDeleted: 'High-risk zone removed',
};

const AdminKpiCard = ({ stat, loading }) => (
    <article className="min-w-0 overflow-hidden rounded-lg border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90">
        <Link
            to={stat.link}
            aria-label={`${stat.title}: ${loading ? 'loading' : stat.value}. ${stat.actionLabel}`}
            className="group block h-full min-h-[6.5rem] cursor-pointer p-4 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/[0.02] sm:p-5"
        >
            <div className="flex items-start justify-between gap-3">
                <p className="font-display text-2xl font-bold leading-none tracking-tight text-gray-950 dark:text-white">
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

const STATUS_CONFIG = {
    pending: { label: 'Pending review', dot: 'bg-amber-500' },
    verified: { label: 'Verified', dot: 'bg-blue-600' },
    transferred: { label: 'Transferred', dot: 'bg-violet-500' },
    responding: { label: 'Responding', dot: 'bg-cyan-600' },
    resolved: { label: 'Resolved', dot: 'bg-emerald-600' },
    rejected: { label: 'Rejected', dot: 'bg-gray-400' },
};

const ROLE_CONFIG = {
    municipal_admin: { label: 'Municipal admin', dot: 'bg-indigo-500' },
    responder: { label: 'Responder', dot: 'bg-cyan-600' },
    reporter: { label: 'Reporter', dot: 'bg-purple-500' },
};

const getRequestErrorMessage = (error, fallback) => (
    error?.response?.data?.message || error?.message || fallback
);

const AdminPage = () => {
    const { user } = useAuth();
    const { connected, reconnectVersion, subscribe } = useSocket();
    const userId = user?.id || user?._id;
    // Per-user cache key: payloads can carry per-user fields, so two
    // operators sharing a municipality must never read each other's snapshot.
    const dashboardCacheKey = `admin-dashboard:${user?.role || 'unknown'}:${user?.assignedMunicipality || 'unassigned'}:${userId || 'unknown'}`;
    const [stats, setStats] = useState(() => getStaleData(dashboardCacheKey));
    const [loading, setLoading] = useState(() => getStaleData(dashboardCacheKey) === null);
    const [dashboardError, setDashboardError] = useState('');
    const { isDegraded: systemDegraded } = useSystemHealth();
    const dashboardRequestIdRef = useRef(0);
    const dashboardRefreshTimerRef = useRef(null);
    // Live operations ticker (MVP real-time monitoring): recent socket events,
    // last-event clock, and socket-authenticated responder presence.
    const [activityFeed, setActivityFeed] = useState([]);
    const [lastEventAt, setLastEventAt] = useState(() => Date.now());
    const [, setNowTick] = useState(() => Date.now());
    const [presence, setPresence] = useState(null);

    const fetchDashboardStats = useCallback(async ({ showLoading = false } = {}) => {
        if (!user?.role) return;
        const requestId = ++dashboardRequestIdRef.current;
        if (showLoading) {
            const fresh = getCachedData(dashboardCacheKey, QUERY_CACHE_TTLS.adminDashboard);
            if (fresh) {
                setStats(fresh);
                setLoading(false);
                setDashboardError('');
                return;
            }
            const stale = getStaleData(dashboardCacheKey);
            if (stale) setStats(stale);
            else setLoading(true);
        }
        setDashboardError('');

        try {
            const response = user.role === 'responder'
                ? await analyticsAPI.getResponder()
                : await analyticsAPI.getAdmin();
            const nextStats = response.data?.data;
            if (!nextStats || typeof nextStats !== 'object' || Array.isArray(nextStats)) {
                throw new Error('The dashboard analytics response was invalid.');
            }
            if (requestId === dashboardRequestIdRef.current) {
                setStats(nextStats);
                setCachedData(dashboardCacheKey, nextStats);
            }
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
            if (requestId === dashboardRequestIdRef.current) {
                if (getStaleData(dashboardCacheKey) === null) {
                    setDashboardError(getRequestErrorMessage(
                        error,
                        'Unable to load dashboard analytics. Please try again.',
                    ));
                }
            }
        } finally {
            if (requestId === dashboardRequestIdRef.current) {
                setLoading(false);
            }
        }
    }, [dashboardCacheKey, user?.role]);

    useEffect(() => {
        if (!userId) return undefined;
        fetchDashboardStats({ showLoading: true });

        return () => {
            dashboardRequestIdRef.current += 1;
        };
    }, [fetchDashboardStats, userId]);

    const scheduleDashboardRefresh = useCallback(() => {
        window.clearTimeout(dashboardRefreshTimerRef.current);
        dashboardRefreshTimerRef.current = window.setTimeout(() => {
            fetchDashboardStats();
        }, 150);
    }, [fetchDashboardStats]);

    // Socket-authenticated responder presence (municipal_admin only).
    const fetchPresence = useCallback(async () => {
        if (user?.role !== 'municipal_admin') return;
        try {
            const response = await adminAPI.getPresence();
            const nextPresence = response?.data?.data;
            if (response?.data?.success && nextPresence && typeof nextPresence === 'object' && !Array.isArray(nextPresence)) setPresence(nextPresence);
        } catch {
            // Presence is best-effort; the dashboard stays usable without it.
        }
    }, [user?.role]);

    const recordActivity = useCallback((eventName, payload) => {
        const detail = payload?.address
            || payload?.title
            || (payload?.id || payload?._id || payload?.reportId
                ? `Report #${String(payload.id || payload._id || payload.reportId).slice(-6)}`
                : '');
        const entry = {
            key: `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            event: eventName,
            label: ACTIVITY_LABELS[eventName] || 'Operations update',
            detail: typeof detail === 'string' ? detail : '',
            at: Date.now(),
        };
        setActivityFeed((current) => [entry, ...current].slice(0, MAX_ACTIVITY_ITEMS));
        setLastEventAt(Date.now());
    }, []);

    useEffect(() => {
        const dashboardEvents = [
            'newReport',
            'reportDeleted',
            'reportVerified',
            'reportResponded',
            'reportResolved',
            'reportUpdatedByReporter',
            'reportTransferred',
            'highRiskZoneCreated',
            'highRiskZoneUpdated',
            'highRiskZoneDeleted',
        ];
        const unsubscribers = dashboardEvents.map((eventName) => subscribe(eventName, (payload) => {
            recordActivity(eventName, payload);
            fetchPresence();
            scheduleDashboardRefresh();
        }));

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            window.clearTimeout(dashboardRefreshTimerRef.current);
        };
    }, [fetchPresence, recordActivity, scheduleDashboardRefresh, subscribe]);

    // Ticking "updated Xs ago" clock for the live indicator.
    useEffect(() => {
        const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (user?.role !== 'municipal_admin') return undefined;
        fetchPresence();
        const interval = window.setInterval(fetchPresence, 30000);
        return () => window.clearInterval(interval);
    }, [fetchPresence, user?.role, reconnectVersion]);

    // Specialized Responder Operations Hub
    if (user?.role === 'responder') {
        return (
            <ResponderDashboardWorkspace
                user={user}
                stats={stats}
                loading={loading}
                error={dashboardError}
                onRetry={() => fetchDashboardStats({ showLoading: true })}
            />
        );
    }

    if (loading && !stats) {
        return (
            <div className={DASHBOARD_CONTAINER_CLASS} role="status" aria-live="polite" aria-label="Loading municipal operations dashboard">
                <span className="sr-only">Loading municipal operations dashboard</span>
                <SkeletonCard className="h-16" />
                <SkeletonCard className="h-32" />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <SkeletonCard className="h-56 space-y-3">
                        <Skeleton variant="text" className="h-4 w-40" />
                        <SkeletonRow lines={2} className="px-0 py-2" />
                        <SkeletonRow lines={2} className="px-0 py-2" />
                    </SkeletonCard>
                    <SkeletonCard className="h-56 space-y-3">
                        <Skeleton variant="text" className="h-4 w-40" />
                        <SkeletonRow lines={2} className="px-0 py-2" />
                        <SkeletonRow lines={2} className="px-0 py-2" />
                    </SkeletonCard>
                </div>
            </div>
        );
    }

    if (dashboardError && !stats) {
        return (
            <div className={`${DASHBOARD_CONTAINER_CLASS} ${PANEL_CLASS} p-6 text-center`} role="alert">
                <HiOutlineExclamation className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
                <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
                    Operations dashboard unavailable
                </h1>
                <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600 dark:text-gray-400">{dashboardError}</p>
                <button
                    type="button"
                    onClick={() => fetchDashboardStats({ showLoading: true })}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                >
                    <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                    Try again
                </button>
            </div>
        );
    }

    const municipality = user?.assignedMunicipality || 'Municipality scope';
    const pendingReports = stats?.reports?.pending ?? 0;
    const pendingVerifications = stats?.users?.pendingVerifications ?? 0;
    const totalReports = stats?.reports?.total ?? 0;
    const totalUsers = stats?.users?.total ?? 0;
    const reportsThisMonth = stats?.reports?.thisMonth ?? 0;
    const reportsThisWeek = stats?.reports?.thisWeek ?? 0;
    const respondingReports = stats?.reports?.responding ?? 0;
    const resolvedReports = stats?.reports?.resolved ?? 0;
    const barangayRows = [...(Array.isArray(stats?.reportsByBarangay) ? stats.reportsByBarangay : [])]
        .map((item) => ({
            barangay: item?.barangay || 'Unspecified barangay',
            count: Number(item?.count) || 0,
            injured: Number(item?.injured) || 0,
            fatalities: Number(item?.fatalities) || 0,
            missing: Number(item?.missing) || 0,
        }))
        .sort((a, b) => b.count - a.count);
    const barangayMax = Math.max(...barangayRows.map((b) => b.count), 1);

    // KPI strip mirrors the responder workspace row: linked stat cards with
    // the same accessible names the queue totals always carried.
    const kpiCards = [
        {
            title: 'Pending reports',
            value: pendingReports,
            subtext: 'Awaiting municipal review',
            link: '/admin/reports?status=pending',
            actionLabel: 'Review pending reports',
        },
        {
            title: 'Pending verifications',
            value: pendingVerifications,
            subtext: 'Reporter accounts to verify',
            link: '/admin/users?status=pending',
            actionLabel: 'Review pending verifications',
        },
        {
            title: 'Responding',
            value: respondingReports,
            subtext: 'Active field responses',
            link: '/admin/reports?status=responding',
            actionLabel: 'View responding incidents',
        },
        {
            title: 'Resolved',
            value: resolvedReports,
            subtext: 'Closed incidents',
            link: '/admin/reports?status=resolved',
            actionLabel: 'View resolved incidents',
        },
    ];

    return (
        <div className={DASHBOARD_CONTAINER_CLASS}>
            {/* Page header: shared dashboard language — eyebrow, title, context line */}
            <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between dark:border-white/10">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400">
                        {municipality} operations
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Operations dashboard
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-gray-600 dark:text-gray-400">
                        Review pending work and monitor municipality volume.
                    </p>
                    <p className="mt-2 flex shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${systemDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                        <span>{systemDegraded ? 'System degraded' : 'System active'} · Sibuyan Island · {user?.assignedMunicipality || 'All Municipalities'}</span>
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-live="polite">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                            <span className="relative flex h-2 w-2" aria-hidden="true">
                                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${connected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-600' : 'bg-gray-400'}`} />
                            </span>
                            <span className={connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}>
                                {connected ? 'Live' : 'Reconnecting'}
                            </span>
                        </span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">
                            Updated {formatIncidentRelativeTime(lastEventAt)}
                        </span>
                        {presence && typeof presence === 'object' && !Array.isArray(presence) && Number.isFinite(presence?.respondersOnline) && (
                            <span className="tabular-nums text-gray-500 dark:text-gray-400">
                                · {presence.respondersOnline} {presence.respondersOnline === 1 ? 'responder' : 'responders'} online
                            </span>
                        )}
                    </p>
                </div>
            </header>

            {/* KPI strip: same row language as the responder workspace */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-4" aria-label="Operational status">
                {kpiCards.map((stat) => (
                    <AdminKpiCard
                        key={stat.title}
                        stat={stat}
                        loading={loading}
                    />
                ))}
            </section>

            {/* Live operations activity: socket-fed incident ticker (MVP monitoring) */}
            <section className={PANEL_CLASS} aria-label="Live operations activity" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                    <h2 className={SECTION_TITLE_CLASS}>Live activity</h2>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} aria-hidden="true" />
                        {connected ? 'Streaming' : 'Paused'}
                    </span>
                </div>
                {activityFeed.length === 0 ? (
                    <p className={`mt-2 ${SECTION_META_CLASS}`}>
                        Waiting for live incident events. New reports, verifications, and dispatches appear here instantly.
                    </p>
                ) : (
                    <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
                        {activityFeed.map((entry, index) => (
                            <li key={entry?.key ?? index} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                                <p className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                                    <span className="font-semibold">{entry?.label || 'Operations update'}</span>
                                    {entry?.detail && <span className="text-gray-500 dark:text-gray-400"> · {entry.detail}</span>}
                                </p>
                                <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
                                    {formatIncidentRelativeTime(entry?.at)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Reference volume: slim full-width strip so it never competes
                with the growing barangay list for row height */}
            <section className={PANEL_CLASS} aria-label="Municipality record">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className={SECTION_TITLE_CLASS}>Municipality record</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <Link
                                to="/admin/reports"
                                aria-label={`Total Reports: ${totalReports}`}
                                className="font-semibold text-gray-900 hover:underline dark:text-gray-100"
                            >
                                {totalReports} {totalReports === 1 ? 'report' : 'reports'}
                            </Link>
                            <span aria-hidden="true"> · </span>
                            <Link
                                to="/admin/users"
                                aria-label={`Total Users: ${totalUsers}`}
                                className="font-semibold text-gray-900 hover:underline dark:text-gray-100"
                            >
                                {totalUsers} {totalUsers === 1 ? 'user' : 'users'}
                            </Link>
                            <span aria-hidden="true"> · </span>
                            <span><span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{reportsThisMonth}</span> this month</span>
                            <span aria-hidden="true"> · </span>
                            <span><span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{reportsThisWeek}</span> this week</span>
                            <span aria-hidden="true"> · </span>
                            <span className={SECTION_META_CLASS}>All-time volume · {municipality}</span>
                        </p>
                    </div>
                    <Link
                        to="/admin/zones"
                        aria-label="High-Risk Zones: manage hazard oversight"
                        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-sky-400"
                    >
                        High-risk zones
                        <span aria-hidden="true">→</span>
                    </Link>
                </div>
            </section>

            {/* Barangay breakdown: bounded Top 5 + scroll, so row height stays
                stable no matter how many barangays record incidents */}
            {barangayRows.length > 0 && (
                <section className={PANEL_CLASS} aria-labelledby="admin-barangay-incidents-title">
                    <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-3 dark:border-white/10">
                        <div className="min-w-0">
                            <h2 id="admin-barangay-incidents-title" className={SECTION_TITLE_CLASS}>
                                Incidents per barangay
                            </h2>
                            <p className={`mt-0.5 ${SECTION_META_CLASS}`}>
                                Ranked published reports · {municipality}
                            </p>
                        </div>
                        <span className={`${SECTION_META_CLASS} shrink-0`}>
                            {barangayRows.length} {barangayRows.length === 1 ? 'barangay' : 'barangays'} recorded
                        </span>
                    </div>

                    <ol className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
                        {barangayRows.slice(0, 5).map((item, idx) => {
                            const pct = Math.min(100, Math.round((item.count / barangayMax) * 100));
                            return (
                                <li key={item.barangay}>
                                    <div className="flex items-baseline justify-between gap-3 text-sm">
                                        <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                                            <span className="mr-2 inline-block w-4 shrink-0 text-xs font-medium tabular-nums text-gray-400">{idx + 1}</span>
                                            {item.barangay}
                                        </span>
                                        <span className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-400">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.count} {item.count === 1 ? 'incident' : 'incidents'}</span>
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-brand-700 dark:bg-brand-500"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                    {barangayRows.length > 5 && (
                        <div className="mt-4 border-t border-gray-200 pt-3 dark:border-white/10">
                            <Link
                                to="/dashboard"
                                className="text-xs font-medium text-brand-700 hover:underline dark:text-sky-400"
                            >
                                View all {barangayRows.length} barangays in analytics
                            </Link>
                        </div>
                    )}
                </section>
            )}

            {/* Recent activity: stretched columns stay equal height as rows grow */}
            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
                <section className={PANEL_CLASS} aria-labelledby="admin-recent-reports-title">
                    <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-3 dark:border-white/10">
                        <h2 id="admin-recent-reports-title" className={SECTION_TITLE_CLASS}>
                            Recent reports
                        </h2>
                        <Link
                            to="/admin/reports"
                            className="shrink-0 text-xs font-medium text-brand-700 hover:underline dark:text-sky-400"
                        >
                            View all
                        </Link>
                    </div>

                    {Array.isArray(stats?.recentReports) && stats.recentReports.length > 0 ? (
                        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
                            {(Array.isArray(stats?.recentReports) ? stats.recentReports : []).map((report, index) => {
                                const statusConfig = STATUS_CONFIG[report?.status] || STATUS_CONFIG.pending;
                                return (
                                    <li
                                        key={report?._id ?? index}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={report?.address || 'Location pending'}>
                                                {report?.address || 'Location pending'}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                                by {report?.reporter?.name || 'Unknown'}{formatIncidentRelativeTime(report?.createdAt) ? ` · ${formatIncidentRelativeTime(report?.createdAt)}` : ''}
                                            </p>
                                        </div>
                                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot}`} aria-hidden="true" />
                                            {statusConfig.label}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            No recent incident reports recorded.
                        </p>
                    )}
                </section>

                <section className={PANEL_CLASS} aria-labelledby="admin-recent-users-title">
                    <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-3 dark:border-white/10">
                        <h2 id="admin-recent-users-title" className={SECTION_TITLE_CLASS}>
                            Recent users
                        </h2>
                        <Link
                            to="/admin/users"
                            className="shrink-0 text-xs font-medium text-brand-700 hover:underline dark:text-sky-400"
                        >
                            View all
                        </Link>
                    </div>

                    {Array.isArray(stats?.recentUsers) && stats.recentUsers.length > 0 ? (
                        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
                            {(Array.isArray(stats?.recentUsers) ? stats.recentUsers : []).map((recentUser, index) => {
                                const roleConfig = ROLE_CONFIG[recentUser?.role] || { label: recentUser?.role || 'User', dot: 'bg-gray-400' };
                                return (
                                    <li
                                        key={recentUser?._id ?? index}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300" aria-hidden="true">
                                                {recentUser?.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {recentUser?.name}
                                                </p>
                                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                    {recentUser?.email}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${roleConfig.dot}`} aria-hidden="true" />
                                            {roleConfig.label}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            No newly registered users.
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
};

export default AdminPage;
