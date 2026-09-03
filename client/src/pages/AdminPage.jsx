import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { adminAPI, analyticsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatIncidentRelativeTime } from '../utils/dateTimeUtils';
import { resolveAssetUrl } from '../utils/assets';
import {
    HiOutlineShieldExclamation,
    HiOutlineArrowRight,
    HiOutlineExclamation,
    HiOutlineRefresh,
} from 'react-icons/hi';
import { Skeleton, SkeletonCard, SkeletonRow } from '../components/ui/Skeleton';
import ResponderDashboardWorkspace from '../components/dashboard/ResponderDashboardWorkspace';

const DASHBOARD_CONTAINER_CLASS = 'mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5';
const PANEL_CLASS = 'rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90';

const STATUS_CONFIG = {
    pending: { label: 'Pending review', shortLabel: 'Pending', dot: 'bg-amber-500' },
    verified: { label: 'Verified', shortLabel: 'Verified', dot: 'bg-blue-500' },
    transferred: { label: 'Transferred', shortLabel: 'Transferred', dot: 'bg-violet-500' },
    responding: { label: 'Responding', shortLabel: 'Responding', dot: 'bg-cyan-500' },
    resolved: { label: 'Resolved', shortLabel: 'Resolved', dot: 'bg-emerald-500' },
    rejected: { label: 'Rejected', shortLabel: 'Rejected', dot: 'bg-gray-400' },
};

const ROLE_CONFIG = {
    municipal_admin: { label: 'Mun. Admin', dot: 'bg-indigo-500' },
    responder: { label: 'Responder', dot: 'bg-cyan-500' },
    reporter: { label: 'Reporter', dot: 'bg-purple-500' },
};

const getOnlineUserBadge = (activeUser) => {
    if (activeUser.role === 'municipal_admin') {
        return { label: 'Mun. Admin', dot: 'bg-indigo-500' };
    }
    const cleanAgency = (activeUser.agency || '').toUpperCase();
    if (cleanAgency.includes('PNP') || cleanAgency.includes('POLICE')) {
        return { label: 'PNP Police', dot: 'bg-blue-500' };
    }
    if (cleanAgency.includes('BFP') || cleanAgency.includes('FIRE')) {
        return { label: 'BFP Fire', dot: 'bg-amber-500' };
    }
    if (cleanAgency.includes('SDH') || cleanAgency.includes('HOSPITAL') || cleanAgency.includes('HEALTH')) {
        return { label: 'SDH Health', dot: 'bg-emerald-500' };
    }
    if (activeUser.role === 'responder') {
        return { label: 'Responder', dot: 'bg-cyan-500' };
    }
    return { label: 'Reporter', dot: 'bg-purple-500' };
};

const getRequestErrorMessage = (error, fallback) => (
    error?.response?.data?.message || error?.message || fallback
);

const AdminPage = () => {
    const { user } = useAuth();
    const { subscribe } = useSocket();
    const userId = user?.id || user?._id;
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [onlineUsersLoading, setOnlineUsersLoading] = useState(true);
    const [onlineUsersError, setOnlineUsersError] = useState('');
    const dashboardRequestIdRef = useRef(0);
    const onlineUsersRequestIdRef = useRef(0);
    const dashboardRefreshTimerRef = useRef(null);
    const onlineUsersRefreshTimerRef = useRef(null);

    const fetchOnlineUsers = useCallback(async ({ showLoading = false } = {}) => {
        if (!user?.assignedMunicipality) return;
        const requestId = ++onlineUsersRequestIdRef.current;
        if (showLoading) setOnlineUsersLoading(true);
        setOnlineUsersError('');
        try {
            const params = { municipality: user.assignedMunicipality };
            const response = await adminAPI.getOnlineUsers(params);
            const nextUsers = response.data?.data;
            if (!Array.isArray(nextUsers)) {
                throw new Error('The operational presence response was invalid.');
            }
            if (requestId === onlineUsersRequestIdRef.current) {
                setOnlineUsers(nextUsers);
            }
        } catch (error) {
            console.error('Failed to fetch online users:', error);
            if (requestId === onlineUsersRequestIdRef.current) {
                setOnlineUsersError(getRequestErrorMessage(
                    error,
                    'Unable to load operational presence. Please try again.',
                ));
            }
        } finally {
            if (requestId === onlineUsersRequestIdRef.current) {
                setOnlineUsersLoading(false);
            }
        }
    }, [user?.assignedMunicipality]);

    const fetchDashboardStats = useCallback(async ({ showLoading = false } = {}) => {
        if (!user?.role) return;
        const requestId = ++dashboardRequestIdRef.current;
        if (showLoading) setLoading(true);
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
            }
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
            if (requestId === dashboardRequestIdRef.current) {
                setDashboardError(getRequestErrorMessage(
                    error,
                    'Unable to load dashboard analytics. Please try again.',
                ));
            }
        } finally {
            if (requestId === dashboardRequestIdRef.current) {
                setLoading(false);
            }
        }
    }, [user?.role]);

    useEffect(() => {
        if (!userId) return undefined;
        setStats(null);
        setOnlineUsers([]);
        fetchDashboardStats({ showLoading: true });
        fetchOnlineUsers({ showLoading: true });

        return () => {
            dashboardRequestIdRef.current += 1;
            onlineUsersRequestIdRef.current += 1;
        };
    }, [fetchDashboardStats, fetchOnlineUsers, userId]);

    const scheduleDashboardRefresh = useCallback(() => {
        window.clearTimeout(dashboardRefreshTimerRef.current);
        dashboardRefreshTimerRef.current = window.setTimeout(() => {
            fetchDashboardStats();
        }, 150);
    }, [fetchDashboardStats]);

    const scheduleOnlineUsersRefresh = useCallback(() => {
        window.clearTimeout(onlineUsersRefreshTimerRef.current);
        onlineUsersRefreshTimerRef.current = window.setTimeout(() => {
            fetchOnlineUsers();
        }, 150);
    }, [fetchOnlineUsers]);

    useEffect(() => {
        const dashboardEvents = [
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
        const onlineUserEvents = ['userOnline', 'userOffline', 'onlineUsersUpdate'];
        const unsubscribers = [
            ...dashboardEvents.map((eventName) => subscribe(eventName, scheduleDashboardRefresh)),
            ...onlineUserEvents.map((eventName) => subscribe(eventName, scheduleOnlineUsersRefresh)),
        ];

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            window.clearTimeout(dashboardRefreshTimerRef.current);
            window.clearTimeout(onlineUsersRefreshTimerRef.current);
        };
    }, [scheduleDashboardRefresh, scheduleOnlineUsersRefresh, subscribe]);

    // Specialized Responder Operations Hub
    if (user?.role === 'responder') {
        return (
            <ResponderDashboardWorkspace
                user={user}
                stats={stats}
                onlineUsers={onlineUsers}
                loading={loading}
                error={dashboardError}
                onRetry={() => fetchDashboardStats({ showLoading: true })}
                onlineUsersLoading={onlineUsersLoading}
                onlineUsersError={onlineUsersError}
                onRetryOnlineUsers={() => fetchOnlineUsers({ showLoading: true })}
            />
        );
    }

    if (loading && !stats) {
        return (
            <div className={DASHBOARD_CONTAINER_CLASS} role="status" aria-live="polite" aria-label="Loading municipal operations dashboard">
                <span className="sr-only">Loading municipal operations dashboard</span>
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
                <SkeletonCard className="h-24" />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <SkeletonCard className="h-64 space-y-3">
                        <Skeleton variant="text" className="h-4 w-40" />
                        <SkeletonRow lines={2} className="px-0 py-2" />
                        <SkeletonRow lines={2} className="px-0 py-2" />
                    </SkeletonCard>
                    <SkeletonCard className="h-64 space-y-3">
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
            <div className={`${DASHBOARD_CONTAINER_CLASS} rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/70 dark:bg-red-950/30`} role="alert">
                <HiOutlineExclamation className="mx-auto h-10 w-10 text-red-600 dark:text-red-400" aria-hidden="true" />
                <h1 className="mt-3 font-display text-xl font-bold text-gray-950 dark:text-white">
                    Operations dashboard unavailable
                </h1>
                <p className="mx-auto mt-1 max-w-lg text-sm text-red-800 dark:text-red-300">{dashboardError}</p>
                <button
                    type="button"
                    onClick={() => fetchDashboardStats({ showLoading: true })}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-800 shadow-2xs hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
                >
                    <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                    Try again
                </button>
            </div>
        );
    }

    const statCards = [
        {
            title: 'Pending Reports',
            value: stats?.reports?.pending ?? 0,
            subtext: 'Awaiting municipal review',
            link: '/admin/reports?status=pending',
            priority: 'primary',
            actionNeeded: (stats?.reports?.pending ?? 0) > 0,
        },
        {
            title: 'Pending Verifications',
            value: stats?.users?.pendingVerifications ?? 0,
            subtext: 'Reporter accounts to verify',
            link: '/admin/users?status=pending',
            priority: 'primary',
            actionNeeded: (stats?.users?.pendingVerifications ?? 0) > 0,
        },
        {
            title: 'Total Reports',
            value: stats?.reports?.total ?? 0,
            subtext: 'Municipality incident volume',
            link: '/admin/reports',
            priority: 'standard',
        },
        {
            title: 'Total Users',
            value: stats?.users?.total ?? 0,
            subtext: 'Registered community accounts',
            link: '/admin/users',
            priority: 'standard',
        },
    ];

    return (
        <div className={DASHBOARD_CONTAINER_CLASS}>
            {/* Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Municipal Operations
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Operations dashboard
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Manage users, review reports, and coordinate emergency response.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 shadow-2xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>System active · Sibuyan Island · {user?.assignedMunicipality || 'All Municipalities'}</span>
                    </div>
                </div>
            </header>

            {/* Top 4-Metric Stat Strip */}
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200/90 bg-gray-200/90 dark:border-white/10 dark:bg-white/10 xl:grid-cols-4" aria-label="Municipal summary statistics">
                {statCards.map((stat) => (
                    <article key={stat.title} className="min-w-0">
                        <Link
                            to={stat.link}
                            aria-label={`${stat.title}: ${loading ? 'loading' : stat.value}`}
                            className="group block h-full min-h-[6.5rem] cursor-pointer bg-white p-4 sm:p-5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-[#0c1813]/90 dark:hover:bg-white/[0.02]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="font-display text-2xl font-bold leading-none tracking-tight text-gray-950 sm:text-3xl dark:text-white tabular-nums">
                                    {loading ? '...' : stat.value}
                                </p>
                                <HiOutlineArrowRight
                                    className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-700 dark:text-gray-500 dark:group-hover:text-emerald-400"
                                    aria-hidden="true"
                                />
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    {stat.title}
                                </h2>
                                {stat.actionNeeded && (
                                    <span className="rounded-md border border-amber-300/80 bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                                        Action needed
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                {stat.subtext}
                            </p>
                        </Link>
                    </article>
                ))}
            </section>

            {/* Secondary Utility Strip (Risk Zones Quick Action & Monthly Volume) */}
            <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-gray-200/90 bg-gray-200/90 sm:grid-cols-3 dark:border-white/10 dark:bg-white/10" aria-label="Quick operations and volume">
                {/* Manage Risk Zones Action */}
                <Link
                    to="/admin/zones"
                    className="group flex min-h-[5.5rem] items-center justify-between bg-white p-4 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-5 dark:bg-[#0c1813]/90 dark:hover:bg-white/[0.02]"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200/80 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                            <HiOutlineShieldExclamation className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold text-gray-950 dark:text-white">High-Risk Zones</h3>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">Hazard oversight & perimeters</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:text-emerald-800 dark:text-emerald-400 dark:group-hover:text-emerald-300">
                        <span className="hidden sm:inline">Manage</span>
                        <HiOutlineArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                </Link>

                {/* Reports This Month */}
                <div className="flex min-h-[5.5rem] flex-col justify-center bg-white p-4 sm:p-5 dark:bg-[#0c1813]/90">
                    <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Reports this month</span>
                        <span className="font-display text-xl sm:text-2xl font-bold tabular-nums text-gray-950 dark:text-white">{stats?.reports?.thisMonth ?? 0}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Recorded across municipality</p>
                </div>

                {/* Reports This Week */}
                <div className="flex min-h-[5.5rem] flex-col justify-center bg-white p-4 sm:p-5 dark:bg-[#0c1813]/90">
                    <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Reports this week</span>
                        <span className="font-display text-xl sm:text-2xl font-bold tabular-nums text-gray-950 dark:text-white">{stats?.reports?.thisWeek ?? 0}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Recent 7-day volume</p>
                </div>
            </section>

            {/* Active Personnel Section */}
            {onlineUsers.length > 0 && (
                <section className={PANEL_CLASS} aria-labelledby="admin-active-personnel-title">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <h2 id="admin-active-personnel-title" className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                Active personnel & users
                            </h2>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {onlineUsers.length} online
                        </span>
                    </div>

                    <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {onlineUsers.map((activeUser) => {
                            const badge = getOnlineUserBadge(activeUser);
                            return (
                                <div
                                    key={activeUser.userId}
                                    className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/60 p-2.5 transition-colors hover:bg-gray-50 dark:border-white/5 dark:bg-white/[0.02]"
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200/90 bg-gray-100 text-xs font-bold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                        {activeUser.avatar ? (
                                            <img src={resolveAssetUrl(activeUser.avatar)} alt={activeUser.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                        ) : (
                                            activeUser.name?.charAt(0).toUpperCase() || '?'
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{activeUser.name}</p>
                                        <div className="mt-0.5 flex items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
                                                {badge.label}
                                            </span>
                                            {activeUser.assignedMunicipality && (
                                                <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">· {activeUser.assignedMunicipality}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Barangay Incidents Breakdown */}
            {stats?.reportsByBarangay && stats.reportsByBarangay.length > 0 && (
                <section className={PANEL_CLASS} aria-labelledby="admin-barangay-incidents-title">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 id="admin-barangay-incidents-title" className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                Incidents per barangay
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Ranked verified reports · {user?.assignedMunicipality || 'Municipality scope'}
                            </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {stats.reportsByBarangay.length} barangays recorded
                        </span>
                    </div>

                    <div className="mt-4 space-y-3">
                        {stats.reportsByBarangay
                            .slice()
                            .sort((a, b) => b.count - a.count)
                            .map((item, idx) => {
                                const maxCount = Math.max(...stats.reportsByBarangay.map((b) => b.count), 1);
                                const pct = Math.min(100, Math.round((item.count / maxCount) * 100));
                                return (
                                    <div key={item.barangay} className="group">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 w-4">{idx + 1}</span>
                                                {item.barangay}
                                            </span>
                                            <div className="flex items-center gap-2 tabular-nums">
                                                <span className="font-bold text-gray-900 dark:text-gray-100">{item.count} incident{item.count !== 1 ? 's' : ''}</span>
                                                {item.injured > 0 && (
                                                    <span className="text-amber-700 dark:text-amber-400 text-[11px]">· {item.injured} injured</span>
                                                )}
                                                {item.fatalities > 0 && (
                                                    <span className="text-red-700 dark:text-red-400 text-[11px]">· {item.fatalities} fatal</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                                            <div
                                                className="h-full rounded-full bg-emerald-600 transition-all duration-300 dark:bg-emerald-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </section>
            )}

            {/* Sibling Panels: Recent Reports & Recent Users */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Recent Reports */}
                <section className={PANEL_CLASS} aria-labelledby="admin-recent-reports-title">
                    <div className="flex items-center justify-between">
                        <h2 id="admin-recent-reports-title" className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                            Recent reports
                        </h2>
                        <Link
                            to="/admin/reports"
                            className="group inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                            <span>View all</span>
                            <HiOutlineArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                        </Link>
                    </div>

                    {stats?.recentReports?.length > 0 ? (
                        <div className="mt-3.5 divide-y divide-gray-100 dark:divide-white/5">
                            {stats.recentReports.map((report) => {
                                const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                                return (
                                    <div
                                        key={report._id}
                                        className="grid grid-cols-[minmax(0,1fr)_108px] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {report.address || 'Location pending'}
                                            </p>
                                            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                                                by {report.reporter?.name || 'Unknown'}{formatIncidentRelativeTime(report.createdAt) ? ` · ${formatIncidentRelativeTime(report.createdAt)}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex justify-end">
                                            <span className="inline-flex h-6 w-[104px] items-center justify-center gap-1.5 rounded-full border border-gray-200/90 bg-gray-50/80 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot}`} aria-hidden="true" />
                                                <span className="truncate">{statusConfig.shortLabel || report.status}</span>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                            No recent incident reports recorded.
                        </div>
                    )}
                </section>

                {/* Recent Users */}
                <section className={PANEL_CLASS} aria-labelledby="admin-recent-users-title">
                    <div className="flex items-center justify-between">
                        <h2 id="admin-recent-users-title" className="font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                            Recent users
                        </h2>
                        <Link
                            to="/admin/users"
                            className="group inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                            <span>View all</span>
                            <HiOutlineArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                        </Link>
                    </div>

                    {stats?.recentUsers?.length > 0 ? (
                        <div className="mt-3.5 divide-y divide-gray-100 dark:divide-white/5">
                            {stats.recentUsers.map((recentUser) => {
                                const roleConfig = ROLE_CONFIG[recentUser.role] || { label: recentUser.role || 'User', dot: 'bg-gray-400' };
                                return (
                                    <div
                                        key={recentUser._id}
                                        className="grid grid-cols-[minmax(0,1fr)_108px] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200/90 bg-gray-100 text-[11px] font-bold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                                {recentUser.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {recentUser.name}
                                                </p>
                                                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                                    {recentUser.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <span className="inline-flex h-6 w-[104px] items-center justify-center gap-1.5 rounded-full border border-gray-200/90 bg-gray-50/80 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${roleConfig.dot}`} aria-hidden="true" />
                                                <span className="truncate">{roleConfig.label}</span>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                            No newly registered users.
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default AdminPage;
