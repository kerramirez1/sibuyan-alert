import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../router';
import { useSocket } from '../context/SocketContext';
import { reportsAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    HiCheck,
    HiOutlineChevronRight,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentAdd,
    HiOutlineExclamationCircle,
    HiOutlineGlobe,
    HiOutlineLocationMarker,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
    HiOutlineTruck,
} from 'react-icons/hi';
import Button from '../components/ui/Button';

const STATUS_CONFIG = {
    pending: {
        label: 'Pending review',
        shortLabel: 'Pending',
        dot: 'bg-amber-500',
        badge: 'border-amber-200/90 bg-amber-50/80 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
        stepIndex: 1,
    },
    verified: {
        label: 'Verified',
        shortLabel: 'Verified',
        dot: 'bg-blue-500',
        badge: 'border-blue-200/90 bg-blue-50/80 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300',
        stepIndex: 2,
    },
    transferred: {
        label: 'Transferred',
        shortLabel: 'Transferred',
        dot: 'bg-purple-500',
        badge: 'border-purple-200/90 bg-purple-50/80 text-purple-800 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300',
        stepIndex: 2,
    },
    responding: {
        label: 'Response active',
        shortLabel: 'Active',
        dot: 'bg-cyan-500',
        badge: 'border-cyan-200/90 bg-cyan-50/80 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300',
        stepIndex: 3,
    },
    resolved: {
        label: 'Resolved',
        shortLabel: 'Resolved',
        dot: 'bg-emerald-500',
        badge: 'border-emerald-200/90 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
        stepIndex: 4,
    },
    rejected: {
        label: 'Rejected',
        shortLabel: 'Rejected',
        dot: 'bg-gray-400',
        badge: 'border-gray-200/90 bg-gray-50/80 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-400',
        stepIndex: 1,
    },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', shortLabel: 'Minor', dot: 'bg-emerald-500' },
    moderate: { label: 'Moderate', shortLabel: 'Moderate', dot: 'bg-amber-500' },
    severe: { label: 'Severe', shortLabel: 'Severe', dot: 'bg-orange-500' },
    critical: { label: 'Critical', shortLabel: 'Critical', dot: 'bg-red-500' },
};

const LIFECYCLE_STEPS = [
    { key: 'submitted', label: 'Submitted', desc: 'Received by system' },
    { key: 'review', label: 'Under review', desc: 'MDRRMO triage' },
    { key: 'verified', label: 'Verified', desc: 'Incident confirmed' },
    { key: 'responding', label: 'Response active', desc: 'Units on scene' },
    { key: 'resolved', label: 'Resolved', desc: 'Safely closed' },
];

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
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
            {/* Header: Citizen Reporting Workspace */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <HiOutlineShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Reporter Overview</span>
                            <span className="text-emerald-600/60 dark:text-emerald-400/60 font-normal">·</span>
                            <span className="hidden xs:inline text-emerald-700 dark:text-emerald-400 font-bold">Citizen Workspace</span>
                        </span>
                    </div>
                    <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Reporter dashboard
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Track your submitted reports and follow their response progress.
                    </p>
                </div>

                {/* Primary & Secondary Header Actions */}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2.5 sm:shrink-0 w-full sm:w-auto">
                    <Link
                        to="/dashboard?view=map"
                        className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#0c1813]/90 dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-[#07130e] dark:hover:text-white cursor-pointer min-h-[44px] sm:min-h-0"
                    >
                        <HiOutlineGlobe className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>Live incident map</span>
                    </Link>
                    <Link
                        to="/report"
                        className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px] sm:min-h-0"
                    >
                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
                        <span>Submit incident report</span>
                    </Link>
                </div>
            </header>

            {loading ? (
                <div className="space-y-3 sm:space-y-4 animate-pulse">
                    <div className="h-20 w-full rounded-xl sm:rounded-2xl bg-gray-100 dark:bg-white/5" />
                    <div className="h-28 w-full rounded-xl sm:rounded-2xl bg-gray-100 dark:bg-white/5" />
                    <div className="h-64 w-full rounded-xl sm:rounded-2xl bg-gray-100 dark:bg-white/5" />
                </div>
            ) : error ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-red-200/90 bg-red-50/80 p-4 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    <div className="flex items-center gap-2">
                        <HiOutlineExclamationCircle className="h-5 w-5 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <Button variant="dangerOutline" size="sm" onClick={() => fetchReports(false)}>
                        <HiOutlineRefresh className="mr-1.5 h-3.5 w-3.5" />
                        Retry
                    </Button>
                </div>
            ) : (
                <>
                    {/* Compact Reporting Status Summary Strip */}
                    <section aria-labelledby="my-reports-overview">
                        <h2 id="my-reports-overview" className="sr-only">My Reports Overview</h2>
                        <div className="grid grid-cols-2 divide-y divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:rounded-2xl">
                            {/* Total Reports */}
                            <div className="p-3.5 sm:p-4 flex flex-col justify-between bg-white dark:bg-[#0c1813]/90">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total reports</p>
                                <p className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white tabular-nums">{summary.total}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">All submissions</p>
                            </div>

                            {/* Pending Review */}
                            <div className={`p-3.5 sm:p-4 flex flex-col justify-between transition-colors ${summary.pending > 0 ? 'bg-amber-50/40 dark:bg-amber-950/15' : 'bg-white dark:bg-[#0c1813]/90'}`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending review</p>
                                    {summary.pending > 0 && (
                                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
                                    )}
                                </div>
                                <p className={`mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${summary.pending > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-gray-950 dark:text-white'}`}>{summary.pending}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">Waiting review</p>
                            </div>

                            {/* Active Cases */}
                            <div className={`p-3.5 sm:p-4 flex flex-col justify-between transition-colors ${summary.responding > 0 ? 'bg-cyan-50/40 dark:bg-cyan-950/15' : 'bg-white dark:bg-[#0c1813]/90'}`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Active cases</p>
                                    {summary.responding > 0 && (
                                        <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" aria-hidden="true" />
                                    )}
                                </div>
                                <p className={`mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${summary.responding > 0 ? 'text-cyan-800 dark:text-cyan-300' : 'text-gray-950 dark:text-white'}`}>{summary.responding}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">In response</p>
                            </div>

                            {/* Resolved */}
                            <div className="p-3.5 sm:p-4 flex flex-col justify-between bg-white dark:bg-[#0c1813]/90">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resolved</p>
                                <p className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-emerald-800 dark:text-emerald-300 tabular-nums">{summary.resolved}</p>
                                <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">Closed incidents</p>
                            </div>
                        </div>
                    </section>

                    {/* Reporting Lifecycle Rail (when reports exist) */}
                    {latestActiveReport && (
                        <section aria-labelledby="lifecycle-rail-heading" className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90 sm:p-5">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pb-3 border-b border-gray-200/70 dark:border-white/10">
                                <div>
                                    <h2 id="lifecycle-rail-heading" className="text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white flex items-center gap-1.5">
                                        <HiOutlineClock className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                                        <span>Reporting lifecycle · Latest update</span>
                                    </h2>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        {latestActiveReport.title || formatIncidentType(latestActiveReport)} · {getLocation(latestActiveReport)}
                                    </p>
                                </div>
                                <span className={`inline-flex self-start sm:self-auto items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CONFIG[latestActiveReport.status]?.badge || 'border-gray-200 bg-gray-50'}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[latestActiveReport.status]?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                    <span>{STATUS_CONFIG[latestActiveReport.status]?.label || latestActiveReport.status}</span>
                                </span>
                            </div>

                            {/* Lifecycle Steps Horizontal Progress Rail */}
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-2">
                                {LIFECYCLE_STEPS.map((step, idx) => {
                                    const isCurrent = activeStepIndex === idx;
                                    const isCompleted = activeStepIndex > idx;

                                    return (
                                        <div
                                            key={step.key}
                                            className={`flex flex-col rounded-xl border p-2.5 transition-colors ${
                                                isCurrent
                                                    ? 'border-emerald-600/90 bg-emerald-50/80 text-emerald-950 shadow-2xs ring-1 ring-emerald-500/30 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                                                    : isCompleted
                                                        ? 'border-gray-200/80 bg-gray-50/60 text-gray-800 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300'
                                                        : 'border-dashed border-gray-200/60 bg-transparent text-gray-400 dark:border-white/5 dark:text-gray-600 opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-mono font-bold">{`0${idx + 1}`}</span>
                                                {isCompleted ? (
                                                    <HiCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                ) : isCurrent ? (
                                                    <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
                                                ) : null}
                                            </div>
                                            <p className="mt-1 text-xs font-bold leading-tight">{step.label}</p>
                                            <p className="mt-0.5 text-[10px] leading-tight text-gray-500 dark:text-gray-400 truncate">{step.desc}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-3.5 flex items-center justify-between rounded-lg bg-gray-50/70 p-2.5 text-xs text-gray-600 dark:bg-white/[0.02] dark:text-gray-400">
                                <span>{getStatusHelp(latestActiveReport.status)}</span>
                                <Link
                                    to={`/my-reports?report=${latestActiveReport._id}`}
                                    className="font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 inline-flex items-center gap-1 shrink-0 ml-2"
                                >
                                    <span>Open report</span>
                                    <HiOutlineChevronRight className="h-3 w-3" />
                                </Link>
                            </div>
                        </section>
                    )}

                    {/* Report Activity Ledger */}
                    <section aria-labelledby="recent-reports-heading" className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90">
                        <div className="flex items-center justify-between border-b border-gray-200/80 bg-gray-50/70 px-3.5 py-2.5 sm:px-5 sm:py-3 dark:border-white/10 dark:bg-white/[0.02]">
                            <div>
                                <h2 id="recent-reports-heading" className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Recent activity log</h2>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:block">Latest citizen submissions and active response progress</p>
                            </div>
                            {reports.length > 0 && (
                                <Link
                                    to="/my-reports"
                                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                                >
                                    <span className="hidden sm:inline">View all records</span>
                                    <span className="sm:hidden">View all</span>
                                    <HiOutlineChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            )}
                        </div>

                        {recentReports.length > 0 && (
                            <div className="hidden border-b border-gray-200/80 bg-gray-50/50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:grid sm:grid-cols-[minmax(0,1fr)_140px_96px_116px] sm:items-center sm:gap-4 md:px-5 dark:border-white/10 dark:bg-white/[0.01] dark:text-gray-400">
                                <span>Incident</span>
                                <span>Status</span>
                                <span>Severity</span>
                                <span className="text-right">Action</span>
                            </div>
                        )}

                        {recentReports.length > 0 ? (
                            <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {recentReports.map((report) => {
                                    const severityConfig = report.severity ? SEVERITY_CONFIG[report.severity] : SEVERITY_CONFIG.minor;
                                    const severityLabel = report.severity ? (SEVERITY_CONFIG[report.severity]?.label || 'Minor') : 'Unknown';
                                    const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;

                                    return (
                                        <article
                                            key={report._id}
                                            className="group flex flex-col gap-2.5 p-3.5 transition-colors hover:bg-gray-50/75 sm:grid sm:grid-cols-[minmax(0,1fr)_140px_96px_116px] sm:items-center sm:gap-4 sm:p-4 md:p-5 dark:hover:bg-white/[0.02]"
                                        >
                                            {/* Location & Title */}
                                            <div className="min-w-0">
                                                <div className="flex items-start gap-1.5">
                                                    <HiOutlineLocationMarker className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                                                    <p className="line-clamp-2 sm:line-clamp-1 font-display text-sm font-bold text-gray-950 sm:text-base dark:text-white">
                                                        {getLocation(report)}
                                                    </p>
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 pl-5.5">
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{formatIncidentType(report)}</span>
                                                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                                                    <span>Reported {formatRelativeDate(report.createdAt)}</span>
                                                    {report.status === 'responding' && (
                                                        <>
                                                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                                                            <span className="text-cyan-700 dark:text-cyan-400 font-medium inline-flex items-center gap-1">
                                                                <HiOutlineTruck className="h-3 w-3" />
                                                                Units on scene
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status & Severity Indicators (Inline dot + label, no bordered pill) */}
                                            <div className="flex items-center justify-between pt-0.5 sm:contents">
                                                <div className="flex items-center gap-3 sm:contents">
                                                    {/* Status Indicator */}
                                                    <div className="flex items-center sm:justify-start">
                                                        <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                                                            <span className={`h-2 w-2 shrink-0 rounded-full ${statusConfig.dot}`} aria-hidden="true" />
                                                            <span className="truncate">{statusConfig.label}</span>
                                                        </div>
                                                    </div>

                                                    {/* Severity Indicator */}
                                                    <div className="flex items-center sm:justify-start">
                                                        <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                            <span className={`h-2 w-2 shrink-0 rounded-full ${severityConfig?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                                                            <span className="truncate">{severityLabel}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action Link */}
                                                <div className="flex items-center justify-end">
                                                    <Link
                                                        to={`/my-reports?report=${report._id}`}
                                                        className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:h-8 sm:w-[116px] sm:justify-center sm:gap-1 sm:rounded-lg sm:border sm:border-gray-200/90 sm:bg-white sm:px-3 sm:text-gray-700 sm:shadow-2xs sm:hover:border-gray-300 sm:hover:bg-gray-50 sm:hover:text-gray-950 dark:text-emerald-400 dark:hover:text-emerald-300 sm:dark:border-white/10 sm:dark:bg-white/5 sm:dark:text-gray-200 sm:dark:hover:border-white/20 sm:dark:hover:bg-white/10 sm:dark:hover:text-white cursor-pointer min-h-[44px] sm:min-h-0"
                                                    >
                                                        <span>View details</span>
                                                        <HiOutlineChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-current sm:text-gray-400 sm:dark:text-gray-500" aria-hidden="true" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-10 text-center sm:p-14">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
                                    <HiOutlineClipboardList className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <h3 className="mt-3 font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">No activity logged</h3>
                                <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                    There are currently no reports linked to your profile. Submit a new incident to see it tracked here.
                                </p>
                                <div className="mt-5">
                                    <Link
                                        to="/report"
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px] sm:min-h-0"
                                    >
                                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
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
