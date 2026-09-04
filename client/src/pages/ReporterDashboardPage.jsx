import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../router';
import { useSocket } from '../context/SocketContext';
import { reportsAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    HiCheck,
    HiOutlineChevronRight,
    HiOutlineExclamationCircle,
    HiOutlineRefresh,
} from 'react-icons/hi';
import Button from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';

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

const formatIncidentType = (report) => (
    (report?.incidentType || report?.accidentType || 'Unspecified incident')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const getLocation = (report) => (
    report?.address
    || [report?.barangay, report?.municipalityName].filter(Boolean).join(', ')
    || 'Location unavailable'
);

// Avoid "Accident at E. Quirino Street · E. Quirino Street, Poblacion": when
// title and location share significant words, show the longer one only.
const getReportHeading = (report) => {
    const title = (report?.title || '').trim();
    const location = getLocation(report);
    if (!title || title === location) return location;
    const words = (value) => value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
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
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { subscribe } = useSocket();

    const fetchReports = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = await reportsAPI.getMyReports();
            setReports(response.data?.data || []);
            setError('');
        } catch (err) {
            console.error('Failed to fetch reporter dashboard reports:', err);
            setError('Unable to load your report overview.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Realtime report updates
    useEffect(() => {
        const updateReport = (id, changes) => {
            if (!id) return;
            setReports((current) => current.map((report) => (
                report._id === id
                    ? (typeof changes === 'function' ? changes(report) : { ...report, ...changes })
                    : report
            )));
        };

        const unsubRespond = subscribe('reportResponded', (data) => {
            updateReport(data?.id, { status: 'responding' });
        });
        const unsubResolve = subscribe('reportResolved', (data) => {
            updateReport(data?.id, { status: 'resolved' });
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            updateReport(data?.id, { status: 'resolved' });
        });
        const unsubDelete = subscribe('reportDeleted', (data) => {
            if (!data?.id) return;
            setReports((current) => current.filter((r) => r._id !== data.id));
        });
        const unsubTransferred = subscribe('reportTransferred', (data) => {
            updateReport(data?.id, { status: 'transferred' });
        });
        const unsubUpdateRejected = subscribe('reportRejectedUpdate', (data) => {
            updateReport(data?.id, { status: 'rejected' });
        });

        return () => {
            unsubRespond();
            unsubResolve();
            unsubResolutionDetails();
            unsubDelete();
            unsubTransferred();
            unsubUpdateRejected();
        };
    }, [subscribe]);

    const summary = useMemo(() => {
        return {
            pending: reports.filter((r) => r.status === 'pending').length,
            responding: reports.filter((r) => r.status === 'responding').length,
            resolved: reports.filter((r) => r.status === 'resolved').length,
            total: reports.length,
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

    const stats = useMemo(() => ([
        { key: 'total', label: 'Total reports', value: summary.total, helper: 'All submissions' },
        { key: 'pending', label: 'Pending review', value: summary.pending, helper: 'Awaiting review' },
        { key: 'active', label: 'Active', value: summary.responding, helper: 'In response' },
        { key: 'resolved', label: 'Resolved', value: summary.resolved, helper: 'Closed' },
    ]), [summary]);

    const recentReports = useMemo(() => {
        return reports.slice(0, 5);
    }, [reports]);

    const latestActiveReport = useMemo(() => {
        return reports.find((r) => r.status === 'responding' || r.status === 'pending' || r.status === 'verified')
            || reports[0]
            || null;
    }, [reports]);

    const activeStepIndex = useMemo(() => {
        if (!latestActiveReport) return 0;
        const cfg = STATUS_CONFIG[latestActiveReport.status];
        return cfg ? cfg.stepIndex : 0;
    }, [latestActiveReport]);

    return (
        <div className="mx-auto w-full max-w-5xl">
            {/* Single page title block: live subline replaces the static tagline */}
            <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Reporter dashboard
                    </h1>
                    <p className="mt-1 text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                        {loading ? 'Loading your report overview.' : headerSummary}
                    </p>
                </div>

                {/* One primary action; the map is a quiet secondary link */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 sm:shrink-0">
                    <Link
                        to="/report"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-10 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                        Submit incident report
                    </Link>
                    <Link
                        to="/dashboard?view=map"
                        className="self-center text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:self-auto dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
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
                    {/* Flat stat row: uniform ink numerals, hairline separators */}
                    <section aria-label="Report summary" className="grid grid-cols-2 sm:grid-cols-4">
                        {stats.map((stat, index) => (
                            <Link
                                key={stat.key}
                                to="/my-reports"
                                className={`group block px-1 py-4 transition-colors hover:bg-gray-50 sm:px-4 dark:hover:bg-white/[0.02] ${index > 0 ? 'border-l border-gray-200 pl-4 dark:border-white/10' : ''} ${index >= 2 ? 'max-sm:border-t max-sm:border-gray-200 max-sm:dark:border-white/10' : ''} ${index === 2 ? 'max-sm:border-l-0 max-sm:pl-1' : ''}`}
                            >
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    {stat.label}
                                </p>
                                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900 transition-colors group-hover:text-emerald-800 sm:text-3xl dark:text-white dark:group-hover:text-emerald-300">
                                    {stat.value}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
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
                                                            ? 'bg-emerald-600 dark:bg-emerald-500'
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
                                        {STATUS_CONFIG[latestActiveReport.status]?.label || latestActiveReport.status}.
                                    </span>
                                    {' '}
                                    {getStatusHelp(latestActiveReport.status)}
                                </p>
                                <Link
                                    to={`/my-reports?report=${latestActiveReport._id}`}
                                    className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
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
                            {reports.length > 0 && (
                                <Link
                                    to="/my-reports"
                                    className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                    Open all reports
                                    <HiOutlineChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            )}
                        </div>

                        {recentReports.length > 0 ? (
                            <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-200 dark:divide-white/5 dark:border-white/10">
                                {recentReports.map((report) => {
                                    const statusLabel = STATUS_CONFIG[report.status]?.label || report.status || 'Pending review';
                                    const severity = SEVERITY_CONFIG[report.severity] || { label: 'Unknown', dot: 'bg-gray-400' };
                                    const location = getLocation(report);
                                    return (
                                        <li key={report._id}>
                                            <Link
                                                to={`/my-reports?report=${report._id}`}
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
                                                        Reported {formatRelativeDate(report.createdAt)}
                                                        {report.status === 'responding' && ' · Units on scene'}
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
                                    className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-10 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
