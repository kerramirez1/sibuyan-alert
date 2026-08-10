import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '../router';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { reportsAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineDocumentAdd,
    HiOutlineGlobe,
    HiOutlineClock,
    HiOutlineLightningBolt,
    HiOutlineBadgeCheck,
    HiOutlineClipboardList,
} from 'react-icons/hi';

const STATUS_CONFIG = {
    pending: { label: 'Pending review', dot: 'bg-amber-400', icon: HiOutlineClock },
    verified: { label: 'Verified', dot: 'bg-gray-400', icon: HiOutlineClipboardList },
    transferred: { label: 'Transferred', dot: 'bg-gray-400', icon: HiOutlineClipboardList },
    responding: { label: 'Response active', dot: 'bg-blue-400', icon: HiOutlineLightningBolt },
    resolved: { label: 'Resolved', dot: 'bg-emerald-500', icon: HiOutlineBadgeCheck },
    rejected: { label: 'Rejected', dot: 'bg-gray-400', icon: HiOutlineClipboardList },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', color: 'text-emerald-700' },
    moderate: { label: 'Moderate', color: 'text-amber-700' },
    severe: { label: 'Severe', color: 'text-red-600' },
    critical: { label: 'Critical', color: 'text-red-700 font-bold' },
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
    const { user } = useAuth();
    const navigate = useNavigate();
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <HiOutlineGlobe className="h-4 w-4" aria-hidden="true" />
                        View live map
                    </Link>
                    <Link
                        to="/report"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
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
                        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-4">
                            <div className="bg-white p-4 sm:p-6">
                                <p className="text-xs font-semibold text-gray-500">Total reports</p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{summary.total}</p>
                                <p className="mt-1 text-xs text-gray-500">All submissions</p>
                            </div>
                            <div className="bg-white p-4 sm:p-6">
                                <p className="text-xs font-semibold text-gray-500">Pending review</p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{summary.pending}</p>
                                <p className="mt-1 text-xs text-gray-500">Waiting review</p>
                            </div>
                            <div className="bg-white p-4 sm:p-6">
                                <p className="text-xs font-semibold text-gray-500">Active cases</p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{summary.responding}</p>
                                <p className="mt-1 text-xs text-gray-500">In response</p>
                            </div>
                            <div className="bg-white p-4 sm:p-6">
                                <p className="text-xs font-semibold text-gray-500">Resolved</p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{summary.resolved}</p>
                                <p className="mt-1 text-xs text-gray-500">Closed incidents</p>
                            </div>
                        </div>
                    </section>

                    <section aria-labelledby="recent-reports-heading">
                        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                            <h2 id="recent-reports-heading" className="text-base font-semibold text-gray-900">Recent reports</h2>
                            {reports.length > 0 && (
                                <Link
                                    to="/my-reports"
                                    className="text-sm font-semibold text-brand-600 hover:text-brand-500"
                                >
                                    View all reports &rarr;
                                </Link>
                            )}
                        </div>

                        {recentReports.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                                {recentReports.map((report) => {
                                    const severityLabel = report.severity ? SEVERITY_CONFIG[report.severity]?.label : 'Unknown';
                                    const severityColor = report.severity ? SEVERITY_CONFIG[report.severity]?.color : 'text-gray-500';
                                    const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                                    const StatusIcon = statusConfig.icon;

                                    return (
                                        <div key={report._id} className="group py-5 transition hover:bg-gray-50 sm:px-4 sm:-mx-4 sm:rounded-xl">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                                                    <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} aria-hidden="true" />
                                                    <span className={severityColor}>{severityLabel}</span>
                                                    <span className="text-gray-300">&middot;</span>
                                                    <span className="flex items-center gap-1 text-gray-600">
                                                        <StatusIcon className="h-3 w-3" aria-hidden="true" />
                                                        {statusConfig.label}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {formatRelativeDate(report.createdAt)}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-sm font-semibold text-gray-900">
                                                {getLocation(report)}
                                            </div>
                                            <div className="mt-1 text-sm text-gray-600">
                                                {formatIncidentType(report)}
                                            </div>
                                            <div className="mt-3">
                                                <Link
                                                    to={`/my-reports?report=${report._id}`}
                                                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:text-brand-700"
                                                >
                                                    View report &rarr;
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-8 flex flex-col items-center justify-center text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                                    <HiOutlineClipboardList className="h-6 w-6 text-gray-500" aria-hidden="true" />
                                </div>
                                <h3 className="mt-4 text-sm font-semibold text-gray-900">No incident reports submitted yet.</h3>
                                <p className="mt-1 text-sm text-gray-500">Submit a new incident report to see it tracked here.</p>
                                <div className="mt-5">
                                    <Link
                                        to="/report"
                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                                    >
                                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
                                        Submit incident report
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
