import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow, format, subDays, isAfter } from 'date-fns';
import toast from 'react-hot-toast';
import {
    HiOutlineClock,
    HiOutlineLocationMarker,
    HiOutlineExclamation,
    HiOutlineBadgeCheck,
    HiOutlineShieldCheck,
    HiOutlineSearch,
    HiOutlineCalendar,
    HiOutlineChevronDown,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineArchive,
    HiOutlineFilter,
    HiOutlineMap,
    HiOutlineLockClosed,
    HiOutlineUserGroup,
    HiOutlineClipboardCheck,
} from 'react-icons/hi';
import ImageViewer from '../components/ui/ImageViewer';

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', gradient: 'from-green-400 to-emerald-500', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', border: 'border-green-200' },
    moderate: { label: 'Moderate', gradient: 'from-amber-400 to-orange-500', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
    severe: { label: 'Severe', gradient: 'from-red-400 to-rose-500', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' },
    critical: { label: 'Critical', gradient: 'from-red-600 to-red-800', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-700', border: 'border-red-300' },
    fatal: { label: 'Fatal', gradient: 'from-gray-700 to-gray-900', bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-700', border: 'border-gray-300' },
};

const INCIDENT_TYPE_LABELS = {
    vehicular: 'Vehicular Collision',
    motorcycle: 'Motorcycle Accident',
    pedestrian: 'Hit & Run / Pedestrian',
    bicycle: 'Bicycle Accident',
    self_accident: 'Self Accident',
    mechanical: 'Mechanical Failure',
    other: 'Other Incident',
};

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

const AccidentHistoryPage = () => {
    const { user, isAuthenticated } = useAuth();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    const [severityFilter, setSeverityFilter] = useState('all');
    const [municipalityFilter, setMunicipalityFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);
    const { subscribe } = useSocket();

    // Role-based access level
    const canViewFullDetails = useMemo(() => {
        if (!isAuthenticated || !user) return false;
        return ['admin', 'municipal_admin', 'responder'].includes(user.role);
    }, [isAuthenticated, user]);

    useEffect(() => { fetchReports(); }, []);

    useEffect(() => {
        const unsub1 = subscribe('reportResolved', (data) => {
            setReports(prev => prev.map(r =>
                r._id === data.id ? { ...r, status: 'resolved', resolvedBy: data.resolvedBy, resolvedAt: data.resolvedAt, resolutionNotes: data.resolutionNotes } : r
            ));
        });
        const unsub2 = subscribe('reportVerified', (data) => {
            setReports(prev => prev.map(r => r._id === data.id ? { ...r, status: 'verified' } : r));
        });
        return () => { unsub1(); unsub2(); };
    }, [subscribe]);

    const fetchReports = async () => {
        try {
            const response = await reportsAPI.getAll({ limit: 500, status: 'all' });
            const allReports = response.data?.data?.reports || [];
            setReports(allReports.filter(r => r.status === 'resolved'));
        } catch (error) {
            console.error('Failed to fetch accident history:', error);
            toast.error('Failed to load accident history');
        } finally {
            setLoading(false);
        }
    };

    const municipalities = useMemo(() => {
        const names = new Set(reports.map(r => r.municipalityName).filter(Boolean));
        return Array.from(names).sort();
    }, [reports]);

    const filteredReports = useMemo(() => {
        let result = [...reports];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(r =>
                (r.address || '').toLowerCase().includes(q) ||
                (r.barangay || '').toLowerCase().includes(q) ||
                (r.municipalityName || '').toLowerCase().includes(q) ||
                (r.incidentType || '').toLowerCase().includes(q) ||
                (r.description || '').toLowerCase().includes(q)
            );
        }
        if (dateFilter !== 'all') {
            const cutoff = subDays(new Date(), parseInt(dateFilter));
            result = result.filter(r => isAfter(new Date(r.resolvedAt || r.createdAt), cutoff));
        }
        if (severityFilter !== 'all') result = result.filter(r => r.severity === severityFilter);
        if (municipalityFilter !== 'all') result = result.filter(r => r.municipalityName === municipalityFilter);
        result.sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt));
        return result;
    }, [reports, searchQuery, dateFilter, severityFilter, municipalityFilter]);

    const stats = useMemo(() => {
        const last7 = reports.filter(r => isAfter(new Date(r.resolvedAt || r.createdAt), subDays(new Date(), 7))).length;
        const last30 = reports.filter(r => isAfter(new Date(r.resolvedAt || r.createdAt), subDays(new Date(), 30))).length;
        const counts = {};
        reports.forEach(r => { const n = r.municipalityName || 'Unknown'; counts[n] = (counts[n] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return { total: reports.length, last7, last30, topMunicipality: top?.[0] || 'N/A', topCount: top?.[1] || 0 };
    }, [reports]);

    const hasFilters = searchQuery || dateFilter !== 'all' || severityFilter !== 'all' || municipalityFilter !== 'all';

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse-soft flex items-center justify-center shadow-lg shadow-indigo-500/25">
                        <HiOutlineArchive className="w-7 h-7 text-white" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-ping opacity-20" />
                </div>
                <p className="text-sm text-gray-500 font-medium animate-pulse">Loading accident history...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto overflow-x-hidden">

            {/* ── Page Header ── */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-6 sm:mb-8"
            >
                {/* Title row */}
                <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
                    <div className="relative group shrink-0">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 transition-transform duration-300 group-hover:scale-105">
                            <HiOutlineArchive className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div className="absolute -inset-1 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-2xl opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl sm:text-3xl font-display font-bold bg-gradient-to-r from-indigo-900 via-purple-800 to-indigo-700 bg-clip-text text-transparent">
                            Accident History
                        </h1>
                        <p className="text-gray-500 text-sm mt-0.5">Browse resolved accident records across Sibuyan Island</p>
                    </div>
                    {/* Access badge */}
                    <div className="shrink-0">
                        {canViewFullDetails ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                                <HiOutlineShieldCheck className="w-3.5 h-3.5" />
                                Full Access
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-200 shadow-sm">
                                <HiOutlineEye className="w-3.5 h-3.5" />
                                Public View
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Stats Strip ── */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5"
                >
                    {[
                        {
                            label: 'Total Resolved',
                            value: stats.total,
                            gradient: 'from-indigo-500 to-purple-600',
                            icon: <HiOutlineBadgeCheck className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />,
                        },
                        {
                            label: 'Last 7 Days',
                            value: stats.last7,
                            gradient: 'from-blue-400 to-cyan-500',
                            icon: <HiOutlineClock className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" />,
                        },
                        {
                            label: 'Last 30 Days',
                            value: stats.last30,
                            gradient: 'from-brand-500 to-brand-700',
                            icon: <HiOutlineCalendar className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />,
                        },
                        {
                            label: 'Top Area',
                            value: stats.topMunicipality,
                            gradient: 'from-rose-400 to-pink-600',
                            icon: <HiOutlineLocationMarker className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />,
                            isText: true,
                            sub: `${stats.topCount} incidents`,
                        },
                    ].map((s, i) => (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.12 + i * 0.05 }}
                            className="card !p-3 sm:!p-4 relative overflow-hidden group cursor-default hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-[0.04] group-hover:opacity-[0.09] transition-opacity rounded-2xl`} />
                            <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 shadow-sm ring-1 ring-gray-100">
                                {s.icon}
                            </span>
                            {s.isText ? (
                                <>
                                    <p className="text-sm sm:text-base font-display font-bold text-gray-800 break-words">{s.value}</p>
                                    <p className="text-[10px] text-gray-400">{s.sub}</p>
                                </>
                            ) : (
                                <p className={`text-xl sm:text-2xl font-display font-bold bg-gradient-to-r ${s.gradient} bg-clip-text text-transparent`}>{s.value}</p>
                            )}
                            <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</p>
                        </motion.div>
                    ))}
                </motion.div>

                {/* ── Search & Filters ── */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2.5"
                >
                    {/* Search bar */}
                    <div className="relative">
                        <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by location, barangay, type..."
                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 transition-all shadow-sm"
                        />
                    </div>

                    {/* Filter pills row */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 text-gray-400">
                            <HiOutlineFilter className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider hidden sm:block">Filters</span>
                        </div>

                        {/* Date */}
                        <div className="relative">
                            <select
                                value={dateFilter}
                                onChange={e => setDateFilter(e.target.value)}
                                className="appearance-none bg-white border border-gray-200 text-gray-600 text-xs font-semibold pl-2.5 pr-6 py-1.5 rounded-lg cursor-pointer hover:border-gray-300 focus:ring-2 focus:ring-indigo-400/20 transition-all shadow-sm"
                            >
                                <option value="all">All Time</option>
                                <option value="7">Last 7 Days</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                            </select>
                            <HiOutlineCalendar className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>

                        {/* Severity */}
                        <select
                            value={severityFilter}
                            onChange={e => setSeverityFilter(e.target.value)}
                            className="appearance-none bg-white border border-gray-200 text-gray-600 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-gray-300 focus:ring-2 focus:ring-indigo-400/20 transition-all shadow-sm"
                        >
                            <option value="all">All Severity</option>
                            <option value="minor">Minor</option>
                            <option value="moderate">Moderate</option>
                            <option value="severe">Severe</option>
                            <option value="critical">Critical</option>
                        </select>

                        {/* Municipality */}
                        {municipalities.length > 1 && (
                            <select
                                value={municipalityFilter}
                                onChange={e => setMunicipalityFilter(e.target.value)}
                                className="appearance-none bg-white border border-gray-200 text-gray-600 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-gray-300 focus:ring-2 focus:ring-indigo-400/20 transition-all shadow-sm"
                            >
                                <option value="all">All Municipalities</option>
                                {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        )}

                        {/* Clear filters */}
                        {hasFilters && (
                            <button
                                onClick={() => { setSearchQuery(''); setDateFilter('all'); setSeverityFilter('all'); setMunicipalityFilter('all'); }}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                                Clear all
                            </button>
                        )}

                        <span className="ml-auto text-xs text-gray-400 font-medium">
                            {filteredReports.length} record{filteredReports.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </motion.div>
            </motion.div>

            {/* ── Records List ── */}
            {filteredReports.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card text-center py-14 sm:py-20 relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/30 via-transparent to-purple-50/30 rounded-2xl" />
                    <div className="relative z-10">
                        <div className="w-20 h-20 mx-auto bg-gray-100 rounded-3xl flex items-center justify-center mb-5 shadow-inner">
                            <HiOutlineArchive className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No records found</h3>
                        <p className="text-gray-500 text-sm max-w-sm mx-auto">
                            {hasFilters ? 'Try adjusting your search or filters to find more results.' : 'Resolved accident reports will appear here.'}
                        </p>
                        {hasFilters && (
                            <button
                                onClick={() => { setSearchQuery(''); setDateFilter('all'); setSeverityFilter('all'); setMunicipalityFilter('all'); }}
                                className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                                Clear all filters
                            </button>
                        )}
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="space-y-3"
                >
                    <AnimatePresence mode="popLayout">
                        {filteredReports.map((report) => {
                            const isExpanded = expandedId === report._id;
                            const sev = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                            const typeLabel = INCIDENT_TYPE_LABELS[report.incidentType] || report.incidentType || report.incidentCategory || 'Incident';

                            return (
                                <motion.div
                                    key={report._id}
                                    layout
                                    variants={itemVariants}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className={`relative overflow-hidden bg-white rounded-2xl border transition-all duration-500 ${isExpanded
                                        ? `border-indigo-300 shadow-2xl shadow-indigo-500/10`
                                        : 'border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 hover:border-indigo-200 group'
                                        }`}
                                >
                                    {/* Accent pulse glow for expanded item */}
                                    {isExpanded && <div className={`absolute inset-0 bg-gradient-to-r ${sev.gradient} opacity-[0.03] pointer-events-none`} />}

                                    {/* Accent bar line left */}
                                    <div className={`absolute top-0 bottom-0 left-0 w-1.5 bg-gradient-to-b ${sev.gradient} ${isExpanded ? 'h-full' : 'h-0 group-hover:h-full'} transition-all duration-500 ease-out`} />

                                    {/* Clickable header */}
                                    <div
                                        className="relative px-4 sm:px-6 py-4 sm:py-5 cursor-pointer select-none"
                                        onClick={() => setExpandedId(isExpanded ? null : report._id)}
                                    >
                                        <div className="flex items-start gap-4 sm:gap-5">
                                            {/* Beautiful icon styling */}
                                            <div className="relative shrink-0 hidden sm:block">
                                                <div className={`absolute inset-0 bg-gradient-to-br ${sev.gradient} opacity-20 blur-md rounded-2xl transform ${isExpanded ? 'scale-110' : 'group-hover:scale-125'} transition-all duration-300`} />
                                                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br ${sev.gradient} flex items-center justify-center text-white shadow-md border-[3px] border-white transform ${isExpanded ? 'scale-105' : 'group-hover:scale-105'} transition-transform duration-300`}>
                                                    <HiOutlineExclamation className="w-5 h-5 sm:w-6 sm:h-6" />
                                                </div>
                                            </div>

                                            {/* Text */}
                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <h3 className="font-bold text-sm sm:text-[15px] text-gray-900 uppercase tracking-tight">{typeLabel}</h3>
                                                    <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${sev.bg} ${sev.text} border ${sev.border}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                                                        {sev.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                                    <HiOutlineLocationMarker className="w-3 h-3 shrink-0 text-gray-400" />
                                                    <span className="break-words">{report.address || report.municipalityName || 'Unknown location'}</span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] text-gray-400">
                                                    <span className="font-medium text-gray-500">{report.municipalityName || 'Unknown'}</span>
                                                    <span className="text-gray-300">·</span>
                                                    <span>{format(new Date(report.resolvedAt || report.createdAt), 'MMM d, yyyy')}</span>
                                                    <span className="text-gray-300">·</span>
                                                    <span>{formatDistanceToNow(new Date(report.resolvedAt || report.createdAt), { addSuffix: true })}</span>
                                                </div>
                                            </div>

                                            {/* Status + expand */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    <HiOutlineBadgeCheck className="w-3 h-3" />
                                                    Resolved
                                                </span>
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ${isExpanded ? 'bg-gray-900 text-white rotate-180' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                                    <HiOutlineChevronDown className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded content */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.26, ease: 'easeInOut' }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-4 sm:px-6 pb-5 space-y-4">
                                                    <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

                                                    {/* ─── FULL DETAILS: Admin / Responder ─── */}
                                                    {canViewFullDetails ? (
                                                        <>
                                                            {/* Description */}
                                                            {report.description && (
                                                                <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
                                                                    <p className="text-gray-700 text-sm leading-relaxed break-words">{report.description}</p>
                                                                </div>
                                                            )}

                                                            {/* Full Info Grid */}
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                                {[
                                                                    { label: 'Incident Time', value: format(new Date(report.incidentTime || report.accidentTime || report.createdAt), 'MMM d, yyyy h:mm a'), icon: <HiOutlineClock className="w-3.5 h-3.5" /> },
                                                                    { label: 'Barangay', value: report.barangay || 'N/A', icon: <HiOutlineLocationMarker className="w-3.5 h-3.5" /> },
                                                                    { label: 'Resolved At', value: report.resolvedAt ? format(new Date(report.resolvedAt), 'MMM d, yyyy h:mm a') : 'N/A', icon: <HiOutlineBadgeCheck className="w-3.5 h-3.5" /> },
                                                                    { label: 'Coordinates', value: report.coordinates ? `${report.coordinates.lat.toFixed(4)}, ${report.coordinates.lng.toFixed(4)}` : 'N/A', icon: <HiOutlineMap className="w-3.5 h-3.5" /> },
                                                                    ...(report.casualties && (report.casualties.injured > 0 || report.casualties.fatalities > 0) ? [{
                                                                        label: 'Casualties',
                                                                        value: `${report.casualties.injured || 0} injured, ${report.casualties.fatalities || 0} fatal`,
                                                                        icon: <HiOutlineExclamation className="w-3.5 h-3.5" />,
                                                                    }] : []),
                                                                    ...(report.reporter ? [{
                                                                        label: 'Reported By',
                                                                        value: report.reporter.name || 'Anonymous',
                                                                        icon: <HiOutlineUserGroup className="w-3.5 h-3.5" />,
                                                                    }] : []),
                                                                    ...(report.viewCount ? [{ label: 'Views', value: report.viewCount, icon: <HiOutlineEye className="w-3.5 h-3.5" /> }] : []),
                                                                ].map((item, i) => (
                                                                    <div key={i} className="bg-gray-50 rounded-xl p-2.5 sm:p-3">
                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                            <span className="text-gray-400">{item.icon}</span>
                                                                            <p className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{item.label}</p>
                                                                        </div>
                                                                        <p className="text-[11px] sm:text-xs font-semibold text-gray-800 break-all">{item.value}</p>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Responder info */}
                                                            {(report.respondedBy || report.resolvedBy) && (
                                                                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shrink-0">
                                                                        <HiOutlineShieldCheck className="w-5 h-5" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-bold text-emerald-800">
                                                                            Handled by {report.respondedBy?.agency || 'Responder'}
                                                                        </p>
                                                                        <p className="text-[11px] text-emerald-600 break-words">
                                                                            {report.respondedBy?.name || 'N/A'}
                                                                            {report.resolutionNotes && ` — ${report.resolutionNotes}`}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Evidence Photos — FULL */}
                                                            {report.images?.length > 0 && (
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-2.5">
                                                                        <HiOutlinePhotograph className="w-4 h-4 text-gray-400" />
                                                                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Evidence Photos</span>
                                                                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{report.images.length}</span>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {report.images.map((img, i) => (
                                                                            <div
                                                                                key={i}
                                                                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gray-100 cursor-zoom-in group/img shadow-sm hover:shadow-lg transition-all border-2 border-white hover:border-indigo-200"
                                                                                onClick={() => { setViewerImage(img); setViewerOpen(true); }}
                                                                            >
                                                                                <img src={img} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-300" />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        /* ─── LIMITED VIEW: Reporter / Guest ─── */
                                                        <>
                                                            {/* Public info grid (limited) */}
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                                {[
                                                                    { label: 'Incident Date', value: format(new Date(report.incidentTime || report.accidentTime || report.createdAt), 'MMM d, yyyy'), icon: <HiOutlineClock className="w-3.5 h-3.5" /> },
                                                                    { label: 'Municipality', value: report.municipalityName || 'N/A', icon: <HiOutlineLocationMarker className="w-3.5 h-3.5" /> },
                                                                    { label: 'Resolved', value: report.resolvedAt ? format(new Date(report.resolvedAt), 'MMM d, yyyy') : 'N/A', icon: <HiOutlineBadgeCheck className="w-3.5 h-3.5" /> },
                                                                    ...(report.casualties && (report.casualties.injured > 0 || report.casualties.fatalities > 0) ? [{
                                                                        label: 'Casualties',
                                                                        value: `${report.casualties.injured || 0} injured, ${report.casualties.fatalities || 0} fatal`,
                                                                        icon: <HiOutlineExclamation className="w-3.5 h-3.5" />,
                                                                    }] : []),
                                                                ].map((item, i) => (
                                                                    <div key={i} className="bg-gray-50 rounded-xl p-2.5 sm:p-3">
                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                            <span className="text-gray-400">{item.icon}</span>
                                                                            <p className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{item.label}</p>
                                                                        </div>
                                                                        <p className="text-[11px] sm:text-xs font-semibold text-gray-800 break-all">{item.value}</p>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Responder info - only agency */}
                                                            {(report.respondedBy || report.resolvedBy) && (
                                                                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shrink-0">
                                                                        <HiOutlineClipboardCheck className="w-5 h-5" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-bold text-emerald-800">
                                                                            Responded by {report.respondedBy?.agency || 'Emergency Services'}
                                                                        </p>
                                                                        <p className="text-[11px] text-emerald-600">This incident has been resolved.</p>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Privacy notice for restricted content */}
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 6 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                className="flex items-start gap-3 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl"
                                                            >
                                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                                                                    <HiOutlineLockClosed className="w-4 h-4" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-amber-800 mb-0.5">
                                                                        Privacy Protected
                                                                    </p>
                                                                    <p className="text-[11px] text-amber-700 leading-relaxed">
                                                                        Detailed information including evidence photos, exact coordinates, and reporter identity are restricted to protect victim privacy. Only authorized personnel (admin & responders) can view the complete report.
                                                                    </p>
                                                                </div>
                                                            </motion.div>
                                                        </>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </motion.div>
            )}

            <ImageViewer isOpen={viewerOpen} onClose={() => setViewerOpen(false)} imageSrc={viewerImage} />
        </div>
    );
};

export default AccidentHistoryPage;
