import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from '../router';
import { format, formatDistanceToNow } from 'date-fns';
import toast from '../utils/appToast';
import { resolveAssetUrl } from '../utils/assets';
import {
    HiOutlineBadgeCheck,
    HiOutlineChatAlt2,
    HiOutlineCheckCircle,
    HiOutlineChevronDown,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineSwitchHorizontal,
    HiOutlineXCircle,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import ImageViewer from '../components/ui/ImageViewer';
import ReportActivityTimeline from '../components/reporterReports/ReportActivityTimeline';
import SituationUpdateDialog from '../components/reporterReports/SituationUpdateDialog';

const STATUS_CONFIG = {
    pending: { label: 'Pending review', shortLabel: 'Pending', dot: 'bg-amber-500', icon: HiOutlineClock },
    verified: { label: 'Verified', shortLabel: 'Verified', dot: 'bg-blue-500', icon: HiOutlineCheckCircle },
    transferred: { label: 'Transferred', shortLabel: 'Transferred', dot: 'bg-purple-500', icon: HiOutlineSwitchHorizontal },
    responding: { label: 'Response active', shortLabel: 'Active', dot: 'bg-cyan-500', icon: HiOutlineLightningBolt },
    resolved: { label: 'Resolved', shortLabel: 'Resolved', dot: 'bg-emerald-500', icon: HiOutlineBadgeCheck },
    rejected: { label: 'Rejected', shortLabel: 'Rejected', dot: 'bg-gray-400', icon: HiOutlineXCircle },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', shortLabel: 'Minor', dot: 'bg-gray-400' },
    moderate: { label: 'Moderate', shortLabel: 'Moderate', dot: 'bg-amber-500' },
    severe: { label: 'Severe', shortLabel: 'Severe', dot: 'bg-orange-500' },
    critical: { label: 'Critical', shortLabel: 'Critical', dot: 'bg-red-500' },
};

const FILTERS = ['all', 'pending', 'verified', 'transferred', 'responding', 'resolved', 'rejected'];

const formatDate = (value, pattern = 'MMM d, yyyy, h:mm a') => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, pattern);
};

const formatRelativeDate = (value) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Unknown date'
        : formatDistanceToNow(date, { addSuffix: true });
};

const formatCoordinates = (report) => {
    const lat = Number(report?.coordinates?.lat);
    const lng = Number(report?.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : 'Not available';
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

function MyReportsPage() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReportId, setSelectedReportId] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);
    const [updateDialogReportId, setUpdateDialogReportId] = useState(null);
    const [highlightedUpdates, setHighlightedUpdates] = useState({});
    const [submittingUpdateId, setSubmittingUpdateId] = useState(null);
    const [searchParams] = useSearchParams();
    const { subscribe } = useSocket();
    const requestedReportId = searchParams.get('report');
    const itemRefs = useRef({});

    const fetchReports = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = await reportsAPI.getMyReports();
            setReports(response.data?.data || []);
        } catch (error) {
            console.error('Failed to fetch reports:', error);
            if (!silent) toast.error('Failed to load your reports');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    useEffect(() => {
        if (!requestedReportId || !reports.some((report) => String(report._id) === requestedReportId)) return;
        setFilterStatus('all');
        setSelectedReportId(requestedReportId);
    }, [reports, requestedReportId]);

    useEffect(() => {
        if (!selectedReportId) return undefined;

        const el = itemRefs.current[selectedReportId];
        if (!el) return undefined;

        const frameId = window.requestAnimationFrame(() => {
            const prefersReducedMotion = typeof window !== 'undefined'
                && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

            try {
                el.scrollIntoView({
                    behavior: prefersReducedMotion ? 'auto' : 'smooth',
                    block: 'start',
                });
            } catch {
                el.scrollIntoView?.();
            }
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [selectedReportId]);

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
            updateReport(data?.id, (report) => ({
                ...report,
                status: 'responding',
                respondedBy: report.respondedBy || data?.respondedBy,
                respondedAt: report.respondedAt || data?.respondedAt,
            }));
        });
        const unsubResolve = subscribe('reportResolved', (data) => {
            updateReport(data?.id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
            });
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            updateReport(data?.id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
                resolutionNotes: data?.resolutionNotes,
            });
        });
        const unsubVerify = subscribe('reportVerified', (data) => {
            updateReport(data?.id, { status: 'verified' });
        });
        const unsubReject = subscribe('reportRejected', (data) => {
            updateReport(data?.id, { status: 'rejected', rejectionReason: data?.reason });
        });
        const unsubTransfer = subscribe('reportTransferred', (data) => {
            updateReport(data?.id, {
                status: data?.status || 'transferred',
                municipalityName: data?.toMunicipality || data?.municipalityName,
            });
        });
        const unsubDelete = subscribe('reportDeleted', (data) => {
            if (!data?.id) return;
            setReports((current) => current.filter((report) => report._id !== data.id));
        });
        const unsubReporterUpdate = subscribe('reportUpdatedByReporter', (data) => {
            if (!data?.id || !Array.isArray(data?.report?.reportUpdates)) return;
            updateReport(data.id, {
                reportUpdates: data.report.reportUpdates,
                status: data.report.status || data.status,
            });
        });

        return () => {
            unsubRespond();
            unsubResolve();
            unsubResolutionDetails();
            unsubVerify();
            unsubReject();
            unsubTransfer();
            unsubDelete();
            unsubReporterUpdate();
        };
    }, [subscribe]);

    const handleSubmitUpdate = async (reportId, update) => {
        setSubmittingUpdateId(reportId);
        try {
            const response = await reportsAPI.addUpdate(reportId, update);
            const responseData = response.data?.data || {};
            const serverReport = responseData.report;
            const latestUpdate = responseData.latestUpdate;

            setReports((current) => current.map((report) => (
                report._id === reportId
                    ? {
                        ...report,
                        ...serverReport,
                        reportUpdates: serverReport?.reportUpdates
                            || (latestUpdate ? [...(report.reportUpdates || []), latestUpdate] : report.reportUpdates),
                    }
                    : report
            )));
            if (latestUpdate?._id) {
                setHighlightedUpdates((current) => ({ ...current, [reportId]: latestUpdate._id }));
            }
            setSelectedReportId(reportId);
            toast.success('Situation update sent');
            return { success: true, latestUpdate };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'The update could not be sent. Check your connection and try again.',
            };
        } finally {
            setSubmittingUpdateId(null);
        }
    };

    const getAgencyLabel = (agency) => {
        const labels = { MDRRMO: 'MDRRMO', PNP: 'PNP', SDH: 'Medical / SDH', BFP: 'BFP', LGU: 'MDRRMO' };
        return agency ? (labels[agency] || agency) : 'Assigned response team';
    };

    const counts = useMemo(() => reports.reduce((result, report) => {
        result[report.status] = (result[report.status] || 0) + 1;
        return result;
    }, {}), [reports]);

    const stats = useMemo(() => ({
        total: reports.length,
        pending: counts.pending || 0,
        active: (counts.verified || 0) + (counts.transferred || 0) + (counts.responding || 0),
        resolved: counts.resolved || 0,
    }), [counts, reports.length]);

    const filteredReports = useMemo(() => (
        reports
            .filter((report) => filterStatus === 'all' || report.status === filterStatus)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    ), [filterStatus, reports]);

    if (loading) {
        return (
            <div className="mx-auto max-w-6xl space-y-5 animate-pulse sm:space-y-6">
                <div className="h-14 rounded-2xl bg-gray-100 dark:bg-white/5" />
                <div className="h-24 rounded-2xl border border-gray-200/90 bg-white dark:border-white/10 dark:bg-[#0c1813]/90" />
                <div className="h-52 rounded-2xl border border-gray-200/90 bg-white dark:border-white/10 dark:bg-[#0c1813]/90" />
            </div>
        );
    }

    const metricCards = [
        { label: 'Total reports', value: stats.total, helper: 'All submissions' },
        { label: 'Pending review', value: stats.pending, helper: 'Waiting for verification' },
        { label: 'Active cases', value: stats.active, helper: 'Verified or in response' },
        { label: 'Resolved', value: stats.resolved, helper: 'Closed incidents' },
    ];

    return (
        <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Reporter records
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        My reports
                    </h1>
                    <p className="mt-1 max-w-2xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Track the review and response status of your incident submissions.
                    </p>
                </div>

                <div className="flex shrink-0 items-center">
                    <Link
                        to="/report"
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-auto dark:hover:bg-brand-600"
                    >
                        <HiOutlineExclamation className="h-4 w-4" aria-hidden="true" />
                        <span>Submit incident report</span>
                    </Link>
                </div>
            </header>

            {/* Unified 4-Column Stat Strip */}
            <section aria-label="Report summary">
                <div className="grid grid-cols-2 divide-y divide-gray-200/80 rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/90 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                    {metricCards.map(({ label, value, helper }) => (
                        <div key={label} className="p-4 sm:p-5 flex flex-col justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{label}</p>
                            <p className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{value}</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Submitted Incident Records Section */}
            <section className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Submitted reports">
                <div className="border-b border-gray-200/80 bg-gray-50/70 p-3.5 sm:flex sm:items-center sm:justify-between sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                Submitted incident records
                            </h2>
                            <span className="inline-flex items-center rounded-lg border border-gray-200/90 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                                {filteredReports.length} {filteredReports.length === 1 ? 'record' : 'records'}
                            </span>
                        </div>
                    </div>

                    {reports.length > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:mt-0 sm:pb-0">
                            {FILTERS.map((filter) => {
                                const count = filter === 'all' ? reports.length : (counts[filter] || 0);
                                if (filter !== 'all' && count === 0) return null;
                                const isActive = filterStatus === filter;
                                const label = filter === 'all' ? 'All records' : STATUS_CONFIG[filter]?.label;
                                return (
                                    <button
                                        key={filter}
                                        type="button"
                                        onClick={() => setFilterStatus(filter)}
                                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors ${isActive
                                            ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                                            : 'border-gray-200/90 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-950 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                                            }`}
                                    >
                                        <span>{label}</span>
                                        <span className={`text-[11px] ${isActive ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {reports.length === 0 ? (
                    <div className="px-5 py-12 text-center sm:py-16">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/5">
                            <HiOutlineClipboardList className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        </div>
                        <h3 className="mt-3 text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white">No records found</h3>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400 leading-relaxed">There are currently no reports linked to your profile. Submit a new incident to see it tracked here.</p>
                        <Link to="/report" className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800">
                            <HiOutlineExclamation className="h-4 w-4" aria-hidden="true" />
                            <span>Submit your first report</span>
                        </Link>
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">No reports match this status</p>
                        <button type="button" onClick={() => setFilterStatus('all')} className="mt-2 text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">Clear filter</button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                        {filteredReports.map((report) => {
                            const isExpanded = Boolean(selectedReportId && String(selectedReportId) === String(report._id));
                            const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                            const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                            const isClosed = ['resolved', 'rejected'].includes(report.status);

                            return (
                                <article
                                    key={report._id}
                                    ref={(node) => {
                                        if (node) {
                                            itemRefs.current[report._id] = node;
                                        } else {
                                            delete itemRefs.current[report._id];
                                        }
                                    }}
                                    style={isExpanded ? { borderLeftColor: 'var(--expanded-record-accent, #15803d)' } : undefined}
                                    className={`transition-colors duration-150 border-l-2 sm:border-l-[3px] scroll-mt-4 sm:scroll-mt-6 ${isExpanded
                                        ? 'border-l-brand-700 bg-[#F8FAF9] shadow-2xs dark:border-l-brand-500 dark:bg-[#07130e]/80 border-b border-gray-200/90 dark:border-white/10'
                                        : 'border-l-transparent bg-white hover:bg-gray-50/75 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedReportId(isExpanded ? null : report._id)}
                                        aria-expanded={isExpanded}
                                        className={`grid w-full grid-cols-[minmax(0,1fr)_82px_74px_24px] items-center gap-1.5 px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_140px_96px_28px] sm:gap-4 sm:px-5 ${isExpanded ? 'bg-emerald-500/[0.03] dark:bg-white/[0.01]' : ''}`}
                                    >
                                        <div className="min-w-0">
                                            <h3 className="truncate text-xs font-bold text-gray-950 sm:text-sm dark:text-white">{getLocation(report)}</h3>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 sm:text-xs dark:text-gray-400">
                                                <span className="font-semibold">{formatIncidentType(report)}</span>
                                                <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">&bull;</span>
                                                <span className="truncate">Submitted {formatRelativeDate(report.createdAt)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-start">
                                            <span className="inline-flex h-5.5 sm:h-6 w-full max-w-[82px] sm:max-w-[136px] items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg border border-gray-200/90 bg-white px-1 sm:px-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-800 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
                                                <span className="hidden sm:inline truncate">{status.label}</span>
                                                <span className="sm:hidden truncate">{status.shortLabel || status.label}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-start">
                                            <span className="inline-flex h-5.5 sm:h-6 w-full max-w-[74px] sm:max-w-[92px] items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg border border-gray-200/90 bg-white px-1 sm:px-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                <span className="hidden sm:inline truncate">{severity.label}</span>
                                                <span className="sm:hidden truncate">{severity.shortLabel || severity.label}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-center">
                                            <HiOutlineChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''}`} />
                                        </div>
                                    </button>

                                    {/* Compact Inline Expanded Inspector with distinct boundary */}
                                    {isExpanded && (
                                        <div className="border-t border-gray-200/60 px-4 py-4 space-y-3.5 dark:border-white/5 sm:px-6">
                                            <div>
                                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Incident details</h4>
                                                <p className="mt-1 text-xs text-gray-700 dark:text-gray-300 leading-relaxed break-words">
                                                    {report.description || <span className="italic text-gray-400 dark:text-gray-500">No incident description was provided.</span>}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 pt-1.5 sm:grid-cols-4">
                                                {[
                                                    { label: 'Incident date', value: formatDate(report.incidentTime || report.accidentTime || report.createdAt) },
                                                    { label: 'Incident type', value: formatIncidentType(report) },
                                                    { label: 'Coordinates', value: formatCoordinates(report) },
                                                    { label: 'Report views', value: report.viewCount || 0 },
                                                ].map(({ label, value }) => (
                                                    <div key={label}>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                                            {label}
                                                        </span>
                                                        <p className="mt-0.5 text-xs font-semibold text-gray-950 dark:text-white break-words">{value}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-1 text-xs text-gray-600 dark:text-gray-400">
                                                <span className="font-semibold text-gray-900 dark:text-white">Status:</span> {status.label}
                                                <span className="text-gray-400 dark:text-gray-500"> &middot; Updated {formatRelativeDate(report.updatedAt || report.createdAt)}</span>
                                                {report.respondedBy && (
                                                    <span className="block mt-0.5 text-gray-500 dark:text-gray-400">
                                                        Response unit: {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)} {report.respondedBy?.name ? `(${report.respondedBy.name})` : ''}
                                                    </span>
                                                )}
                                                {report.status === 'resolved' && report.resolutionNotes && (
                                                    <div className="mt-1 text-xs text-emerald-800 dark:text-emerald-400">
                                                        <span className="font-semibold">Resolution notes:</span> {report.resolutionNotes}
                                                    </div>
                                                )}
                                                {report.status === 'rejected' && report.rejectionReason && (
                                                    <div className="mt-1 text-xs text-red-800 dark:text-red-400">
                                                        <span className="font-semibold">Reason:</span> {report.rejectionReason}
                                                    </div>
                                                )}
                                            </div>

                                            {report.images?.length > 0 && (
                                                <div className="pt-1">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                                        Evidence photos ({report.images.length})
                                                    </h4>
                                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                                        {report.images.map((image, index) => (
                                                            <button
                                                                key={`${image}-${index}`}
                                                                type="button"
                                                                onClick={() => { setViewerImage(resolveAssetUrl(image)); setViewerOpen(true); }}
                                                                className="h-14 w-14 overflow-hidden rounded-lg border border-gray-200/90 bg-gray-100 shadow-2xs transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/10 dark:bg-gray-800"
                                                            >
                                                                <img src={resolveAssetUrl(image)} alt={`Incident evidence ${index + 1}`} className="h-full w-full object-cover" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="border-t border-gray-200/60 pt-3 dark:border-white/5" aria-labelledby={`activity-heading-${report._id}`}>
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <div>
                                                        <h4 id={`activity-heading-${report._id}`} className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                                            Incident activity log
                                                        </h4>
                                                    </div>
                                                    {!isClosed ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setUpdateDialogReportId(report._id)}
                                                            className="inline-flex h-8 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:bg-brand-600"
                                                        >
                                                            <HiOutlineChatAlt2 className="h-3.5 w-3.5 text-white/90" aria-hidden="true" />
                                                            <span>Send situation update</span>
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-lg border border-gray-200/90 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                                                            Updates closed
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-2">
                                                    <ReportActivityTimeline
                                                        report={report}
                                                        highlightedUpdateId={highlightedUpdates[report._id]}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <SituationUpdateDialog
                isOpen={Boolean(updateDialogReportId)}
                report={reports.find((report) => report._id === updateDialogReportId) || null}
                submitting={submittingUpdateId === updateDialogReportId}
                onClose={() => setUpdateDialogReportId(null)}
                onSubmit={(update) => handleSubmitUpdate(updateDialogReportId, update)}
            />
            <ImageViewer isOpen={viewerOpen} onClose={() => setViewerOpen(false)} imageSrc={viewerImage} />
        </div>
    );
}

export default MyReportsPage;
