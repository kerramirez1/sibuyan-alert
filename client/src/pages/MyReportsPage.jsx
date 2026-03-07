import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import {
    HiOutlineBadgeCheck,
    HiOutlineChartBar,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiChevronDown,
    HiOutlineExclamationCircle,
    HiOutlineEye,
    HiOutlineFilter,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
    HiOutlinePaperAirplane,
    HiOutlinePhotograph,
    HiOutlinePlus,
    HiOutlineSparkles,
    HiOutlineShieldCheck,
    HiOutlineXCircle,
} from 'react-icons/hi';
import { reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import ImageViewer from '../components/ui/ImageViewer';

const STATUS_CONFIG = {
    pending: { label: 'Pending Review', icon: HiOutlineClock, iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500', softBg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
    verified: { label: 'Verified', icon: HiOutlineCheckCircle, iconBg: 'bg-gradient-to-br from-brand-500 to-brand-600', softBg: 'bg-brand-50', text: 'text-brand-700', border: 'border-brand-200', dot: 'bg-brand-500' },
    responding: { label: 'Responding', icon: HiOutlineLightningBolt, iconBg: 'bg-gradient-to-br from-blue-400 to-indigo-600', softBg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    resolved: { label: 'Resolved', icon: HiOutlineBadgeCheck, iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600', softBg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    rejected: { label: 'Rejected', icon: HiOutlineXCircle, iconBg: 'bg-gradient-to-br from-red-400 to-rose-600', softBg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
};

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
    moderate: { label: 'Moderate', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    severe: { label: 'Severe', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
    critical: { label: 'Critical', bg: 'bg-red-200', text: 'text-red-900', dot: 'bg-red-700' },
};

const CARD_STATS = [
    { key: 'total', label: 'Total', icon: HiOutlineChartBar, gradient: 'from-slate-600 to-slate-800' },
    { key: 'pending', label: 'Pending', icon: HiOutlineClock, gradient: 'from-amber-400 to-orange-500' },
    { key: 'active', label: 'Active', icon: HiOutlineLightningBolt, gradient: 'from-blue-400 to-indigo-600' },
    { key: 'resolved', label: 'Resolved', icon: HiOutlineBadgeCheck, gradient: 'from-brand-500 to-brand-700' },
];

const FILTERS = ['all', 'pending', 'verified', 'responding', 'resolved', 'rejected'];

const ReportLogoIcon = ({ className = 'w-6 h-6' }) => (
    <img src="/icons/report.logo.png" alt="Report icon" className={`${className} object-contain`} />
);

const AnimatedNumber = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let frameId;
        let startTime;
        const duration = 500;

        const tick = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            setDisplayValue(Math.round(value * (1 - ((1 - progress) * (1 - progress)))));
            if (progress < 1) frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
    }, [value]);

    return <>{displayValue}</>;
};

function MyReportsPage() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReportId, setSelectedReportId] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);
    const [updateDrafts, setUpdateDrafts] = useState({});
    const [updateTagDrafts, setUpdateTagDrafts] = useState({});
    const [submittingUpdateId, setSubmittingUpdateId] = useState(null);
    const { subscribe } = useSocket();

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const res = await reportsAPI.getMyReports();
                setReports(res.data.data || []);
            } catch (error) {
                console.error('Failed to fetch reports:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    useEffect(() => {
        const unsubRespond = subscribe('reportResponded', (data) => {
            setReports((prev) => prev.map((report) => report._id === data.id ? { ...report, status: 'responding', respondedBy: data.respondedBy, respondedAt: data.respondedAt } : report));
        });
        const unsubResolve = subscribe('reportResolved', (data) => {
            setReports((prev) => prev.map((report) => report._id === data.id ? { ...report, status: 'resolved', resolvedBy: data.resolvedBy, resolvedAt: data.resolvedAt, resolutionNotes: data.resolutionNotes } : report));
        });
        const unsubVerify = subscribe('reportVerified', (data) => {
            setReports((prev) => prev.map((report) => report._id === data.id ? { ...report, status: 'verified' } : report));
        });
        return () => { unsubRespond(); unsubResolve(); unsubVerify(); };
    }, [subscribe]);

    const handleSubmitUpdate = async (reportId) => {
        const message = (updateDrafts[reportId] || '').trim();
        const tag = updateTagDrafts[reportId] || 'general';
        if (message.length < 5) {
            toast.error('Please enter at least 5 characters');
            return;
        }
        setSubmittingUpdateId(reportId);
        try {
            await reportsAPI.addUpdate(reportId, { message, tag });
            toast.success('Update sent!');
            setUpdateDrafts((prev) => ({ ...prev, [reportId]: '' }));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send update');
        } finally {
            setSubmittingUpdateId(null);
        }
    };

    const getAgencyLabel = (agency) => {
        const labels = { MDRRMO: 'MDRRMO', PNP: 'PNP', SDH: 'Medical/SDH', BFP: 'BFP', LGU: 'MDRRMO' };
        return agency ? (labels[agency] || agency) : '';
    };

    const counts = reports.reduce((acc, report) => {
        acc[report.status] = (acc[report.status] || 0) + 1;
        return acc;
    }, {});
    const stats = {
        total: reports.length,
        pending: counts.pending || 0,
        active: (counts.verified || 0) + (counts.responding || 0),
        resolved: counts.resolved || 0,
    };
    const reportsNeedingAttention = stats.pending + (counts.responding || 0);
    const latestReport = reports[0] || null;
    const filteredReports = filterStatus === 'all' ? reports : reports.filter((report) => report.status === filterStatus);

    if (loading) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
                    <HiOutlineClipboardList className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-gray-500">Loading your reports...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl overflow-x-hidden">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-6 sm:mb-8">
                <div className="relative overflow-hidden rounded-[28px] border border-brand-100/80 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#ecfdf5_100%)] px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)] sm:px-6 sm:py-6">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -right-14 top-0 h-40 w-40 rounded-full bg-emerald-200/35 blur-3xl" />
                        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-brand-200/20 blur-2xl" />
                    </div>

                    <div className="relative grid gap-4 lg:grid-cols-[1.45fr_0.9fr]">
                        <div>
                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/30 sm:h-14 sm:w-14">
                                    <ReportLogoIcon className="h-9 w-9" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700 shadow-sm">
                                        <HiOutlineSparkles className="h-3.5 w-3.5" />
                                        Incident Tracking
                                    </div>
                                    <h1 className="text-3xl font-display font-bold tracking-tight text-gray-900 sm:text-4xl">My Reports</h1>
                                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-[15px]">
                                        Monitor review progress, field response, and resolution updates for every incident you submitted.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <div className="inline-flex min-w-[220px] items-center gap-3 rounded-2xl border border-amber-100 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
                                        <HiOutlineSparkles className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-400">Quick Insight</p>
                                        <p className="mt-1 text-sm font-semibold text-gray-800">
                                            {reportsNeedingAttention > 0
                                                ? `${reportsNeedingAttention} reports need attention across review and response tracking.`
                                                : 'Your reports are currently stable and moving through the workflow.'}
                                        </p>
                                    </div>
                                </div>

                                <Link to="/report" className="hidden sm:inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:-translate-y-0.5">
                                    <HiOutlinePlus className="h-4 w-4" />
                                    Submit New Report
                                </Link>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {CARD_STATS.map((card) => {
                                    const Icon = card.icon;
                                    return (
                                        <div key={card.key} className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur-sm">
                                            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.gradient}`} />
                                            <div className="mb-2 flex items-center justify-between">
                                                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-sm`}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                {card.key === 'active' && stats.active > 0 && (
                                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Live</span>
                                                )}
                                            </div>
                                            <p className={`bg-gradient-to-r ${card.gradient} bg-clip-text text-xl font-display font-bold text-transparent sm:text-2xl`}>
                                                <AnimatedNumber value={stats[card.key]} />
                                            </p>
                                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400">{card.label}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col justify-between rounded-[24px] border border-slate-200/70 bg-slate-950 p-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">Latest Field Snapshot</p>
                                    <p className="mt-2 text-lg font-semibold">{latestReport?.barangay || latestReport?.municipalityName || 'No live incident yet'}</p>
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80">
                                    {latestReport ? (STATUS_CONFIG[latestReport.status]?.label || 'Tracked') : 'Standby'}
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3.5">
                                <div className="flex items-center justify-between text-xs text-white/70">
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                                        Watchtower Feed
                                    </span>
                                    <span>{latestReport ? formatDistanceToNow(new Date(latestReport.createdAt), { addSuffix: true }) : 'Waiting for first report'}</span>
                                </div>
                                <p className="mt-3 text-sm font-medium leading-relaxed text-white/90">
                                    {latestReport?.description || 'New submissions appear here with their latest operational state and field metadata.'}
                                </p>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Status Mix</p>
                                    <p className="mt-2 text-xl font-display font-bold">{stats.pending}:{stats.active}:{stats.resolved}</p>
                                    <p className="mt-1 text-xs text-white/60">Pending, active, and resolved flow</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Preview Mode</p>
                                    <p className="mt-2 text-xl font-display font-bold">Rich Cards</p>
                                    <p className="mt-1 text-xs text-white/60">Map, media, and lifecycle at a glance</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-5 mt-4 sm:hidden">
                    <Link to="/report" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/20">
                        <HiOutlinePlus className="h-4 w-4" />
                        Submit New Report
                    </Link>
                </div>

                {reports.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar sm:gap-2">
                        <div className="mr-0.5 flex shrink-0 items-center gap-1 text-gray-400">
                            <HiOutlineFilter className="h-3.5 w-3.5" />
                            <span className="hidden text-[10px] font-semibold uppercase tracking-wider sm:block">Filter</span>
                        </div>
                        {FILTERS.map((filter) => {
                            const count = filter === 'all' ? reports.length : (counts[filter] || 0);
                            if (filter !== 'all' && count === 0) return null;
                            return (
                                <button
                                    key={filter}
                                    onClick={() => setFilterStatus(filter)}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 sm:text-xs ${filterStatus === filter ? 'bg-gray-900 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                                >
                                    {filter === 'responding' ? 'Active' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${filterStatus === filter ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            {reports.length === 0 ? (
                <div className="card relative overflow-hidden py-14 text-center sm:py-20">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-50/40 via-transparent to-blue-50/30" />
                    <div className="relative z-10">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100 shadow-inner">
                            <ReportLogoIcon className="h-10 w-10 opacity-30" />
                        </div>
                        <h3 className="mb-2 text-xl font-display font-bold text-gray-900">No reports yet</h3>
                        <p className="mx-auto max-w-xs text-sm text-gray-500">Submit your first incident report and it'll appear here for tracking.</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {filteredReports.map((report) => {
                            const isExpanded = selectedReportId === report._id;
                            const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
                            const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                            const StatusIcon = status.icon;

                            return (
                                <motion.div key={report._id} layout exit={{ opacity: 0, scale: 0.97 }} className={`group card !p-0 relative overflow-hidden transition-all duration-300 ${isExpanded ? `ring-2 ring-offset-1 ${status.border} shadow-lg ring-opacity-50` : 'hover:shadow-md'}`}>
                                    <div className={`absolute inset-x-0 top-0 h-[3px] ${status.iconBg} ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'} transition-opacity`} />
                                    <div className="cursor-pointer select-none px-4 pb-3.5 pt-4 sm:px-5" onClick={() => setSelectedReportId(isExpanded ? null : report._id)}>
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-200 sm:h-11 sm:w-11 ${status.iconBg} ${isExpanded ? 'scale-105' : 'group-hover:scale-105'}`}>
                                                <StatusIcon className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="mb-1 truncate text-sm font-bold text-gray-900 sm:text-[15px]">{report.address || report.title || 'Untitled Report'}</h3>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold sm:text-[11px] ${status.softBg} ${status.text} ${status.border}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${report.status === 'responding' ? 'animate-pulse' : ''}`} />
                                                        {status.label}
                                                    </span>
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold sm:text-[11px] ${severity.bg} ${severity.text}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />
                                                        {severity.label}
                                                    </span>
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 sm:text-xs">
                                                        <HiOutlineClock className="h-3 w-3" />
                                                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                {!isExpanded && report.description && <p className="mt-1.5 line-clamp-1 text-xs text-gray-400">{report.description}</p>}
                                            </div>
                                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-300 ${isExpanded ? 'rotate-180 bg-gray-900 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                                <HiChevronDown className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: 'easeInOut' }} className="overflow-hidden">
                                                <div className="space-y-4 px-4 pb-5 sm:px-5">
                                                    <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

                                                    {report.description && <div className="rounded-xl bg-gray-50 p-3 sm:p-4"><p className="break-words text-sm leading-relaxed text-gray-700">{report.description}</p></div>}

                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { label: 'Incident Time', value: format(new Date(report.incidentTime || report.accidentTime || report.createdAt), 'MMM d, yyyy h:mm a'), icon: <HiOutlineClock className="h-3.5 w-3.5" /> },
                                                            { label: 'Type', value: (report.incidentType || report.accidentType || 'N/A').replace(/_/g, ' '), icon: <HiOutlineExclamationCircle className="h-3.5 w-3.5" /> },
                                                            { label: 'Coordinates', value: `${report.coordinates?.lat?.toFixed(4)}, ${report.coordinates?.lng?.toFixed(4)}`, icon: <HiOutlineLocationMarker className="h-3.5 w-3.5" /> },
                                                            { label: 'Views', value: report.viewCount || 0, icon: <HiOutlineEye className="h-3.5 w-3.5" /> },
                                                        ].map((item) => (
                                                            <div key={item.label} className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
                                                                <div className="mb-1 flex items-center gap-1.5">
                                                                    <span className="text-gray-400">{item.icon}</span>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.label}</p>
                                                                </div>
                                                                <p className="break-all text-xs font-semibold capitalize text-gray-800 sm:text-sm">{item.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {report.images?.length > 0 && (
                                                        <div>
                                                            <div className="mb-2.5 flex items-center gap-2">
                                                                <HiOutlinePhotograph className="h-4 w-4 text-gray-400" />
                                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Evidence Photos</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {report.images.slice(0, 4).map((img, index) => (
                                                                    <button key={img + index} type="button" className="group/img relative h-16 w-16 overflow-hidden rounded-xl bg-gray-100 shadow-sm transition-all hover:shadow-md sm:h-20 sm:w-20" onClick={() => { setViewerImage(img); setViewerOpen(true); }}>
                                                                        <img src={img} alt={`Report ${index + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-110" />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {report.respondedBy && (
                                                        <div className={`flex items-center gap-3 rounded-xl border p-3 ${report.status === 'resolved' ? 'border-emerald-100 bg-emerald-50' : 'border-blue-100 bg-blue-50'}`}>
                                                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-white ${report.status === 'resolved' ? 'bg-gradient-to-br from-emerald-400 to-teal-600' : 'bg-gradient-to-br from-blue-400 to-indigo-600'}`}>
                                                                {report.status === 'resolved' ? <HiOutlineBadgeCheck className="h-5 w-5" /> : <HiOutlineShieldCheck className="h-5 w-5" />}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-800">{getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}</p>
                                                                <p className="text-[11px] text-gray-500">{report.respondedBy?.name}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50/50 p-3 sm:p-4">
                                                        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-blue-800">
                                                            <HiOutlinePaperAirplane className="h-3.5 w-3.5" />
                                                            Situation Update
                                                        </h4>
                                                        <div className="space-y-2">
                                                            <div className="flex gap-2">
                                                                <select
                                                                    value={updateTagDrafts[report._id] || 'general'}
                                                                    onChange={(e) => setUpdateTagDrafts((prev) => ({ ...prev, [report._id]: e.target.value }))}
                                                                    disabled={['resolved', 'rejected'].includes(report.status)}
                                                                    className="shrink-0 rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs text-gray-700 transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                                                                >
                                                                    <option value="general">General</option>
                                                                    <option value="transported">Transported</option>
                                                                    <option value="stabilized">Stabilized</option>
                                                                    <option value="need_help">Need help</option>
                                                                    <option value="false_alarm">False alarm</option>
                                                                    <option value="other">Other</option>
                                                                </select>
                                                                <input
                                                                    value={updateDrafts[report._id] || ''}
                                                                    onChange={(e) => setUpdateDrafts((prev) => ({ ...prev, [report._id]: e.target.value }))}
                                                                    placeholder={['resolved', 'rejected'].includes(report.status) ? 'This report is closed' : 'Describe the current situation...'}
                                                                    disabled={['resolved', 'rejected'].includes(report.status)}
                                                                    maxLength={500}
                                                                    className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-gray-700 transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSubmitUpdate(report._id)}
                                                                    disabled={submittingUpdateId === report._id || ['resolved', 'rejected'].includes(report.status)}
                                                                    className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    <HiOutlinePaperAirplane className="h-3.5 w-3.5 rotate-90" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>

                    {filteredReports.length === 0 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 text-center">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
                                <HiOutlineFilter className="h-6 w-6 text-gray-300" />
                            </div>
                            <p className="mb-1 text-sm font-medium text-gray-500">No reports match this filter</p>
                            <button onClick={() => setFilterStatus('all')} className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700">
                                Clear filter
                            </button>
                        </motion.div>
                    )}
                </div>
            )}

            <ImageViewer isOpen={viewerOpen} onClose={() => setViewerOpen(false)} imageSrc={viewerImage} />
        </div>
    );
}

export default MyReportsPage;
