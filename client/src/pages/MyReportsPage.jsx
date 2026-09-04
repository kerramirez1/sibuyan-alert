import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from '../router';
import { format, formatDistanceToNow } from 'date-fns';
import toast from '../utils/appToast';
import {
    HiCheck,
    HiOutlineChevronDown,
    HiOutlineExclamationCircle,
    HiOutlineFilter,
    HiOutlineRefresh,
    HiOutlineX,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import Button from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import ImageViewer from '../components/ui/ImageViewer';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import ReportActivityTimeline from '../components/reporterReports/ReportActivityTimeline';
import SituationUpdateDialog from '../components/reporterReports/SituationUpdateDialog';

// Canonical lifecycle vocabulary shared with the reporter dashboard, so one
// state is never named two different ways across pages.
const STATUS_CONFIG = {
    pending: { label: 'Pending review' },
    verified: { label: 'Verified' },
    transferred: { label: 'Transferred' },
    responding: { label: 'Responding' },
    resolved: { label: 'Resolved' },
    rejected: { label: 'Rejected' },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', dot: 'bg-emerald-500' },
    moderate: { label: 'Moderate', dot: 'bg-amber-500' },
    severe: { label: 'Severe', dot: 'bg-orange-500' },
    critical: { label: 'Critical', dot: 'bg-red-500' },
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

// Mobile filter bottom sheet / modal
function MyReportsFilterModal({ isOpen, onClose, filterStatus, onApplyFilter, counts, totalReports }) {
    const [draftStatus, setDraftStatus] = useState(filterStatus);
    const modalId = useId();

    useEffect(() => {
        if (isOpen) {
            setDraftStatus(filterStatus);
        }
    }, [isOpen, filterStatus]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') return null;

    const handleApply = () => {
        onApplyFilter(draftStatus);
        onClose();
    };

    const handleClear = () => {
        setDraftStatus('all');
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${modalId}-title`}
                className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0c1813]"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200/80 px-4 py-3 sm:px-5 dark:border-white/10">
                    <div className="flex items-center gap-2">
                        <HiOutlineFilter className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <h3 id={`${modalId}-title`} className="font-display text-sm font-bold text-gray-950 dark:text-white">
                            Filter reports by status
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close filter sheet"
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200 cursor-pointer"
                    >
                        <HiOutlineX className="h-5 w-5" />
                    </button>
                </div>

                {/* Options List */}
                <div className="overflow-y-auto p-4 space-y-1.5 flex-1">
                    {FILTERS.map((filterKey) => {
                        const count = filterKey === 'all' ? totalReports : (counts[filterKey] || 0);
                        if (filterKey !== 'all' && count === 0) return null;
                        const isSelected = draftStatus === filterKey;
                        const label = filterKey === 'all' ? 'All records' : STATUS_CONFIG[filterKey]?.label;

                        return (
                            <button
                                key={filterKey}
                                type="button"
                                onClick={() => setDraftStatus(filterKey)}
                                className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                                    isSelected
                                        ? 'text-emerald-800 dark:text-emerald-300'
                                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5'
                                }`}
                            >
                                <span>{label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-400">{count}</span>
                                    {isSelected && <HiCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-gray-200/80 bg-gray-50/70 px-4 py-3 sm:px-5 dark:border-white/10 dark:bg-white/[0.02]">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                    >
                        Clear all
                    </button>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleApply}>
                            Apply filters
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

const MyReportsSkeleton = () => (
    <div role="status" aria-busy="true" aria-label="Loading submitted reports">
        <span className="sr-only">Loading submitted reports</span>
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

function MyReportsPage() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedReportId, setSelectedReportId] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterModalOpen, setFilterModalOpen] = useState(false);
    const [viewerItem, setViewerItem] = useState(null);
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
            setError('');
        } catch (err) {
            console.error('Failed to fetch reports:', err);
            setError('Unable to load your submitted reports.');
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
        setSelectedReportId(String(requestedReportId));
    }, [reports, requestedReportId]);

    const toggleReportSelected = useCallback((id) => {
        if (!id) return;
        const strId = String(id);
        setSelectedReportId((current) => (current && String(current) === strId ? null : strId));
    }, []);

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
                    block: 'nearest',
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
        } catch (err) {
            return {
                success: false,
                message: err.response?.data?.message || 'The update could not be sent. Check your connection and try again.',
            };
        } finally {
            setSubmittingUpdateId(null);
        }
    };

    const getAgencyLabel = (agency) => {
        const labels = { MDRRMO: 'MDRRMO', PNP: 'PNP', 'Medical Team': 'Medical Team', BFP: 'BFP', LGU: 'MDRRMO' };
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

    const metricCards = [
        { label: 'Total reports', value: stats.total, helper: 'All submissions' },
        { label: 'Pending review', value: stats.pending, helper: 'Waiting for verification' },
        { label: 'Active', value: stats.active, helper: 'Verified or in response' },
        { label: 'Resolved', value: stats.resolved, helper: 'Closed incidents' },
    ];

    return (
        <div className="mx-auto w-full max-w-6xl">
            {/* Single page title block */}
            <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        My reports
                    </h1>
                    <p className="mt-1 max-w-xl text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                        Track the review and response status of your incident submissions.
                    </p>
                </div>

                <div className="hidden sm:block sm:shrink-0">
                    <Link
                        to="/report"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-10 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                        Submit incident report
                    </Link>
                </div>
            </header>

            {loading ? (
                <MyReportsSkeleton />
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
                <div className="divide-y divide-gray-200 dark:divide-white/10">
                    {/* Flat stat row: uniform ink numerals, hairline separators */}
                    <section aria-label="Report summary" className="grid grid-cols-2 sm:grid-cols-4">
                        {metricCards.map(({ label, value, helper }, index) => (
                            <div
                                key={label}
                                className={`px-1 py-4 sm:px-4 ${index > 0 ? 'border-l border-gray-200 pl-4 dark:border-white/10' : ''} ${index >= 2 ? 'max-sm:border-t max-sm:border-gray-200 max-sm:dark:border-white/10' : ''} ${index === 2 ? 'max-sm:border-l-0 max-sm:pl-1' : ''}`}
                            >
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    {label}
                                </p>
                                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                                    {value}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
                            </div>
                        ))}
                    </section>

                    {/* Mobile primary action: context (stats) first, action second */}
                    <div className="py-4 sm:hidden">
                        <Link
                            to="/report"
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                            Submit incident report
                        </Link>
                    </div>

                    {/* Submitted incident records */}
                    <section className="py-6" aria-label="Submitted reports">
                        <div className="flex items-baseline justify-between gap-2">
                            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {filterStatus === 'all'
                                    ? 'Submitted reports'
                                    : `Submitted reports · ${filteredReports.length} of ${reports.length}`}
                            </h2>

                            {reports.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setFilterModalOpen(true)}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 sm:hidden dark:border-white/10 dark:text-gray-200"
                                >
                                    <HiOutlineFilter className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                    <span>Filter reports</span>
                                    {filterStatus !== 'all' && (
                                        <span className="inline-flex items-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                                            1
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>

                        {reports.length > 0 && (
                            <div className="mt-3 hidden gap-5 border-b border-gray-200 sm:flex dark:border-white/10" aria-label="Filter reports by status">
                                {FILTERS.map((filter) => {
                                    const count = filter === 'all' ? reports.length : (counts[filter] || 0);
                                    if (filter !== 'all' && count === 0) return null;
                                    const isActive = filterStatus === filter;
                                    const label = filter === 'all' ? 'All records' : STATUS_CONFIG[filter]?.label;

                                    return (
                                        <button
                                            key={filter}
                                            type="button"
                                            aria-pressed={isActive}
                                            onClick={() => setFilterStatus(filter)}
                                            className={`-mb-px shrink-0 border-b-2 pb-2 text-sm transition-colors ${
                                                isActive
                                                    ? 'border-emerald-600 font-semibold text-emerald-800 dark:border-emerald-500 dark:text-emerald-300'
                                                    : 'border-transparent font-normal text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                            }`}
                                        >
                                            {label}
                                            <span className="ml-1.5 tabular-nums text-xs text-gray-400 dark:text-gray-500">{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {reports.length === 0 ? (
                            <div className="py-10 text-center sm:text-left">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                    You have not submitted an incident report yet.
                                </h3>
                                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 sm:mx-0 dark:text-gray-400">
                                    Submit a new emergency or incident report to track its verification and response here.
                                </p>
                                <div className="mt-4">
                                    <Link
                                        to="/report"
                                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-10 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                    >
                                        Submit incident report
                                    </Link>
                                </div>
                            </div>
                        ) : filteredReports.length === 0 ? (
                            <div className="py-10 text-center">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    No reports match this status
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('all')}
                                    className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                    Clear filter
                                </button>
                            </div>
                        ) : (
                            <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-200 dark:divide-white/5 dark:border-white/10">
                                {filteredReports.map((report) => {
                                    const isExpanded = Boolean(selectedReportId && String(selectedReportId) === String(report._id));
                                    const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                                    const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.minor;
                                    const severityLabel = report.severity ? (SEVERITY_CONFIG[report.severity]?.label || 'Minor') : 'Unknown';
                                    const isClosed = ['resolved', 'rejected'].includes(report.status);

                                    return (
                                        <li
                                            key={report._id}
                                            ref={(node) => {
                                                if (node) {
                                                    itemRefs.current[String(report._id)] = node;
                                                } else {
                                                    delete itemRefs.current[String(report._id)];
                                                }
                                            }}
                                        >
                                        <article className="scroll-mt-20 sm:scroll-mt-24">
                                            {/* Collapsible header row: carries the expanded-state accent */}
                                            <button
                                                type="button"
                                                onClick={() => toggleReportSelected(report._id)}
                                                aria-expanded={isExpanded}
                                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for report at ${getLocation(report)}`}
                                                style={isExpanded ? { borderLeftColor: 'var(--expanded-record-accent, #059669)' } : undefined}
                                                className={`w-full flex flex-col gap-2 border-l-2 p-3.5 text-left transition-colors sm:grid sm:grid-cols-[minmax(0,1fr)_140px_96px_28px] sm:items-center sm:gap-4 sm:border-l-[3px] sm:p-4 md:p-5 cursor-pointer min-h-[44px] ${
                                                    isExpanded
                                                        ? 'border-l-emerald-600 dark:border-l-emerald-500'
                                                        : 'border-l-transparent hover:bg-gray-50/75 dark:hover:bg-white/[0.02]'
                                                }`}
                                            >
                                                {/* Location & Title */}
                                                <div className="min-w-0">
                                                    <h3 className="line-clamp-2 sm:line-clamp-1 text-sm font-semibold text-gray-900 sm:text-base dark:text-white">
                                                        {getLocation(report)}
                                                    </h3>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 sm:text-xs dark:text-gray-400">
                                                        <span className="font-medium text-gray-600 dark:text-gray-300">{formatIncidentType(report)}</span>
                                                        <span aria-hidden="true">·</span>
                                                        <span>Submitted {formatRelativeDate(report.createdAt)}</span>
                                                    </div>
                                                </div>

                                                {/* Status & severity: one meta line on mobile (dot glued
                                                    to severity), dedicated columns on sm+ */}
                                                <div className="flex items-center justify-between gap-2 pt-0.5 sm:contents">
                                                    <p className="truncate text-[11px] text-gray-500 sm:hidden dark:text-gray-400">
                                                        {status.label}
                                                        <span aria-hidden="true"> · </span>
                                                        <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                        {severityLabel}
                                                    </p>
                                                    <div className="hidden sm:contents">
                                                        <div className="flex items-center sm:justify-start">
                                                            <span className="truncate text-sm font-medium text-gray-600 dark:text-gray-400">
                                                                {status.label}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center sm:justify-start">
                                                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400">
                                                                <span className={`h-2 w-2 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                                <span className="truncate">{severityLabel}</span>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Chevron Affordance */}
                                                    <div className="flex items-center justify-end">
                                                        <HiOutlineChevronDown
                                                            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                                                                isExpanded ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''
                                                            }`}
                                                            aria-hidden="true"
                                                        />
                                                    </div>
                                                </div>
                                            </button>

                                            {/* Progressive Disclosure: Expanded Incident Dossier */}
                                            {isExpanded && (
                                                <div className="space-y-5 border-t border-gray-200 px-1 py-5 sm:px-2 dark:border-white/10">
                                                    {/* 1. Incident Description */}
                                                    <div>
                                                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                            Incident details
                                                        </h4>
                                                        <p className="mt-1 text-sm leading-relaxed text-gray-800 break-words dark:text-gray-200">
                                                            {report.description || (
                                                                <span className="italic text-gray-400 dark:text-gray-500">
                                                                    No incident description was provided.
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {/* 2. Key Facts Grid */}
                                                    <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-5 sm:grid-cols-4 dark:border-white/5">
                                                        {[
                                                            { label: 'Incident date', value: formatDate(report.incidentTime || report.accidentTime || report.createdAt) },
                                                            { label: 'Incident type', value: formatIncidentType(report) },
                                                            { label: 'Coordinates', value: formatCoordinates(report) },
                                                            { label: 'Report views', value: report.viewCount || 0 },
                                                        ].map(({ label, value }) => (
                                                            <div key={label}>
                                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                                    {label}
                                                                </span>
                                                                <p className="mt-0.5 break-words text-sm font-medium text-gray-900 dark:text-white">
                                                                    {value}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* 3. Operational State Details */}
                                                    <div className="border-t border-gray-100 pt-5 dark:border-white/5">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                            Status
                                                        </span>
                                                        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                                                            {status.label}
                                                            <span aria-hidden="true"> · </span>
                                                            Updated {formatRelativeDate(report.updatedAt || report.createdAt)}
                                                        </p>

                                                        {report.respondedBy && (
                                                            <p>
                                                                <span className="font-semibold text-gray-900 dark:text-white">Response unit:</span>{' '}
                                                                {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}{' '}
                                                                {report.respondedBy?.name ? `(${report.respondedBy.name})` : ''}
                                                            </p>
                                                        )}

                                                        {report.status === 'resolved' && report.resolutionNotes && (
                                                            <p className="border-l-2 border-emerald-500 py-0.5 pl-3">
                                                                <span className="font-semibold text-gray-900 dark:text-white">Resolution notes:</span> {report.resolutionNotes}
                                                            </p>
                                                        )}

                                                        {report.status === 'rejected' && report.rejectionReason && (
                                                            <p className="border-l-2 border-red-500 py-0.5 pl-3">
                                                                <span className="font-semibold text-gray-900 dark:text-white">Rejection reason:</span> {report.rejectionReason}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* 4. Evidence Gallery */}
                                                    <div className="border-t border-gray-100 pt-5 dark:border-white/5">
                                                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                            Evidence photos ({report.evidence?.items?.length || report.images?.length || 0})
                                                        </h4>
                                                        <ProtectedEvidenceGallery
                                                            images={report.images}
                                                            evidence={report.evidence || (report.images?.length ? { count: report.images.length, viewerAccess: 'original', items: report.images.map((img, i) => ({ id: String(i), index: i, originalUrl: img, previewUrl: img, isOwner: true })) } : null)}
                                                            isOwner={true}
                                                            variant="stacked"
                                                            onViewImage={(item) => setViewerItem(item)}
                                                        />
                                                    </div>

                                                    {/* 5. Incident Activity Log */}
                                                    <div
                                                        className="border-t border-gray-100 pt-5 dark:border-white/5"
                                                        aria-labelledby={`activity-heading-${report._id}`}
                                                    >
                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                            <h4
                                                                id={`activity-heading-${report._id}`}
                                                                className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                                                            >
                                                                Incident activity log
                                                            </h4>
                                                            {!isClosed ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setUpdateDialogReportId(report._id)}
                                                                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-9 sm:w-auto dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                                                >
                                                                    Send situation update
                                                                </button>
                                                            ) : (
                                                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                                                    Updates closed
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <ReportActivityTimeline
                                                                report={report}
                                                                highlightedUpdateId={highlightedUpdates[report._id]}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </article>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>
            )}

            <MyReportsFilterModal
                isOpen={filterModalOpen}
                onClose={() => setFilterModalOpen(false)}
                filterStatus={filterStatus}
                onApplyFilter={(status) => setFilterStatus(status)}
                counts={counts}
                totalReports={reports.length}
            />

            <SituationUpdateDialog
                isOpen={Boolean(updateDialogReportId)}
                report={reports.find((report) => report._id === updateDialogReportId) || null}
                submitting={submittingUpdateId === updateDialogReportId}
                onClose={() => setUpdateDialogReportId(null)}
                onSubmit={(update) => handleSubmitUpdate(updateDialogReportId, update)}
            />
            <ImageViewer
                isOpen={Boolean(viewerItem)}
                item={viewerItem}
                items={viewerItem?.items}
                initialIndex={viewerItem?.index ?? 0}
                onClose={() => setViewerItem(null)}
            />
        </div>
    );
}

export default MyReportsPage;
