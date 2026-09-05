import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, formatDistanceToNow, isAfter, subDays } from 'date-fns';
import toast from '../utils/appToast';
import {
    HiCheck,
    HiOutlineArchive,
    HiOutlineChevronDown,
    HiOutlineFilter,
    HiOutlineLockClosed,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';
import { adminAPI, reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import CustomSelect from '../components/ui/CustomSelect';
import { Skeleton, SkeletonCard, SkeletonRow, SkeletonTable } from '../components/ui/Skeleton';
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

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest resolved' },
    { value: 'oldest', label: 'Oldest resolved' },
];

const normalizeDateFilter = (value) => (
    ['today', '7', '30', '90', '365'].includes(value) ? value : 'all'
);

// Every range the date dropdown offers must actually filter. Centralized so
// the list, the Top Barangay scope, and the URL param stay in agreement.
const DAY_RANGE_FILTERS = ['7', '30', '90', '365'];

const getRangeCutoff = (dateFilter) => (
    DAY_RANGE_FILTERS.includes(dateFilter) ? subDays(new Date(), Number(dateFilter)) : null
);

// Single source of truth for "when was this resolved". resolveReport always
// stamps resolvedAt; the fallbacks cover legacy records consistently
// everywhere (list, sort, stats, dossier) instead of mixing updatedAt/createdAt.
const getResolvedDate = (report) => report?.resolvedAt || report?.updatedAt || report?.createdAt;

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

/**
 * Filter Modal / Bottom Sheet for Accident History Archive
 */
const ArchiveFilterModal = ({
    isOpen,
    onClose,
    dateFilter,
    setDateFilter,
    severityFilter,
    setSeverityFilter,
    municipalityFilter,
    onMunicipalityChange,
    barangayFilter,
    setBarangayFilter,
    municipalityOptions,
    barangayOptions,
    totalResults,
    onClearFilters,
}) => {
    const titleId = useId();
    const sheetRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[88vh] w-full sm:max-w-lg flex-col overflow-hidden rounded-t-md sm:rounded-md border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]"
            >
                <div className="flex items-center justify-between px-4 py-4 sm:px-5 dark:border-white/10">
                    <div>
                        <h2 id={titleId} className="text-sm font-semibold text-gray-900 dark:text-white">
                            Archive filters
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            Narrow resolved incident records by date, severity, and jurisdiction
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[44px] px-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                        aria-label="Close filters"
                    >
                        Close
                    </button>
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-gray-200 p-4 sm:p-5 dark:border-white/10">
                    {/* Date Range Section */}
                    <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-1.5">
                            Date range
                        </label>
                        <CustomSelect
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            options={DATE_OPTIONS}
                            ariaLabel="Filter by date"
                            className="w-full"
                        />
                    </div>

                    {/* Severity Section */}
                    <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-1.5">
                            Severity
                        </label>
                        <CustomSelect
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            options={SEVERITY_OPTIONS}
                            ariaLabel="Filter by severity"
                            className="w-full"
                        />
                    </div>

                    {/* Municipality Section */}
                    <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-1.5">
                            Municipality
                        </label>
                        <CustomSelect
                            value={municipalityFilter}
                            onChange={(e) => onMunicipalityChange(e.target.value)}
                            options={municipalityOptions}
                            ariaLabel="Filter by municipality"
                            className="w-full"
                        />
                    </div>

                    {/* Barangay Section */}
                    <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-1.5">
                            Barangay
                        </label>
                        <CustomSelect
                            value={barangayFilter}
                            onChange={(e) => setBarangayFilter(e.target.value)}
                            options={barangayOptions}
                            ariaLabel="Filter by barangay"
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 dark:border-white/10">
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className="min-h-[44px] text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                    >
                        Clear all
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 items-center justify-center rounded-md bg-emerald-700 px-5 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                        Show {totalResults} {totalResults === 1 ? 'record' : 'records'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
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
    const [sortOrder, setSortOrder] = useState('newest');
    const [expandedId, setExpandedId] = useState(null);
    const [filterModalOpen, setFilterModalOpen] = useState(false);
    const recordedViewsRef = useRef(new Set());

    // Dossier expands count as views (owner self-views excluded server-side).
    // Fire-and-forget: the dossier renders from list data either way.
    // Once per report per page session — re-expands don't inflate the count.
    const toggleExpandedDossier = useCallback((report) => {
        if (!report?._id) return;
        const id = String(report._id);
        const isCollapsing = expandedId && String(expandedId) === id;
        setExpandedId(isCollapsing ? null : report._id);
        if (!isCollapsing && !recordedViewsRef.current.has(id)) {
            recordedViewsRef.current.add(id);
            reportsAPI.recordView(id)
                .then((response) => {
                    const viewCount = response.data?.data?.viewCount;
                    if (Number.isFinite(viewCount)) {
                        setReports((currentReports) => currentReports.map((item) => (
                            item._id === report._id ? { ...item, viewCount } : item
                        )));
                    }
                })
                .catch(() => {});
        }
    }, [expandedId]);    const [isMobile, setIsMobile] = useState(() => (
        typeof window !== 'undefined' ? window.innerWidth < 640 : false
    ));
    const itemRefs = useRef({});

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
        const cutoff = getRangeCutoff(dateFilter);

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
                const resolvedDate = getResolvedDate(report);
                if (dateFilter === 'today' && !isSameManilaCalendarDay(resolvedDate)) return false;
                if (cutoff && !isAfter(new Date(resolvedDate), cutoff)) return false;
                if (severityFilter !== 'all' && report.severity !== severityFilter) return false;
                if (municipalityFilter !== 'all' && report.municipalityName !== municipalityFilter) return false;
                if (barangayFilter !== 'all' && report.barangay !== barangayFilter) return false;
                return true;
            })
            .sort((a, b) => {
                const dateA = new Date(getResolvedDate(a));
                const dateB = new Date(getResolvedDate(b));
                return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
            });
    }, [reports, searchQuery, dateFilter, severityFilter, municipalityFilter, barangayFilter, sortOrder]);

    // Top Barangay calculation within current search/date/severity/municipality scope
    const topBarangayScopeReports = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const cutoff = getRangeCutoff(dateFilter);

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
            const resolvedDate = getResolvedDate(report);
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
            last7: reports.filter((report) => isAfter(new Date(getResolvedDate(report)), subDays(now, 7))).length,
            last30: reports.filter((report) => isAfter(new Date(getResolvedDate(report)), subDays(now, 30))).length,
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

    const activeFilterCount = (dateFilter !== 'all' ? 1 : 0)
        + (severityFilter !== 'all' ? 1 : 0)
        + (municipalityFilter !== 'all' ? 1 : 0)
        + (barangayFilter !== 'all' ? 1 : 0);

    const clearFilters = () => {
        setSearchQuery('');
        setDateFilter('all');
        setSeverityFilter('all');
        setMunicipalityFilter('all');
        setBarangayFilter('all');
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6" role="status" aria-busy="true" aria-label="Loading accident archive">
                <span className="sr-only">Loading accident archive</span>
                {/* Header Skeleton */}
                <div className="space-y-2">
                    <Skeleton variant="text" role={null} className="h-3 w-28 rounded" />
                    <Skeleton variant="text" role={null} className="h-7 w-52 rounded" />
                    <Skeleton variant="text" role={null} className="h-3.5 w-72 rounded opacity-75" />
                </div>

                {/* 4-Metric Strip Skeleton */}
                <div className="grid grid-cols-2 divide-y divide-gray-100 dark:divide-white/5 sm:grid-cols-4 sm:divide-x sm:divide-y-0 rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90 overflow-hidden">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="p-3 sm:p-4 space-y-2">
                            <Skeleton variant="text" role={null} className="h-3 w-16" />
                            <Skeleton variant="text" role={null} className="h-6 w-10" />
                        </div>
                    ))}
                </div>

                {/* Filter Controls Bar Skeleton */}
                <SkeletonCard role={null} className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <Skeleton variant="button" role={null} className="h-9 w-full sm:w-64" />
                        <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
                            <Skeleton variant="button" role={null} className="h-9 w-28" />
                            <Skeleton variant="button" role={null} className="h-9 w-28" />
                        </div>
                    </div>
                </SkeletonCard>

                {/* Table Skeleton */}
                <SkeletonCard role={null} className="p-0 overflow-hidden">
                    <SkeletonTable columns={5} rows={6} role={null} />
                </SkeletonCard>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
            {/* Header: Clean Public Archive Title */}
            <header className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <span className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400 uppercase">
                        Public Archive
                    </span>

                    <h1 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                        Accident history
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        Resolved public-safety incidents across Sibuyan Island.
                    </p>
                </div>
            </header>

            {/* Flat Summary Metrics Grid with Hairline Dividers */}
            <section
                className="grid grid-cols-2 divide-y divide-gray-100 dark:divide-white/5 sm:grid-cols-4 sm:divide-x sm:divide-y-0"
                aria-label="History summary"
            >
                {/* 1. Total Resolved */}
                <div className="p-3 sm:p-4 min-h-[88px] sm:min-h-[96px] flex flex-col justify-between">
                    <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total resolved</h2>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${stats.total === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        {stats.total}
                    </p>
                    <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 break-words leading-tight">All recorded incidents</p>
                </div>

                {/* 2. Last 7 Days */}
                <div className="p-3 sm:p-4 min-h-[88px] sm:min-h-[96px] flex flex-col justify-between">
                    <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Last 7 days</h2>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${stats.last7 === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        {stats.last7}
                    </p>
                    <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 break-words leading-tight">Recently closed</p>
                </div>

                {/* 3. Last 30 Days */}
                <div className="p-3 sm:p-4 min-h-[88px] sm:min-h-[96px] flex flex-col justify-between">
                    <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Last 30 days</h2>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${stats.last30 === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        {stats.last30}
                    </p>
                    <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 break-words leading-tight">Monthly activity</p>
                </div>

                {/* 4. Top Barangay Insight */}
                <div
                    onClick={handleTopBarangayClick}
                    role={topBarangayInfo.name && topBarangayInfo.name !== 'No data' ? 'button' : undefined}
                    tabIndex={topBarangayInfo.name && topBarangayInfo.name !== 'No data' ? 0 : undefined}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleTopBarangayClick();
                        }
                    }}
                    aria-pressed={barangayFilter !== 'all' && barangayFilter === topBarangayInfo.name}
                    className={`p-3 sm:p-4 min-h-[88px] sm:min-h-[96px] flex flex-col justify-between text-left ${
                        topBarangayInfo.name && topBarangayInfo.name !== 'No data' ? 'cursor-pointer' : ''
                    }`}
                >
                    <div className="flex items-center justify-between gap-1">
                        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">Top Barangay</h2>
                        {topBarangayInfo.name && topBarangayInfo.name !== 'No data' && (
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 shrink-0">
                                {barangayFilter === topBarangayInfo.name ? 'Clear' : 'View'}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate tracking-tight">
                        {topBarangayInfo.name}
                    </p>
                    <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 break-words leading-tight">{topBarangayInfo.helper}</p>
                </div>
            </section>

            {/* Resolved Incident Records Ledger */}
            <section className="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Resolved accident records">
                {/* Search-First Archive Toolbar */}
                <div className="border-b border-gray-200 p-3 sm:p-4 dark:border-white/10">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                        {/* Primary Search Input */}
                        <label className="relative block flex-1 min-w-[200px]">
                            <span className="sr-only">Search accident history</span>
                            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder={isMobile ? 'Search archive or barangay…' : 'Search location, barangay, or incident category…'}
                                className="h-9 w-full rounded-md border border-gray-200 bg-white py-1.5 pl-9 pr-8 text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
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

                        {/* Consolidated Toolbar Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Refined Ghost/Outlined Filters Button */}
                            <button
                                type="button"
                                onClick={() => setFilterModalOpen(true)}
                                className={`flex h-9 items-center justify-between gap-2 rounded-md border px-3 text-[13px] font-medium cursor-pointer ${
                                    activeFilterCount > 0
                                        ? 'border-gray-400 text-gray-900 dark:border-gray-500 dark:text-white'
                                        : 'bg-transparent border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <HiOutlineFilter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    <span>Filters</span>
                                </span>
                                {activeFilterCount > 0 && (
                                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                        · {activeFilterCount}
                                    </span>
                                )}
                            </button>

                            {/* Sort Selector */}
                            <div className="relative flex items-center">
                                <label htmlFor="history-sort-select" className="sr-only">Sort records</label>
                                <select
                                    id="history-sort-select"
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder(e.target.value)}
                                    className="h-9 appearance-none rounded-md border border-gray-200 bg-white py-1 pl-3 pr-8 text-[13px] font-medium text-gray-700 outline-none hover:bg-gray-50 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 cursor-pointer"
                                >
                                    {SORT_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-2.5 flex items-center text-gray-400 dark:text-gray-500" aria-hidden="true">
                                    <HiOutlineChevronDown className="h-3.5 w-3.5" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Accessible Hidden Filters for Screen Readers and Testing */}
                    <div className="sr-only">
                        <CustomSelect
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            options={DATE_OPTIONS}
                            ariaLabel="Filter by date"
                        />
                        <CustomSelect
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            options={SEVERITY_OPTIONS}
                            ariaLabel="Filter by severity"
                        />
                        <CustomSelect
                            value={municipalityFilter}
                            onChange={(e) => handleMunicipalityChange(e.target.value)}
                            options={municipalityOptions}
                            ariaLabel="Filter by municipality"
                        />
                        <CustomSelect
                            value={barangayFilter}
                            onChange={(e) => setBarangayFilter(e.target.value)}
                            options={barangayOptions}
                            ariaLabel="Filter by barangay"
                        />
                    </div>

                    {/* Results Counter & Removable Filter Chips */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200/80 pt-2.5 dark:border-white/10">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Showing <span className="text-gray-900 dark:text-white font-semibold tabular-nums">{filteredReports.length}</span> of {reports.length} records
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {dateFilter !== 'all' && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Date: {DATE_OPTIONS.find((o) => o.value === dateFilter)?.label || dateFilter}</span>
                                    <button type="button" onClick={() => setDateFilter('all')} className="hover:text-gray-900 dark:hover:text-white cursor-pointer" aria-label="Remove date filter">
                                        <HiOutlineX className="h-3 w-3" />
                                    </button>
                                </span>
                            )}

                            {severityFilter !== 'all' && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Severity: {SEVERITY_OPTIONS.find((o) => o.value === severityFilter)?.label || severityFilter}</span>
                                    <button type="button" onClick={() => setSeverityFilter('all')} className="hover:text-gray-900 dark:hover:text-white cursor-pointer" aria-label="Remove severity filter">
                                        <HiOutlineX className="h-3 w-3" />
                                    </button>
                                </span>
                            )}

                            {municipalityFilter !== 'all' && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Municipality: {municipalityFilter}</span>
                                    <button type="button" onClick={() => handleMunicipalityChange('all')} className="hover:text-gray-900 dark:hover:text-white cursor-pointer" aria-label="Remove municipality filter">
                                        <HiOutlineX className="h-3 w-3" />
                                    </button>
                                </span>
                            )}

                            {barangayFilter !== 'all' && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Barangay: {barangayFilter}</span>
                                    <button type="button" onClick={() => setBarangayFilter('all')} className="hover:text-gray-900 dark:hover:text-white cursor-pointer" aria-label="Remove barangay filter">
                                        <HiOutlineX className="h-3 w-3" />
                                    </button>
                                </span>
                            )}

                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer ml-1"
                                >
                                    <HiOutlineX className="w-3.5 h-3.5" />
                                    <span>Clear filters</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Records Listing */}
                {loading ? (
                    <div className="divide-y divide-gray-100 dark:divide-white/5 p-2 sm:p-4" role="status" aria-busy="true" aria-label="Loading accident records">
                        <span className="sr-only">Loading accident records</span>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <SkeletonRow key={i} lines={2} trailingAction className="px-3 py-3.5" />
                        ))}
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="rounded-b-lg px-6 py-14 text-center">
                        <HiOutlineArchive className="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                        <h2 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">No accident records found</h2>
                        <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-gray-500 dark:text-gray-400">Try adjusting the selected filters.</p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-4 text-[13px] font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 cursor-pointer dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table Header */}
                        <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] gap-4 border-b border-gray-200/80 bg-gray-50/50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.01] dark:text-gray-400">
                            <span>Incident</span>
                            <span>Municipality</span>
                            <span>Resolved</span>
                            <span>Severity</span>
                            <span className="sr-only">Toggle details</span>
                        </div>

                        <div className="rounded-b-lg overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                            {filteredReports.map((report) => {
                                const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                                const isExpanded = Boolean(expandedId && String(expandedId) === String(report._id));
                                const incidentDate = report.incidentTime || report.accidentTime || report.createdAt;
                                const resolvedDate = getResolvedDate(report);
                                const dossierInjured = Number(report.casualties?.injured || 0);
                                const dossierFatalities = Number(report.casualties?.fatalities || 0);
                                const dossierMissing = Number(report.casualties?.missing || 0);
                                const casualtyCount = dossierInjured + dossierFatalities + dossierMissing;

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
                                        className={`border-l-2 sm:border-l-2 scroll-mt-4 sm:scroll-mt-6 ${isExpanded
                                            ? 'border-l-emerald-600 bg-emerald-50/15 dark:border-l-emerald-500 dark:bg-[#07130e]/80 border-b border-gray-200 dark:border-white/10'
                                            : 'border-l-transparent bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleExpandedDossier(report)}
                                            aria-expanded={isExpanded}
                                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${INCIDENT_TYPE_LABELS[report.incidentType] || 'incident'}`}
                                            className={`grid w-full grid-cols-[minmax(0,1fr)_74px_24px] items-center gap-1.5 px-3 py-3.5 text-left sm:grid-cols-[minmax(0,1fr)_88px_28px] sm:gap-3 sm:px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] md:gap-4 md:px-5 cursor-pointer ${isExpanded ? 'bg-emerald-500/[0.03] dark:bg-white/[0.01]' : ''}`}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" aria-hidden="true">
                                                        <HiCheck className="h-2.5 w-2.5" />
                                                    </span>
                                                    <p className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-white">
                                                        {INCIDENT_TYPE_LABELS[report.incidentType] || report.incidentType || 'Road incident'}
                                                    </p>
                                                </div>
                                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400 pl-5">
                                                    {[report.barangay, report.municipalityName].filter(Boolean).join(', ') || 'Location not provided'}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 md:hidden pl-5">Incident {formatDate(incidentDate)}</p>
                                            </div>

                                            <div className="hidden md:flex md:items-center text-xs text-gray-700 dark:text-gray-300 font-semibold">
                                                <span className="truncate">{report.municipalityName || 'Unknown'}</span>
                                            </div>

                                            <div className="hidden md:block text-xs text-gray-600 dark:text-gray-300">
                                                <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{formatDate(resolvedDate)}</p>
                                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{formatRelativeDate(resolvedDate)}</p>
                                            </div>

                                            <div className="flex items-center justify-start">
                                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} aria-hidden="true" />
                                                    <span className="truncate">{severity.label}</span>
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-center">
                                                <HiOutlineChevronDown className={`h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 ${isExpanded ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''}`} />
                                            </div>
                                        </button>

                                        {/* Structured Municipal Incident Dossier (Typography-Driven Flat Layout) */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 px-4 py-4 space-y-4 sm:px-6 dark:border-white/5">
                                                {/* Incident Summary */}
                                                <div>
                                                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
                                                        Incident summary
                                                    </h3>
                                                    <p className="text-xs leading-relaxed text-gray-800 dark:text-gray-200 break-words">
                                                        {report.description || <span className="italic text-gray-400 dark:text-gray-500">No public description provided.</span>}
                                                    </p>
                                                </div>

                                                {/* Flat Metadata Grid */}
                                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 pt-1 border-t border-gray-100 dark:border-white/5">
                                                    {[
                                                        ['Incident date', formatDate(incidentDate, 'MMM d, yyyy h:mm a')],
                                                        ['Barangay', report.barangay || 'Not available'],
                                                        ['Resolved date', formatDate(resolvedDate, 'MMM d, yyyy h:mm a')],
                                                        ['Municipality', report.municipalityName || 'Not available'],
                                                        ['Casualties', casualtyCount ? `${dossierInjured} injured, ${dossierFatalities} fatal, ${dossierMissing} missing` : 'None recorded'],
                                                        ...(canViewFullDetails ? [
                                                            ['Coordinates', getCoordinates(report)],
                                                            ['Reported by', report.reporter?.name || 'Anonymous'],
                                                            ['Views', String(report.viewCount || 0)],
                                                        ] : []),
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="min-w-0">
                                                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{label}</dt>
                                                            <dd className="text-xs font-medium text-gray-900 dark:text-gray-100 break-words tabular-nums">{value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>

                                                {/* Flat Responsive Privacy / Operational Footer */}
                                                <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 dark:border-white/5 text-xs text-gray-500 dark:text-gray-400">
                                                    {(report.respondedBy || report.resolvedBy) ? (
                                                        <div className="flex flex-wrap items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
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
                                                        (report.images?.length || report.evidence?.items?.length) ? (
                                                            <div className="flex items-center gap-2">
                                                                <ProtectedEvidenceGallery
                                                                    images={report.images}
                                                                    evidence={report.evidence}
                                                                    accessLevel="original"
                                                                    isOperational={true}
                                                                    variant="stacked"
                                                                />
                                                            </div>
                                                        ) : null
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
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

            {/* Unified Filter Modal / Bottom Sheet */}
            <ArchiveFilterModal
                isOpen={filterModalOpen}
                onClose={() => setFilterModalOpen(false)}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                severityFilter={severityFilter}
                setSeverityFilter={setSeverityFilter}
                municipalityFilter={municipalityFilter}
                onMunicipalityChange={handleMunicipalityChange}
                barangayFilter={barangayFilter}
                setBarangayFilter={setBarangayFilter}
                municipalityOptions={municipalityOptions}
                barangayOptions={barangayOptions}
                totalResults={filteredReports.length}
                onClearFilters={clearFilters}
            />
        </div>
    );
};

export default AccidentHistoryPage;
