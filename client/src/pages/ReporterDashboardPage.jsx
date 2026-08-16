import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../router';
import { useSocket } from '../context/SocketContext';
import { reportsAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineDocumentAdd,
    HiOutlineGlobe,
    HiOutlineClipboardList,
    HiOutlineChevronRight,
} from 'react-icons/hi';

const STATUS_CONFIG = {
    pending: { label: 'Pending review', shortLabel: 'Pending', dot: 'bg-amber-500' },
    verified: { label: 'Verified', shortLabel: 'Verified', dot: 'bg-blue-500' },
    transferred: { label: 'Transferred', shortLabel: 'Transferred', dot: 'bg-purple-500' },
    responding: { label: 'Response active', shortLabel: 'Active', dot: 'bg-cyan-500' },
    resolved: { label: 'Resolved', shortLabel: 'Resolved', dot: 'bg-emerald-500' },
    rejected: { label: 'Rejected', shortLabel: 'Rejected', dot: 'bg-gray-400' },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', shortLabel: 'Minor', dot: 'bg-emerald-500' },
    moderate: { label: 'Moderate', shortLabel: 'Moderate', dot: 'bg-amber-500' },
    severe: { label: 'Severe', shortLabel: 'Severe', dot: 'bg-orange-500' },
    critical: { label: 'Critical', shortLabel: 'Critical', dot: 'bg-red-500' },
};

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

    // Setup basic socket listeners for realtime dashboard counts and statuses
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

    const recentReports = useMemo(() => {
        return reports.slice(0, 5);
    }, [reports]);

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Reporter Overview
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Reporter dashboard
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Track your reports and stay informed about their response status.
                    </p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2.5 sm:shrink-0 w-full sm:w-auto">
                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-[#07130e] dark:hover:text-white"
                    >
                        <HiOutlineGlobe className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Live incident map</span>
                    </Link>
                    <Link
                        to="/report"
                        className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:bg-brand-600"
                    >
                        <HiOutlineDocumentAdd className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Submit incident report</span>
                    </Link>
                </div>
            </header>

            {loading ? (
                <div className="space-y-3 sm:space-y-4">
                    <div className="h-20 w-full animate-pulse rounded-xl sm:rounded-2xl bg-gray-100 dark:bg-white/5" />
                    <div className="h-64 w-full animate-pulse rounded-xl sm:rounded-2xl bg-gray-100 dark:bg-white/5" />
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-200/90 bg-red-50/80 p-4 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : (
                <>
                    <section aria-labelledby="my-reports-overview">
                        <h2 id="my-reports-overview" className="sr-only">My Reports Overview</h2>
                        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200/90 bg-gray-200/90 shadow-2xs sm:grid-cols-4 sm:rounded-2xl dark:border-white/10 dark:bg-white/10">
                            <div className="bg-white p-3 sm:p-5 dark:bg-[#0c1813]/90">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total reports</p>
                                <p className="mt-1 sm:mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{summary.total}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">All submissions</p>
                            </div>
                            <div className="bg-white p-3 sm:p-5 dark:bg-[#0c1813]/90">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending review</p>
                                <p className="mt-1 sm:mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{summary.pending}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">Waiting review</p>
                            </div>
                            <div className="bg-white p-3 sm:p-5 dark:bg-[#0c1813]/90">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Active cases</p>
                                <p className="mt-1 sm:mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{summary.responding}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">In response</p>
                            </div>
                            <div className="bg-white p-3 sm:p-5 dark:bg-[#0c1813]/90">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resolved</p>
                                <p className="mt-1 sm:mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{summary.resolved}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">Closed incidents</p>
                            </div>
                        </div>
                    </section>

                    <section aria-labelledby="recent-reports-heading" className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90">
                        <div className="flex items-center justify-between border-b border-gray-200/80 bg-gray-50/70 px-3.5 py-2.5 sm:px-5 sm:py-3 dark:border-white/10 dark:bg-white/[0.02]">
                            <h2 id="recent-reports-heading" className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Recent activity log</h2>
                            {reports.length > 0 && (
                                <Link
                                    to="/my-reports"
                                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                    <span className="hidden sm:inline">View all records</span>
                                    <span className="sm:hidden">View all</span>
                                    <HiOutlineChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            )}
                        </div>

                        {recentReports.length > 0 ? (
                            <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {recentReports.map((report) => {
                                    const severityConfig = report.severity ? SEVERITY_CONFIG[report.severity] : SEVERITY_CONFIG.minor;
                                    const severityLabel = report.severity ? (SEVERITY_CONFIG[report.severity]?.label || 'Minor') : 'Unknown';
                                    const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;

                                    return (
                                        <div
                                            key={report._id}
                                            className="group flex flex-col gap-2.5 p-3.5 transition-colors hover:bg-gray-50/75 sm:grid sm:grid-cols-[minmax(0,1fr)_140px_96px_116px] sm:items-center sm:gap-4 sm:p-5 dark:hover:bg-white/[0.02]"
                                        >
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 sm:line-clamp-1 font-display text-sm font-bold text-gray-950 sm:text-base dark:text-white">
                                                    {getLocation(report)}
                                                </p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{formatIncidentType(report)}</span>
                                                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                                                    <span>Reported {formatRelativeDate(report.createdAt)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-0.5 sm:contents">
                                                <div className="flex items-center gap-1.5 sm:contents">
                                                    <div className="flex items-center sm:justify-start">
                                                        <span className="inline-flex h-5.5 sm:h-6 w-auto sm:w-full max-w-[136px] items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg border border-gray-200/90 bg-white px-1.5 sm:px-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-800 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot}`} aria-hidden="true" />
                                                            <span className="hidden sm:inline truncate">{statusConfig.label}</span>
                                                            <span className="sm:hidden truncate">{statusConfig.shortLabel || statusConfig.label}</span>
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center sm:justify-start">
                                                        <span className="inline-flex h-5.5 sm:h-6 w-auto sm:w-full max-w-[92px] items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg border border-gray-200/90 bg-white px-1.5 sm:px-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityConfig?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                                            <span className="hidden sm:inline truncate">{severityLabel}</span>
                                                            <span className="sm:hidden truncate">{severityConfig?.shortLabel || severityLabel}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-end">
                                                    <Link
                                                        to={`/my-reports?report=${report._id}`}
                                                        className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:h-8 sm:w-[116px] sm:justify-center sm:gap-1 sm:rounded-lg sm:border sm:border-gray-200/90 sm:bg-white sm:px-3 sm:text-gray-700 sm:shadow-2xs sm:hover:border-gray-300 sm:hover:bg-gray-50 sm:hover:text-gray-950 dark:text-emerald-400 dark:hover:text-emerald-300 sm:dark:border-white/10 sm:dark:bg-white/5 sm:dark:text-gray-200 sm:dark:hover:border-white/20 sm:dark:hover:bg-white/10 sm:dark:hover:text-white"
                                                    >
                                                        <span>View details</span>
                                                        <HiOutlineChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-current sm:text-gray-400 sm:dark:text-gray-500" aria-hidden="true" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-10 text-center sm:p-14">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
                                    <HiOutlineClipboardList className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <h3 className="mt-3 font-display text-sm font-bold text-gray-950 dark:text-white">No activity logged</h3>
                                <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">There are currently no reports linked to your profile. Submit a new incident to see it tracked here.</p>
                                <div className="mt-5">
                                    <Link
                                        to="/report"
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                                    >
                                        <HiOutlineDocumentAdd className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span>Submit new incident</span>
                                    </Link>
                                </div>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default ReporterDashboardPage;
