import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from '../router';
import { format, formatDistanceToNow } from 'date-fns';
import toast from '../utils/appToast';
import { resolveAssetUrl } from '../utils/assets';
import {
    HiOutlineBadgeCheck,
    HiOutlineChartBar,
    HiOutlineChatAlt2,
    HiOutlineCheckCircle,
    HiOutlineChevronDown,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineExclamationCircle,
    HiOutlineEye,
    HiOutlineFilter,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineSwitchHorizontal,
    HiOutlineXCircle,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { MAP_STATUS_CONFIG } from '../config/mapVisuals';
import ImageViewer from '../components/ui/ImageViewer';
import ReportActivityTimeline from '../components/reporterReports/ReportActivityTimeline';
import SituationUpdateDialog from '../components/reporterReports/SituationUpdateDialog';

const STATUS_CONFIG = {
    pending: { label: 'Pending review', dot: 'bg-amber-400', icon: HiOutlineClock },
    verified: { label: 'Verified', dot: 'bg-gray-400', icon: HiOutlineCheckCircle },
    transferred: { label: 'Transferred', dot: 'bg-gray-400', icon: HiOutlineSwitchHorizontal },
    responding: { label: 'Response active', dot: 'bg-blue-400', icon: HiOutlineLightningBolt },
    resolved: { label: 'Resolved', dot: 'bg-emerald-500', icon: HiOutlineBadgeCheck },
    rejected: { label: 'Rejected', dot: 'bg-gray-400', icon: HiOutlineXCircle },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', color: 'text-emerald-700' },
    moderate: { label: 'Moderate', color: 'text-amber-700' },
    severe: { label: 'Severe', color: 'text-red-600' },
    critical: { label: 'Critical', color: 'text-red-700 font-bold' },
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
                <div className="h-16 rounded-xl bg-gray-100" />
                <div className="h-28 rounded-xl border border-gray-200 bg-white" />
                <div className="h-52 rounded-xl border border-gray-200 bg-white" />
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
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                        <HiOutlineClipboardList className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reporter records</p>
                        <h1 className="text-2xl font-display font-bold text-gray-900 sm:text-3xl">My reports</h1>
                        <p className="mt-1 text-sm text-gray-500">Track the review and response status of your incident submissions.</p>
                    </div>
                </div>

                <Link
                    to="/report"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(220,38,38,0.75)] transition-all hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:w-auto"
                >
                    <HiOutlineExclamation className="h-4 w-4" />
                    Submit report
                </Link>
            </header>

            <section className="rounded-xl border border-gray-200 bg-white" aria-label="Report summary">
                <div className="grid grid-cols-2 border-b border-gray-100 lg:grid-cols-4 lg:border-b-0">
                    {metricCards.map(({ label, value, helper }, index) => (
                        <div
                            key={label}
                            className={`p-4 sm:p-5 ${
                                index % 2 === 0 ? 'border-r border-gray-100' : ''
                            } ${
                                index < 2 ? 'border-b border-gray-100 lg:border-b-0' : ''
                            } ${
                                index !== 3 ? 'lg:border-r lg:border-gray-100' : ''
                            }`}
                        >
                            <p className="text-xs font-medium text-gray-500">{label}</p>
                            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
                            <p className="mt-1 text-[11px] text-gray-400">{helper}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Submitted reports">
                {reports.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-200 p-3 sm:p-4 hide-scrollbar">
                        <div className="mr-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-500">
                            <HiOutlineFilter className="h-4 w-4" />
                            Status
                        </div>
                        {FILTERS.map((filter) => {
                            const count = filter === 'all' ? reports.length : (counts[filter] || 0);
                            if (filter !== 'all' && count === 0) return null;
                            const isActive = filterStatus === filter;
                            const label = filter === 'all' ? 'All' : STATUS_CONFIG[filter]?.label;
                            return (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() => setFilterStatus(filter)}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${isActive
                                        ? 'border-gray-800 bg-gray-800 text-white'
                                        : 'border-transparent bg-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                                >
                                    {label}
                                    <span className={isActive ? 'text-gray-300' : 'text-gray-400'}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Submitted incidents</h2>
                        <p className="mt-0.5 text-xs text-gray-500">
                            {filteredReports.length} {filteredReports.length === 1 ? 'record' : 'records'} shown
                        </p>
                    </div>
                </div>

                {reports.length === 0 ? (
                    <div className="px-5 py-14 text-center sm:py-16">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                            <HiOutlineClipboardList className="h-6 w-6" />
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-gray-900">No reports submitted</h3>
                        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Your incident reports will appear here after submission.</p>
                        <Link to="/report" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(220,38,38,0.75)] transition-all hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
                            <HiOutlineExclamation className="h-4 w-4" />
                            Submit your first report
                        </Link>
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                        <HiOutlineFilter className="mx-auto h-6 w-6 text-gray-300" />
                        <p className="mt-3 text-sm font-medium text-gray-700">No reports match this status</p>
                        <button type="button" onClick={() => setFilterStatus('all')} className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700">Clear filter</button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {filteredReports.map((report) => {
                            const isExpanded = selectedReportId === report._id;
                            const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                            const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                            const StatusIcon = status.icon;
                            const isClosed = ['resolved', 'rejected'].includes(report.status);

                            return (
                                <article key={report._id} className={isExpanded ? 'bg-gray-50/60' : 'bg-white'}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedReportId(isExpanded ? null : report._id)}
                                        aria-expanded={isExpanded}
                                        className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-gray-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5"
                                    >
                                        <div className="flex min-w-0 items-start gap-0">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-sm font-semibold text-gray-900">{getLocation(report)}</h3>
                                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                                    <span>{formatIncidentType(report)}</span>
                                                    <span aria-hidden="true" className="text-gray-300">•</span>
                                                    <span>Submitted {formatRelativeDate(report.createdAt)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                                            <span className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600">
                                                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                                                {status.label}
                                            </span>
                                            <span className={`text-[11px] font-semibold ${severity.color}`}>
                                                {severity.label}
                                            </span>
                                        </div>

                                        <HiOutlineChevronDown className={`hidden h-4 w-4 text-gray-400 transition-transform sm:block ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 px-4 py-5 sm:px-5">
                                            <div className="space-y-6">
                                                <div>
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Incident details</h4>
                                                    <p className="mt-3 break-words text-sm leading-6 text-gray-700">
                                                        {report.description || 'No incident description was provided.'}
                                                    </p>
                                                </div>

                                                <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                                                    {[
                                                        { label: 'Incident date', value: formatDate(report.incidentTime || report.accidentTime || report.createdAt) },
                                                        { label: 'Incident type', value: formatIncidentType(report) },
                                                        { label: 'Coordinates', value: formatCoordinates(report) },
                                                        { label: 'Report views', value: report.viewCount || 0 },
                                                    ].map(({ label, value }) => (
                                                        <div key={label}>
                                                            <dt className="text-[11px] font-medium text-gray-500">
                                                                {label}
                                                            </dt>
                                                            <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>

                                                <div>
                                                    <p className="text-[11px] font-medium text-gray-500">Current status</p>
                                                    <p className="mt-1 text-sm font-medium text-gray-900">
                                                        {status.label} <span className="font-normal text-gray-500">· Updated {formatRelativeDate(report.updatedAt || report.createdAt)}</span>
                                                    </p>
                                                    {report.respondedBy && (
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Response unit: {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)} {report.respondedBy?.name ? `(${report.respondedBy.name})` : ''}
                                                        </p>
                                                    )}
                                                    {report.status === 'resolved' && report.resolutionNotes && (
                                                        <div className="mt-2 text-sm text-gray-700">
                                                            <span className="font-medium">Resolution notes:</span> {report.resolutionNotes}
                                                        </div>
                                                    )}
                                                    {report.status === 'rejected' && report.rejectionReason && (
                                                        <div className="mt-2 text-sm text-gray-700">
                                                            <span className="font-medium">Reason:</span> {report.rejectionReason}
                                                        </div>
                                                    )}
                                                </div>

                                                {report.images?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                            Evidence photos ({report.images.length})
                                                        </h4>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {report.images.map((image, index) => (
                                                                <button
                                                                    key={`${image}-${index}`}
                                                                    type="button"
                                                                    onClick={() => { setViewerImage(resolveAssetUrl(image)); setViewerOpen(true); }}
                                                                    className="h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                                                >
                                                                    <img src={resolveAssetUrl(image)} alt={`Incident evidence ${index + 1}`} className="h-full w-full object-cover transition hover:scale-105" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <section className="mt-8 border-t border-gray-200 pt-6" aria-labelledby={`activity-heading-${report._id}`}>
                                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                    <div>
                                                        <h4 id={`activity-heading-${report._id}`} className="text-xs font-semibold uppercase tracking-wider text-gray-500">Report activity</h4>
                                                        <p className="mt-1.5 text-xs text-gray-500">Updates and response milestones for this incident.</p>
                                                    </div>
                                                    {!isClosed ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setUpdateDialogReportId(report._id)}
                                                            className="inline-flex min-h-[38px] w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:w-auto"
                                                        >
                                                            <HiOutlineChatAlt2 className="h-4 w-4" aria-hidden="true" />
                                                            Send situation update
                                                        </button>
                                                    ) : (
                                                        <span className="rounded-lg bg-gray-100 px-3 py-2 text-[11px] font-medium text-gray-600">Updates closed</span>
                                                    )}
                                                </div>
                                                <div className="mt-6">
                                                    <ReportActivityTimeline
                                                        report={report}
                                                        highlightedUpdateId={highlightedUpdates[report._id]}
                                                    />
                                                </div>
                                            </section>
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
