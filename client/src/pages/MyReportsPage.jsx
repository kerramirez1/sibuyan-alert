import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from '../router';
import { format, formatDistanceToNow } from 'date-fns';
import toast from '../utils/appToast';
import {
    HiOutlineChevronDown,
    HiOutlineExclamationCircle,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import { getPhysicalMunicipality } from '../utils/incidentDetails';
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
    String(report?.incidentType || report?.accidentType || 'Unspecified incident')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const getLocation = (report) => (
    report?.address
    || [report?.barangay, getPhysicalMunicipality(report)].filter(Boolean).join(', ')
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
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
            <div
                className="fixed inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${modalId}-title`}
                className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col rounded-md border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4">
                    <h3 id={`${modalId}-title`} className="text-sm font-semibold text-gray-900 dark:text-white">
                        Filter reports by status
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[44px] px-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                    >
                        Close
                    </button>
                </div>

                {/* Options List */}
                <div className="flex-1 overflow-y-auto px-2 pb-2">
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
                                aria-pressed={isSelected}
                                className={`flex w-full items-center justify-between rounded px-3 py-2.5 text-sm cursor-pointer ${
                                    isSelected
                                        ? 'font-semibold text-gray-900 dark:text-white'
                                        : 'font-normal text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                }`}
                            >
                                <span>{label}</span>
                                <span className="text-xs tabular-nums text-gray-400">{count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between px-5 py-4">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="min-h-[44px] text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                    >
                        Clear all
                    </button>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" size="sm" className="rounded-md" onClick={handleApply}>
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
        <div className="mx-auto w-full max-w-5xl">
            {/* Single page title block */}
            <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                        My reports
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                        Track the review and response status of your incident submissions.
                    </p>
                </div>

                <div className="hidden sm:block sm:shrink-0">
                    <Link
                        to="/report"
                        className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-emerald-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                        Submit incident report
                    </Link>
                </div>
            </header>

            {loading ? (
                <MyReportsSkeleton />
            ) : error ? (
                <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    <div className="flex items-center gap-2">
                        <HiOutlineExclamationCircle className="h-5 w-5 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <Button variant="dangerOutline" size="sm" className="rounded-md" onClick={() => fetchReports(false)}>
                        Retry
                    </Button>
                </div>
            ) : (
                <div>
                    {/* Summary: hairline dividers like Reporter dashboard */}
                    <section aria-label="Report summary" className="grid grid-cols-2 gap-x-4 gap-y-5 py-2 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-6">
                        {metricCards.map(({ label, value, helper }, index) => (
                            // Mobile is 2-col: col-1 items (index 0, 2) never get a divider;
                            // col-2 items (index 1, 3) always do. On sm (4-col) every
                            // item after the first gets one. This keeps Total and
                            // Active flush-left aligned.
                            <div
                                key={label}
                                className={
                                    index === 0
                                        ? ''
                                        : index === 2
                                            ? 'sm:border-l sm:border-gray-200 sm:pl-6 sm:dark:border-white/10'
                                            : 'border-l border-gray-200 pl-4 sm:pl-6 dark:border-white/10'
                                }
                            >
                                <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs dark:text-gray-300">
                                    {label}
                                </p>
                                <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 sm:mt-1 sm:text-3xl dark:text-white">
                                    {value}
                                </p>
                                <p className="mt-0.5 text-[11px] leading-tight text-gray-500 sm:mt-1 sm:text-xs dark:text-gray-400">{helper}</p>
                            </div>
                        ))}
                    </section>

                    {/* Mobile primary action: same minimalist button as Reporter dashboard */}
                    <div className="py-4 sm:hidden">
                        <Link
                            to="/report"
                            className="inline-flex min-h-[40px] w-full items-center justify-center whitespace-nowrap rounded-md bg-emerald-600 px-3 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                            Submit incident report
                        </Link>
                    </div>

                    {/* Submitted incident records */}
                    <section className="mt-6 border-t border-gray-200 pt-5 sm:mt-8 sm:pt-6 dark:border-white/10" aria-label="Submitted reports">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {filterStatus === 'all'
                                    ? 'Submitted reports'
                                    : `Submitted reports · ${filteredReports.length} of ${reports.length}`}
                            </h2>

                            {reports.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setFilterModalOpen(true)}
                                    className="inline-flex min-h-[44px] items-center px-1 text-sm font-semibold text-emerald-700 underline-offset-4 hover:text-emerald-800 hover:underline sm:hidden dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                    <span>Filter reports{filterStatus !== 'all' ? ' · 1' : ''}</span>
                                </button>
                            )}
                        </div>

                        {reports.length > 0 && (
                            <div className="mt-4 hidden gap-6 border-b border-gray-200 pb-0 sm:flex dark:border-white/10" aria-label="Filter reports by status">
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
                                            className={`shrink-0 border-b pb-2.5 text-sm ${
                                                isActive
                                                    ? 'border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white'
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
                            <div className="py-12">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                    You have not submitted an incident report yet.
                                </h3>
                                <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                                    Submit a new emergency or incident report to track its verification and response here.
                                </p>
                                <div className="mt-5">
                                    <Link
                                        to="/report"
                                        className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                    >
                                        Submit incident report
                                    </Link>
                                </div>
                            </div>
                        ) : filteredReports.length === 0 ? (
                            <div className="py-12">
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    No reports match this status.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('all')}
                                    className="mt-2 min-h-[44px] text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                    Clear filter
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200 dark:divide-white/10">
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
                                            {/* Row: single hairline accent marks expanded state */}
                                            <button
                                                type="button"
                                                onClick={() => toggleReportSelected(report._id)}
                                                aria-expanded={isExpanded}
                                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for report at ${getLocation(report)}`}
                                                className={`grid w-full min-h-[44px] grid-cols-[minmax(0,1fr)_24px] items-baseline gap-x-3 border-l-2 py-3.5 pl-3 text-left min-[400px]:gap-x-4 min-[400px]:pl-4 sm:grid-cols-[minmax(0,1fr)_120px_110px_24px] sm:items-center sm:py-4 cursor-pointer ${
                                                    isExpanded
                                                        ? 'border-l-emerald-600'
                                                        : 'border-l-transparent'
                                                }`}
                                            >
                                                {/* Location & Title */}
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-sm font-medium text-gray-900 min-[400px]:text-[15px] dark:text-white">
                                                        {getLocation(report)}
                                                    </h3>
                                                    <p className="mt-0.5 text-xs leading-snug text-gray-500 min-[400px]:text-[13px] dark:text-gray-400">
                                                        {formatIncidentType(report)} · Submitted {formatRelativeDate(report.createdAt)}
                                                    </p>
                                                    <p className="mt-0.5 text-xs leading-snug text-gray-500 sm:hidden dark:text-gray-400">
                                                        {status.label} · {severityLabel}
                                                    </p>
                                                </div>

                                                <span className="hidden truncate text-sm text-gray-500 sm:block dark:text-gray-400">
                                                    {status.label}
                                                </span>

                                                <span className="hidden items-center gap-1.5 text-sm text-gray-500 sm:inline-flex dark:text-gray-400">
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                    <span className="truncate">{severityLabel}</span>
                                                </span>

                                                {/* Chevron Affordance */}
                                                <span className="flex items-center justify-end">
                                                    <HiOutlineChevronDown
                                                        className={`h-4 w-4 text-gray-400 transition-transform duration-150 ${
                                                            isExpanded ? 'rotate-180' : ''
                                                        }`}
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            </button>

                                            {/* Progressive Disclosure: Expanded Incident Dossier */}
                                            {isExpanded && (
                                                <div className="space-y-6 border-t border-gray-100 py-6 pl-4 dark:border-white/5">
                                                    {/* 1. Incident Description */}
                                                    <div>
                                                        <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Incident details
                                                        </h4>
                                                        <p className="mt-1.5 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                                                            {report.description || (
                                                                <span className="text-gray-400 dark:text-gray-500">
                                                                    No incident description was provided.
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {/* 2. Key Facts Grid */}
                                                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                                                        {[
                                                            { label: 'Incident date', value: formatDate(report.incidentTime || report.accidentTime || report.createdAt) },
                                                            { label: 'Incident type', value: formatIncidentType(report) },
                                                            { label: 'Coordinates', value: formatCoordinates(report) },
                                                            { label: 'Report views', value: report.viewCount || 0 },
                                                        ].map(({ label, value }) => (
                                                            <div key={label}>
                                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                                    {label}
                                                                </dt>
                                                                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                                                                    {value}
                                                                </dd>
                                                            </div>
                                                        ))}
                                                    </dl>

                                                    {/* 3. Operational State Details */}
                                                    <div>
                                                        <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Status
                                                        </h4>
                                                        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                            {status.label} · Updated {formatRelativeDate(report.updatedAt || report.createdAt)}
                                                        </p>

                                                        {report.respondedBy && (
                                                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                                Response unit: {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}{' '}
                                                                {report.respondedBy?.name ? `(${report.respondedBy.name})` : ''}
                                                            </p>
                                                        )}

                                                        {report.status === 'resolved' && report.resolutionNotes && (
                                                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                                Resolution notes: {report.resolutionNotes}
                                                            </p>
                                                        )}

                                                        {report.status === 'rejected' && report.rejectionReason && (
                                                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                                Rejection reason: {report.rejectionReason}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* 4. Evidence Gallery */}
                                                    <div>
                                                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Evidence ({report.evidence?.items?.length || report.images?.length || 0})
                                                        </h4>
                                                        <ProtectedEvidenceGallery
                                                            images={report.images}
                                                            evidence={report.evidence || (Array.isArray(report.images) && report.images.length ? { count: report.images.length, viewerAccess: 'original', items: report.images.map((img, i) => ({ id: String(i), index: i, originalUrl: img, previewUrl: img, isOwner: true })) } : null)}
                                                            isOwner={true}
                                                            variant="stacked"
                                                            onViewImage={(item) => setViewerItem(item)}
                                                        />
                                                    </div>

                                                    {/* 5. Incident Activity Log */}
                                                    <div aria-labelledby={`activity-heading-${report._id}`}>
                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                            <h4
                                                                id={`activity-heading-${report._id}`}
                                                                className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                                            >
                                                                Activity
                                                            </h4>
                                                            {!isClosed ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setUpdateDialogReportId(report._id)}
                                                                    className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-9 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
