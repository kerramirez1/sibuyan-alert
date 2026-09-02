import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from '../router';
import { format, formatDistanceToNow } from 'date-fns';
import toast from '../utils/appToast';
import {
    HiCheck,
    HiOutlineBadgeCheck,
    HiOutlineChatAlt2,
    HiOutlineCheckCircle,
    HiOutlineChevronDown,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentAdd,
    HiOutlineExclamationCircle,
    HiOutlineFilter,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
    HiOutlinePhotograph,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
    HiOutlineSwitchHorizontal,
    HiOutlineX,
    HiOutlineXCircle,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import Button from '../components/ui/Button';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import ImageViewer from '../components/ui/ImageViewer';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
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
    minor: { label: 'Minor', shortLabel: 'Minor', dot: 'bg-emerald-500' },
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
                        const dotClass = filterKey === 'all' ? 'bg-gray-400' : STATUS_CONFIG[filterKey]?.dot;

                        return (
                            <button
                                key={filterKey}
                                type="button"
                                onClick={() => setDraftStatus(filterKey)}
                                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                                    isSelected
                                        ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200'
                                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                                    <span>{label}</span>
                                </div>
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
    <div className="space-y-4 sm:space-y-6" role="status" aria-busy="true" aria-label="Loading submitted reports">
        <span className="sr-only">Loading submitted reports</span>
        {/* 4-Metric Strip Skeleton */}
        <div className="grid grid-cols-2 divide-y divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:rounded-2xl">
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-3 sm:p-4 min-h-[88px] sm:min-h-[104px] flex flex-col justify-between bg-white dark:bg-[#0c1813]/90">
                    <Skeleton variant="text" role={null} className="h-3 w-20 rounded" />
                    <Skeleton variant="text" role={null} className="h-7 w-12 rounded mt-1" />
                    <Skeleton variant="text" role={null} className="h-2.5 w-24 rounded mt-1 opacity-70" />
                </div>
            ))}
        </div>

        {/* Filter bar & report cards */}
        <SkeletonCard role={null} className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/5">
                <Skeleton variant="text" role={null} className="h-4 w-32" />
                <Skeleton variant="button" role={null} className="h-8 w-24" />
            </div>
            <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="p-4 rounded-xl border border-gray-100 dark:border-white/5 space-y-2.5">
                        <div className="flex justify-between items-center">
                            <Skeleton variant="text" role={null} className="h-4 w-44" />
                            <Skeleton variant="button" role={null} className="h-6 w-20 rounded-full" />
                        </div>
                        <Skeleton variant="text" role={null} className="h-3 w-3/4" />
                        <div className="flex justify-between items-center pt-2 text-xs">
                            <Skeleton variant="text" role={null} className="h-2.5 w-28" />
                            <Skeleton variant="button" role={null} className="h-7 w-20" />
                        </div>
                    </div>
                ))}
            </div>
        </SkeletonCard>
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

    const metricCards = [
        { label: 'Total reports', value: stats.total, helper: 'All submissions', tone: 'neutral' },
        { label: 'Pending review', value: stats.pending, helper: 'Waiting for verification', tone: stats.pending > 0 ? 'amber' : 'neutral' },
        { label: 'Active cases', value: stats.active, helper: 'Verified or in response', tone: stats.active > 0 ? 'cyan' : 'neutral' },
        { label: 'Resolved', value: stats.resolved, helper: 'Closed incidents', tone: 'neutral' },
    ];

    return (
        <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            {/* Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <HiOutlineShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Reporter records</span>
                            <span className="text-emerald-600/60 dark:text-emerald-400/60 font-normal">·</span>
                            <span className="hidden xs:inline text-emerald-700 dark:text-emerald-400 font-bold">Case Tracking</span>
                        </span>
                    </div>
                    <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        My reports
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Track the review and response status of your incident submissions.
                    </p>
                </div>

                <div className="flex shrink-0 items-center w-full sm:w-auto">
                    <Link
                        to="/report"
                        className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px] sm:min-h-0"
                    >
                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
                        <span>Submit incident report</span>
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
                <>
                    {/* Compact Reporting Summary Strip */}
                    <section aria-label="Report summary">
                        <div className="grid grid-cols-2 divide-y divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:rounded-2xl">
                            {metricCards.map(({ label, value, helper, tone }) => {
                                const isAmber = tone === 'amber';
                                const isCyan = tone === 'cyan';

                                return (
                                    <div
                                        key={label}
                                        className={`p-3 sm:p-4 min-h-[88px] sm:min-h-[104px] flex flex-col justify-between transition-colors ${
                                            isAmber
                                                ? 'bg-amber-50/40 dark:bg-amber-950/15'
                                                : isCyan
                                                    ? 'bg-cyan-50/40 dark:bg-cyan-950/15'
                                                    : 'bg-white dark:bg-[#0c1813]/90'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 break-words leading-tight flex-1">
                                                {label}
                                            </p>
                                            {isAmber && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />}
                                            {isCyan && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500 animate-pulse" aria-hidden="true" />}
                                        </div>
                                        <p
                                            className={`mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight tabular-nums leading-none ${
                                                isAmber
                                                    ? 'text-amber-800 dark:text-amber-300'
                                                    : isCyan
                                                        ? 'text-cyan-800 dark:text-cyan-300'
                                                        : 'text-gray-950 dark:text-white'
                                            }`}
                                        >
                                            {value}
                                        </p>
                                        <p className="mt-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 break-words leading-tight">{helper}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Submitted Incident Records Section */}
                    <section
                        className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                        aria-label="Submitted reports"
                    >
                        {/* Section Header & Filters Toolbar */}
                        <div className="border-b border-gray-200/80 bg-gray-50/70 p-3 sm:flex sm:items-center sm:justify-between sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="min-w-0">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                                    Submitted incident records
                                </h2>
                            </div>

                            {reports.length > 0 && (
                                <div className="mt-3 flex items-center justify-between sm:mt-0 sm:justify-end gap-2">
                                    {/* Mobile Filter Button */}
                                    <button
                                        type="button"
                                        onClick={() => setFilterModalOpen(true)}
                                        className="sm:hidden inline-flex items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 cursor-pointer min-h-[44px]"
                                    >
                                        <HiOutlineFilter className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                                        <span>Filter reports</span>
                                        {filterStatus !== 'all' && (
                                            <span className="inline-flex items-center rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                                                1
                                            </span>
                                        )}
                                    </button>

                                    {/* Desktop Segmented Filters */}
                                    <div className="hidden sm:flex items-center gap-1">
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
                                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                                        isActive
                                                            ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                                                            : 'border-gray-200/90 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-950 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                                                    }`}
                                                >
                                                    <span>{label}</span>
                                                    <span className={`text-[11px] ${isActive ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Desktop Table Column Header */}
                        {recentReportsExist(filteredReports) && (
                            <div className="hidden border-b border-gray-200/80 bg-gray-50/50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:grid sm:grid-cols-[minmax(0,1fr)_140px_96px_28px] sm:items-center sm:gap-4 md:px-5 dark:border-white/10 dark:bg-white/[0.01] dark:text-gray-400" aria-hidden="true">
                                <span>Incident</span>
                                <span>Status</span>
                                <span>Severity</span>
                                <span className="text-right">Details</span>
                            </div>
                        )}

                        {reports.length === 0 ? (
                            <div className="px-5 py-12 text-center sm:py-16">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
                                    <HiOutlineClipboardList className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <h3 className="mt-3 font-display text-sm sm:text-base font-bold text-gray-950 dark:text-white">
                                    You have not submitted an incident report yet.
                                </h3>
                                <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                    Submit a new emergency or incident report to track its verification and response here.
                                </p>
                                <div className="mt-5">
                                    <Link
                                        to="/report"
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px] sm:min-h-0"
                                    >
                                        <HiOutlineDocumentAdd className="h-4 w-4" aria-hidden="true" />
                                        <span>Submit incident report</span>
                                    </Link>
                                </div>
                            </div>
                        ) : filteredReports.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                    No reports match this status
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('all')}
                                    className="mt-2 text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer"
                                >
                                    Clear filter
                                </button>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {filteredReports.map((report) => {
                                    const isExpanded = Boolean(selectedReportId && String(selectedReportId) === String(report._id));
                                    const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                                    const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.minor;
                                    const severityLabel = report.severity ? (SEVERITY_CONFIG[report.severity]?.label || 'Minor') : 'Unknown';
                                    const isClosed = ['resolved', 'rejected'].includes(report.status);

                                    return (
                                        <article
                                            key={report._id}
                                            ref={(node) => {
                                                if (node) {
                                                    itemRefs.current[String(report._id)] = node;
                                                } else {
                                                    delete itemRefs.current[String(report._id)];
                                                }
                                            }}
                                            style={isExpanded ? { borderLeftColor: 'var(--expanded-record-accent, #059669)' } : undefined}
                                            className={`transition-colors duration-150 border-l-2 sm:border-l-[3px] scroll-mt-20 sm:scroll-mt-24 ${
                                                isExpanded
                                                    ? 'border-l-emerald-600 bg-emerald-50/[0.15] dark:border-l-emerald-500 dark:bg-[#07130e]/80 shadow-2xs'
                                                    : 'border-l-transparent bg-white hover:bg-gray-50/75 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                            }`}
                                        >
                                            {/* Collapsed Clickable Header Row */}
                                            <button
                                                type="button"
                                                onClick={() => toggleReportSelected(report._id)}
                                                aria-expanded={isExpanded}
                                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for report at ${getLocation(report)}`}
                                                className={`w-full flex flex-col gap-2 p-3.5 text-left transition-colors sm:grid sm:grid-cols-[minmax(0,1fr)_140px_96px_28px] sm:items-center sm:gap-4 sm:p-4 md:p-5 cursor-pointer min-h-[44px] ${
                                                    isExpanded ? 'bg-emerald-500/[0.03] dark:bg-white/[0.01]' : ''
                                                }`}
                                            >
                                                {/* Location & Title */}
                                                <div className="min-w-0">
                                                    <div className="flex items-start gap-1.5">
                                                        <HiOutlineLocationMarker className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                                                        <h3 className="line-clamp-2 sm:line-clamp-1 font-display text-sm font-bold text-gray-950 sm:text-base dark:text-white">
                                                            {getLocation(report)}
                                                        </h3>
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 pl-5.5">
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">{formatIncidentType(report)}</span>
                                                        <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                                                        <span>Submitted {formatRelativeDate(report.createdAt)}</span>
                                                    </div>
                                                </div>

                                                {/* Status & Severity Indicators (Inline dot + label, no bordered pill) */}
                                                <div className="flex items-center justify-between pt-0.5 sm:contents">
                                                    <div className="flex items-center gap-3 sm:contents">
                                                        {/* Status Indicator */}
                                                        <div className="flex items-center sm:justify-start">
                                                            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                                                                <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
                                                                <span className="truncate">{status.label}</span>
                                                            </div>
                                                        </div>

                                                        {/* Severity Indicator */}
                                                        <div className="flex items-center sm:justify-start">
                                                            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                                <span className={`h-2 w-2 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                                <span className="truncate">{severityLabel}</span>
                                                            </div>
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
                                                <div className="border-t border-gray-200/70 p-3.5 sm:p-5 space-y-3 sm:space-y-3.5 dark:border-white/10 bg-gray-50/40 dark:bg-white/[0.01]">
                                                    {/* 1. Incident Description */}
                                                    <div>
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                                                            Incident details
                                                        </h4>
                                                        <p className="mt-1 text-xs sm:text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words">
                                                            {report.description || (
                                                                <span className="italic text-gray-400 dark:text-gray-500">
                                                                    No incident description was provided.
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {/* 2. Key Facts Grid */}
                                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 pt-2 border-t border-gray-200/60 dark:border-white/5">
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
                                                                <p className="mt-0.5 text-xs font-semibold text-gray-950 dark:text-white break-words">
                                                                    {value}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* 3. Operational State Details */}
                                                    <div className="pt-2 border-t border-gray-200/60 dark:border-white/5 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="font-semibold text-gray-900 dark:text-white">Status:</span>
                                                            <span>{status.label}</span>
                                                            <span className="text-gray-400 dark:text-gray-500">·</span>
                                                            <span>Updated {formatRelativeDate(report.updatedAt || report.createdAt)}</span>
                                                        </div>

                                                        {report.respondedBy && (
                                                            <p className="text-gray-700 dark:text-gray-300">
                                                                <span className="font-semibold text-gray-900 dark:text-white">Response unit:</span>{' '}
                                                                {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}{' '}
                                                                {report.respondedBy?.name ? `(${report.respondedBy.name})` : ''}
                                                            </p>
                                                        )}

                                                        {report.status === 'resolved' && report.resolutionNotes && (
                                                            <div className="mt-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-2.5 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                                                <span className="font-bold">Resolution notes:</span> {report.resolutionNotes}
                                                            </div>
                                                        )}

                                                        {report.status === 'rejected' && report.rejectionReason && (
                                                            <div className="mt-1.5 rounded-lg border border-red-200/80 bg-red-50/70 p-2.5 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                                                                <span className="font-bold">Rejection reason:</span> {report.rejectionReason}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 4. Evidence Gallery */}
                                                    <div className="pt-2 border-t border-gray-200/60 dark:border-white/5">
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-2">
                                                            <HiOutlinePhotograph className="h-3.5 w-3.5" />
                                                            <span>Evidence photos ({report.evidence?.items?.length || report.images?.length || 0})</span>
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
                                                        className="border-t border-gray-200/60 pt-2.5 dark:border-white/5"
                                                        aria-labelledby={`activity-heading-${report._id}`}
                                                    >
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2">
                                                            <h4
                                                                id={`activity-heading-${report._id}`}
                                                                className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400"
                                                            >
                                                                Incident activity log
                                                            </h4>
                                                            {!isClosed ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setUpdateDialogReportId(report._id)}
                                                                    className="inline-flex h-8 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px] sm:min-h-0"
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
                </>
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

const recentReportsExist = (records) => Array.isArray(records) && records.length > 0;

export default MyReportsPage;
