import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../components/ui/PageHeader';
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
import { adminAPI, reportsAPI, viewsAPI } from '../services/api';
import {
    dedupedFetch,
    getStaleData,
    isRecentlyRevalidated,
    setCachedData,
} from '../utils/queryCache';
import { getPhysicalMunicipality } from '../utils/incidentDetails';
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
import { fetchAllReportPages } from '../utils/dashboardReports';

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
                        className="flex h-10 items-center justify-center rounded-md bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-800 cursor-pointer dark:bg-brand-600 dark:hover:bg-brand-500"
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
    const canViewFullDetails = useMemo(() => (
        Boolean(isAuthenticated && user && ['municipal_admin', 'responder'].includes(user.role))
    ), [isAuthenticated, user]);

    // Municipal sovereignty invariant: full operational details (coordinates,
    // reporter name, responder identity/notes, original evidence) never cross
    // municipalities. Cross-municipality rows render the public projection.
    const showFullDetails = (report) => (
        canViewFullDetails && report?.municipalityName === user?.assignedMunicipality
    );

    const requestedDateFilter = searchParams.get('date');
    // Session-scoped (wiped on logout), so no leakage. The key was renamed
    // when the page became island-wide for operational users: the old
    // 'accident-history:full'/'public' caches hold jurisdiction-scoped data
    // and must never be reused.
    const historyCacheKey = 'accident-history:island-v1';
    const [reports, setReports] = useState(() => {
        const cached = getStaleData(historyCacheKey);
        return Array.isArray(cached) ? cached : [];
    });
    const [municipalitiesData, setMunicipalitiesData] = useState([]);
    const [loading, setLoading] = useState(() => {
        const cached = getStaleData(historyCacheKey);
        return cached == null || !Array.isArray(cached);
    });
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
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
    //
    // This call no longer has a reader on this page. The archive used to print a
    // per-report "Views" figure and patch it from the response, but reach is an
    // operational metric and it is read on the Analytics dashboard's reach
    // panels; a count on a public record said nothing the archive's own filters
    // and summary strip did not. What stays is the recording itself — dropping
    // it would quietly starve the panel that does display the number.
    const toggleExpandedDossier = useCallback((report) => {
        if (!report?._id) return;
        const id = String(report._id);
        const isCollapsing = expandedId && String(expandedId) === id;
        setExpandedId(isCollapsing ? null : report._id);
        if (!isCollapsing && !recordedViewsRef.current.has(id)) {
            recordedViewsRef.current.add(id);
            viewsAPI.recordViewEvent({ targetType: 'report', targetId: id })?.catch?.(() => {});
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

    // Deep link from header search ("See all results"): apply ?q= to the
    // archive's own filter so the full list continues the same query.
    useEffect(() => {
        const incoming = searchParams.get('q') || '';
        setSearchQuery((current) => (current === incoming ? current : incoming));
    }, [searchParams]);

    const fetchReports = useCallback(async (silent = false) => {
        const stale = getStaleData(historyCacheKey);
        if (Array.isArray(stale) && stale.length > 0) {
            setReports(stale);
            setLoading(false);
        } else if (!silent) {
            setLoading(true);
        }

        // Avoid micro-burst revalidation within 5 seconds unless forced or cold
        if (stale && isRecentlyRevalidated(historyCacheKey, 5000)) {
            return;
        }

        try {
            let rows;
            if (canViewFullDetails) {
                // Operational users: own municipality's full details (from the
                // jurisdiction-scoped admin endpoint) merged with the
                // island-wide public projection. Rows present in both resolve
                // to the full-detail copy; the admin endpoint can never
                // supply cross-municipality detail, so no full details leak.
                const [ownMunicipality, islandWide] = await Promise.all([
                    dedupedFetch(`fetch:${historyCacheKey}:own`, () => fetchAllReportPages(
                        (pageParams) => adminAPI.getReports({ status: 'resolved', ...pageParams }),
                        { status: 'resolved' },
                        250
                    )),
                    dedupedFetch(`fetch:${historyCacheKey}:island`, () => fetchAllReportPages(
                        (pageParams) => reportsAPI.getAll({ status: 'resolved', ...pageParams }),
                        { status: 'resolved' },
                        250
                    )),
                ]);
                const ownReports = (Array.isArray(ownMunicipality) ? ownMunicipality : []).filter(Boolean);
                const ownIds = new Set(ownReports.map((report) => String(report?._id)));
                const islandExtra = (Array.isArray(islandWide) ? islandWide : [])
                    .filter(Boolean)
                    .filter((report) => !ownIds.has(String(report?._id)));
                rows = [...ownReports, ...islandExtra];
            } else {
                const fetchPage = (pageParams) => reportsAPI.getAll({ status: 'resolved', ...pageParams });
                rows = await dedupedFetch(`fetch:${historyCacheKey}`, () => fetchAllReportPages(fetchPage, { status: 'resolved' }, 250));
            }
            const nextReports = (Array.isArray(rows) ? rows : [])
                .filter(Boolean)
                .filter((report) => report?.status === 'resolved');
            setReports(nextReports);
            setCachedData(historyCacheKey, nextReports);
        } catch (error) {
            console.error('Failed to fetch accident history:', error);
            if (getStaleData(historyCacheKey) === null && !silent) {
                toast.error('Failed to load accident history');
            }
        } finally {
            setLoading(false);
        }
    }, [canViewFullDetails, historyCacheKey]);

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
            setReports((current) => (Array.isArray(current) ? current : []).filter((report) => String(report?._id) !== String(data.id)));
        });
        // Evidence attached server-side ('reportEvidenceUpdated' to the
        // municipality and 'reporters' rooms): silently refetch through the
        // existing list flow when it targets the open report, so the gallery —
        // and its canonical preview-URL validation — picks up the new evidence.
        const unsubscribeEvidenceUpdated = subscribe('reportEvidenceUpdated', (data) => {
            const evidenceReportId = data?.reportId ?? data?.id ?? data?._id;
            if (evidenceReportId === null || evidenceReportId === undefined || evidenceReportId === '') return;
            if (expandedId && String(evidenceReportId) === String(expandedId)) {
                fetchReports(true);
            }
        });
        return () => {
            unsubscribeResolved();
            unsubscribeDeleted();
            unsubscribeEvidenceUpdated();
        };
    }, [subscribe, fetchReports, expandedId]);

    const municipalities = useMemo(() => {
        const set = new Set(SIBUYAN_MUNICIPALITY_NAMES);
        const locationRows = Array.isArray(municipalitiesData) ? municipalitiesData : [];
        const reportRows = Array.isArray(reports) ? reports : [];
        locationRows.forEach((m) => { if (m?.name) set.add(m.name); });
        reportRows.filter(Boolean).forEach((report) => { if (report?.municipalityName) set.add(report.municipalityName); });
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
        const query = (searchQuery ?? '').trim().toLowerCase();
        const cutoff = getRangeCutoff(dateFilter);
        const source = Array.isArray(reports) ? reports : [];

        return source
            .filter(Boolean)
            .filter((report) => {
                if (!report || typeof report !== 'object') return false;
                if (query) {
                    const searchable = [
                        report?.address,
                        report?.barangay,
                        report?.municipalityName,
                        report?.incidentType,
                        report?.description,
                    ].filter(Boolean).join(' ').toLowerCase();
                    if (!searchable.includes(query)) return false;
                }
                const resolvedDate = getResolvedDate(report);
                if (dateFilter === 'today' && !isSameManilaCalendarDay(resolvedDate)) return false;
                if (cutoff && !isAfter(new Date(resolvedDate), cutoff)) return false;
                if (severityFilter !== 'all' && report?.severity !== severityFilter) return false;
                if (municipalityFilter !== 'all' && report?.municipalityName !== municipalityFilter) return false;
                if (barangayFilter !== 'all' && report?.barangay !== barangayFilter) return false;
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
        const query = (searchQuery ?? '').trim().toLowerCase();
        const cutoff = getRangeCutoff(dateFilter);
        const source = Array.isArray(reports) ? reports : [];

        return source.filter(Boolean).filter((report) => {
            if (!report || typeof report !== 'object') return false;
            if (query) {
                const searchable = [
                    report?.address,
                    report?.barangay,
                    report?.municipalityName,
                    report?.incidentType,
                    report?.description,
                ].filter(Boolean).join(' ').toLowerCase();
                if (!searchable.includes(query)) return false;
            }
            const resolvedDate = getResolvedDate(report);
            if (dateFilter === 'today' && !isSameManilaCalendarDay(resolvedDate)) return false;
            if (cutoff && !isAfter(new Date(resolvedDate), cutoff)) return false;
            if (severityFilter !== 'all' && report?.severity !== severityFilter) return false;
            if (municipalityFilter !== 'all' && report?.municipalityName !== municipalityFilter) return false;
            return true;
        });
    }, [reports, searchQuery, dateFilter, severityFilter, municipalityFilter]);

    const topBarangayInfo = useMemo(() => {
        const counts = {};
        const barangayToMunicipality = {};

        topBarangayScopeReports.forEach((report) => {
            const b = report?.barangay?.trim();
            if (!b) return;
            counts[b] = (counts[b] || 0) + 1;
            if (report?.municipalityName && !barangayToMunicipality[b]) {
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
        const source = Array.isArray(reports) ? reports : [];
        return {
            total: source.length,
            last7: source.filter((report) => isAfter(new Date(getResolvedDate(report)), subDays(now, 7))).length,
            last30: source.filter((report) => isAfter(new Date(getResolvedDate(report)), subDays(now, 30))).length,
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

    if (loading && reports.length === 0) {
        return (
            <div className="mx-auto max-w-6xl space-y-5" role="status" aria-busy="true" aria-label="Loading accident archive">
                <span className="sr-only">Loading accident archive</span>
                {/* Header Skeleton */}
                <div className="space-y-2">
                    <Skeleton variant="text" role={null} className="h-3 w-28 rounded" />
                    <Skeleton variant="text" role={null} className="h-7 w-52 rounded" />
                    <Skeleton variant="text" role={null} className="h-3.5 w-72 rounded opacity-75" />
                </div>

                {/* 4-Metric Strip Skeleton */}
                <div className="metric-strip md:grid-cols-2 lg:grid-cols-4 md:[&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(3)]:border-l lg:[&>*:nth-child(n+3)]:border-t-0">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="metric-tile space-y-2">
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
        <div className="page-shell max-w-6xl space-y-5">
            <PageHeader eyebrow="Public Archive" title="Accident history" description="Resolved public-safety incidents across Sibuyan Island." />

            {/* Shared summary strip with My Reports / Dashboard: same labels, dots, dividers, sizes. */}
            <section
                className="metric-strip md:grid-cols-2 lg:grid-cols-4 md:[&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(3)]:border-l lg:[&>*:nth-child(n+3)]:border-t-0"
                aria-label="History summary"
            >
                {/* 1. Total Resolved */}
                <div className="metric-tile">
                    <p className="metric-value text-brand-900 dark:text-white">
                        {stats.total}
                    </p>
                    <h2 className="metric-label flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                        <span>Total resolved</span>
                    </h2>
                    <p className="metric-helper">All recorded incidents</p>
                </div>

                {/* 2. Last 7 Days */}
                <div className="metric-tile">
                    <p className="metric-value">
                        {stats.last7}
                    </p>
                    <h2 className="metric-label">
                        Last 7 days
                    </h2>
                    <p className="metric-helper">Recently closed</p>
                </div>

                {/* 3. Last 30 Days */}
                <div className="metric-tile">
                    <p className="metric-value">
                        {stats.last30}
                    </p>
                    <h2 className="metric-label">
                        Last 30 days
                    </h2>
                    <p className="metric-helper">Monthly activity</p>
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
                    className={`metric-tile text-left hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-inset dark:focus-visible:ring-sky-400 ${
                        topBarangayInfo.name && topBarangayInfo.name !== 'No data' ? 'cursor-pointer' : ''
                    }`}
                >
                    <p className={`metric-value metric-value--text ${
                        topBarangayInfo.name === 'No data'
                            ? 'text-base font-normal text-gray-400 dark:text-gray-500'
                            : 'text-gray-900 dark:text-white'
                    }`}>
                        {topBarangayInfo.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-1">
                        <h2 className="min-w-0 flex-1 text-xs font-semibold text-[var(--text-secondary)]">
                            Top Barangay
                        </h2>
                        {topBarangayInfo.name && topBarangayInfo.name !== 'No data' && (
                            <span className="text-[11px] font-semibold text-brand-700 dark:text-sky-400 underline decoration-brand-300 underline-offset-2 shrink-0">
                                {barangayFilter === topBarangayInfo.name ? 'Clear' : 'View'}
                            </span>
                        )}
                    </div>
                    <p className="metric-helper">{topBarangayInfo.helper}</p>
                </div>
            </section>

            {/* Resolved Incident Records Ledger */}
            <section className="surface-panel" aria-label="Resolved accident records">
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
                                className="field-control pl-9 pr-8 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
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
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {/* Refined Ghost/Outlined Filters Button */}
                            <button
                                type="button"
                                onClick={() => setFilterModalOpen(true)}
                                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors cursor-pointer ${
                                    activeFilterCount > 0
                                        ? 'border-brand-700/60 bg-brand-50/50 text-brand-900 dark:border-sky-500/50 dark:bg-sky-950/30 dark:text-sky-200'
                                        : 'border-gray-200 bg-transparent text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <HiOutlineFilter className={`h-4 w-4 ${activeFilterCount > 0 ? 'text-brand-700 dark:text-sky-400' : 'text-gray-500 dark:text-gray-400'}`} />
                                    <span>Filters</span>
                                </span>
                                {activeFilterCount > 0 && (
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white dark:bg-sky-400 dark:text-slate-950 tabular-nums">
                                        {activeFilterCount}
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
                                    className="field-control w-auto cursor-pointer appearance-none pr-8"
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
                    <div className="flex flex-col items-center justify-center rounded-b-lg px-6 py-8 text-center sm:py-10">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500" aria-hidden="true">
                            <HiOutlineArchive className="h-5 w-5" />
                        </div>
                        <h2 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                            {hasFilters ? 'No accident records found' : 'No resolved records available'}
                        </h2>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                            {hasFilters
                                ? 'Try adjusting the selected filters.'
                                : 'There are no resolved incident records in the archive yet.'}
                        </p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-brand-700 px-4 text-[13px] font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 cursor-pointer dark:bg-brand-600 dark:hover:bg-brand-500"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table Header */}
                        <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] gap-4 border-b border-gray-200/80 bg-gray-50/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                            <span>Incident</span>
                            <span>Municipality</span>
                            <span>Resolved</span>
                            <span>Severity</span>
                            <span className="sr-only">Toggle details</span>
                        </div>

                        <div className="rounded-b-lg overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                            {filteredReports.map((report) => {
                                const severity = SEVERITY_CONFIG[report?.severity] || SEVERITY_CONFIG.moderate;
                                const isExpanded = Boolean(expandedId && String(expandedId) === String(report?._id));
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
                                        style={isExpanded ? { borderLeftColor: 'var(--expanded-record-accent, #14385C)' } : undefined}
                                        className={`scroll-mt-4 sm:scroll-mt-6 ${isExpanded
                                            ? 'bg-brand-50/40 dark:bg-white/[0.03] border-b border-gray-200 dark:border-white/10'
                                            : 'bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.02]'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleExpandedDossier(report)}
                                            aria-expanded={isExpanded}
                                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${INCIDENT_TYPE_LABELS[report.incidentType] || 'incident'}`}
                                            className={`grid w-full grid-cols-[minmax(0,1fr)_74px_24px] items-center gap-1.5 border-l-4 px-3 py-3.5 text-left sm:grid-cols-[minmax(0,1fr)_88px_28px] sm:gap-3 sm:px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,.8fr)_130px_110px_28px] md:gap-4 md:px-5 cursor-pointer ${isExpanded ? 'border-l-brand-600 bg-brand-500/[0.04] dark:border-l-brand-500 dark:bg-white/[0.01]' : 'border-l-transparent'}`}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-sky-400" aria-hidden="true">
                                                        <HiCheck className="h-2.5 w-2.5" />
                                                    </span>
                                                    <p className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-white">
                                                        {INCIDENT_TYPE_LABELS[report.incidentType] || report.incidentType || 'Road incident'}
                                                    </p>
                                                </div>
                                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400 pl-5">
                                                    {[report.barangay, getPhysicalMunicipality(report)].filter(Boolean).join(', ') || 'Location not provided'}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 md:hidden pl-5">Incident {formatDate(incidentDate)}</p>
                                            </div>

                                            <div className="hidden md:flex md:items-center text-xs text-gray-700 dark:text-gray-300 font-semibold">
                                                <span className="truncate">{getPhysicalMunicipality(report) || 'Unknown'}</span>
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
                                                <HiOutlineChevronDown className={`h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 ${isExpanded ? 'rotate-180 text-brand-700 dark:text-sky-400' : ''}`} />
                                            </div>
                                        </button>

                                        {/* Structured Municipal Incident Dossier (Typography-Driven Flat Layout) */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 border-l-4 border-l-brand-600/30 px-4 py-4 space-y-4 sm:px-6 dark:border-white/5 dark:border-l-brand-500/30">
                                                {/* Incident Summary */}
                                                <div>
                                                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400 mb-1">
                                                        Incident summary
                                                    </h3>
                                                    <p className="text-xs leading-relaxed text-gray-800 dark:text-gray-200 break-words">
                                                        {report.description || <span className="italic text-gray-400 dark:text-gray-500">No public description provided.</span>}
                                                    </p>
                                                </div>

                                                {/* Flat Metadata Grid */}
                                                {/* The facts grid is separated from the
                                                    summary above it by the stack's own space and
                                                    by the label/value type step, not by a second
                                                    rule inside a dossier that already opens with
                                                    one. */}
                                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                                    {[
                                                        ['Incident date', formatDate(incidentDate, 'MMM d, yyyy h:mm a')],
                                                        ['Barangay', report.barangay || 'Not available'],
                                                        ['Resolved date', formatDate(resolvedDate, 'MMM d, yyyy h:mm a')],
                                                        ['Municipality', getPhysicalMunicipality(report) || 'Not available'],
                                                        ['Casualties', casualtyCount ? `${dossierInjured} injured, ${dossierFatalities} fatal, ${dossierMissing} missing` : 'None recorded'],
                                                        ...(showFullDetails(report) ? [
                                                            ['Coordinates', getCoordinates(report)],
                                                            ['Reported by', report.reporter?.name || 'Anonymous'],
                                                        ] : []),
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="min-w-0">
                                                            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-0.5">{label}</dt>
                                                            <dd className="text-xs font-medium text-gray-900 dark:text-gray-100 break-words tabular-nums">{value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>

                                                {/* Flat Responsive Privacy / Operational Footer */}
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500 dark:text-gray-400">
                                                    {(report.respondedBy || report.resolvedBy) ? (
                                                        <div className="flex flex-wrap items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                                                            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                                                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                                                Handled by {report.respondedBy?.agency || report.resolvedBy?.agency || 'Emergency Services'}
                                                            </span>
                                                            {showFullDetails(report) && (
                                                                <span className="text-[11px] font-medium text-brand-700 dark:text-sky-400">
                                                                    ({report.respondedBy?.name || report.resolvedBy?.name || 'Responder'}{report.resolutionNotes ? ` — ${report.resolutionNotes}` : ''})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : <div />}

                                                    {showFullDetails(report) ? (
                                                        <>
                                                            {(report.images?.length || report.evidence?.items?.length) ? (
                                                                <div className="flex items-center gap-2">
                                                                    <ProtectedEvidenceGallery
                                                                        images={report.images}
                                                                        evidence={report.evidence}
                                                                        accessLevel="original"
                                                                        isOperational={true}
                                                                        variant="stacked"
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            {/* Resolution photos: the responder's proof of
                                                                resolution — a separate identity from the
                                                                reporter's evidence, same sovereignty gating. */}
                                                            {(report.resolutionImages?.length || 0) > 0 && (
                                                                <div className="mt-2">
                                                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                                        Resolution photos · {report.resolutionImages.length}
                                                                    </p>
                                                                    <ProtectedEvidenceGallery
                                                                        images={report.resolutionImages}
                                                                        accessLevel="original"
                                                                        isOperational={true}
                                                                        variant="stacked"
                                                                        labelVariant="resolution"
                                                                    />
                                                                </div>
                                                            )}
                                                        </>
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
