import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow, isAfter, subDays } from 'date-fns';
import toast from '../utils/appToast';
import { resolveAssetUrl } from '../utils/assets';
import {
    HiOutlineArchive,
    HiOutlineBadgeCheck,
    HiOutlineCalendar,
    HiOutlineChevronDown,
    HiOutlineClock,
    HiOutlineEye,
    HiOutlineLocationMarker,
    HiOutlineLockClosed,
    HiOutlinePhotograph,
    HiOutlineSearch,
    HiOutlineShieldCheck,
    HiOutlineX,
} from 'react-icons/hi';
import { adminAPI, reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import ImageViewer from '../components/ui/ImageViewer';
import { useSearchParams } from '../router';
import { isSameManilaCalendarDay } from '../utils/reportResolution';
import {
    getAvailableBarangays,
    isBarangayInMunicipality,
    SIBUYAN_MUNICIPALITY_NAMES,
} from '../utils/sibuyanLocations';

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', shortLabel: 'Minor', dot: 'bg-emerald-500' },
    moderate: { label: 'Moderate', shortLabel: 'Moderate', dot: 'bg-amber-500' },
    severe: { label: 'Severe', shortLabel: 'Severe', dot: 'bg-orange-500' },
    critical: { label: 'Critical', shortLabel: 'Critical', dot: 'bg-red-500' },
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

const normalizeDateFilter = (value) => (
    ['today', '7', '30'].includes(value) ? value : 'all'
);

const formatDate = (value, pattern = 'MMM d, yyyy') => {
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

const getCoordinates = (report) => {
    const lat = Number(report?.coordinates?.lat);
    const lng = Number(report?.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : 'Not available';
};

const AccidentHistoryPage = () => {
    const { user, isAuthenticated } = useAuth();
    const { subscribe } = useSocket();
    const [searchParams] = useSearchParams();
    const requestedDateFilter = searchParams.get('date');
    const [reports, setReports] = useState([]);
    const [municipalitiesData, setMunicipalitiesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState(() => normalizeDateFilter(requestedDateFilter));
    const [severityFilter, setSeverityFilter] = useState('all');
    const [municipalityFilter, setMunicipalityFilter] = useState('all');
    const [barangayFilter, setBarangayFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);
    const itemRefs = useRef({});

    const canViewFullDetails = useMemo(() => (
        Boolean(isAuthenticated && user && ['municipal_admin', 'responder'].includes(user.role))
    ), [isAuthenticated, user]);

    const fetchReports = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = canViewFullDetails
                ? await adminAPI.getReports({ limit: 500, status: 'resolved' })
                : await reportsAPI.getAll({ limit: 500, status: 'resolved' });
            const rows = response.data?.data?.reports || [];
            setReports(rows.filter((report) => report.status === 'resolved'));
        } catch (error) {
            console.error('Failed to fetch accident history:', error);
            if (!silent) toast.error('Failed to load accident history');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [canViewFullDetails]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    useEffect(() => {
        reportsAPI.getMunicipalities()
            .then((response) => {
                if (response.data?.success && Array.isArray(response.data?.data)) {
                    setMunicipalitiesData(response.data.data);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        setDateFilter(normalizeDateFilter(requestedDateFilter));
    }, [requestedDateFilter]);

    useEffect(() => {
        if (!expandedId) return undefined;

        const el = itemRefs.current[expandedId];
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
    }, [expandedId]);

    useEffect(() => {
        const unsubscribeResolved = subscribe('reportResolved', () => fetchReports(true));
        const unsubscribeDeleted = subscribe('reportDeleted', (data) => {
            if (!data?.id) return;
            setReports((current) => current.filter((report) => report._id !== data.id));
        });
        return () => {
            unsubscribeResolved();
            unsubscribeDeleted();
        };
    }, [subscribe, fetchReports]);

    const municipalities = useMemo(() => {
        const set = new Set(SIBUYAN_MUNICIPALITY_NAMES);
        municipalitiesData.forEach((m) => { if (m.name) set.add(m.name); });
        reports.forEach((report) => { if (report.municipalityName) set.add(report.municipalityName); });
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [reports, municipalitiesData]);

    const availableBarangays = useMemo(() => (
        getAvailableBarangays(municipalityFilter, municipalitiesData, reports)
    ), [municipalityFilter, municipalitiesData, reports]);

    const handleMunicipalityChange = (newMunicipality) => {
        setMunicipalityFilter(newMunicipality);
        if (barangayFilter !== 'all') {
            const isValid = isBarangayInMunicipality(
                barangayFilter,
                newMunicipality,
                municipalitiesData,
                reports
            );
            if (!isValid) {
                setBarangayFilter('all');
            }
        }
    };

    useEffect(() => {
        if (barangayFilter !== 'all') {
            const isValid = isBarangayInMunicipality(
                barangayFilter,
                municipalityFilter,
                municipalitiesData,
                reports
            );
            if (!isValid) {
                setBarangayFilter('all');
            }
        }
    }, [municipalityFilter, barangayFilter, municipalitiesData, reports]);

    const filteredReports = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const cutoff = ['7', '30'].includes(dateFilter)
            ? subDays(new Date(), Number(dateFilter))
            : null;

        return reports
            .filter((report) => {
                if (query) {
                    const searchable = [
                        report.address,
                        report.barangay,
                        report.municipalityName,
                        report.incidentType,
                        report.description,
                    ].filter(Boolean).join(' ').toLowerCase();
                    if (!searchable.includes(query)) return false;
                }
                const resolvedDate = report.resolvedAt || report.createdAt;
                if (dateFilter === 'today' && !isSameManilaCalendarDay(resolvedDate)) return false;
                if (cutoff && !isAfter(new Date(resolvedDate), cutoff)) return false;
                if (severityFilter !== 'all' && report.severity !== severityFilter) return false;
                if (municipalityFilter !== 'all' && report.municipalityName !== municipalityFilter) return false;
                if (barangayFilter !== 'all' && report.barangay !== barangayFilter) return false;
                return true;
            })
            .sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt));
    }, [reports, searchQuery, dateFilter, severityFilter, municipalityFilter, barangayFilter]);

    // Top Barangay calculation: calculated within the current active search/date/severity/municipality scope
    // explicitly EXCLUDING the barangay filter itself so it remains informative when a barangay is selected.
    const topBarangayScopeReports = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const cutoff = ['7', '30'].includes(dateFilter)
            ? subDays(new Date(), Number(dateFilter))
            : null;

        return reports.filter((report) => {
            if (query) {
                const searchable = [
                    report.address,
                    report.barangay,
                    report.municipalityName,
                    report.incidentType,
                    report.description,
                ].filter(Boolean).join(' ').toLowerCase();
                if (!searchable.includes(query)) return false;
            }
            const resolvedDate = report.resolvedAt || report.createdAt;
            if (dateFilter === 'today' && !isSameManilaCalendarDay(resolvedDate)) return false;
            if (cutoff && !isAfter(new Date(resolvedDate), cutoff)) return false;
            if (severityFilter !== 'all' && report.severity !== severityFilter) return false;
            if (municipalityFilter !== 'all' && report.municipalityName !== municipalityFilter) return false;
            return true;
        });
    }, [reports, searchQuery, dateFilter, severityFilter, municipalityFilter]);

    const topBarangayInfo = useMemo(() => {
        const counts = {};
        const barangayToMunicipality = {};

        topBarangayScopeReports.forEach((report) => {
            const b = report.barangay?.trim();
            if (!b) return;
            counts[b] = (counts[b] || 0) + 1;
            if (report.municipalityName && !barangayToMunicipality[b]) {
                barangayToMunicipality[b] = report.municipalityName;
            }
        });

        const entries = Object.entries(counts);
        if (entries.length === 0) {
            return {
                name: 'No data',
                helper: '0 resolved incidents',
            };
        }

        let maxCount = 0;
        entries.forEach(([, count]) => {
            if (count > maxCount) maxCount = count;
        });

        const leaders = entries
            .filter(([, count]) => count === maxCount)
            .map(([name]) => name)
            .sort((a, b) => a.localeCompare(b));

        const topName = leaders[0];
        const isTied = leaders.length > 1;
        const incidentWord = maxCount === 1 ? 'incident' : 'incidents';
        const municipalityLabel = barangayToMunicipality[topName] || (municipalityFilter !== 'all' ? municipalityFilter : null);

        let helper = `${maxCount} resolved ${incidentWord}`;
        if (isTied) {
            helper += ` · Tied (${leaders.length} barangays)`;
        } else if (municipalityLabel) {
            helper += ` · ${municipalityLabel}`;
        }

        return {
            name: topName,
            helper,
        };
    }, [topBarangayScopeReports, municipalityFilter]);

    const stats = useMemo(() => {
        const now = new Date();
        return {
            total: reports.length,
            last7: reports.filter((report) => isAfter(new Date(report.resolvedAt || report.createdAt), subDays(now, 7))).length,
            last30: reports.filter((report) => isAfter(new Date(report.resolvedAt || report.createdAt), subDays(now, 30))).length,
        };
    }, [reports]);

    const hasFilters = Boolean(
        searchQuery
        || dateFilter !== 'all'
        || severityFilter !== 'all'
        || municipalityFilter !== 'all'
        || barangayFilter !== 'all'
    );

    const clearFilters = () => {
        setSearchQuery('');
        setDateFilter('all');
        setSeverityFilter('all');
        setMunicipalityFilter('all');
        setBarangayFilter('all');
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-6xl space-y-5 animate-pulse">
                <div className="h-14 w-full rounded-2xl bg-gray-100 dark:bg-white/5" />
                <div className="h-24 w-full rounded-2xl bg-gray-100 dark:bg-white/5" />
                <div className="h-64 w-full rounded-2xl bg-gray-100 dark:bg-white/5" />
            </div>
        );
    }

    const metricCards = [
        { label: 'Total resolved', value: stats.total, helper: 'All recorded incidents', icon: HiOutlineBadgeCheck },
        { label: 'Last 7 days', value: stats.last7, helper: 'Recently closed', icon: HiOutlineClock },
        { label: 'Last 30 days', value: stats.last30, helper: 'Monthly activity', icon: HiOutlineCalendar },
        { label: 'Top Barangay', value: topBarangayInfo.name, helper: topBarangayInfo.helper, icon: HiOutlineLocationMarker, text: true },
    ];

    return (
        <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        <HiOutlineArchive className="h-3.5 w-3.5" aria-hidden="true" />
                        Records
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Accident history
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Resolved road incidents across Sibuyan Island.
                    </p>
                </div>

                <div
                    className={`inline-flex self-start items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold select-none shadow-2xs ${canViewFullDetails
                        ? 'border-emerald-200/90 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-gray-200/90 bg-gray-50/80 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'
                        }`}
                    aria-label={canViewFullDetails ? 'Operational access level' : 'Public records access level'}
                >
                    {canViewFullDetails
                        ? <HiOutlineShieldCheck className="h-4 w-4" />
                        : <HiOutlineEye className="h-4 w-4" />}
                    <span>{canViewFullDetails ? 'Operational access' : 'Public records'}</span>
                </div>
            </header>

            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200/90 bg-gray-200/90 shadow-2xs md:grid-cols-4 dark:border-white/10 dark:bg-white/10" aria-label="History summary">
                {metricCards.map(({ label, value, helper, icon: Icon, text }) => (
                    <div
                        key={label}
                        className="bg-white p-4 sm:p-5 dark:bg-[#0c1813]/90"
                    >
                        <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h2>
                        </div>
                        <p className={`mt-1.5 font-display font-bold text-gray-950 dark:text-white ${text ? 'text-xl truncate' : 'text-2xl sm:text-3xl'}`}>{value}</p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
                    </div>
                ))}
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Resolved accident records">
                {/* Filters Toolbar */}
                <div className="border-b border-gray-200/80 bg-gray-50/70 p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:flex-wrap md:items-center lg:flex-nowrap">
                        <label className="relative block flex-1 min-w-[200px]">
                            <span className="sr-only">Search accident history</span>
                            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search location, barangay, or incident type"
                                className="h-9 w-full rounded-xl border border-gray-200/90 bg-white py-1.5 pl-9 pr-3 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                            />
                        </label>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                            <select
                                value={dateFilter}
                                onChange={(event) => setDateFilter(event.target.value)}
                                className="h-9 w-full sm:w-auto rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                                aria-label="Filter by date"
                            >
                                <option value="all">All dates</option>
                                <option value="today">Today</option>
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 3 months</option>
                                <option value="365">Last year</option>
                            </select>

                            <select
                                value={severityFilter}
                                onChange={(event) => setSeverityFilter(event.target.value)}
                                className="h-9 w-full sm:w-auto rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                                aria-label="Filter by severity"
                            >
                                <option value="all">All severities</option>
                                <option value="minor">Minor</option>
                                <option value="moderate">Moderate</option>
                                <option value="severe">Severe</option>
                                <option value="critical">Critical</option>
                            </select>

                            <select
                                value={municipalityFilter}
                                onChange={(event) => handleMunicipalityChange(event.target.value)}
                                className="h-9 w-full sm:w-auto rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                                aria-label="Filter by municipality"
                            >
                                <option value="all">All municipalities</option>
                                {municipalities.map((municipality) => (
                                    <option key={municipality} value={municipality}>{municipality}</option>
                                ))}
                            </select>

                            <select
                                value={barangayFilter}
                                onChange={(event) => setBarangayFilter(event.target.value)}
                                className="h-9 w-full sm:w-auto rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                                aria-label="Filter by barangay"
                            >
                                <option value="all">All barangays</option>
                                {availableBarangays.map((barangay) => (
                                    <option key={barangay} value={barangay}>{barangay}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200/80 pt-2.5 dark:border-white/10">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Showing <span className="text-gray-900 dark:text-white">{filteredReports.length}</span> of {reports.length} records
                        </p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                            >
                                <HiOutlineX className="w-3.5 h-3.5" />
                                <span>Clear filters</span>
                            </button>
                        )}
                    </div>
                </div>

                {filteredReports.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
                            <HiOutlineArchive className="h-5 w-5" />
                        </div>
                        <h2 className="mt-3 font-display text-sm font-bold text-gray-950 dark:text-white">No accident records found</h2>
                        <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-gray-500 dark:text-gray-400">Try adjusting the selected filters.</p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] gap-4 border-b border-gray-200/80 bg-gray-50/50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.01] dark:text-gray-400">
                            <span>Incident</span>
                            <span>Municipality</span>
                            <span>Resolved</span>
                            <span>Severity</span>
                            <span />
                        </div>

                        <div className="divide-y divide-gray-100 dark:divide-white/5">
                            {filteredReports.map((report) => {
                                const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                                const isExpanded = Boolean(expandedId && String(expandedId) === String(report._id));
                                const incidentDate = report.incidentTime || report.accidentTime || report.createdAt;
                                const resolvedDate = report.resolvedAt || report.updatedAt;
                                const casualtyCount = Number(report.casualties?.injured || 0) + Number(report.casualties?.fatalities || 0);

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
                                            onClick={() => setExpandedId(isExpanded ? null : report._id)}
                                            aria-expanded={isExpanded}
                                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${INCIDENT_TYPE_LABELS[report.incidentType] || 'incident'}`}
                                            className={`grid w-full grid-cols-[minmax(0,1fr)_74px_24px] items-center gap-1.5 px-3 py-3.5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_88px_28px] sm:gap-3 sm:px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] md:gap-4 md:px-5 ${isExpanded ? 'bg-emerald-500/[0.03] dark:bg-white/[0.01]' : ''}`}
                                        >
                                            <div className="min-w-0">
                                                <p className="line-clamp-1 font-display text-sm font-bold text-gray-950 dark:text-white">
                                                    {INCIDENT_TYPE_LABELS[report.incidentType] || report.incidentType || 'Road incident'}
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                                    {[report.barangay, report.municipalityName].filter(Boolean).join(', ') || 'Location not provided'}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 md:hidden">Incident {formatDate(incidentDate)}</p>
                                            </div>

                                            <div className="hidden md:flex md:items-center text-xs text-gray-600 dark:text-gray-300">
                                                <span className="truncate">{report.municipalityName || 'Unknown'}</span>
                                            </div>

                                            <div className="hidden md:block text-xs text-gray-600 dark:text-gray-300">
                                                <p className="font-semibold text-gray-900 dark:text-white">{formatDate(resolvedDate)}</p>
                                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{formatRelativeDate(resolvedDate)}</p>
                                            </div>

                                            <div className="flex items-center justify-start">
                                                <span className="inline-flex h-5.5 sm:h-6 w-full max-w-[74px] sm:max-w-[88px] md:max-w-[96px] items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg border border-gray-200/90 bg-white px-1 sm:px-2 text-[9px] sm:text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-gray-700 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                    <span className="hidden md:inline truncate">{severity.label}</span>
                                                    <span className="md:hidden truncate">{severity.shortLabel || severity.label}</span>
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-center">
                                                <HiOutlineChevronDown className={`h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''}`} />
                                            </div>
                                        </button>

                                        {/* Compact Inline Expanded Inspector with distinct boundary */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-200/60 px-4 py-4 space-y-3.5 sm:px-6 dark:border-white/5">
                                                <div>
                                                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Incident summary</h3>
                                                    <p className="mt-0.5 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{report.description || <span className="italic text-gray-400 dark:text-gray-500">No incident description was provided.</span>}</p>
                                                </div>

                                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-200/60 pt-2.5 sm:grid-cols-3 md:grid-cols-5 dark:border-white/5">
                                                    {[
                                                        ['Incident date', formatDate(incidentDate, 'MMM d, yyyy h:mm a')],
                                                        ['Barangay', report.barangay || 'Not available'],
                                                        ['Resolved date', formatDate(resolvedDate, 'MMM d, yyyy h:mm a')],
                                                        ['Municipality', report.municipalityName || 'Not available'],
                                                        ['Casualties', casualtyCount ? `${report.casualties?.injured || 0} injured, ${report.casualties?.fatalities || 0} fatal` : 'None recorded'],
                                                        ...(canViewFullDetails ? [
                                                            ['Coordinates', getCoordinates(report)],
                                                            ['Reported by', report.reporter?.name || 'Anonymous'],
                                                            ['Views', String(report.viewCount || 0)],
                                                        ] : []),
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="min-w-0">
                                                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 truncate">{label}</dt>
                                                            <dd className="mt-0.5 text-xs font-semibold text-gray-900 break-words dark:text-white truncate">{value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>

                                                <div className="flex flex-col gap-2 border-t border-gray-200/60 pt-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
                                                    {(report.respondedBy || report.resolvedBy) ? (
                                                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">
                                                                Handled by {report.respondedBy?.agency || report.resolvedBy?.agency || 'Emergency Services'}
                                                            </span>
                                                            {canViewFullDetails && (
                                                                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                                                    ({report.respondedBy?.name || report.resolvedBy?.name || 'Responder'}{report.resolutionNotes ? ` — ${report.resolutionNotes}` : ''})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : <div />}

                                                    {canViewFullDetails ? (
                                                        report.images?.length ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                                                    <HiOutlinePhotograph className="h-3.5 w-3.5" />
                                                                    Evidence ({report.images.length})
                                                                </span>
                                                                <div className="flex items-center gap-1.5">
                                                                    {report.images.map((image, index) => (
                                                                        <button
                                                                            key={image}
                                                                            type="button"
                                                                            onClick={() => { setViewerImage(resolveAssetUrl(image)); setViewerOpen(true); }}
                                                                            className="h-7 w-7 overflow-hidden rounded-md border border-gray-200/90 bg-gray-100 transition-transform hover:scale-105 dark:border-white/10 dark:bg-gray-800"
                                                                        >
                                                                            <img src={resolveAssetUrl(image)} alt={`Evidence ${index + 1}`} className="h-full w-full object-cover" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : null
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                                                            <HiOutlineLockClosed className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                            <span>Protected details restricted to authorized operational users.</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>

            <ImageViewer isOpen={viewerOpen} onClose={() => setViewerOpen(false)} imageSrc={viewerImage} />
        </div>
    );
};

export default AccidentHistoryPage;
