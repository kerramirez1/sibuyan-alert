import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { analyticsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatIncidentRelativeTime } from '../utils/dateTimeUtils';
import {
    HiOutlineExclamation,
    HiOutlineRefresh,
} from 'react-icons/hi';
import { Skeleton, SkeletonCard, SkeletonRow } from '../components/ui/Skeleton';
import { useSystemHealth } from '../hooks/useSystemHealth';
import ResponderDashboardWorkspace from '../components/dashboard/ResponderDashboardWorkspace';

const DASHBOARD_CONTAINER_CLASS = 'mx-auto w-full min-w-0 max-w-[1120px] space-y-6 sm:space-y-8';
const PANEL_CLASS = 'rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90';
const SECTION_TITLE_CLASS = 'text-sm font-semibold text-gray-900 dark:text-white';
const SECTION_META_CLASS = 'text-xs text-gray-500 dark:text-gray-400';
const ROW_LINK_CLASS = 'flex items-center gap-4 px-4 py-4 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-5 dark:hover:bg-white/[0.03]';

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
    const { subscribe } = useSocket();
    const userId = user?.id || user?._id;
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const { isDegraded: systemDegraded } = useSystemHealth();
    const dashboardRequestIdRef = useRef(0);
    const dashboardRefreshTimerRef = useRef(null);

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
        const unsubscribers = dashboardEvents.map((eventName) => subscribe(eventName, scheduleDashboardRefresh));

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            window.clearTimeout(dashboardRefreshTimerRef.current);
        };
    }, [scheduleDashboardRefresh, subscribe]);

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
    const attentionCount = pendingReports + pendingVerifications;
    const barangayRows = [...(stats?.reportsByBarangay || [])].sort((a, b) => b.count - a.count);
    const barangayMax = Math.max(...barangayRows.map((b) => b.count), 1);

    return (
        <div className={DASHBOARD_CONTAINER_CLASS}>
            {/* Page header: single jurisdiction line, no duplicate eyebrows */}
            <header className="flex flex-col gap-2 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/10">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {municipality} · Municipal operations
                    </p>
                    <h1 className="mt-1 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl dark:text-white">
                        Operations dashboard
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-gray-600 dark:text-gray-400">
                        Review pending work and monitor municipality volume.
                    </p>
                </div>
                <p className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500 sm:pt-1 dark:text-gray-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${systemDegraded ? 'bg-amber-500' : 'bg-emerald-600'}`} aria-hidden="true" />
                    <span>{systemDegraded ? 'System degraded' : 'System active'} · Sibuyan Island · {user?.assignedMunicipality || 'All Municipalities'}</span>
                </p>
            </header>

            {/* Priority queue: only actionable work gets prominence */}
            <section aria-label="Needs attention">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className={SECTION_TITLE_CLASS}>Needs attention</h2>
                    <span className={SECTION_META_CLASS}>
                        {attentionCount === 0 ? 'All clear' : `${attentionCount} awaiting action`}
                    </span>
                </div>
                <div className={`${PANEL_CLASS} mt-3 divide-y divide-gray-100 overflow-hidden dark:divide-white/5`}>
                    <Link
                        to="/admin/reports?status=pending"
                        aria-label={`Pending Reports: ${loading ? 'loading' : pendingReports}`}
                        className={ROW_LINK_CLASS}
                    >
                        <span className="w-10 shrink-0 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
                            {loading ? '…' : pendingReports}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                Pending reports
                                {pendingReports > 0 && (
                                    <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                        · Action needed
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                Awaiting municipal review
                            </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            Review
                        </span>
                    </Link>
                    <Link
                        to="/admin/users?status=pending"
                        aria-label={`Pending Verifications: ${loading ? 'loading' : pendingVerifications}`}
                        className={ROW_LINK_CLASS}
                    >
                        <span className="w-10 shrink-0 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
                            {loading ? '…' : pendingVerifications}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                Pending verifications
                                {pendingVerifications > 0 && (
                                    <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                        · Action needed
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                Reporter accounts to verify
                            </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            Review
                        </span>
                    </Link>
                </div>
            </section>

            {/* Reference volume: de-emphasized record, not competing cards */}
            <section aria-label="Municipality record">
                <h2 className={SECTION_TITLE_CLASS}>Municipality record</h2>
                <div className={`${PANEL_CLASS} mt-3 px-4 py-3.5 sm:px-5`}>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
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
                    </p>
                    <div className="mt-2 border-t border-gray-100 pt-2.5 dark:border-white/5">
                        <Link
                            to="/admin/zones"
                            aria-label="High-Risk Zones: manage hazard oversight"
                            className="flex items-center justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">High-risk zones</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">Hazard oversight and perimeters</span>
                            </span>
                            <span className="shrink-0 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                                Manage
                            </span>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Barangay breakdown */}
            {barangayRows.length > 0 && (
                <section className={`${PANEL_CLASS} p-4 sm:p-5`} aria-labelledby="admin-barangay-incidents-title">
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                            <h2 id="admin-barangay-incidents-title" className={SECTION_TITLE_CLASS}>
                                Incidents per barangay
                            </h2>
                            <p className={`mt-0.5 ${SECTION_META_CLASS}`}>
                                Ranked verified reports · {municipality}
                            </p>
                        </div>
                        <span className={`${SECTION_META_CLASS} shrink-0`}>
                            {barangayRows.length} {barangayRows.length === 1 ? 'barangay' : 'barangays'} recorded
                        </span>
                    </div>

                    <ol className="mt-4 space-y-4">
                        {barangayRows.map((item, idx) => {
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
                                            {item.injured > 0 && (
                                                <span> · {item.injured} injured</span>
                                            )}
                                            {item.fatalities > 0 && (
                                                <span> · {item.fatalities} fatal</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-emerald-700 dark:bg-emerald-500"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}

            {/* Recent activity */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className={`${PANEL_CLASS} p-4 sm:p-5`} aria-labelledby="admin-recent-reports-title">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 id="admin-recent-reports-title" className={SECTION_TITLE_CLASS}>
                            Recent reports
                        </h2>
                        <Link
                            to="/admin/reports"
                            className="shrink-0 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                            View all
                        </Link>
                    </div>

                    {stats?.recentReports?.length > 0 ? (
                        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
                            {stats.recentReports.map((report) => {
                                const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                                return (
                                    <li
                                        key={report._id}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={report.address || 'Location pending'}>
                                                {report.address || 'Location pending'}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                                by {report.reporter?.name || 'Unknown'}{formatIncidentRelativeTime(report.createdAt) ? ` · ${formatIncidentRelativeTime(report.createdAt)}` : ''}
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

                <section className={`${PANEL_CLASS} p-4 sm:p-5`} aria-labelledby="admin-recent-users-title">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 id="admin-recent-users-title" className={SECTION_TITLE_CLASS}>
                            Recent users
                        </h2>
                        <Link
                            to="/admin/users"
                            className="shrink-0 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                            View all
                        </Link>
                    </div>

                    {stats?.recentUsers?.length > 0 ? (
                        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
                            {stats.recentUsers.map((recentUser) => {
                                const roleConfig = ROLE_CONFIG[recentUser.role] || { label: recentUser.role || 'User', dot: 'bg-gray-400' };
                                return (
                                    <li
                                        key={recentUser._id}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300" aria-hidden="true">
                                                {recentUser.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {recentUser.name}
                                                </p>
                                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                    {recentUser.email}
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
