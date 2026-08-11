import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../router';
import { useSocket } from '../context/SocketContext';
import { reportsAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineDocumentAdd,
    HiOutlineGlobe,
    HiOutlineClipboardList,
} from 'react-icons/hi';

const STATUS_CONFIG = {
    pending: { label: 'Pending review', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-400' },
    verified: { label: 'Verified', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400' },
    transferred: { label: 'Transferred', bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-800 dark:text-indigo-400' },
    responding: { label: 'Response active', bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-800 dark:text-cyan-400' },
    resolved: { label: 'Resolved', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-800 dark:text-emerald-400' },
    rejected: { label: 'Rejected', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-300' },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', color: 'text-emerald-700 dark:text-emerald-400' },
    moderate: { label: 'Moderate', color: 'text-amber-700 dark:text-amber-400' },
    severe: { label: 'Severe', color: 'text-orange-700 dark:text-orange-400' },
    critical: { label: 'Critical', color: 'text-red-700 dark:text-red-400 font-bold' },
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
        // Assume API returns newest first, just take top 5
        return reports.slice(0, 5);
    }, [reports]);

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Reporter Overview</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Reporter dashboard</h1>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                        Track your reports and stay informed about their response status.
                    </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-sm border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        <HiOutlineGlobe className="h-4 w-4" aria-hidden="true" />
                        Live incident map
                    </Link>
                    <Link
                        to="/report"
                        className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-sm border border-transparent bg-brand-700 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:hover:bg-brand-600"
                    >
                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
                        Submit incident report
                    </Link>
                </div>
            </header>

            {loading ? (
                <div className="space-y-6">
                    <div className="h-28 w-full animate-pulse rounded-2xl bg-gray-100" />
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 w-full animate-pulse rounded-xl bg-gray-50" />
                        ))}
                    </div>
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <>
                    <section aria-labelledby="my-reports-overview">
                        <h2 id="my-reports-overview" className="sr-only">My Reports Overview</h2>
                        <div className="grid grid-cols-2 gap-px border border-gray-300 bg-gray-300 dark:border-gray-600 dark:bg-gray-600 sm:grid-cols-4">
                            <div className="bg-white p-5 dark:bg-gray-900 sm:p-7">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total reports</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">All submissions</p>
                            </div>
                            <div className="bg-white p-5 dark:bg-gray-900 sm:p-7">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending review</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{summary.pending}</p>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Waiting review</p>
                            </div>
                            <div className="bg-white p-5 dark:bg-gray-900 sm:p-7">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Active cases</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{summary.responding}</p>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">In response</p>
                            </div>
                            <div className="bg-white p-5 dark:bg-gray-900 sm:p-7">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resolved</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{summary.resolved}</p>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Closed incidents</p>
                            </div>
                        </div>
                    </section>

                    <section aria-labelledby="recent-reports-heading" className="border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
                        <div className="flex items-center justify-between border-b border-gray-300 bg-gray-100 px-5 py-4 dark:border-gray-600 dark:bg-gray-800">
                            <h2 id="recent-reports-heading" className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">Recent activity log</h2>
                            {reports.length > 0 && (
                                <Link
                                    to="/my-reports"
                                    className="text-xs font-bold uppercase tracking-wider text-brand-700 hover:text-brand-800 dark:text-brand-400"
                                >
                                    View all records
                                </Link>
                            )}
                        </div>

                        {recentReports.length > 0 ? (
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {recentReports.map((report) => {
                                    const severityLabel = report.severity ? SEVERITY_CONFIG[report.severity]?.label : 'Unknown';
                                    const severityColor = report.severity ? SEVERITY_CONFIG[report.severity]?.color : 'text-gray-500';
                                    const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;

                                    return (
                                        <div key={report._id} className="flex flex-col gap-4 p-5 transition hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className={`inline-flex items-center rounded-sm px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${statusConfig.bg} ${statusConfig.text}`}>
                                                        {statusConfig.label}
                                                    </span>
                                                    <span className={`text-[11px] font-bold uppercase tracking-wider ${severityColor}`}>
                                                        {severityLabel} Severity
                                                    </span>
                                                </div>
                                                <p className="mt-3 truncate text-sm font-bold text-gray-900 dark:text-white">
                                                    {getLocation(report)}
                                                </p>
                                                <div className="mt-1 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                                    <span className="font-semibold">{formatIncidentType(report)}</span>
                                                    <span>&middot;</span>
                                                    <span>Reported {formatRelativeDate(report.createdAt)}</span>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center sm:ml-4 sm:mt-0">
                                                <Link
                                                    to={`/my-reports?report=${report._id}`}
                                                    className="inline-flex min-h-[36px] items-center justify-center rounded-sm border border-gray-300 bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-800 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                                                >
                                                    View details
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center">
                                <div className="flex h-12 w-12 items-center justify-center bg-gray-100 dark:bg-gray-800">
                                    <HiOutlineClipboardList className="h-6 w-6 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                                </div>
                                <h3 className="mt-4 text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">No activity logged</h3>
                                <p className="mt-1 max-w-sm text-sm text-gray-600 dark:text-gray-400">There are currently no reports linked to your profile. Submit a new incident to see it tracked here.</p>
                                <div className="mt-6">
                                    <Link
                                        to="/report"
                                        className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-sm bg-brand-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-800"
                                    >
                                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
                                        Submit new incident
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
