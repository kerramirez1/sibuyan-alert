import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../router';
import { useSocket } from '../context/SocketContext';
import { reportsAPI } from '../services/api';
import {
    dedupedFetch,
    getStaleData,
    isRecentlyRevalidated,
    setCachedData,
} from '../utils/queryCache';
import { getPhysicalMunicipality } from '../utils/incidentDetails';
import { formatDistanceToNow } from 'date-fns';
import {
    HiCheck,
    HiOutlineArrowRight,
    HiOutlineChevronRight,
    HiOutlineDocumentAdd,
    HiOutlineExclamationCircle,
    HiOutlineMap,
    HiOutlineRefresh,
} from 'react-icons/hi';
import Button from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { getReportIncidentTypeLabel } from '../config/incidentTypes';

// Canonical lifecycle vocabulary shared by the stepper, status column, and
// status line, so one state is never named three different ways.
const STATUS_CONFIG = {
    pending: { label: 'Pending review', stepIndex: 1 },
    verified: { label: 'Verified', stepIndex: 2 },
    transferred: { label: 'Transferred', stepIndex: 2 },
    responding: { label: 'Responding', stepIndex: 3 },
    resolved: { label: 'Resolved', stepIndex: 4 },
    rejected: { label: 'Rejected', stepIndex: 1 },
};

// Hue is reserved for the severity scale only; status stays achromatic so the
// two columns can never collide on the same color with different meanings.
const SEVERITY_CONFIG = {
    minor: { label: 'Minor', dot: 'bg-emerald-500' },
    moderate: { label: 'Moderate', dot: 'bg-amber-500' },
    severe: { label: 'Severe', dot: 'bg-orange-500' },
    critical: { label: 'Critical', dot: 'bg-red-500' },
};

const LIFECYCLE_STEPS = ['Submitted', 'Pending review', 'Verified', 'Responding', 'Resolved'];

const formatRelativeDate = (value) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Unknown date'
        : formatDistanceToNow(date, { addSuffix: true });
};

const formatIncidentType = (report) => getReportIncidentTypeLabel(report);

const getLocation = (report) => {
    const address = typeof report?.address === 'string' ? report.address.trim() : '';
    if (address) return address;
    const parts = [report?.barangay, getPhysicalMunicipality(report)]
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim());
    if (parts.length) return parts.join(', ');
    return 'Location unavailable';
};

// Avoid "Accident at E. Quirino Street · E. Quirino Street, Poblacion": when
// title and location share significant words, show the longer one only.
const getReportHeading = (report) => {
    const title = String(report?.title ?? '').trim();
    const location = getLocation(report);
    if (!title || title === location) return location;
    const words = (value) => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    const titleWords = new Set(words(title));
    const overlap = words(location).filter((word) => titleWords.has(word)).length;
    if (overlap >= 2) return title.length >= location.length ? title : location;
    return `${title} · ${location}`;
};

const getStatusHelp = (status) => {
    switch (status) {
        case 'pending':
            return 'Awaiting municipal verification by emergency dispatchers.';
        case 'verified':
            return 'Incident verified. Emergency units are being coordinated.';
        case 'responding':
            return 'Emergency responders are actively operating at the scene.';
        case 'transferred':
            return 'Report transferred to neighboring municipal jurisdiction.';
        case 'resolved':
            return 'Incident response completed and case closed safely.';
        case 'rejected':
            return 'Report was rejected or marked invalid by dispatchers.';
        default:
            return 'Report submitted and logged in municipal safety system.';
    }
};

const ReporterDashboardSkeleton = () => (
    <div role="status" aria-busy="true" aria-label="Loading reporter dashboard">
        <span className="sr-only">Loading reporter dashboard</span>
        <div className="border-t border-gray-200 py-6 dark:border-white/10">
            <Skeleton variant="text" role={null} className="h-3 w-40" />
            <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i}>
                        <Skeleton variant="text" role={null} className="h-3 w-20" />
                        <Skeleton variant="text" role={null} className="mt-2 h-7 w-12" />
                    </div>
                ))}
            </div>
        </div>
        <div className="border-t border-gray-200 py-6 dark:border-white/10">
            <Skeleton variant="text" role={null} className="h-3 w-32" />
            <Skeleton variant="text" role={null} className="mt-3 h-4 w-2/3" />
            <Skeleton variant="text" role={null} className="mt-2 h-3 w-1/2 opacity-70" />
        </div>
        <div className="border-t border-gray-200 py-6 dark:border-white/10">
            <Skeleton variant="text" role={null} className="h-3 w-32" />
            <div className="mt-4 space-y-4">
                {[0, 1, 2].map((i) => (
                    <div key={i}>
                        <Skeleton variant="text" role={null} className="h-4 w-3/4" />
                        <Skeleton variant="text" role={null} className="mt-1.5 h-3 w-1/2 opacity-70" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const ReporterDashboardPage = () => {
    // Shared with MyReportsPage (same data). Session-scoped: wiped on logout.
    const cacheKey = 'my-reports:list';
    const [reports, setReports] = useState(() => {
        const stale = getStaleData(cacheKey);
        return Array.isArray(stale) ? stale : [];
    });
    const [loading, setLoading] = useState(() => {
        const stale = getStaleData(cacheKey);
        return Array.isArray(stale) ? false : true;
    });
    const [error, setError] = useState('');
    const { subscribe } = useSocket();

    const fetchReports = useCallback(async (silent = false) => {
        const stale = getStaleData(cacheKey);
        if (Array.isArray(stale) && stale.length > 0) {
            setReports(stale.filter(Boolean));
            setLoading(false);
        } else if (!silent) {
            setLoading(true);
        }

        // Avoid micro-burst revalidation within 4 seconds unless forced or cold
        if (stale && isRecentlyRevalidated(cacheKey, 4000)) {
            return;
        }

        try {
            const response = await dedupedFetch(`fetch:${cacheKey}`, () => reportsAPI.getMyReports());
            const raw = response?.data?.data;
            const nextReports = Array.isArray(raw)
                ? raw
                : (Array.isArray(raw?.reports) ? raw.reports : []);
            setReports(nextReports.filter(Boolean));
            setCachedData(cacheKey, nextReports);
            setError('');
        } catch (err) {
            console.error('Failed to fetch reporter dashboard reports:', err);
            if (!Array.isArray(getStaleData(cacheKey))) {
                setError('Unable to load your report overview.');
            }
        } finally {
            setLoading(false);
        }
    }, [cacheKey]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Realtime report updates
    useEffect(() => {
        const updateReport = (id, changes) => {
            if (id === null || id === undefined || id === '') return;
            const targetId = String(id);
            setReports((current) => (Array.isArray(current) ? current : []).filter(Boolean).map((report) => (
                String(report?._id ?? report?.id) === targetId
                    ? (typeof changes === 'function' ? changes(report) : { ...report, ...changes })
                    : report
            )));
        };

        const unsubRespond = subscribe('reportResponded', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'responding' });
        });
        const unsubResolve = subscribe('reportResolved', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'resolved' });
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'resolved' });
        });
        const unsubVerify = subscribe('reportVerified', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'verified' });
        });
        const unsubReject = subscribe('reportRejected', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'rejected', rejectionReason: data?.reason });
        });
        const unsubDelete = subscribe('reportDeleted', (data) => {
            const deleteId = data?.id ?? data?._id;
            if (deleteId === null || deleteId === undefined || deleteId === '') return;
            const targetId = String(deleteId);
            setReports((current) => (Array.isArray(current) ? current : []).filter(Boolean).filter((r) => String(r?._id ?? r?.id) !== targetId));
        });
        const unsubTransferred = subscribe('reportTransferred', (data) => {
            updateReport(data?.id ?? data?._id, { status: data?.status || 'transferred' });
        });
        const unsubUpdateRejected = subscribe('reportRejectedUpdate', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'rejected' });
        });

        return () => {
            unsubRespond();
            unsubResolve();
            unsubResolutionDetails();
            unsubVerify();
            unsubReject();
            unsubDelete();
            unsubTransferred();
            unsubUpdateRejected();
        };
    }, [subscribe]);

    const summary = useMemo(() => {
        const safeReports = (Array.isArray(reports) ? reports : []).filter(Boolean);
        const pending = safeReports.filter((r) => r?.status === 'pending').length;
        const verified = safeReports.filter((r) => r?.status === 'verified').length;
        const transferred = safeReports.filter((r) => r?.status === 'transferred').length;
        const responding = safeReports.filter((r) => r?.status === 'responding').length;
        const resolved = safeReports.filter((r) => r?.status === 'resolved').length;
        return {
            pending,
            verified,
            transferred,
            responding,
            active: verified + transferred + responding,
            resolved,
            total: safeReports.length,
        };
    }, [reports]);

    const headerSummary = useMemo(() => {
        if (summary.total === 0) {
            return 'Track your submitted reports and follow their response progress.';
        }
        const parts = [`${summary.total} ${summary.total === 1 ? 'report' : 'reports'}`];
        if (summary.pending > 0) parts.push(`${summary.pending} awaiting review`);
        if (summary.responding > 0) parts.push(`${summary.responding} in response`);
        return parts.join(' · ');
    }, [summary]);

    // Shared summary vocabulary with My Reports: identical labels and helpers.
    // Each card deep-links to its filtered My Reports view.
    // Active matches MyReports: verified + transferred + responding.
    const stats = useMemo(() => ([
        { key: 'total', label: 'Total reports', value: summary.total, helper: 'All submissions', to: '/my-reports' },
        { key: 'pending', label: 'Pending review', value: summary.pending, helper: 'Waiting for verification', to: '/my-reports?status=pending' },
        { key: 'active', label: 'Active', value: summary.active, helper: 'Verified or in response', to: '/my-reports?status=active' },
        { key: 'resolved', label: 'Resolved', value: summary.resolved, helper: 'Closed incidents', to: '/my-reports?status=resolved' },
    ]), [summary]);

    const recentReports = useMemo(() => {
        return (Array.isArray(reports) ? reports : []).filter(Boolean).slice(0, 5);
    }, [reports]);

    const latestActiveReport = useMemo(() => {
        const safeReports = (Array.isArray(reports) ? reports : []).filter(Boolean);
        return safeReports.find((r) => r?.status === 'responding' || r?.status === 'pending' || r?.status === 'verified' || r?.status === 'transferred')
            || safeReports[0]
            || null;
    }, [reports]);

    const activeStepIndex = useMemo(() => {
        if (!latestActiveReport) return 0;
        const cfg = STATUS_CONFIG[latestActiveReport?.status];
        return cfg ? cfg.stepIndex : 0;
    }, [latestActiveReport]);

    return (
        <div className="mx-auto w-full max-w-5xl">
            {/* Single page title block: live subline replaces the static tagline */}
            <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Reporter dashboard
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                        {loading ? 'Loading your report overview.' : headerSummary}
                    </p>
                </div>

                {/* Minimalist header actions: light solid primary + quiet text link */}
                <div className="flex flex-row items-center gap-2 sm:gap-3 sm:shrink-0">
                    <Link
                        to="/report"
                        className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 whitespace-nowrap px-1 text-[13px] font-semibold text-red-600 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:min-h-0 sm:h-9 sm:flex-none sm:px-1.5 dark:text-red-400 dark:hover:text-red-300"
                    >
                        <HiOutlineDocumentAdd className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Submit incident report
                    </Link>
                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 whitespace-nowrap px-1 text-[13px] font-semibold text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300 sm:min-h-0 sm:h-9 sm:flex-none sm:px-1.5"
                    >
                        <HiOutlineMap className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Live incident map
                    </Link>
                </div>
            </header>

            {loading ? (
                <ReporterDashboardSkeleton />
            ) : error ? (
                <div className="flex flex-col gap-3 border-t border-gray-200 py-6 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                        <HiOutlineExclamationCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                    <Button variant="dangerOutline" size="sm" onClick={() => fetchReports(false)}>
                        <HiOutlineRefresh className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Retry
                    </Button>
                </div>
            ) : (
                <div className="divide-y divide-gray-200 dark:divide-white/10">
                    {/* Summary KPI cards */}
                    <section aria-label="Report summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {stats.map((stat) => (
                            <Link
                                key={stat.key}
                                to={stat.to}
                                aria-label={`${stat.label}: ${stat.value}. ${stat.helper}`}
                                className="group block min-w-0 rounded-lg border border-gray-200/90 bg-white p-4 shadow-2xs transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-[#0c1813]/90 dark:hover:bg-white/[0.02]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <p className="min-w-0 flex-1 truncate font-display text-2xl font-bold tabular-nums tracking-tight text-gray-950 transition-colors group-hover:text-brand-800 dark:text-white dark:group-hover:text-sky-300">
                                        {stat.value}
                                    </p>
                                    <HiOutlineArrowRight
                                        className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600"
                                        aria-hidden="true"
                                    />
                                </div>
                                <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                    {stat.label}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-tight text-gray-500 dark:text-gray-400">
                                    {stat.helper}
                                </p>
                            </Link>
                        ))}
                    </section>

                    {/* Latest update: one status line, one stepper */}
                    {latestActiveReport && (
                        <section aria-labelledby="latest-update-heading" className="py-6">
                            <h2 id="latest-update-heading" className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Latest update
                            </h2>
                            <p className="mt-1.5 truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {getReportHeading(latestActiveReport)}
                            </p>

                            {/* Compact progress summary on mobile; full stepper on sm+ */}
                            <p className="mt-1 text-xs text-gray-500 sm:hidden dark:text-gray-400">
                                Step {activeStepIndex + 1} of {LIFECYCLE_STEPS.length} · {LIFECYCLE_STEPS[activeStepIndex] || LIFECYCLE_STEPS[0]}
                            </p>
                            <ol className="mt-4 hidden sm:flex" aria-label="Reporting progress">
                                {LIFECYCLE_STEPS.map((label, idx) => {
                                    const isCurrent = activeStepIndex === idx;
                                    const isCompleted = activeStepIndex > idx;
                                    return (
                                        <li key={label} className="min-w-0 flex-1" aria-current={isCurrent ? 'step' : undefined}>
                                            <div className="flex items-center">
                                                <span
                                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isCompleted || isCurrent
                                                            ? 'bg-brand-700 dark:bg-brand-500'
                                                            : 'border border-gray-300 dark:border-white/20'
                                                        }`}
                                                    aria-hidden="true"
                                                >
                                                    {isCompleted && <HiCheck className="h-2.5 w-2.5 text-white" />}
                                                </span>
                                                {idx < LIFECYCLE_STEPS.length - 1 && (
                                                    <span className="mx-2 h-px flex-1 bg-gray-200 dark:bg-white/10" aria-hidden="true" />
                                                )}
                                            </div>
                                            <p className={`mt-1.5 pr-2 text-xs leading-tight ${isCurrent
                                                    ? 'font-semibold text-gray-900 dark:text-white'
                                                    : isCompleted
                                                        ? 'text-gray-600 dark:text-gray-300'
                                                        : 'text-gray-400 dark:text-gray-500'
                                                }`}>
                                                {label}
                                            </p>
                                        </li>
                                    );
                                })}
                            </ol>

                            <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {STATUS_CONFIG[latestActiveReport?.status]?.label || latestActiveReport?.status || 'Pending review'}.
                                    </span>
                                    {' '}
                                    {getStatusHelp(latestActiveReport?.status)}
                                </p>
                                <Link
                                    to={`/my-reports?report=${latestActiveReport?._id ?? latestActiveReport?.id ?? ''}`}
                                    className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300"
                                >
                                    Open report
                                    <HiOutlineChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            </div>
                        </section>
                    )}

                    {/* Recent reports: rows are the links, no Action column */}
                    <section aria-labelledby="recent-reports-heading" className="py-6">
                        <div className="flex items-baseline justify-between gap-2">
                            <h2 id="recent-reports-heading" className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Recent reports
                            </h2>
                            {(Array.isArray(reports) ? reports.length : 0) > 0 && (
                                <Link
                                    to="/my-reports"
                                    className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300"
                                >
                                    Open all reports
                                    <HiOutlineChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            )}
                        </div>

                        {recentReports.length > 0 ? (
                            <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-200 dark:divide-white/5 dark:border-white/10">
                                {recentReports.filter(Boolean).map((report) => {
                                    const reportId = report?._id ?? report?.id;
                                    const statusLabel = STATUS_CONFIG[report?.status]?.label || report?.status || 'Pending review';
                                    const severity = SEVERITY_CONFIG[report?.severity] || { label: 'Unknown', dot: 'bg-gray-400' };
                                    const location = getLocation(report);
                                    return (
                                        <li key={String(reportId)}>
                                            <Link
                                                to={`/my-reports?report=${reportId}`}
                                                aria-label={`Open report: ${location}`}
                                                className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_7rem_1rem] sm:gap-4 dark:hover:bg-white/[0.02]"
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                                                        {location}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                                                        {formatIncidentType(report)}
                                                        {' · '}
                                                        Reported {formatRelativeDate(report?.createdAt)}
                                                        {report?.status === 'responding' && ' · Units on scene'}
                                                    </span>
                                                    <span className="mt-0.5 block text-[11px] text-gray-500 sm:hidden dark:text-gray-400">
                                                        {statusLabel} · {severity.label}
                                                    </span>
                                                </span>
                                                <span className="hidden w-28 shrink-0 truncate text-xs text-gray-600 sm:block dark:text-gray-400">
                                                    {statusLabel}
                                                </span>
                                                <span className="hidden w-28 shrink-0 items-center gap-1.5 text-xs text-gray-600 sm:flex dark:text-gray-400">
                                                    <span className={`h-2 w-2 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                    <span className="truncate">{severity.label}</span>
                                                </span>
                                                <HiOutlineChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 dark:text-gray-500" aria-hidden="true" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="py-10 text-center sm:text-left">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">No activity logged</h3>
                                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 sm:mx-0 dark:text-gray-400">
                                    There are currently no reports linked to your profile. Submit a new incident to see it tracked here.
                                </p>
                                <Link
                                    to="/report"
                                    className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-10 dark:bg-red-600 dark:hover:bg-red-500"
                                >
                                    Submit new incident
                                </Link>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default ReporterDashboardPage;
