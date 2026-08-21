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
import CustomSelect from '../components/ui/CustomSelect';
import { useSearchParams } from '../router';
import { isSameManilaCalendarDay } from '../utils/reportResolution';
import {
    getAvailableBarangays,
    isBarangayInMunicipality,
    SIBUYAN_MUNICIPALITY_NAMES,
} from '../utils/sibuyanLocations';

const SEVERITY_CONFIG = {
    minor: {
        label: 'Minor',
        shortLabel: 'Minor',
        dot: 'bg-emerald-500',
        badge: 'border-emerald-200/90 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    moderate: {
        label: 'Moderate',
        shortLabel: 'Moderate',
        dot: 'bg-amber-500',
        badge: 'border-amber-200/90 bg-amber-50/80 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
    },
    severe: {
        label: 'Severe',
        shortLabel: 'Severe',
        dot: 'bg-orange-500',
        badge: 'border-orange-200/90 bg-orange-50/80 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300',
    },
    critical: {
        label: 'Critical',
        shortLabel: 'Critical',
        dot: 'bg-red-500',
        badge: 'border-red-200/90 bg-red-50/80 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
    },
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

const DATE_OPTIONS = [
    { value: 'all', label: 'All dates' },
    { value: 'today', label: 'Today' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 3 months' },
    { value: '365', label: 'Last year' },
];

const SEVERITY_OPTIONS = [
    { value: 'all', label: 'All severities' },
    { value: 'minor', label: 'Minor', dot: 'bg-emerald-500' },
    { value: 'moderate', label: 'Moderate', dot: 'bg-amber-500' },
    { value: 'severe', label: 'Severe', dot: 'bg-orange-500' },
    { value: 'critical', label: 'Critical', dot: 'bg-red-500' },
];

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

    const municipalityOptions = useMemo(() => [
        { value: 'all', label: 'All municipalities' },
        ...municipalities.map((m) => ({ value: m, label: m })),
    ], [municipalities]);

    const barangayOptions = useMemo(() => [
        { value: 'all', label: 'All barangays' },
        ...availableBarangays.map((b) => ({ value: b, label: b })),
    ], [availableBarangays]);

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

    const handleTopBarangayClick = () => {
        if (!topBarangayInfo.name || topBarangayInfo.name === 'No data') return;
        if (barangayFilter === topBarangayInfo.name) {
            setBarangayFilter('all');
        } else {
            setBarangayFilter(topBarangayInfo.name);
        }
    };

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
            <div className="mx-auto max-w-6xl space-y-4 animate-pulse sm:space-y-5">
                <div className="h-14 w-full rounded-xl bg-gray-100 dark:bg-white/5" />
                <div className="h-24 w-full rounded-xl bg-gray-100 dark:bg-white/5" />
                <div className="h-80 w-full rounded-xl bg-gray-100 dark:bg-white/5" />
            </div>
        );
    }

    const metricCards = [
        {
            label: 'Total resolved',
            value: stats.total,
            helper: 'All recorded incidents',
            icon: HiOutlineBadgeCheck,
        },
        {
            label: 'Last 7 days',
            value: stats.last7,
            helper: 'Recently closed',
            icon: HiOutlineClock,
        },
        {
            label: 'Last 30 days',
            value: stats.last30,
            helper: 'Monthly activity',
            icon: HiOutlineCalendar,
        },
        {
            label: 'Top Barangay',
            value: topBarangayInfo.name,
            helper: topBarangayInfo.helper,
            icon: HiOutlineLocationMarker,
            text: true,
            isButton: topBarangayInfo.name && topBarangayInfo.name !== 'No data',
            isActive: barangayFilter !== 'all' && barangayFilter === topBarangayInfo.name,
            onClick: handleTopBarangayClick,
        },
    ];

    return (
        <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
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
                    className={`inline-flex self-start items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold select-none shadow-2xs ${canViewFullDetails
                        ? 'border-emerald-200/90 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-gray-200/90 bg-gray-50/80 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'
                        }`}
                    aria-label={canViewFullDetails ? 'Operational access level' : 'Public records access level'}
                >
                    {canViewFullDetails
                        ? <HiOutlineShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        : <HiOutlineEye className="h-4 w-4 text-gray-500" />}
                    <span>{canViewFullDetails ? 'Operational access' : 'Public records'}</span>
                </div>
            </header>

            {/* Restrained 4-Column Supporting Summary Strip */}
            <section className="grid grid-cols-2 divide-y divide-gray-200/80 rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0" aria-label="History summary">
                {metricCards.map(({ label, value, helper, icon: Icon, text, isButton, isActive, onClick }) => {
                    const CardComponent = isButton ? 'button' : 'div';
                    return (
                        <CardComponent
                            key={label}
                            type={isButton ? 'button' : undefined}
                            onClick={onClick}
                            aria-pressed={isButton ? isActive : undefined}
                            className={`p-3.5 sm:p-4 flex flex-col justify-between text-left transition-all duration-150 relative ${
                                isButton
                                    ? 'cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
                                    : ''
                            } ${isActive ? 'bg-emerald-500/10 dark:bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30' : ''}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h2>
                                </div>
                                {isButton && (
                                    <span className={`text-[9px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5 ${
                                        isActive
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'bg-gray-200/80 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                                    }`}>
                                        {isActive ? 'Filtered' : 'Filter'}
                                    </span>
                                )}
                            </div>
                            <p className={`mt-1 font-display font-black text-gray-950 dark:text-white tabular-nums ${text ? 'text-lg sm:text-xl truncate' : 'text-xl sm:text-2xl'}`}>{value}</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{helper}</p>
                        </CardComponent>
                    );
                })}
            </section>

            {/* Resolved Accident Records Ledger */}
            <section className="rounded-xl border border-gray-200/90 bg-white shadow-xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Resolved accident records">
                {/* Integrated Filters Toolbar */}
                <div className="rounded-t-xl border-b border-gray-200/80 bg-gray-50/70 p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:flex-wrap md:items-center lg:flex-nowrap">
                        <label className="relative block flex-1 min-w-[200px]">
                            <span className="sr-only">Search accident history</span>
                            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search location, barangay, or incident type"
                                className="h-9 w-full rounded-lg border border-gray-200/90 bg-white py-1.5 pl-9 pr-8 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                                    aria-label="Clear search query"
                                >
                                    <HiOutlineX className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </label>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                            <CustomSelect
                                value={dateFilter}
                                onChange={(event) => setDateFilter(event.target.value)}
                                options={DATE_OPTIONS}
                                ariaLabel="Filter by date"
                            />

                            <CustomSelect
                                value={severityFilter}
                                onChange={(event) => setSeverityFilter(event.target.value)}
                                options={SEVERITY_OPTIONS}
                                ariaLabel="Filter by severity"
                            />

                            <CustomSelect
                                value={municipalityFilter}
                                onChange={(event) => handleMunicipalityChange(event.target.value)}
                                options={municipalityOptions}
                                ariaLabel="Filter by municipality"
                            />

                            <CustomSelect
                                value={barangayFilter}
                                onChange={(event) => setBarangayFilter(event.target.value)}
                                options={barangayOptions}
                                ariaLabel="Filter by barangay"
                            />
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200/80 pt-2.5 dark:border-white/10">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Showing <span className="text-gray-900 dark:text-white font-black tabular-nums">{filteredReports.length}</span> of {reports.length} records
                        </p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                            >
                                <HiOutlineX className="w-3.5 h-3.5" />
                                <span>Clear filters</span>
                            </button>
                        )}
                    </div>
                </div>

                {filteredReports.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
                            <HiOutlineArchive className="h-5 w-5" />
                        </div>
                        <h2 className="mt-3 font-display text-sm font-bold text-gray-950 dark:text-white">No accident records found</h2>
                        <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-gray-500 dark:text-gray-400">Try adjusting the selected filters.</p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 cursor-pointer dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] gap-4 border-b border-gray-200/80 bg-gray-50/50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.01] dark:text-gray-400">
                            <span>Incident</span>
                            <span>Municipality</span>
                            <span>Resolved</span>
                            <span>Severity</span>
                            <span className="sr-only">Toggle details</span>
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
                                        style={isExpanded ? { borderLeftColor: 'var(--expanded-record-accent, #059669)' } : undefined}
                                        className={`transition-colors duration-150 border-l-2 sm:border-l-[3px] scroll-mt-4 sm:scroll-mt-6 ${isExpanded
                                            ? 'border-l-emerald-600 bg-emerald-50/20 shadow-2xs dark:border-l-emerald-500 dark:bg-[#07130e]/80 border-b border-gray-200/90 dark:border-white/10'
                                            : 'border-l-transparent bg-white hover:bg-gray-50/75 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(isExpanded ? null : report._id)}
                                            aria-expanded={isExpanded}
                                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${INCIDENT_TYPE_LABELS[report.incidentType] || 'incident'}`}
                                            className={`grid w-full grid-cols-[minmax(0,1fr)_74px_24px] items-center gap-1.5 px-3 py-3.5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_88px_28px] sm:gap-3 sm:px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] md:gap-4 md:px-5 cursor-pointer ${isExpanded ? 'bg-emerald-500/[0.03] dark:bg-white/[0.01]' : ''}`}
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

                                            <div className="hidden md:flex md:items-center text-xs text-gray-700 dark:text-gray-300 font-semibold">
                                                <span className="truncate">{report.municipalityName || 'Unknown'}</span>
                                            </div>

                                            <div className="hidden md:block text-xs text-gray-600 dark:text-gray-300">
                                                <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{formatDate(resolvedDate)}</p>
                                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{formatRelativeDate(resolvedDate)}</p>
                                            </div>

                                            <div className="flex items-center justify-start">
                                                <span className={`inline-flex h-5.5 sm:h-6 w-full max-w-[74px] sm:max-w-[88px] md:max-w-[96px] items-center gap-1 sm:gap-1.5 rounded-md border px-1 sm:px-2 text-[9px] sm:text-[10px] md:text-[11px] font-semibold uppercase tracking-wider shadow-2xs ${severity.badge}`}>
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                    <span className="hidden md:inline truncate">{severity.label}</span>
                                                    <span className="md:hidden truncate">{severity.shortLabel || severity.label}</span>
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-center">
                                                <HiOutlineChevronDown className={`h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''}`} />
                                            </div>
                                        </button>

                                        {/* Structured Municipal Incident Dossier */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-200/60 px-4 py-4 space-y-3.5 sm:px-6 dark:border-white/5">
                                                <div>
                                                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Incident summary</h3>
                                                    <p className="mt-1 text-xs leading-relaxed text-gray-800 dark:text-gray-200 bg-white dark:bg-[#0c1813]/80 p-3 rounded-lg border border-gray-200/70 dark:border-white/10 break-words">{report.description || <span className="italic text-gray-400 dark:text-gray-500">No incident description was provided.</span>}</p>
                                                </div>

                                                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 pt-1">
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
                                                        <div key={label} className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-2.5 dark:border-white/10 dark:bg-white/[0.02] min-w-0">
                                                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">{label}</dt>
                                                            <dd className="mt-0.5 text-xs font-bold text-gray-950 break-words dark:text-white tabular-nums truncate">{value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>

                                                <div className="flex flex-col gap-2 rounded-lg border border-gray-200/60 bg-gray-50/50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.02]">
                                                    {(report.respondedBy || report.resolvedBy) ? (
                                                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                                                            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
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
                                                                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                                    <HiOutlinePhotograph className="h-3.5 w-3.5" />
                                                                    Evidence ({report.images.length})
                                                                </span>
                                                                <div className="flex items-center gap-1.5">
                                                                    {report.images.map((image, index) => (
                                                                        <button
                                                                            key={image}
                                                                            type="button"
                                                                            onClick={() => { setViewerImage(resolveAssetUrl(image)); setViewerOpen(true); }}
                                                                            className="h-7 w-7 overflow-hidden rounded-md border border-gray-200/90 bg-gray-100 transition-transform hover:scale-105 dark:border-white/10 dark:bg-gray-800 cursor-pointer"
                                                                        >
                                                                            <img src={resolveAssetUrl(image)} alt={`Evidence ${index + 1}`} className="h-full w-full object-cover" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : null
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
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
