import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from '../router';
import { format, formatDistanceToNow } from 'date-fns';
import toast from '../utils/appToast';
import {
    HiOutlineChevronDown,
    HiOutlineCloudUpload,
    HiOutlineDocumentAdd,
    HiOutlineExclamationCircle,
    HiOutlineX,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import {
    dedupedFetch,
    getStaleData,
    isRecentlyRevalidated,
    setCachedData,
} from '../utils/queryCache';
import { getPhysicalMunicipality } from '../utils/incidentDetails';
import { normalizeEvidenceDescriptor } from '../utils/evidenceModel';
import { useSocket } from '../context/SocketContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useOfflineReportSync } from '../hooks/useOfflineReportSync';
import Button from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import ImageViewer from '../components/ui/ImageViewer';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import ReportActivityTimeline from '../components/reporterReports/ReportActivityTimeline';
import SituationUpdateDialog from '../components/reporterReports/SituationUpdateDialog';
import { getReportIncidentTypeLabel } from '../config/incidentTypes';
import { MAP_STATUS_CONFIG } from '../config/mapVisuals';

// Canonical lifecycle vocabulary shared with the dashboard, so one
// state is never named two different ways across pages.
const STATUS_CONFIG = {
    pending: { label: 'Pending review', dot: 'bg-amber-500' },
    verified: { label: 'Verified', dot: 'bg-blue-600' },
    transferred: { label: 'Transferred', dot: 'bg-violet-500' },
    // One lifecycle state, one name: the display name is owned by
    // MAP_STATUS_CONFIG, the same source the map legend and the badges read.
    responding: { label: MAP_STATUS_CONFIG.responding.label, dot: 'bg-cyan-500' },
    resolved: { label: 'Resolved', dot: 'bg-green-600' },
    rejected: { label: 'Rejected', dot: 'bg-gray-400' },
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

const getEvidenceFallback = (report) => {
    const images = Array.isArray(report?.images) ? report.images.filter(Boolean) : [];
    if (report?.evidence) return report.evidence;
    if (!images.length) return null;
    return {
        count: images.length,
        viewerAccess: 'original',
        items: images.map((img, i) => ({
            id: String(i),
            index: i,
            originalUrl: typeof img === 'string' ? img : (img?.originalUrl ?? img?.previewUrl ?? ''),
            previewUrl: typeof img === 'string' ? img : (img?.previewUrl ?? img?.originalUrl ?? ''),
            isOwner: true,
        })),
    };
};

const getEvidenceCount = (report) => {
    try {
        const fallback = getEvidenceFallback(report);
        const rawImages = Array.isArray(report?.images) ? report.images.filter(Boolean) : [];
        const normalized = normalizeEvidenceDescriptor(fallback, {
            isOwner: true,
            isOperational: false,
            rawImages,
        });
        return normalized?.evidenceCount ?? 0;
    } catch {
        return 0;
    }
};

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
    // Session-scoped key (no user id needed): the whole cache is wiped on
    // logout/session-expiry, so entries can never leak across accounts.
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
    const [selectedReportId, setSelectedReportId] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterModalOpen, setFilterModalOpen] = useState(false);
    const [viewerItem, setViewerItem] = useState(null);
    const [updateDialogReportId, setUpdateDialogReportId] = useState(null);
    const [highlightedUpdates, setHighlightedUpdates] = useState({});
    const [submittingUpdateId, setSubmittingUpdateId] = useState(null);
    const [searchParams] = useSearchParams();
    const { subscribe } = useSocket();
    const { isOnline } = useConnectivity();
    const { pendingCount, isSyncing, sync: syncOfflineReports } = useOfflineReportSync();
    const requestedReportId = searchParams.get('report');
    const requestedStatus = searchParams.get('status');
    const itemRefs = useRef({});

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
            console.error('Failed to fetch reports:', err);
            if (!Array.isArray(getStaleData(cacheKey))) {
                setError('Unable to load your submitted reports.');
            }
            if (!silent && !Array.isArray(getStaleData(cacheKey))) {
                toast.error('Failed to load your reports');
            }
        } finally {
            setLoading(false);
        }
    }, [cacheKey]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    useEffect(() => {
        if (!requestedReportId) return;
        const safeReports = Array.isArray(reports) ? reports : [];
        if (!safeReports.filter(Boolean).some((report) => String(report?._id) === requestedReportId)) return;
        setFilterStatus('all');
        setSelectedReportId(String(requestedReportId));
    }, [reports, requestedReportId]);

    // Deep links from dashboard KPI cards (e.g. /my-reports?status=resolved).
    // Skipped when a specific report is requested — the report takes over the view.
    useEffect(() => {
        if (requestedReportId || !requestedStatus) return;
        if (requestedStatus === 'active' || FILTERS.includes(requestedStatus)) {
            setFilterStatus(requestedStatus);
        }
    }, [requestedReportId, requestedStatus]);

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
            if (id === null || id === undefined || id === '') return;
            const targetId = String(id);
            setReports((current) => (Array.isArray(current) ? current : []).filter(Boolean).map((report) => (
                String(report?._id) === targetId
                    ? (typeof changes === 'function' ? changes(report) : { ...report, ...changes })
                    : report
            )));
        };

        const unsubRespond = subscribe('reportResponded', (data) => {
            updateReport(data?.id ?? data?._id, (report) => ({
                ...report,
                status: 'responding',
                respondedBy: report.respondedBy || data?.respondedBy,
                respondedAt: report.respondedAt || data?.respondedAt,
            }));
        });
        const unsubResolve = subscribe('reportResolved', (data) => {
            updateReport(data?.id ?? data?._id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
            });
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            updateReport(data?.id ?? data?._id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
                resolutionNotes: data?.resolutionNotes,
            });
        });
        const unsubVerify = subscribe('reportVerified', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'verified' });
        });
        const unsubReject = subscribe('reportRejected', (data) => {
            updateReport(data?.id ?? data?._id, { status: 'rejected', rejectionReason: data?.reason });
        });
        const unsubTransfer = subscribe('reportTransferred', (data) => {
            updateReport(data?.id ?? data?._id, {
                status: data?.status || 'transferred',
                municipalityName: data?.toMunicipality || data?.municipalityName,
            });
        });
        const unsubDelete = subscribe('reportDeleted', (data) => {
            const deleteId = data?.id ?? data?._id;
            if (deleteId === null || deleteId === undefined || deleteId === '') return;
            const targetId = String(deleteId);
            setReports((current) => (Array.isArray(current) ? current : []).filter(Boolean).filter((report) => String(report?._id) !== targetId));
        });
        const unsubReporterUpdate = subscribe('reportUpdatedByReporter', (data) => {
            const updateId = data?.id ?? data?._id;
            if (updateId === null || updateId === undefined || updateId === '' || !Array.isArray(data?.report?.reportUpdates)) return;
            updateReport(updateId, {
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

            setReports((current) => (Array.isArray(current) ? current : []).filter(Boolean).map((report) => (
                String(report?._id) === String(reportId)
                    ? {
                        ...report,
                        ...serverReport,
                        reportUpdates: Array.isArray(serverReport?.reportUpdates)
                            ? serverReport.reportUpdates
                            : (latestUpdate ? [...(Array.isArray(report?.reportUpdates) ? report.reportUpdates : []), latestUpdate] : report?.reportUpdates),
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

    const counts = useMemo(() => (Array.isArray(reports) ? reports : []).filter(Boolean).reduce((result, report) => {
        const status = report?.status;
        if (!status) return result;
        result[status] = (result[status] || 0) + 1;
        return result;
    }, {}), [reports]);

    const stats = useMemo(() => {
        const safeReports = Array.isArray(reports) ? reports : [];
        return {
            total: safeReports.length,
            pending: counts.pending || 0,
            active: (counts.verified || 0) + (counts.transferred || 0) + (counts.responding || 0),
            resolved: counts.resolved || 0,
        };
    }, [counts, reports]);

    const filteredReports = useMemo(() => (
        (Array.isArray(reports) ? reports : [])
            .filter(Boolean)
            .filter((report) => {
                if (filterStatus === 'all') return true;
                // 'active' is a dashboard-level grouping (verified + transferred + responding),
                // not a report status — it only arrives via ?status= deep links.
                if (filterStatus === 'active') return ['verified', 'transferred', 'responding'].includes(report?.status);
                return report?.status === filterStatus;
            })
            .sort((a, b) => new Date(b?.createdAt) - new Date(a?.createdAt))
    ), [filterStatus, reports]);

    const metricCards = [
        { label: 'Total reports', value: stats.total, helper: 'All submissions' },
        { label: 'Pending review', value: stats.pending, helper: 'Waiting for verification' },
        { label: 'Active', value: stats.active, helper: 'Verified or in response' },
        { label: 'Resolved', value: stats.resolved, helper: 'Closed incidents' },
    ];

    // Human label for the active filter chip (covers the 'active' dashboard
    // grouping, which has no desktop tab of its own).
    const activeFilterLabel = filterStatus === 'all'
        ? null
        : filterStatus === 'active'
            ? 'Active'
            : STATUS_CONFIG[filterStatus]?.label || filterStatus;

    return (
        <div className="mx-auto w-full max-w-5xl">
            {/* Single page title block. Submit lives in the bottom nav + sidebar. */}
            <header className="pb-5 sm:pb-6">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        My reports
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                        Track the review and response status of your incident submissions.
                    </p>
                </div>
            </header>

            {pendingCount > 0 && (
                <div
                    role="region"
                    aria-label="Offline queued reports"
                    className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <div className="flex items-start gap-3">
                        <HiOutlineCloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-semibold">
                                {pendingCount} incident {pendingCount === 1 ? 'report is' : 'reports are'} queued on this device
                            </p>
                            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                                Saved locally while offline. {isOnline ? 'Retrying automatically — you can also Sync now.' : 'Will automatically sync when internet connection returns.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            className="rounded-md bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                            onClick={async () => {
                                const res = await syncOfflineReports();
                                if (res?.sent > 0) {
                                    fetchReports(true);
                                }
                            }}
                            disabled={isSyncing || !isOnline}
                        >
                            {isSyncing ? 'Syncing reports…' : 'Sync now'}
                        </Button>
                    </div>
                </div>
            )}

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
                    {/* Summary KPI cards */}
                    <section aria-label="Report summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {metricCards.map(({ label, value, helper }) => (
                            <div
                                key={label}
                                className="min-w-0 rounded-lg border border-gray-200/90 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                            >
                                <p className="truncate font-display text-2xl font-bold tabular-nums tracking-tight text-gray-950 dark:text-white">
                                    {value}
                                </p>
                                <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                    {label}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-tight text-gray-500 dark:text-gray-400">{helper}</p>
                            </div>
                        ))}
                    </section>

                    {/* Submitted incident records */}
                    <section className="mt-6 border-t border-gray-200 pt-5 sm:mt-8 sm:pt-6 dark:border-white/10" aria-label="Submitted reports">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {filterStatus === 'all'
                                    ? 'Submitted reports'
                                    : `Submitted reports · ${filteredReports.length} of ${Array.isArray(reports) ? reports.length : 0}`}
                            </h2>

                            {(Array.isArray(reports) ? reports.length : 0) > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setFilterModalOpen(true)}
                                    className="inline-flex min-h-[44px] items-center px-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline sm:hidden dark:text-sky-400 dark:hover:text-sky-300"
                                >
                                    <span>Filter reports{filterStatus !== 'all' ? ' · 1' : ''}</span>
                                </button>
                            )}
                        </div>

                        {/* Active filter chip — the only place the current filter
                            is named on mobile (desktop tabs are sm+ only). */}
                        {activeFilterLabel && (
                            <div className="mt-3">
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('all')}
                                    aria-label={`Clear ${activeFilterLabel} filter and show all reports`}
                                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-sky-300 dark:hover:bg-white/10"
                                >
                                    <span>Filter: {activeFilterLabel}</span>
                                    <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            </div>
                        )}

                        {(Array.isArray(reports) ? reports.length : 0) > 0 && (
                            <div className="mt-4 hidden gap-6 border-b border-gray-200 pb-0 sm:flex dark:border-white/10" aria-label="Filter reports by status">
                                {FILTERS.map((filter) => {
                                    const safeLength = Array.isArray(reports) ? reports.length : 0;
                                    const count = filter === 'all' ? safeLength : (counts[filter] || 0);
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

                        {(Array.isArray(reports) ? reports.length : 0) === 0 ? (
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
                                        className="inline-flex h-10 items-center justify-center gap-1 whitespace-nowrap px-1 text-sm font-semibold text-red-600 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                        <HiOutlineDocumentAdd className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                                    className="mt-2 min-h-[44px] text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-sky-400 dark:hover:text-sky-300"
                                >
                                    Clear filter
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200 dark:divide-white/10">
                                {filteredReports.map((report) => {
                                    if (!report || typeof report !== 'object') return null;
                                    const reportId = report?._id ?? report?.id;
                                    const isExpanded = Boolean(selectedReportId && String(selectedReportId) === String(reportId));
                                    const status = STATUS_CONFIG[report?.status] || STATUS_CONFIG.pending;
                                    const severity = SEVERITY_CONFIG[report?.severity] || SEVERITY_CONFIG.minor;
                                    const severityLabel = report?.severity ? (SEVERITY_CONFIG[report.severity]?.label || 'Minor') : 'Unknown';
                                    const isClosed = ['resolved', 'rejected'].includes(report?.status);

                                    return (
                                        <li
                                            key={String(reportId ?? Math.random())}
                                            ref={(node) => {
                                                const refKey = String(reportId);
                                                if (node) {
                                                    itemRefs.current[refKey] = node;
                                                } else {
                                                    delete itemRefs.current[refKey];
                                                }
                                            }}
                                        >
                                        <article className="scroll-mt-20 sm:scroll-mt-24">
                                            {/* Row: single hairline accent marks expanded state */}
                                            <button
                                                type="button"
                                                onClick={() => toggleReportSelected(reportId)}
                                                aria-expanded={isExpanded}
                                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for report at ${getLocation(report)}`}
                                                className={`grid w-full min-h-[44px] grid-cols-[minmax(0,1fr)_24px] items-baseline gap-x-3 border-l-4 py-3.5 pl-3 text-left min-[400px]:gap-x-4 min-[400px]:pl-4 sm:grid-cols-[minmax(0,1fr)_120px_110px_24px] sm:items-center sm:py-4 cursor-pointer ${
                                                    isExpanded
                                                        ? 'border-l-brand-600'
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
                                                <div className="space-y-6 border-l-4 border-l-brand-600/30 border-t border-gray-100 py-6 pl-4 dark:border-white/5 dark:border-l-brand-500/30">
                                                    {/* 1. Incident Description */}
                                                    <div>
                                                        <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Incident details
                                                        </h4>
                                                        <p className="mt-1.5 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                                                            {report?.description || (
                                                                <span className="text-gray-400 dark:text-gray-500">
                                                                    No incident description was provided.
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {/* 2. Key Facts Grid */}
                                                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                                                        {[
                                                            { label: 'Incident date', value: formatDate(report?.incidentTime || report?.accidentTime || report?.createdAt) },
                                                            { label: 'Incident type', value: formatIncidentType(report) },
                                                            { label: 'Coordinates', value: formatCoordinates(report) },
                                                            { label: 'Report views', value: report?.viewCount || 0 },
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
                                                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                                                <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${['pending', 'responding'].includes(report?.status) ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                                                {status.label}
                                                            </span>
                                                            <span>Updated {formatRelativeDate(report?.updatedAt || report?.createdAt)}</span>
                                                        </p>

                                                        {report?.respondedBy && (
                                                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                                Response unit: {getAgencyLabel(report?.respondedBy?.agency || report?.responderAgency)}{' '}
                                                                {report?.respondedBy?.name ? `(${report.respondedBy.name})` : ''}
                                                            </p>
                                                        )}

                                                        {report?.status === 'resolved' && report?.resolutionNotes && (
                                                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                                Resolution notes: {report.resolutionNotes}
                                                            </p>
                                                        )}

                                                        {report?.status === 'rejected' && report?.rejectionReason && (
                                                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                                Rejection reason: {report.rejectionReason}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* 4. Evidence Gallery */}
                                                    <div>
                                                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Evidence photos ({getEvidenceCount(report)})
                                                        </h4>
                                                        <ProtectedEvidenceGallery
                                                            images={Array.isArray(report?.images) ? report.images.filter(Boolean) : []}
                                                            evidence={getEvidenceFallback(report)}
                                                            isOwner={true}
                                                            variant="stacked"
                                                            onViewImage={(item) => setViewerItem(item)}
                                                        />
                                                    </div>

                                                    {/* 5. Incident Activity Log */}
                                                    <div aria-labelledby={`activity-heading-${reportId}`}>
                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                            <h4
                                                                id={`activity-heading-${reportId}`}
                                                                className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                                            >
                                                                Activity
                                                            </h4>
                                                            {!isClosed ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setUpdateDialogReportId(reportId)}
                                                                    className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:min-h-0 sm:h-9 dark:bg-brand-600 dark:hover:bg-brand-500"
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
                                                                highlightedUpdateId={highlightedUpdates[reportId]}
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
                totalReports={Array.isArray(reports) ? reports.length : 0}
            />

            <SituationUpdateDialog
                isOpen={Boolean(updateDialogReportId)}
                report={(Array.isArray(reports) ? reports : []).filter(Boolean).find((report) => String(report?._id ?? report?.id) === String(updateDialogReportId)) || null}
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
